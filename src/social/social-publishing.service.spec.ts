import { Test, TestingModule } from "@nestjs/testing"
import { ConfigService } from "@nestjs/config"
import { HttpService } from "@nestjs/axios"
import { SocialPublishingService } from "./social-publishing.service"
import { PrismaService } from "../../prisma/prisma.service"
import { ConnectedAccountsService } from "../integrations/connected-accounts.service"
import { LinkedInOAuthService } from "../integrations/linkedin/linkedin-oauth.service"
import {
  SocialChannel,
  SocialPostStatus,
  ConnectedProvider,
} from "@prisma/client"
import { createMockPrisma, mockLinkedInApi, mockFacebookApi } from "../../test/helpers/mocks.helper"
import { AppError } from "../errors/app-error"
import { ErrorCodes } from "../errors/error-codes"

describe("SocialPublishingService", () => {
  let service: SocialPublishingService
  let prisma: PrismaService
  let httpService: HttpService
  let connectedAccounts: ConnectedAccountsService
  let linkedinOAuth: LinkedInOAuthService

  const mockPrisma = createMockPrisma()
  const mockHttpService = {
    axiosRef: {
      post: jest.fn(),
      get: jest.fn(),
    },
  }
  const mockConnectedAccounts = {
    findLatestByProvider: jest.fn(),
  }
  const mockLinkedInOAuth = {
    refreshAccessToken: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialPublishingService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === "FACEBOOK_GRAPH_VERSION") return "v19.0"
              return undefined
            }),
          },
        },
        {
          provide: ConnectedAccountsService,
          useValue: mockConnectedAccounts,
        },
        {
          provide: LinkedInOAuthService,
          useValue: mockLinkedInOAuth,
        },
      ],
    }).compile()

    service = module.get<SocialPublishingService>(SocialPublishingService)
    prisma = module.get<PrismaService>(PrismaService)
    httpService = module.get<HttpService>(HttpService)
    connectedAccounts = module.get<ConnectedAccountsService>(
      ConnectedAccountsService,
    )
    linkedinOAuth = module.get<LinkedInOAuthService>(LinkedInOAuthService)

    jest.clearAllMocks()
  })

  describe("publishPost", () => {
    it("should publish LinkedIn post successfully", async () => {
      const postId = "post-1"
      const userId = "user-1"
      const post = {
        id: postId,
        userId,
        channel: SocialChannel.LINKEDIN,
        content: "Test LinkedIn post",
        status: SocialPostStatus.DRAFT,
      }
      const account = {
        id: "account-1",
        userId,
        provider: ConnectedProvider.LINKEDIN,
        accessToken: "access-token",
        expiresAt: new Date(Date.now() + 3600000),
        metadata: {
          urn: "urn:li:person:123",
        },
      }

      ;(mockPrisma.socialPost.findUnique as jest.Mock).mockResolvedValue(post)
      ;(mockPrisma.socialPost.update as jest.Mock)
        .mockResolvedValueOnce({
          ...post,
          status: SocialPostStatus.POSTING,
        })
        .mockResolvedValueOnce({
          ...post,
          status: SocialPostStatus.POSTED,
          externalPostId: "urn:li:activity:123",
          externalUrl: "https://www.linkedin.com/feed/update/123",
          publishedAt: new Date(),
        })
      ;(mockConnectedAccounts.findLatestByProvider as jest.Mock).mockResolvedValue(
        account,
      )
      ;(mockHttpService.axiosRef.post as jest.Mock).mockResolvedValue({
        data: {
          id: "urn:li:activity:123",
        },
      })

      const result = await service.publishPost(postId, userId)

      expect(result.status).toBe(SocialPostStatus.POSTED)
      expect(result.externalPostId).toBe("urn:li:activity:123")
      expect(mockHttpService.axiosRef.post).toHaveBeenCalledWith(
        "https://api.linkedin.com/v2/ugcPosts",
        expect.objectContaining({
          author: account.metadata.urn,
          specificContent: expect.any(Object),
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${account.accessToken}`,
          }),
        }),
      )
    })

    it("should publish Facebook post successfully", async () => {
      const postId = "post-1"
      const userId = "user-1"
      const post = {
        id: postId,
        userId,
        channel: SocialChannel.FACEBOOK,
        content: "Test Facebook post",
        status: SocialPostStatus.DRAFT,
      }
      const account = {
        id: "account-1",
        userId,
        provider: ConnectedProvider.FACEBOOK,
        accessToken: "page-access-token",
        providerAccountId: "page-123",
        metadata: {
          pageId: "page-123",
        },
      }

      ;(mockPrisma.socialPost.findUnique as jest.Mock).mockResolvedValue(post)
      ;(mockPrisma.socialPost.update as jest.Mock)
        .mockResolvedValueOnce({
          ...post,
          status: SocialPostStatus.POSTING,
        })
        .mockResolvedValueOnce({
          ...post,
          status: SocialPostStatus.POSTED,
          externalPostId: "page-123_456",
          externalUrl: "https://www.facebook.com/page-123/posts/456",
          publishedAt: new Date(),
        })
      ;(mockConnectedAccounts.findLatestByProvider as jest.Mock).mockResolvedValue(
        account,
      )
      ;(mockHttpService.axiosRef.post as jest.Mock).mockResolvedValue({
        data: {
          id: "page-123_456",
        },
      })

      const result = await service.publishPost(postId, userId)

      expect(result.status).toBe(SocialPostStatus.POSTED)
      expect(result.externalPostId).toBe("page-123_456")
      expect(mockHttpService.axiosRef.post).toHaveBeenCalledWith(
        expect.stringContaining("/page-123/feed"),
        expect.any(URLSearchParams),
      )
    })

    it("should throw NotFoundException for non-existent post", async () => {
      const postId = "non-existent"
      const userId = "user-1"

      ;(mockPrisma.socialPost.findUnique as jest.Mock).mockResolvedValue(null)

      await expect(service.publishPost(postId, userId)).rejects.toThrow(
        AppError,
      )
    })

    it("should throw NotFoundException for post owned by different user", async () => {
      const postId = "post-1"
      const userId = "user-1"
      const post = {
        id: postId,
        userId: "user-2",
        channel: SocialChannel.LINKEDIN,
        content: "Test post",
        status: SocialPostStatus.DRAFT,
      }

      ;(mockPrisma.socialPost.findUnique as jest.Mock).mockResolvedValue(post)

      await expect(service.publishPost(postId, userId)).rejects.toThrow(
        AppError,
      )
    })

    it("should refresh LinkedIn access token when expired", async () => {
      const postId = "post-1"
      const userId = "user-1"
      const post = {
        id: postId,
        userId,
        channel: SocialChannel.LINKEDIN,
        content: "Test LinkedIn post",
        status: SocialPostStatus.DRAFT,
      }
      const account = {
        id: "account-1",
        userId,
        provider: ConnectedProvider.LINKEDIN,
        accessToken: "expired-token",
        expiresAt: new Date(Date.now() - 1000),
        refreshToken: "refresh-token",
        metadata: {},
      }

      ;(mockPrisma.socialPost.findUnique as jest.Mock).mockResolvedValue(post)
      ;(mockPrisma.socialPost.update as jest.Mock)
        .mockResolvedValueOnce({
          ...post,
          status: SocialPostStatus.POSTING,
        })
        .mockResolvedValueOnce({
          ...post,
          status: SocialPostStatus.POSTED,
        })
      ;(mockConnectedAccounts.findLatestByProvider as jest.Mock).mockResolvedValue(
        account,
      )
      ;(mockLinkedInOAuth.refreshAccessToken as jest.Mock).mockResolvedValue({
        access_token: "new-access-token",
        expires_in: 3600,
      })
      ;(mockPrisma.connectedAccount.update as jest.Mock)
        .mockResolvedValueOnce({
          ...account,
          accessToken: "new-access-token",
          expiresAt: new Date(Date.now() + 3600000),
        })
        .mockResolvedValueOnce({
          ...account,
          accessToken: "new-access-token",
          expiresAt: new Date(Date.now() + 3600000),
          metadata: { urn: "urn:li:person:123" },
        })
      ;(mockHttpService.axiosRef.get as jest.Mock).mockResolvedValue({
        data: { id: "123" },
      })
      ;(mockHttpService.axiosRef.post as jest.Mock).mockResolvedValue({
        data: {
          id: "urn:li:activity:123",
        },
      })

      await expect(service.publishPost(postId, userId)).resolves.toBeDefined()

      expect(mockLinkedInOAuth.refreshAccessToken).toHaveBeenCalledWith(
        account.refreshToken,
      )
      expect(mockPrisma.connectedAccount.update).toHaveBeenCalled()
    })

    it("should handle publishing errors and mark post as failed", async () => {
      const postId = "post-1"
      const userId = "user-1"
      const post = {
        id: postId,
        userId,
        channel: SocialChannel.LINKEDIN,
        content: "Test LinkedIn post",
        status: SocialPostStatus.DRAFT,
      }
      const account = {
        id: "account-1",
        userId,
        provider: ConnectedProvider.LINKEDIN,
        accessToken: "access-token",
        expiresAt: new Date(Date.now() + 3600000),
        metadata: {
          urn: "urn:li:person:123",
        },
      }

      ;(mockPrisma.socialPost.findUnique as jest.Mock).mockResolvedValue(post)
      ;(mockPrisma.socialPost.update as jest.Mock)
        .mockResolvedValueOnce({
          ...post,
          status: SocialPostStatus.POSTING,
        })
        .mockResolvedValueOnce({
          ...post,
          status: SocialPostStatus.FAILED,
          error: "Failed to publish",
        })
      ;(mockConnectedAccounts.findLatestByProvider as jest.Mock).mockResolvedValue(
        account,
      )
      ;(mockHttpService.axiosRef.post as jest.Mock).mockRejectedValue(
        new Error("API Error"),
      )

      await expect(service.publishPost(postId, userId)).rejects.toThrow(
        AppError,
      )

      expect(mockPrisma.socialPost.update).toHaveBeenCalledWith({
        where: { id: postId },
        data: {
          status: SocialPostStatus.FAILED,
          error: expect.any(String),
        },
      })
    })

    it("should refresh Facebook page token when needed", async () => {
      const postId = "post-1"
      const userId = "user-1"
      const post = {
        id: postId,
        userId,
        channel: SocialChannel.FACEBOOK,
        content: "Test Facebook post",
        status: SocialPostStatus.DRAFT,
      }
      const account = {
        id: "account-1",
        userId,
        provider: ConnectedProvider.FACEBOOK,
        refreshToken: "user-refresh-token",
        metadata: {},
      }

      ;(mockPrisma.socialPost.findUnique as jest.Mock).mockResolvedValue(post)
      ;(mockPrisma.socialPost.update as jest.Mock)
        .mockResolvedValueOnce({
          ...post,
          status: SocialPostStatus.POSTING,
        })
        .mockResolvedValueOnce({
          ...post,
          status: SocialPostStatus.POSTED,
        })
      ;(mockConnectedAccounts.findLatestByProvider as jest.Mock).mockResolvedValue(
        account,
      )
      ;(mockHttpService.axiosRef.get as jest.Mock).mockResolvedValue({
        data: {
          data: [
            {
              id: "page-123",
              name: "Test Page",
              access_token: "page-access-token",
              category: "Business",
            },
          ],
        },
      })
      ;(mockHttpService.axiosRef.post as jest.Mock).mockResolvedValue({
        data: {
          id: "page-123_456",
        },
      })

      await service.publishPost(postId, userId)

      expect(mockHttpService.axiosRef.get).toHaveBeenCalledWith(
        expect.stringContaining("/me/accounts"),
        expect.any(Object),
      )
      expect(mockPrisma.connectedAccount.update).toHaveBeenCalled()
    })
  })
})

