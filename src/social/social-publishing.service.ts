import { Injectable, Logger } from "@nestjs/common"
import { HttpService } from "@nestjs/axios"
import { ConfigService } from "@nestjs/config"
import {
  ConnectedAccount,
  ConnectedProvider,
  Prisma,
  SocialChannel,
  SocialPost,
  SocialPostStatus,
} from "@prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import { ConnectedAccountsService } from "../integrations/connected-accounts.service"
import { LinkedInOAuthService } from "../integrations/linkedin/linkedin-oauth.service"
import { AppError } from "../errors/app-error"
import { ErrorCodes } from "../errors/error-codes"

@Injectable()
export class SocialPublishingService {
  private readonly logger = new Logger(SocialPublishingService.name)
  private readonly facebookGraphVersion: string

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly configService: ConfigService,
    private readonly connectedAccounts: ConnectedAccountsService,
    private readonly linkedinOAuth: LinkedInOAuthService,
  ) {
    this.facebookGraphVersion =
      this.configService.get<string>("FACEBOOK_GRAPH_VERSION") ?? "v19.0"
  }

  async publishPost(postId: string, userId: string) {
    const post = await this.prisma.socialPost.findUnique({
      where: { id: postId },
    })
    if (!post || post.userId !== userId) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        params: { resource: "SocialPost" },
      })
    }
    if (!post.content) {
      throw new AppError(ErrorCodes.BAD_REQUEST, {
        params: { resource: "SocialPost" },
      })
    }

    await this.prisma.socialPost.update({
      where: { id: post.id },
      data: { status: SocialPostStatus.POSTING, error: null },
    })

    try {
      let externalPostId: string | null = null
      switch (post.channel) {
        case SocialChannel.LINKEDIN:
          externalPostId = await this.publishLinkedIn(post)
          break
        case SocialChannel.FACEBOOK:
          externalPostId = await this.publishFacebook(post)
          break
        default:
          throw new AppError(ErrorCodes.BAD_REQUEST, {
            params: { resource: "SocialPost" },
          })
      }

      return await this.prisma.socialPost.update({
        where: { id: post.id },
        data: {
          status: SocialPostStatus.POSTED,
          externalPostId,
          publishedAt: new Date(),
          error: null,
        },
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to publish post"
      await this.prisma.socialPost.update({
        where: { id: post.id },
        data: {
          status: SocialPostStatus.FAILED,
          error: message,
        },
      })
      throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, {
        params: { resource: "SocialPost" },
        debug: message,
      })
    }
  }

  private async publishLinkedIn(post: SocialPost) {
    const account = await this.connectedAccounts.findLatestByProvider(
      post.userId,
      ConnectedProvider.LINKEDIN,
    )
    if (!account) {
      throw new AppError(ErrorCodes.BAD_REQUEST, {
        params: { resource: "LinkedInAccount" },
      })
    }

    const accessToken = await this.ensureLinkedInAccessToken(account)
    const authorUrn = await this.resolveLinkedInUrn(account, accessToken)

    const payload = {
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareMediaCategory: "NONE",
          shareCommentary: {
            text: post.content,
          },
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    }

    const { data } = await this.http.axiosRef.post(
      "https://api.linkedin.com/v2/ugcPosts",
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
      },
    )
    return data?.id ?? data?.entityUrn ?? null
  }

  private async publishFacebook(post: SocialPost) {
    const account = await this.connectedAccounts.findLatestByProvider(
      post.userId,
      ConnectedProvider.FACEBOOK,
    )
    if (!account?.accessToken) {
      throw new AppError(ErrorCodes.BAD_REQUEST, {
        params: { resource: "FacebookAccount" },
      })
    }

    const metadata =
      ((account.metadata ?? {}) as Record<string, unknown>) ?? {}
    const pageId = metadata.pageId as string
    if (!pageId) {
      throw new AppError(ErrorCodes.BAD_REQUEST, {
        params: { resource: "FacebookAccount" },
      })
    }

    const url = `https://graph.facebook.com/${this.facebookGraphVersion}/${pageId}/feed`
    const params = new URLSearchParams({
      message: post.content,
      access_token: account.accessToken,
    })

    const { data } = await this.http.axiosRef.post(url, params)
    return data?.id ?? null
  }

  private async ensureLinkedInAccessToken(account: ConnectedAccount) {
    if (account.accessToken && !this.isExpired(account.expiresAt)) {
      return account.accessToken
    }
    if (!account.refreshToken) {
      throw new AppError(ErrorCodes.FORBIDDEN, {
        params: { resource: "LinkedInAccount" },
      })
    }
    const tokens = await this.linkedinOAuth.refreshAccessToken(
      account.refreshToken,
    )
    const updated = await this.prisma.connectedAccount.update({
      where: { id: account.id },
      data: {
        accessToken: tokens.access_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    })
    return updated.accessToken!
  }

  private async resolveLinkedInUrn(
    account: ConnectedAccount,
    accessToken: string,
  ) {
    const metadata =
      ((account.metadata ?? {}) as Record<string, unknown>) ?? {}
    if (typeof metadata.urn === "string" && metadata.urn.length) {
      return metadata.urn
    }

    const { data } = await this.http.axiosRef.get<{ id: string }>(
      "https://api.linkedin.com/v2/me",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    )
    if (!data?.id) {
      throw new Error("Unable to resolve LinkedIn member id")
    }
    const urn = `urn:li:person:${data.id}`
    await this.prisma.connectedAccount.update({
      where: { id: account.id },
      data: {
        metadata: {
          ...metadata,
          urn,
        } as Prisma.InputJsonValue,
      },
    })
    return urn
  }

  private isExpired(expiresAt?: Date | null) {
    if (!expiresAt) {
      return true
    }
    return expiresAt.getTime() <= Date.now() + 60 * 1000
  }
}



