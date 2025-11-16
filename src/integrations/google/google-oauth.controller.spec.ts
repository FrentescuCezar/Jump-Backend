import { Test, TestingModule } from "@nestjs/testing"
import { BadRequestException } from "@nestjs/common"
import { GoogleOAuthController } from "./google-oauth.controller"
import { GoogleOAuthService } from "./google-oauth.service"
import { CalendarSyncService } from "../../calendar/calendar-sync.service"

describe("GoogleOAuthController", () => {
  let controller: GoogleOAuthController
  let googleOAuth: GoogleOAuthService
  let calendarSync: CalendarSyncService

  const mockGoogleOAuth = {
    buildAuthorizationUrl: jest.fn(),
    handleOAuthCallback: jest.fn(),
    settingsRedirectBase: "http://localhost:3000/settings/integrations?provider=google",
  }
  const mockCalendarSync = {
    syncAccountById: jest.fn(),
  }

  const mockUser = {
    id: "user-1",
    email: "test@example.com",
    name: "Test User",
    keycloakId: "keycloak-1",
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GoogleOAuthController],
      providers: [
        {
          provide: GoogleOAuthService,
          useValue: mockGoogleOAuth,
        },
        {
          provide: CalendarSyncService,
          useValue: mockCalendarSync,
        },
      ],
    }).compile()

    controller = module.get<GoogleOAuthController>(GoogleOAuthController)
    googleOAuth = module.get<GoogleOAuthService>(GoogleOAuthService)
    calendarSync = module.get<CalendarSyncService>(CalendarSyncService)

    jest.clearAllMocks()
  })

  describe("getAuthUrl", () => {
    it("should return authorization URL", async () => {
      const url = "https://accounts.google.com/oauth/authorize?state=test"
      ;(mockGoogleOAuth.buildAuthorizationUrl as jest.Mock).mockReturnValue(url)

      const result = await controller.getAuthUrl(mockUser as any, undefined)

      expect(result.url).toBe(url)
      expect(mockGoogleOAuth.buildAuthorizationUrl).toHaveBeenCalledWith(
        mockUser.id,
        undefined,
      )
    })

    it("should include redirect path in URL", async () => {
      const url = "https://accounts.google.com/oauth/authorize?state=test"
      ;(mockGoogleOAuth.buildAuthorizationUrl as jest.Mock).mockReturnValue(url)

      const result = await controller.getAuthUrl(mockUser as any, "/settings")

      expect(result.url).toBe(url)
      expect(mockGoogleOAuth.buildAuthorizationUrl).toHaveBeenCalledWith(
        mockUser.id,
        "/settings",
      )
    })
  })

  describe("handleCallback", () => {
    it("should handle OAuth callback successfully", async () => {
      const code = "auth-code"
      const state = "state-token"
      const mockResponse = {
        redirect: jest.fn(),
      }

      ;(mockGoogleOAuth.handleOAuthCallback as jest.Mock).mockResolvedValue({
        account: { id: "account-1" },
        redirectUri: "http://localhost:3000/settings?status=success",
      })
      ;(mockCalendarSync.syncAccountById as jest.Mock).mockResolvedValue(
        undefined,
      )

      await controller.handleCallback(code, state, mockResponse as any)

      expect(mockGoogleOAuth.handleOAuthCallback).toHaveBeenCalledWith(
        code,
        state,
      )
      expect(mockCalendarSync.syncAccountById).toHaveBeenCalledWith("account-1")
      expect(mockResponse.redirect).toHaveBeenCalled()
    })

    it("should handle OAuth callback errors", async () => {
      const code = "auth-code"
      const state = "state-token"
      const mockResponse = {
        redirect: jest.fn(),
      }

      // Suppress console.error for this test
      const originalError = console.error
      console.error = jest.fn()

      ;(mockGoogleOAuth.handleOAuthCallback as jest.Mock).mockRejectedValue(
        new Error("OAuth error"),
      )

      await controller.handleCallback(code, state, mockResponse as any)

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining("status=error"),
      )

      // Restore console.error
      console.error = originalError
    })

    it("should throw BadRequestException if code or state missing", async () => {
      const mockResponse = {
        redirect: jest.fn(),
      }

      await expect(
        controller.handleCallback("", "", mockResponse as any),
      ).rejects.toThrow(BadRequestException)
    })
  })
})

