import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { google } from "googleapis"
import { OAuth2Client, type Credentials } from "google-auth-library"
import { JwtPayload, sign, verify } from "jsonwebtoken"
import { ConnectedProvider } from "@prisma/client"
import { ConnectedAccountsService } from "../connected-accounts.service"

type GoogleTokens = Credentials & { scope?: string }

type GoogleProfile = {
  id: string
  email?: string
  name?: string
  given_name?: string
  family_name?: string
  picture?: string
}

interface StatePayload extends JwtPayload {
  userId: string
}

@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name)
  private readonly oauthClient: OAuth2Client
  private readonly redirectUri: string
  private readonly stateSecret: string
  private readonly appOrigin: string
  private readonly scopes: string[]

  constructor(
    private readonly configService: ConfigService,
    private readonly connectedAccounts: ConnectedAccountsService,
  ) {
    const clientId = this.configService.getOrThrow<string>(
      "GOOGLE_OAUTH_CLIENT_ID",
    )
    const clientSecret = this.configService.getOrThrow<string>(
      "GOOGLE_OAUTH_CLIENT_SECRET",
    )
    this.redirectUri = this.configService.getOrThrow<string>(
      "GOOGLE_OAUTH_REDIRECT_URI",
    )
    this.stateSecret =
      this.configService.get<string>("GOOGLE_OAUTH_STATE_SECRET") ??
      this.configService.getOrThrow<string>("NEXTAUTH_SECRET")
    this.appOrigin = this.configService.getOrThrow<string>("APP_ORIGIN")
    this.oauthClient = new google.auth.OAuth2(
      clientId,
      clientSecret,
      this.redirectUri,
    )
    this.scopes = [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "openid",
    ]
  }

  buildAuthorizationUrl(userId: string) {
    const state = this.signState({ userId })
    return this.oauthClient.generateAuthUrl({
      access_type: "offline",
      scope: this.scopes,
      include_granted_scopes: true,
      prompt: "consent",
      state,
    })
  }

  verifyStateToken(token: string): StatePayload {
    const payload = verify(token, this.stateSecret) as StatePayload
    if (!payload.userId) {
      throw new Error("Invalid OAuth state payload")
    }
    return payload
  }

  async exchangeCode(
    code: string,
  ): Promise<{ tokens: GoogleTokens; profile: GoogleProfile }> {
    const { tokens } = await this.oauthClient.getToken({
      code,
      redirect_uri: this.redirectUri,
    })

    this.oauthClient.setCredentials(tokens)
    const oauth2 = google.oauth2("v2")
    const { data } = await oauth2.userinfo.get({
      auth: this.oauthClient,
    })

    return { tokens, profile: data as GoogleProfile }
  }

  async handleOAuthCallback(code: string, stateToken: string) {
    const state = this.verifyStateToken(stateToken)
    const { tokens, profile } = await this.exchangeCode(code)

    if (!profile?.id) {
      throw new Error("Unable to determine Google account id")
    }

    const account = await this.connectedAccounts.upsertAccount(
      state.userId,
      ConnectedProvider.GOOGLE_CALENDAR,
      profile.id,
      {
        label: profile.email ?? profile.name ?? "Google Calendar",
        scopes: (tokens.scope ?? "").split(" ").filter(Boolean),
        accessToken: tokens.access_token ?? null,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        metadata: {
          email: profile.email,
          name: profile.name,
          picture: profile.picture,
        },
      },
    )

    return { account, redirectUri: this.settingsRedirectBase }
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

  createOAuthClient(credentials?: {
    accessToken?: string | null
    refreshToken?: string | null
    expiryDate?: number | null
  }) {
    const clientId = this.configService.getOrThrow<string>(
      "GOOGLE_OAUTH_CLIENT_ID",
    )
    const clientSecret = this.configService.getOrThrow<string>(
      "GOOGLE_OAUTH_CLIENT_SECRET",
    )
    const client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      this.redirectUri,
    )
    if (credentials) {
      client.setCredentials({
        access_token: credentials.accessToken ?? undefined,
        refresh_token: credentials.refreshToken ?? undefined,
        expiry_date: credentials.expiryDate ?? undefined,
      })
    }
    return client
  }

  get settingsRedirectBase() {
    return `${this.appOrigin}/settings/integrations?provider=google`
  }
}
