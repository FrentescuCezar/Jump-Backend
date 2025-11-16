import { Test, TestingModule } from "@nestjs/testing"
import { BadRequestException } from "@nestjs/common"
import { OnboardingService } from "./onboarding.service"
import { PrismaService } from "../../prisma/prisma.service"
import { ConnectedProvider } from "@prisma/client"
import { createMockPrisma } from "../../test/helpers/mocks.helper"

describe("OnboardingService", () => {
  let service: OnboardingService
  let prisma: PrismaService

  const mockPrisma = createMockPrisma()

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile()

    service = module.get<OnboardingService>(OnboardingService)
    prisma = module.get<PrismaService>(PrismaService)

    jest.clearAllMocks()
    // Reset all mock implementations to ensure clean state
    ;(mockPrisma.meetingPreference.findUnique as jest.Mock).mockReset()
    ;(mockPrisma.automationPreference.findUnique as jest.Mock).mockReset()
  })

  describe("getState", () => {
    it("should return onboarding state with Google Calendar", async () => {
      const userId = "user-1"
      const accounts = [
        {
          id: "account-1",
          provider: ConnectedProvider.GOOGLE_CALENDAR,
          providerAccountId: "user@gmail.com",
          label: "Google Calendar",
          linkedAt: new Date(),
          lastSyncedAt: new Date(),
          metadata: { email: "user@gmail.com" },
        },
      ]
      const meetingPreference = {
        id: "pref-1",
        userId,
        leadMinutes: 15,
        defaultNotetaker: true,
      }
      const automationPreference = {
        id: "auto-pref-1",
        userId,
        generateTranscripts: true,
        createEmailDrafts: true,
        generateSocialPosts: false,
      }
      const user = {
        id: userId,
        onboardingCompletedAt: new Date(),
      }

      ;(mockPrisma.connectedAccount.findMany as jest.Mock).mockResolvedValue(
        accounts,
      )
      ;(mockPrisma.meetingPreference.findUnique as jest.Mock).mockResolvedValue(
        meetingPreference,
      )
      ;(mockPrisma.automationPreference.findUnique as jest.Mock).mockResolvedValue(
        automationPreference,
      )
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(user)

      const result = await service.getState(userId)

      expect(result.hasGoogleCalendar).toBe(true)
      expect(result.isComplete).toBe(true)
      expect(result.googleAccounts).toHaveLength(1)
      expect(result.meetingPreference.leadMinutes).toBe(15)
    })

    it("should create preferences if they don't exist", async () => {
      const userId = "user-1"

      ;(mockPrisma.connectedAccount.findMany as jest.Mock).mockResolvedValue([])
      ;(mockPrisma.meetingPreference.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: "pref-1",
          userId,
          leadMinutes: 10,
          defaultNotetaker: false,
        })
      ;(mockPrisma.automationPreference.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: "auto-pref-1",
          userId,
          generateTranscripts: false,
          createEmailDrafts: false,
          generateSocialPosts: false,
        })
      ;(mockPrisma.meetingPreference.create as jest.Mock).mockResolvedValue({
        id: "pref-1",
        userId,
        leadMinutes: 10,
        defaultNotetaker: false,
      })
      ;(mockPrisma.automationPreference.create as jest.Mock).mockResolvedValue({
        id: "auto-pref-1",
        userId,
        generateTranscripts: false,
        createEmailDrafts: false,
        generateSocialPosts: false,
      })
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: userId,
        onboardingCompletedAt: null,
      })

      const result = await service.getState(userId)

      expect(result.hasGoogleCalendar).toBe(false)
      expect(result.isComplete).toBe(false)
      expect(mockPrisma.meetingPreference.create).toHaveBeenCalled()
      expect(mockPrisma.automationPreference.create).toHaveBeenCalled()
    })
  })

  describe("updatePreferences", () => {
    it("should update preferences successfully", async () => {
      const userId = "user-1"
      const dto = {
        leadMinutes: 20,
        autoJoinMeetings: true,
        generateTranscripts: true,
        createEmailDrafts: true,
        generateSocialPosts: true,
        completeOnboarding: false,
      }

      ;(mockPrisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = {
            meetingPreference: {
              upsert: jest.fn().mockResolvedValue({
                id: "pref-1",
                userId,
                leadMinutes: 20,
                defaultNotetaker: true,
              }),
            },
            automationPreference: {
              upsert: jest.fn().mockResolvedValue({
                id: "auto-pref-1",
                userId,
                generateTranscripts: true,
                createEmailDrafts: true,
                generateSocialPosts: true,
              }),
            },
            connectedAccount: {
              count: jest.fn().mockResolvedValue(1),
            },
          }
          return callback(tx)
        },
      )

      // Mock getState return (called after updatePreferences)
      // getState calls findOrCreateMeetingPreference and findOrCreateAutomationPreference
      // These methods call findUnique, so we need to mock it to return the updated values
      ;(mockPrisma.connectedAccount.findMany as jest.Mock).mockResolvedValue([
        {
          id: "account-1",
          provider: ConnectedProvider.GOOGLE_CALENDAR,
          providerAccountId: "user@gmail.com",
          label: "Google Calendar",
          linkedAt: new Date(),
          lastSyncedAt: new Date(),
          metadata: { email: "user@gmail.com" },
        },
      ])
      // findOrCreateMeetingPreference - will find the updated preference (called in getState)
      // Since updatePreferences calls getState at the end, we return the updated value
      ;(mockPrisma.meetingPreference.findUnique as jest.Mock).mockResolvedValue({
        id: "pref-1",
        userId,
        leadMinutes: 20, // Updated value (after transaction)
        defaultNotetaker: true,
      })
      // findOrCreateAutomationPreference - will find the updated preference (called in getState)
      ;(mockPrisma.automationPreference.findUnique as jest.Mock).mockResolvedValue(
        {
          id: "auto-pref-1",
          userId,
          generateTranscripts: true,
          createEmailDrafts: true,
          generateSocialPosts: true,
        },
      )
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: userId,
        onboardingCompletedAt: null,
      })

      const result = await service.updatePreferences(userId, dto)

      expect(result.meetingPreference.leadMinutes).toBe(20)
      expect(result.automationPreferences.generateTranscripts).toBe(true)
    })

    it("should complete onboarding when requested and Google Calendar exists", async () => {
      const userId = "user-1"
      const dto = {
        leadMinutes: 15,
        autoJoinMeetings: true,
        generateTranscripts: true,
        createEmailDrafts: true,
        generateSocialPosts: true,
        completeOnboarding: true,
      }

      ;(mockPrisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = {
            meetingPreference: {
              upsert: jest.fn().mockResolvedValue({
                id: "pref-1",
                userId,
                leadMinutes: 15,
                defaultNotetaker: true,
              }),
            },
            automationPreference: {
              upsert: jest.fn().mockResolvedValue({
                id: "auto-pref-1",
                userId,
                generateTranscripts: true,
                createEmailDrafts: true,
                generateSocialPosts: true,
              }),
            },
            connectedAccount: {
              count: jest.fn().mockResolvedValue(1),
            },
            user: {
              update: jest.fn().mockResolvedValue({
                id: userId,
                onboardingCompletedAt: new Date(),
              }),
            },
          }
          return callback(tx)
        },
      )

      // Mock getState return
      ;(mockPrisma.connectedAccount.findMany as jest.Mock).mockResolvedValue([
        {
          id: "account-1",
          provider: ConnectedProvider.GOOGLE_CALENDAR,
          linkedAt: new Date(),
          metadata: { email: "user@gmail.com" },
        },
      ])
      ;(mockPrisma.meetingPreference.findUnique as jest.Mock).mockResolvedValue({
        id: "pref-1",
        userId,
        leadMinutes: 15,
        defaultNotetaker: true,
      })
      ;(mockPrisma.automationPreference.findUnique as jest.Mock).mockResolvedValue(
        {
          id: "auto-pref-1",
          userId,
          generateTranscripts: true,
          createEmailDrafts: true,
          generateSocialPosts: true,
        },
      )
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: userId,
        onboardingCompletedAt: new Date(),
      })

      const result = await service.updatePreferences(userId, dto)

      expect(result.isComplete).toBe(true)
    })

    it("should throw error if completing onboarding without Google Calendar", async () => {
      const userId = "user-1"
      const dto = {
        leadMinutes: 15,
        autoJoinMeetings: true,
        generateTranscripts: true,
        createEmailDrafts: true,
        generateSocialPosts: true,
        completeOnboarding: true,
      }

      ;(mockPrisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = {
            meetingPreference: {
              upsert: jest.fn().mockResolvedValue({}),
            },
            automationPreference: {
              upsert: jest.fn().mockResolvedValue({}),
            },
            connectedAccount: {
              count: jest.fn().mockResolvedValue(0),
            },
          }
          return callback(tx)
        },
      )

      await expect(
        service.updatePreferences(userId, dto),
      ).rejects.toThrow(BadRequestException)
    })
  })
})

