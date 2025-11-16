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

type PublishResult = {
  externalPostId: string | null
  externalUrl: string | null
}

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
      let publishResult: PublishResult
      switch (post.channel) {
        case SocialChannel.LINKEDIN:
          publishResult = await this.publishLinkedIn(post)
          break
        case SocialChannel.FACEBOOK:
          publishResult = await this.publishFacebook(post)
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
          externalPostId: publishResult.externalPostId,
          externalUrl: publishResult.externalUrl,
          publishedAt: new Date(),
          error: null,
        } as Prisma.SocialPostUpdateInput,
      })
    } catch (error) {
      // If this was an application-level error (e.g., missing account),
      // rethrow to preserve the original HTTP status (400/403/etc).
      if (error instanceof AppError) {
        throw error
      }
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

  private async publishLinkedIn(post: SocialPost): Promise<PublishResult> {
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
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
      },
    )
    const externalPostId = data?.id ?? data?.entityUrn ?? null
    const externalUrl = externalPostId
      ? `https://www.linkedin.com/feed/update/${externalPostId}`
      : null

    return { externalPostId, externalUrl }
  }

  private async publishFacebook(post: SocialPost): Promise<PublishResult> {
    const account = await this.connectedAccounts.findLatestByProvider(
      post.userId,
      ConnectedProvider.FACEBOOK,
    )
    if (!account) {
      throw new AppError(ErrorCodes.BAD_REQUEST, {
        params: { resource: "FacebookAccount" },
      })
    }

    const stored = this.extractFacebookPageAccount(account)
    const attempts: Array<
      () => Promise<{ pageId: string; accessToken: string }>
    > = []

    if (stored.pageId && stored.accessToken) {
      attempts.push(async () => ({
        pageId: stored.pageId!,
        accessToken: stored.accessToken!,
      }))
    }

    if (account.refreshToken) {
      attempts.push(() =>
        this.refreshFacebookPageAccessToken(account, stored.pageId),
      )
    }

    if (!attempts.length) {
      throw new AppError(ErrorCodes.BAD_REQUEST, {
        params: { resource: "FacebookAccount" },
      })
    }

    let lastError: unknown = null
    for (const attempt of attempts) {
      try {
        const { pageId, accessToken } = await attempt()
        if (!pageId || !accessToken) {
          continue
        }
        return await this.sendFacebookPost(pageId, accessToken, post.content)
      } catch (error) {
        lastError = error
        this.logger.warn(
          `Facebook publish attempt failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }

    throw lastError ?? new Error("Unable to publish to Facebook")
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
    const metadata = ((account.metadata ?? {}) as Record<string, unknown>) ?? {}
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

  private extractFacebookPageAccount(account: ConnectedAccount) {
    const metadata = ((account.metadata ?? {}) as Record<string, unknown>) ?? {}
    const pageId =
      (metadata.pageId as string | undefined) ??
      account.providerAccountId ??
      null
    const accessToken = account.accessToken ?? null
    return { pageId, accessToken }
  }

  private async refreshFacebookPageAccessToken(
    account: ConnectedAccount,
    preferredPageId?: string | null,
  ) {
    if (!account.refreshToken) {
      throw new AppError(ErrorCodes.FORBIDDEN, {
        params: { resource: "FacebookAccount" },
      })
    }
    const pages = await this.fetchFacebookPages(account.refreshToken)
    const page =
      (preferredPageId && pages.find((p) => p.id === preferredPageId)) ??
      pages[0]
    if (!page?.id || !page.access_token) {
      throw new Error("Unable to refresh Facebook page access token")
    }
    const metadata = ((account.metadata ?? {}) as Record<string, unknown>) ?? {}
    await this.prisma.connectedAccount.update({
      where: { id: account.id },
      data: {
        providerAccountId: page.id,
        accessToken: page.access_token,
        metadata: {
          ...metadata,
          pageId: page.id,
          pageName: page.name,
          category: page.category,
        } as Prisma.InputJsonValue,
        linkedAt: new Date(),
      },
    })
    return { pageId: page.id, accessToken: page.access_token }
  }

  private async fetchFacebookPages(userAccessToken: string) {
    const url = `https://graph.facebook.com/${this.facebookGraphVersion}/me/accounts`
    const { data } = await this.http.axiosRef.get<{ data: FacebookPage[] }>(
      url,
      {
        params: { access_token: userAccessToken },
      },
    )
    return data?.data ?? []
  }

  private async sendFacebookPost(
    pageId: string,
    accessToken: string,
    content: string,
  ): Promise<PublishResult> {
    const url = `https://graph.facebook.com/${this.facebookGraphVersion}/${pageId}/feed`
    const params = new URLSearchParams({
      message: content,
      access_token: accessToken,
    })

    const { data } = await this.http.axiosRef.post(url, params)
    const externalPostId = data?.id ?? null
    let externalUrl: string | null = null
    if (externalPostId) {
      const [pageIdPart, postIdPart] = externalPostId.split("_")
      if (pageIdPart && postIdPart) {
        externalUrl = `https://www.facebook.com/${pageIdPart}/posts/${postIdPart}`
      } else if (pageId) {
        externalUrl = `https://www.facebook.com/${pageId}`
      }
    }
    return { externalPostId, externalUrl }
  }
}

type FacebookPage = {
  id: string
  name: string
  access_token: string
  category?: string
}
