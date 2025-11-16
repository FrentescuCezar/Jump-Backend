import { Test, TestingModule } from "@nestjs/testing"
import { ConfigService } from "@nestjs/config"
import { HttpService } from "@nestjs/axios"
import { LinkedInOAuthService } from "./linkedin-oauth.service"
import { ConnectedAccountsService } from "../connected-accounts.service"
import { ConnectedProvider } from "@prisma/client"

describe("LinkedInOAuthService", () => {
  let service: LinkedInOAuthService
  let configService: ConfigService
  let httpService: HttpService
  let connectedAccounts: ConnectedAccountsService

  const mockConfigService = {
    getOrThrow: jest.fn((key: string) => {
      const config: Record<string, string> = {
        LINKEDIN_CLIENT_ID: "test-client-id",
        LINKEDIN_CLIENT_SECRET: "test-client-secret",
        LINKEDIN_REDIRECT_URI: "http://localhost:3001/callback",
        APP_ORIGIN: "http://localhost:3000",
        NEXTAUTH_SECRET: "test-secret",
      }
      return config[key] || "default-value"
    }),
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        LINKEDIN_STATE_SECRET: undefined,
      }
      return config[key]
    }),
  }

  const mockHttpService = {
    axiosRef: {
      post: jest.fn(),
      get: jest.fn(),
    },
  }

  const mockConnectedAccounts = {
    upsertAccount: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinkedInOAuthService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConnectedAccountsService,
          useValue: mockConnectedAccounts,
        },
      ],
    }).compile()

    service = module.get<LinkedInOAuthService>(LinkedInOAuthService)
    configService = module.get<ConfigService>(ConfigService)
    httpService = module.get<HttpService>(HttpService)
    connectedAccounts = module.get<ConnectedAccountsService>(
      ConnectedAccountsService,
    )

    jest.clearAllMocks()
  })

  describe("buildAuthorizationUrl", () => {
    it("should build LinkedIn authorization URL", () => {
      const userId = "user-1"
      const url = service.buildAuthorizationUrl(userId)

      expect(url).toContain("linkedin.com/oauth/v2/authorization")
      expect(url).toContain("client_id=test-client-id")
      expect(url).toContain("response_type=code")
    })

    it("should include redirect path in state", () => {
      const userId = "user-1"
      const redirectPath = "/settings"
      const url = service.buildAuthorizationUrl(userId, redirectPath)

      expect(url).toContain("linkedin.com/oauth/v2/authorization")
    })
  })

  describe("handleCallback", () => {
    it("should handle LinkedIn OAuth callback", async () => {
      const code = "auth-code"
      const jwt = require("jsonwebtoken")
      const statePayload = { userId: "user-1" }
      const stateToken = jwt.sign(statePayload, "test-secret", {
        expiresIn: "15m",
      })

      // Mock token exchange
      ;(mockHttpService.axiosRef.post as jest.Mock).mockResolvedValue({
        data: {
          access_token: "access-token",
          expires_in: 3600,
          refresh_token: "refresh-token",
          id_token: jwt.sign(
            {
              sub: "linkedin-id",
              email: "user@linkedin.com",
              given_name: "John",
              family_name: "Doe",
            },
            "test-secret",
          ),
        },
      })

      ;(mockConnectedAccounts.upsertAccount as jest.Mock).mockResolvedValue({
        id: "account-1",
        userId: "user-1",
        provider: ConnectedProvider.LINKEDIN,
      })

      const result = await service.handleCallback(code, stateToken)

      expect(result.account).toBeDefined()
      expect(result.redirectUri).toBeDefined()
      expect(mockConnectedAccounts.upsertAccount).toHaveBeenCalled()
    })
  })
})

