import { Test, TestingModule } from "@nestjs/testing"
import { BadRequestException } from "@nestjs/common"
import { LinkedInOAuthController } from "./linkedin-oauth.controller"
import { LinkedInOAuthService } from "./linkedin-oauth.service"

describe("LinkedInOAuthController", () => {
  let controller: LinkedInOAuthController
  let linkedInOAuth: LinkedInOAuthService

  const mockLinkedInOAuth = {
    buildAuthorizationUrl: jest.fn(),
    handleCallback: jest.fn(),
    settingsRedirectBase: "http://localhost:3000/settings/integrations?provider=linkedin",
  }

  const mockUser = {
    id: "user-1",
    email: "test@example.com",
    name: "Test User",
    keycloakId: "keycloak-1",
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LinkedInOAuthController],
      providers: [
        {
          provide: LinkedInOAuthService,
          useValue: mockLinkedInOAuth,
        },
      ],
    }).compile()

    controller = module.get<LinkedInOAuthController>(LinkedInOAuthController)
    linkedInOAuth = module.get<LinkedInOAuthService>(LinkedInOAuthService)

    jest.clearAllMocks()
  })

  describe("getUrl", () => {
    it("should return authorization URL", async () => {
      const url = "https://www.linkedin.com/oauth/v2/authorization?state=test"
      ;(mockLinkedInOAuth.buildAuthorizationUrl as jest.Mock).mockReturnValue(url)

      const result = await controller.getUrl(mockUser as any, undefined)

      expect(result.url).toBe(url)
      expect(mockLinkedInOAuth.buildAuthorizationUrl).toHaveBeenCalledWith(
        mockUser.id,
        undefined,
      )
    })

    it("should include redirect path in URL", async () => {
      const url = "https://www.linkedin.com/oauth/v2/authorization?state=test"
      ;(mockLinkedInOAuth.buildAuthorizationUrl as jest.Mock).mockReturnValue(url)

      const result = await controller.getUrl(mockUser as any, "/settings")

      expect(result.url).toBe(url)
      expect(mockLinkedInOAuth.buildAuthorizationUrl).toHaveBeenCalledWith(
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

      ;(mockLinkedInOAuth.handleCallback as jest.Mock).mockResolvedValue({
        redirectUri: "http://localhost:3000/settings?status=success",
      })

      await controller.handleCallback(
        code,
        state,
        undefined,
        undefined,
        mockResponse as any,
      )

      expect(mockLinkedInOAuth.handleCallback).toHaveBeenCalledWith(code, state)
      expect(mockResponse.redirect).toHaveBeenCalled()

      loggerErrorSpy.mockRestore()
      loggerLogSpy.mockRestore()
      loggerWarnSpy.mockRestore()
    })

    it("should handle OAuth errors from LinkedIn", async () => {
      const error = "access_denied"
      const errorDescription = "User denied access"
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

      ;(mockLinkedInOAuth.handleCallback as jest.Mock).mockRejectedValue(
        new Error("OAuth error"),
      )

      await controller.handleCallback(
        code,
        state,
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
        controller.handleCallback("", "", undefined, undefined, mockResponse as any),
      ).rejects.toThrow(BadRequestException)

      loggerWarnSpy.mockRestore()
    })
  })
})

