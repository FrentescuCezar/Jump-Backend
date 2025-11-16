import { Test, TestingModule } from "@nestjs/testing"
import { OnboardingController } from "./onboarding.controller"
import { OnboardingService } from "./onboarding.service"

describe("OnboardingController", () => {
  let controller: OnboardingController
  let onboardingService: OnboardingService

  const mockOnboardingService = {
    getState: jest.fn(),
    updatePreferences: jest.fn(),
  }

  const mockUser = {
    id: "user-1",
    email: "test@example.com",
    name: "Test User",
    keycloakId: "keycloak-1",
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OnboardingController],
      providers: [
        {
          provide: OnboardingService,
          useValue: mockOnboardingService,
        },
      ],
    }).compile()

    controller = module.get<OnboardingController>(OnboardingController)
    onboardingService = module.get<OnboardingService>(OnboardingService)

    jest.clearAllMocks()
  })

  describe("getState", () => {
    it("should return onboarding state", async () => {
      const state = {
        hasGoogleCalendar: true,
        isComplete: true,
        completedAt: new Date().toISOString(),
        googleAccounts: [],
        socialConnections: {
          linkedin: false,
          facebook: false,
        },
        meetingPreference: {
          leadMinutes: 15,
          defaultNotetaker: true,
        },
        automationPreferences: {
          generateTranscripts: true,
          createEmailDrafts: true,
          generateSocialPosts: true,
        },
      }

      ;(mockOnboardingService.getState as jest.Mock).mockResolvedValue(state)

      const result = await controller.getState(mockUser as any)

      expect(result).toEqual(state)
      expect(mockOnboardingService.getState).toHaveBeenCalledWith(mockUser.id)
    })
  })

  describe("updatePreferences", () => {
    it("should update onboarding preferences", async () => {
      const dto = {
        leadMinutes: 20,
        autoJoinMeetings: true,
        generateTranscripts: true,
        createEmailDrafts: true,
        generateSocialPosts: true,
        completeOnboarding: false,
      }
      const updatedState = {
        hasGoogleCalendar: true,
        isComplete: false,
        completedAt: null,
        googleAccounts: [],
        socialConnections: {
          linkedin: false,
          facebook: false,
        },
        meetingPreference: {
          leadMinutes: 20,
          defaultNotetaker: true,
        },
        automationPreferences: {
          generateTranscripts: true,
          createEmailDrafts: true,
          generateSocialPosts: true,
        },
      }

      ;(mockOnboardingService.updatePreferences as jest.Mock).mockResolvedValue(
        updatedState,
      )

      const result = await controller.updatePreferences(mockUser as any, dto)

      expect(result.meetingPreference.leadMinutes).toBe(20)
      expect(mockOnboardingService.updatePreferences).toHaveBeenCalledWith(
        mockUser.id,
        dto,
      )
    })
  })
})

