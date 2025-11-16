import { Test, TestingModule } from "@nestjs/testing"
import { ConfigService } from "@nestjs/config"
import { HttpService } from "@nestjs/axios"
import { FacebookOAuthService } from "./facebook-oauth.service"
import { ConnectedAccountsService } from "../connected-accounts.service"
import { ConnectedProvider } from "@prisma/client"

describe("FacebookOAuthService", () => {
  let service: FacebookOAuthService
  let configService: ConfigService
  let httpService: HttpService
  let connectedAccounts: ConnectedAccountsService

  const mockConfigService = {
    getOrThrow: jest.fn((key: string) => {
      const config: Record<string, string> = {
        FACEBOOK_CLIENT_ID: "test-client-id",
        FACEBOOK_CLIENT_SECRET: "test-client-secret",
        FACEBOOK_REDIRECT_URI: "http://localhost:3001/callback",
        APP_ORIGIN: "http://localhost:3000",
        NEXTAUTH_SECRET: "test-secret",
        FACEBOOK_GRAPH_VERSION: "v19.0",
      }
      return config[key] || "default-value"
    }),
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        FACEBOOK_STATE_SECRET: undefined,
        FACEBOOK_GRAPH_VERSION: "v19.0",
      }
      return config[key]
    }),
  }

  const mockHttpService = {
    axiosRef: {
      get: jest.fn(),
    },
  }

  const mockConnectedAccounts = {
    upsertAccount: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacebookOAuthService,
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

    service = module.get<FacebookOAuthService>(FacebookOAuthService)
    configService = module.get<ConfigService>(ConfigService)
    httpService = module.get<HttpService>(HttpService)
    connectedAccounts = module.get<ConnectedAccountsService>(
      ConnectedAccountsService,
    )

    jest.clearAllMocks()
  })

  describe("buildAuthorizationUrl", () => {
    it("should build Facebook authorization URL", () => {
      const userId = "user-1"
      const url = service.buildAuthorizationUrl(userId)

      expect(url).toContain("facebook.com")
      expect(url).toContain("client_id=test-client-id")
      expect(url).toContain("response_type=code")
    })

    it("should include redirect path in state", () => {
      const userId = "user-1"
      const redirectPath = "/settings"
      const url = service.buildAuthorizationUrl(userId, redirectPath)

      expect(url).toContain("facebook.com")
    })
  })

  describe("handleCallback", () => {
    it("should handle Facebook OAuth callback", async () => {
      const code = "auth-code"
      const jwt = require("jsonwebtoken")
      const statePayload = { userId: "user-1" }
      const stateToken = jwt.sign(statePayload, "test-secret", {
        expiresIn: "15m",
      })

      // Mock token exchange
      ;(mockHttpService.axiosRef.get as jest.Mock)
        .mockResolvedValueOnce({
          data: {
            access_token: "short-lived-token",
            expires_in: 3600,
          },
        })
        .mockResolvedValueOnce({
          data: {
            access_token: "long-lived-token",
            expires_in: 5184000,
          },
        })
        .mockResolvedValueOnce({
          data: {
            data: [
              {
                id: "page-id",
                name: "Test Page",
                access_token: "page-token",
              },
            ],
          },
        })

      ;(mockConnectedAccounts.upsertAccount as jest.Mock).mockResolvedValue({
        id: "account-1",
        userId: "user-1",
        provider: ConnectedProvider.FACEBOOK,
      })

      const result = await service.handleCallback(code, stateToken)

      expect(result.account).toBeDefined()
      expect(result.redirectUri).toBeDefined()
      expect(mockConnectedAccounts.upsertAccount).toHaveBeenCalled()
    })
  })
})

