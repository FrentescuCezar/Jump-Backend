import { Test, TestingModule } from "@nestjs/testing"
import { BadRequestException } from "@nestjs/common"
import { FacebookOAuthController } from "./facebook-oauth.controller"
import { FacebookOAuthService } from "./facebook-oauth.service"

describe("FacebookOAuthController", () => {
  let controller: FacebookOAuthController
  let facebookOAuth: FacebookOAuthService

  const mockFacebookOAuth = {
    buildAuthorizationUrl: jest.fn(),
    handleCallback: jest.fn(),
    settingsRedirectBase:
      "http://localhost:3000/settings/integrations?provider=facebook",
  }

  const mockUser = {
    id: "user-1",
    email: "test@example.com",
    name: "Test User",
    keycloakId: "keycloak-1",
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FacebookOAuthController],
      providers: [
        {
          provide: FacebookOAuthService,
          useValue: mockFacebookOAuth,
        },
      ],
    }).compile()

    controller = module.get<FacebookOAuthController>(FacebookOAuthController)
    facebookOAuth = module.get<FacebookOAuthService>(FacebookOAuthService)

    jest.clearAllMocks()
  })

  describe("getUrl", () => {
    it("should return authorization URL", async () => {
      const url = "https://www.facebook.com/v19.0/dialog/oauth?state=test"
      ;(mockFacebookOAuth.buildAuthorizationUrl as jest.Mock).mockReturnValue(
        url,
      )

      const result = await controller.getUrl(mockUser as any, undefined)

      expect(result.url).toBe(url)
      expect(mockFacebookOAuth.buildAuthorizationUrl).toHaveBeenCalledWith(
        mockUser.id,
        undefined,
      )
    })

    it("should include redirect path in URL", async () => {
      const url = "https://www.facebook.com/v19.0/dialog/oauth?state=test"
      ;(mockFacebookOAuth.buildAuthorizationUrl as jest.Mock).mockReturnValue(
        url,
      )

      const result = await controller.getUrl(mockUser as any, "/settings")

      expect(result.url).toBe(url)
      expect(mockFacebookOAuth.buildAuthorizationUrl).toHaveBeenCalledWith(
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

      // Suppress logger
      const loggerErrorSpy = jest
        .spyOn(controller["logger"], "error")
        .mockImplementation()
      const loggerLogSpy = jest
        .spyOn(controller["logger"], "log")
        .mockImplementation()
      const loggerWarnSpy = jest
        .spyOn(controller["logger"], "warn")
        .mockImplementation()

      ;(mockFacebookOAuth.handleCallback as jest.Mock).mockResolvedValue({
        redirectUri: "http://localhost:3000/settings?status=success",
      })

      await controller.handleCallback(
        code,
        state,
        undefined,
        undefined,
        undefined,
        mockResponse as any,
      )

      expect(mockFacebookOAuth.handleCallback).toHaveBeenCalledWith(code, state)
      expect(mockResponse.redirect).toHaveBeenCalled()

      loggerErrorSpy.mockRestore()
      loggerLogSpy.mockRestore()
      loggerWarnSpy.mockRestore()
    })

    it("should handle OAuth errors from Facebook", async () => {
      const error = "access_denied"
      const errorDescription = "User denied access"
      const errorReason = "user_denied"
      const mockResponse = {
        redirect: jest.fn(),
      }

      const loggerErrorSpy = jest
        .spyOn(controller["logger"], "error")
        .mockImplementation()

      await controller.handleCallback(
        "",
        "",
        error,
        errorDescription,
        errorReason,
        mockResponse as any,
      )

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining("status=error"),
      )

      loggerErrorSpy.mockRestore()
    })

    it("should handle callback errors gracefully", async () => {
      const code = "auth-code"
      const state = "state-token"
      const mockResponse = {
        redirect: jest.fn(),
      }

      const loggerErrorSpy = jest
        .spyOn(controller["logger"], "error")
        .mockImplementation()
      const loggerLogSpy = jest
        .spyOn(controller["logger"], "log")
        .mockImplementation()

      ;(mockFacebookOAuth.handleCallback as jest.Mock).mockRejectedValue(
        new Error("OAuth error"),
      )

      await controller.handleCallback(
        code,
        state,
        undefined,
        undefined,
        undefined,
        mockResponse as any,
      )

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining("status=error"),
      )

      loggerErrorSpy.mockRestore()
      loggerLogSpy.mockRestore()
    })

    it("should throw BadRequestException if code or state missing", async () => {
      const mockResponse = {
        redirect: jest.fn(),
      }

      const loggerWarnSpy = jest
        .spyOn(controller["logger"], "warn")
        .mockImplementation()

      await expect(
        controller.handleCallback(
          "",
          "",
          undefined,
          undefined,
          undefined,
          mockResponse as any,
        ),
      ).rejects.toThrow(BadRequestException)

      loggerWarnSpy.mockRestore()
    })
  })
})
