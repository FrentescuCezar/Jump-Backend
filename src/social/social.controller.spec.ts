import { Test, TestingModule } from "@nestjs/testing"
import { SocialController } from "./social.controller"
import { SocialPublishingService } from "./social-publishing.service"
import { SocialPostStatus, SocialChannel } from "@prisma/client"

describe("SocialController", () => {
  let controller: SocialController
  let socialPublishingService: SocialPublishingService

  const mockSocialPublishingService = {
    publishPost: jest.fn(),
  }

  const mockUser = {
    id: "user-1",
    email: "test@example.com",
    name: "Test User",
    keycloakId: "keycloak-1",
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SocialController],
      providers: [
        {
          provide: SocialPublishingService,
          useValue: mockSocialPublishingService,
        },
      ],
    }).compile()

    controller = module.get<SocialController>(SocialController)
    socialPublishingService = module.get<SocialPublishingService>(
      SocialPublishingService,
    )

    jest.clearAllMocks()
  })

  describe("publish", () => {
    it("should publish a social post", async () => {
      const post = {
        id: "post-1",
        channel: SocialChannel.LINKEDIN,
        content: "Test post",
        status: SocialPostStatus.POSTED,
        externalPostId: "external-123",
        externalUrl: "https://linkedin.com/posts/123",
        publishedAt: new Date(),
      }

      ;(mockSocialPublishingService.publishPost as jest.Mock).mockResolvedValue(
        post,
      )

      const result = await controller.publish("post-1", mockUser as any)

      expect(result.post.id).toBe("post-1")
      expect(result.post.status).toBe(SocialPostStatus.POSTED)
      expect(mockSocialPublishingService.publishPost).toHaveBeenCalledWith(
        "post-1",
        mockUser.id,
      )
    })
  })
})

