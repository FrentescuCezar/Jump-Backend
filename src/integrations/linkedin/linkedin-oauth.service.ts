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

type LinkedInTokenResponse = {
  access_token: string
  expires_in: number
  refresh_token?: string
  id_token?: string // OpenID Connect ID token
}

@Injectable()
export class LinkedInOAuthService {
  private readonly logger = new Logger(LinkedInOAuthService.name)
  private readonly clientId: string
  private readonly clientSecret: string
  private readonly redirectUri: string
  private readonly scopes: string[]
  private readonly stateSecret: string
  private readonly appOrigin: string

  constructor(
    private readonly configService: ConfigService,
    private readonly http: HttpService,
    private readonly connectedAccounts: ConnectedAccountsService,
  ) {
    this.clientId = this.configService.getOrThrow<string>("LINKEDIN_CLIENT_ID")
    this.clientSecret = this.configService.getOrThrow<string>(
      "LINKEDIN_CLIENT_SECRET",
    )
    this.redirectUri = this.configService.getOrThrow<string>(
      "LINKEDIN_REDIRECT_URI",
    )
    this.scopes = ["openid", "profile", "email", "w_member_social"]
    this.stateSecret =
      this.configService.get<string>("LINKEDIN_STATE_SECRET") ??
      this.configService.getOrThrow<string>("NEXTAUTH_SECRET")
    this.appOrigin = this.configService.getOrThrow<string>("APP_ORIGIN")
  }

  buildAuthorizationUrl(userId: string, redirectPath?: string) {
    const state = this.signState({
      userId,
      redirectPath: this.sanitizeRedirectPath(redirectPath),
    })
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scopes.join(" "),
      state,
    })
    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`
  }

  async handleCallback(code: string, stateToken: string) {
    try {
      this.logger.log("Verifying state token")
      const state = this.verifyState(stateToken)
      this.logger.log(`State verified for user: ${state.userId}`)

      this.logger.log("Exchanging authorization code for tokens")
      const tokens = await this.exchangeCode(code)
      this.logger.log("Token exchange successful")
      this.logger.log(`Token response includes id_token: ${!!tokens.id_token}`)

      this.logger.log("Fetching user profile")
      // Try to get profile from ID token first, then fall back to API
      let profile: {
        id: string
        localizedFirstName?: string
        localizedLastName?: string
        email?: string
      }

      if (tokens.id_token) {
        // With OpenID Connect, the ID token contains all user info we need
        profile = this.extractProfileFromIdToken(tokens.id_token)
        this.logger.log(
          `Profile extracted from ID token: ${profile.id}, email: ${profile.email ? "present" : "missing"}`,
        )
      } else {
        // No ID token - this shouldn't happen with OpenID Connect scopes
        this.logger.error(
          "No ID token received from LinkedIn. This indicates OpenID Connect is not properly configured.",
        )
        throw new Error(
          "LinkedIn did not provide an ID token. Please ensure OpenID Connect is enabled in your LinkedIn app settings.",
        )
      }

      const urn = profile?.id ? `urn:li:person:${profile.id}` : null

      this.logger.log("Upserting connected account")
      const account = await this.connectedAccounts.upsertAccount(
        state.userId,
        ConnectedProvider.LINKEDIN,
        profile.id ?? state.userId,
        {
          label:
            `${profile.localizedFirstName ?? ""} ${profile.localizedLastName ?? ""}`.trim() ||
            "LinkedIn",
          scopes: this.scopes,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          metadata: {
            urn,
            localizedFirstName: profile.localizedFirstName,
            localizedLastName: profile.localizedLastName,
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

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<LinkedInTokenResponse> {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    })
    const { data } = await this.http.axiosRef.post<LinkedInTokenResponse>(
      "https://www.linkedin.com/oauth/v2/accessToken",
      params.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    )
    return data
  }

  private async exchangeCode(code: string): Promise<LinkedInTokenResponse> {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    })
    try {
      const { data } = await this.http.axiosRef.post<LinkedInTokenResponse>(
        "https://www.linkedin.com/oauth/v2/accessToken",
        params.toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      )
      return data
    } catch (error: any) {
      this.logger.error(
        `Token exchange failed: ${error?.response?.data || error?.message || String(error)}`,
      )
      if (error?.response?.data) {
        this.logger.error(
          `LinkedIn response: ${JSON.stringify(error.response.data)}`,
        )
      }
      throw error
    }
  }

  private extractProfileFromIdToken(idToken: string): {
    id: string
    localizedFirstName?: string
    localizedLastName?: string
    email?: string
  } {
    // Decode JWT without verification (ID token is from LinkedIn, we trust it)
    const parts = idToken.split(".")
    if (parts.length !== 3) {
      throw new Error("Invalid ID token format")
    }
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8"),
    ) as {
      sub: string
      given_name?: string
      family_name?: string
      name?: string
      email?: string
    }

    return {
      id: payload.sub,
      localizedFirstName: payload.given_name,
      localizedLastName: payload.family_name,
      email: payload.email,
    }
  }

  private async fetchProfile(accessToken: string) {
    try {
      // Try using People API with version parameter
      const { data: profileData } = await this.http.axiosRef.get<{
        id: string
        localizedFirstName?: string
        localizedLastName?: string
        firstName?: {
          localized?: Record<string, string>
          preferredLocale?: {
            country?: string
            language?: string
          }
        }
        lastName?: {
          localized?: Record<string, string>
          preferredLocale?: {
            country?: string
            language?: string
          }
        }
      }>("https://api.linkedin.com/v2/me", {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "X-Restli-Protocol-Version": "2.0.0",
        },
        params: {
          projection:
            "(id,localizedFirstName,localizedLastName,firstName,lastName)",
        },
      })

      // Fetch email separately using the email endpoint
      let email: string | undefined
      try {
        const { data: emailData } = await this.http.axiosRef.get<{
          elements?: Array<{
            "handle~"?: {
              emailAddress?: string
            }
          }>
        }>("https://api.linkedin.com/v2/emailAddress", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            q: "members",
            projection: "(elements*(handle~))",
          },
        })
        email = emailData.elements?.[0]?.["handle~"]?.emailAddress
      } catch (emailError: any) {
        this.logger.warn(
          `Failed to fetch email: ${emailError?.response?.data || emailError?.message}`,
        )
        // Email is optional, continue without it
      }

      this.logger.log(
        `Profile data received: ${JSON.stringify({ id: profileData.id, hasEmail: !!email })}`,
      )

      // Extract names - handle both formats
      const firstName =
        profileData.localizedFirstName ||
        profileData.firstName?.localized?.[
          `${profileData.firstName.preferredLocale?.language}_${profileData.firstName.preferredLocale?.country}`
        ] ||
        Object.values(profileData.firstName?.localized || {})[0]

      const lastName =
        profileData.localizedLastName ||
        profileData.lastName?.localized?.[
          `${profileData.lastName.preferredLocale?.language}_${profileData.lastName.preferredLocale?.country}`
        ] ||
        Object.values(profileData.lastName?.localized || {})[0]

      return {
        id: profileData.id,
        localizedFirstName: firstName,
        localizedLastName: lastName,
        email,
      }
    } catch (error: any) {
      this.logger.error(
        `Profile fetch failed: ${error?.response?.data || error?.message || String(error)}`,
      )
      if (error?.response?.data) {
        this.logger.error(
          `LinkedIn response: ${JSON.stringify(error.response.data)}`,
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
      throw new Error("Invalid LinkedIn state payload")
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
    return `${this.appOrigin}/settings/integrations?provider=linkedin`
  }
}
