import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { HttpService } from "@nestjs/axios"
import * as jwt from "jsonwebtoken"
import { ConnectedAccountsService } from "../connected-accounts.service"
import { ConnectedProvider } from "@prisma/client"

@Injectable()
export class LinkedInOAuthService {
  private readonly logger = new Logger(LinkedInOAuthService.name)
  readonly settingsRedirectBase: string

  constructor(
    private readonly configService: ConfigService,
    private readonly http: HttpService,
    private readonly connectedAccounts: ConnectedAccountsService,
  ) {
    const appOrigin = this.configService.getOrThrow<string>("APP_ORIGIN")
    this.settingsRedirectBase = `${appOrigin}/settings/integrations?provider=linkedin`
  }

  buildAuthorizationUrl(userId: string, redirectPath?: string): string {
    const clientId = this.configService.getOrThrow<string>("LINKEDIN_CLIENT_ID")
    const redirectUri = this.configService.getOrThrow<string>(
      "LINKEDIN_REDIRECT_URI",
    )
    const stateSecret =
      this.configService.get<string>("LINKEDIN_STATE_SECRET") ||
      this.configService.getOrThrow<string>("NEXTAUTH_SECRET")

    const statePayload: { userId: string; redirectPath?: string } = { userId }
    if (redirectPath) {
      statePayload.redirectPath = redirectPath
    }

    const state = jwt.sign(statePayload, stateSecret, { expiresIn: "15m" })

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      scope: "openid profile email w_member_social",
    })

    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`
  }

  async handleCallback(
    code: string,
    state: string,
  ): Promise<{ account: any; redirectUri: string }> {
    const stateSecret =
      this.configService.get<string>("LINKEDIN_STATE_SECRET") ||
      this.configService.getOrThrow<string>("NEXTAUTH_SECRET")

    let statePayload: { userId: string; redirectPath?: string }
    try {
      statePayload = jwt.verify(state, stateSecret) as {
        userId: string
        redirectPath?: string
      }
    } catch (error) {
      this.logger.error("Invalid state token", error)
      throw new Error("Invalid state token")
    }

    const clientId = this.configService.getOrThrow<string>("LINKEDIN_CLIENT_ID")
    const clientSecret = this.configService.getOrThrow<string>(
      "LINKEDIN_CLIENT_SECRET",
    )
    const oauthRedirectUri = this.configService.getOrThrow<string>(
      "LINKEDIN_REDIRECT_URI",
    )

    const tokenResponse = await this.http.axiosRef.post<{
      access_token: string
      expires_in: number
      refresh_token: string
      id_token?: string
    }>(
      "https://www.linkedin.com/oauth/v2/accessToken",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: oauthRedirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    )

    const { access_token, expires_in, refresh_token, id_token } =
      tokenResponse.data

    let providerAccountId = ""
    if (id_token) {
      try {
        const decoded = jwt.decode(id_token) as { sub?: string }
        providerAccountId = decoded.sub || ""
      } catch (error) {
        this.logger.warn("Failed to decode LinkedIn ID token", error)
      }
    }

    if (!providerAccountId) {
      // Fallback: fetch user info from LinkedIn API
      const userResponse = await this.http.axiosRef.get<{ id: string }>(
        "https://api.linkedin.com/v2/me",
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        },
      )
      providerAccountId = userResponse.data.id
    }

    const account = await this.connectedAccounts.upsertAccount(
      statePayload.userId,
      ConnectedProvider.LINKEDIN,
      providerAccountId,
      {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: new Date(Date.now() + expires_in * 1000),
        scopes: ["openid", "profile", "email", "w_member_social"],
      },
    )

    const redirectPath = statePayload.redirectPath || ""
    const redirectUri = redirectPath
      ? `${this.settingsRedirectBase}&redirectPath=${encodeURIComponent(redirectPath)}&status=success`
      : `${this.settingsRedirectBase}&status=success`

    return { account, redirectUri }
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ access_token: string; expires_in: number }> {
    const clientId = this.configService.getOrThrow<string>("LINKEDIN_CLIENT_ID")
    const clientSecret = this.configService.getOrThrow<string>(
      "LINKEDIN_CLIENT_SECRET",
    )

    const response = await this.http.axiosRef.post<{
      access_token: string
      expires_in: number
      refresh_token?: string
    }>(
      "https://www.linkedin.com/oauth/v2/accessToken",
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    )

    return {
      access_token: response.data.access_token,
      expires_in: response.data.expires_in,
    }
  }
}

