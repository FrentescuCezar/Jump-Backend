import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { HttpService } from "@nestjs/axios"
import { JwtPayload, sign, verify } from "jsonwebtoken"
import { ConnectedProvider } from "@prisma/client"
import { ConnectedAccountsService } from "../connected-accounts.service"

interface StatePayload extends JwtPayload {
  userId: string
  redirectPath?: string
}

type FacebookTokenResponse = {
  access_token: string
  token_type: string
  expires_in?: number
}

type FacebookPage = {
  id: string
  name: string
  access_token: string
  category?: string
}

@Injectable()
export class FacebookOAuthService {
  private readonly logger = new Logger(FacebookOAuthService.name)
  private readonly clientId: string
  private readonly clientSecret: string
  private readonly redirectUri: string
  private readonly graphVersion: string
  private readonly scopes: string[]
  private readonly stateSecret: string
  private readonly appOrigin: string

  constructor(
    private readonly configService: ConfigService,
    private readonly http: HttpService,
    private readonly connectedAccounts: ConnectedAccountsService,
  ) {
    this.clientId = this.configService.getOrThrow<string>("FACEBOOK_CLIENT_ID")
    this.clientSecret = this.configService.getOrThrow<string>(
      "FACEBOOK_CLIENT_SECRET",
    )
    this.redirectUri = this.configService.getOrThrow<string>(
      "FACEBOOK_REDIRECT_URI",
    )
    this.graphVersion =
      this.configService.get<string>("FACEBOOK_GRAPH_VERSION") ?? "v19.0"
    // Facebook OAuth scopes
    // Add these permissions in Facebook Developer Console under "Customize use case" > "Manage Pages"
    // Click "+ Add" for each permission you need
    this.scopes = [
      "pages_show_list", // Ready for testing - lists user's pages
      "public_profile", // Ready for testing - basic profile info
      "pages_manage_posts", // Add this for posting to pages
      "pages_read_engagement", // Add this for reading engagement metrics
      "pages_manage_metadata", // Add this for webhooks and page settings
      "pages_read_user_content", // Add this for reading user comments
    ]
    this.stateSecret =
      this.configService.get<string>("FACEBOOK_STATE_SECRET") ??
      this.configService.getOrThrow<string>("NEXTAUTH_SECRET")
    this.appOrigin = this.configService.getOrThrow<string>("APP_ORIGIN")
  }

  buildAuthorizationUrl(userId: string, redirectPath?: string) {
    const state = this.signState({
      userId,
      redirectPath: this.sanitizeRedirectPath(redirectPath),
    })
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
      scope: this.scopes.join(","),
      response_type: "code",
    })
    return `https://www.facebook.com/${this.graphVersion}/dialog/oauth?${params.toString()}`
  }

  async handleCallback(code: string, stateToken: string) {
    try {
      this.logger.log("Verifying state token")
      const state = this.verifyState(stateToken)
      this.logger.log(`State verified for user: ${state.userId}`)

      this.logger.log("Exchanging authorization code for short-lived token")
      const shortLived = await this.exchangeCode(code)
      this.logger.log("Short-lived token obtained")

      this.logger.log("Exchanging for long-lived token")
      const longLived = await this.exchangeForLongLived(shortLived.access_token)
      this.logger.log("Long-lived token obtained")

      this.logger.log("Fetching user's Facebook pages")
      const pages = await this.fetchPages(longLived.access_token)
      this.logger.log(`Found ${pages.length} page(s)`)

      if (!pages.length) {
        this.logger.warn("No Facebook Pages available for publishing")
        throw new Error("No Facebook Pages available for publishing")
      }
      const page = pages[0]
      this.logger.log(`Selected page: ${page.name} (${page.id})`)

      this.logger.log("Upserting connected account")
      const account = await this.connectedAccounts.upsertAccount(
        state.userId,
        ConnectedProvider.FACEBOOK,
        page.id,
        {
          label: page.name,
          scopes: this.scopes,
          accessToken: page.access_token,
          refreshToken: longLived.access_token,
          expiresAt: longLived.expires_in
            ? new Date(Date.now() + longLived.expires_in * 1000)
            : null,
          metadata: {
            pageId: page.id,
            pageName: page.name,
            category: page.category,
          },
        },
      )
      this.logger.log("Account upserted successfully")

      return {
        account,
        redirectUri: this.resolveRedirectUri(state.redirectPath),
      }
    } catch (error) {
      this.logger.error(
        `Error in handleCallback: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      throw error
    }
  }

  private async exchangeCode(code: string): Promise<FacebookTokenResponse> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      client_secret: this.clientSecret,
      code,
    })
    try {
      const { data } = await this.http.axiosRef.get<FacebookTokenResponse>(
        `https://graph.facebook.com/${this.graphVersion}/oauth/access_token?${params.toString()}`,
      )
      return data
    } catch (error: any) {
      this.logger.error(
        `Token exchange failed: ${error?.response?.data || error?.message || String(error)}`,
      )
      if (error?.response?.data) {
        this.logger.error(
          `Facebook response: ${JSON.stringify(error.response.data)}`,
        )
      }
      throw error
    }
  }

  private async exchangeForLongLived(
    shortLivedToken: string,
  ): Promise<FacebookTokenResponse> {
    const params = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: this.clientId,
      client_secret: this.clientSecret,
      fb_exchange_token: shortLivedToken,
    })
    try {
      const { data } = await this.http.axiosRef.get<FacebookTokenResponse>(
        `https://graph.facebook.com/${this.graphVersion}/oauth/access_token?${params.toString()}`,
      )
      return data
    } catch (error: any) {
      this.logger.error(
        `Long-lived token exchange failed: ${error?.response?.data || error?.message || String(error)}`,
      )
      if (error?.response?.data) {
        this.logger.error(
          `Facebook response: ${JSON.stringify(error.response.data)}`,
        )
      }
      throw error
    }
  }

  private async fetchPages(accessToken: string): Promise<FacebookPage[]> {
    try {
      const { data } = await this.http.axiosRef.get<{
        data: FacebookPage[]
      }>(`https://graph.facebook.com/${this.graphVersion}/me/accounts`, {
        params: {
          access_token: accessToken,
        },
      })
      return data.data ?? []
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch pages: ${error?.response?.data || error?.message || String(error)}`,
      )
      if (error?.response?.data) {
        this.logger.error(
          `Facebook response: ${JSON.stringify(error.response.data)}`,
        )
      }
      if (error?.response?.status) {
        this.logger.error(`HTTP status: ${error.response.status}`)
      }
      throw error
    }
  }

  private signState(payload: StatePayload) {
    return sign(
      {
        ...payload,
        ts: Date.now(),
      },
      this.stateSecret,
      { expiresIn: "15m" },
    )
  }

  private verifyState(token: string): StatePayload {
    const payload = verify(token, this.stateSecret) as StatePayload
    if (!payload.userId) {
      throw new Error("Invalid Facebook state payload")
    }
    return payload
  }

  private sanitizeRedirectPath(path?: string) {
    if (!path || !path.startsWith("/")) {
      return undefined
    }
    return path
  }

  private resolveRedirectUri(redirectPath?: string) {
    if (!redirectPath) {
      return this.settingsRedirectBase
    }
    try {
      const url = new URL(redirectPath, this.appOrigin)
      if (url.origin !== this.appOrigin) {
        return this.settingsRedirectBase
      }
      return url.toString()
    } catch {
      return this.settingsRedirectBase
    }
  }

  get settingsRedirectBase() {
    return `${this.appOrigin}/settings/integrations?provider=facebook`
  }
}
