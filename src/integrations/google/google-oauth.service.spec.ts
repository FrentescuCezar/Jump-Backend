// Mock googleapis before any imports
const mockGenerateAuthUrl = jest.fn().mockReturnValue(
  "https://accounts.google.com/oauth/authorize?state=test-state&client_id=test",
)
const mockGetToken = jest.fn()
const mockSetCredentials = jest.fn()

jest.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: jest.fn(() => ({
        generateAuthUrl: mockGenerateAuthUrl,
        getToken: mockGetToken,
        setCredentials: mockSetCredentials,
      })),
    },
    oauth2: jest.fn(() => ({
      userinfo: {
        get: jest.fn(),
      },
    })),
  },
}))

import { Test, TestingModule } from "@nestjs/testing"
import { ConfigService } from "@nestjs/config"
import { GoogleOAuthService } from "./google-oauth.service"
import { ConnectedAccountsService } from "../connected-accounts.service"
import { ConnectedProvider } from "@prisma/client"

describe("GoogleOAuthService", () => {
  let service: GoogleOAuthService
  let configService: ConfigService
  let connectedAccounts: ConnectedAccountsService

  const mockConfigService = {
    getOrThrow: jest.fn((key: string) => {
      const config: Record<string, string> = {
        GOOGLE_OAUTH_CLIENT_ID: "test-client-id",
        GOOGLE_OAUTH_CLIENT_SECRET: "test-client-secret",
        GOOGLE_OAUTH_REDIRECT_URI: "http://localhost:3001/callback",
        APP_ORIGIN: "http://localhost:3000",
        NEXTAUTH_SECRET: "test-secret",
      }
      return config[key] || "default-value"
    }),
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        GOOGLE_OAUTH_STATE_SECRET: undefined,
      }
      return config[key]
    }),
  }

  const mockConnectedAccounts = {
    upsertAccount: jest.fn(),
  }

  beforeEach(async () => {
    // Reset mocks before each test
    mockGenerateAuthUrl.mockClear()
    mockGetToken.mockClear()
    mockSetCredentials.mockClear()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleOAuthService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: ConnectedAccountsService,
          useValue: mockConnectedAccounts,
        },
      ],
    }).compile()

    service = module.get<GoogleOAuthService>(GoogleOAuthService)
    configService = module.get<ConfigService>(ConfigService)
    connectedAccounts = module.get<ConnectedAccountsService>(
      ConnectedAccountsService,
    )

    jest.clearAllMocks()
  })

  describe("buildAuthorizationUrl", () => {
    it("should build authorization URL with state", () => {
      const userId = "user-1"
      const url = service.buildAuthorizationUrl(userId)

      expect(url).toBeDefined()
      expect(typeof url).toBe("string")
      expect(url.length).toBeGreaterThan(0)
      expect(mockGenerateAuthUrl).toHaveBeenCalled()
    })

    it("should include redirect path in state", () => {
      const userId = "user-1"
      const redirectPath = "/settings"
      const url = service.buildAuthorizationUrl(userId, redirectPath)

      expect(url).toBeDefined()
      expect(typeof url).toBe("string")
      expect(mockGenerateAuthUrl).toHaveBeenCalled()
    })
  })

  describe("verifyStateToken", () => {
    it("should verify valid state token", () => {
      const jwt = require("jsonwebtoken")
      const payload = { userId: "user-1", redirectPath: "/settings" }
      const token = jwt.sign(payload, "test-secret", { expiresIn: "15m" })

      const result = service.verifyStateToken(token)

      expect(result.userId).toBe("user-1")
      expect(result.redirectPath).toBe("/settings")
    })

    it("should throw error for invalid token", () => {
      expect(() => service.verifyStateToken("invalid-token")).toThrow()
    })
  })

  describe("handleOAuthCallback", () => {
    it("should handle OAuth callback and create account", async () => {
      const code = "auth-code"
      const jwt = require("jsonwebtoken")
      const statePayload = { userId: "user-1" }
      const stateToken = jwt.sign(statePayload, "test-secret", {
        expiresIn: "15m",
      })

      // Setup mocks
      mockGetToken.mockResolvedValue({
        tokens: {
          access_token: "access-token",
          refresh_token: "refresh-token",
          expiry_date: Date.now() + 3600000,
          scope: "calendar.readonly",
        },
      })

      const { google } = require("googleapis")
      const mockUserinfoGet = jest.fn().mockResolvedValue({
        data: {
          id: "google-id",
          email: "user@gmail.com",
          name: "Test User",
        },
      })
      google.oauth2 = jest.fn(() => ({
        userinfo: {
          get: mockUserinfoGet,
        },
      }))

      ;(mockConnectedAccounts.upsertAccount as jest.Mock).mockResolvedValue({
        id: "account-1",
        userId: "user-1",
        provider: ConnectedProvider.GOOGLE_CALENDAR,
      })

      const result = await service.handleOAuthCallback(code, stateToken)

      expect(result.account).toBeDefined()
      expect(result.redirectUri).toBeDefined()
      expect(mockConnectedAccounts.upsertAccount).toHaveBeenCalled()
      expect(mockGetToken).toHaveBeenCalled()
    })
  })

  describe("createOAuthClient", () => {
    it("should create OAuth client with credentials", () => {
      const credentials = {
        accessToken: "token-123",
        refreshToken: "refresh-123",
        expiryDate: Date.now() + 3600000,
      }

      const client = service.createOAuthClient(credentials)

      expect(client).toBeDefined()
    })

    it("should create OAuth client without credentials", () => {
      const client = service.createOAuthClient()

      expect(client).toBeDefined()
    })
  })
})
