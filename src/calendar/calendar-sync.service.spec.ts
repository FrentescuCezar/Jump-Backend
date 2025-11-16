import { Test, TestingModule } from "@nestjs/testing"
import { CalendarSyncService } from "./calendar-sync.service"
import { PrismaService } from "../../prisma/prisma.service"
import { CalendarService } from "./calendar.service"
import { RecallService } from "../recall/recall.service"
import { GoogleOAuthService } from "../integrations/google/google-oauth.service"
import { ConnectedProvider, MeetingPlatform } from "@prisma/client"
import { createMockPrisma } from "../../test/helpers/mocks.helper"

// Mock googleapis
jest.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
        refreshAccessToken: jest.fn(),
      })),
    },
    calendar: jest.fn(() => ({
      events: {
        list: jest.fn(),
      },
    })),
  },
}))

describe("CalendarSyncService", () => {
  let service: CalendarSyncService
  let prisma: PrismaService
  let calendarService: CalendarService
  let recallService: RecallService
  let googleOAuth: GoogleOAuthService

  const mockPrisma = createMockPrisma()
  const mockCalendarService = {
    upsertEvents: jest.fn(),
  }
  const mockRecallService = {
    ensureBotScheduled: jest.fn(),
    cancelBotForEvent: jest.fn(),
  }
  const mockGoogleOAuth = {
    createOAuthClient: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarSyncService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: CalendarService,
          useValue: mockCalendarService,
        },
        {
          provide: RecallService,
          useValue: mockRecallService,
        },
        {
          provide: GoogleOAuthService,
          useValue: mockGoogleOAuth,
        },
      ],
    }).compile()

    service = module.get<CalendarSyncService>(CalendarSyncService)
    prisma = module.get<PrismaService>(PrismaService)
    calendarService = module.get<CalendarService>(CalendarService)
    recallService = module.get<RecallService>(RecallService)
    googleOAuth = module.get<GoogleOAuthService>(GoogleOAuthService)

    jest.clearAllMocks()
  })

  describe("syncUserAccounts", () => {
    it("should sync all user accounts successfully", async () => {
      const userId = "user-1"
      const accounts = [
        {
          id: "account-1",
          userId,
          provider: ConnectedProvider.GOOGLE_CALENDAR,
          providerAccountId: "user@gmail.com",
          accessToken: "token-123",
          refreshToken: "refresh-123",
          expiresAt: new Date(Date.now() + 3600000),
        },
      ]

      ;(mockPrisma.connectedAccount.findMany as jest.Mock).mockResolvedValue(
        accounts,
      )
      ;(mockGoogleOAuth.createOAuthClient as jest.Mock).mockReturnValue({
        setCredentials: jest.fn(),
        refreshAccessToken: jest.fn().mockResolvedValue({
          credentials: {
            access_token: "new-token",
            refresh_token: "new-refresh",
            expiry_date: Date.now() + 3600000,
          },
        }),
      })

      const { google } = require("googleapis")
      const mockCalendar = {
        events: {
          list: jest.fn().mockResolvedValue({
            data: {
              items: [],
              nextPageToken: undefined,
            },
          }),
        },
      }
      google.calendar = jest.fn(() => mockCalendar)

      ;(mockPrisma.meetingPreference.findUnique as jest.Mock).mockResolvedValue({
        id: "pref-1",
        userId,
        leadMinutes: 15,
        defaultNotetaker: false,
      })
      ;(mockCalendarService.upsertEvents as jest.Mock).mockResolvedValue([])
      ;(mockPrisma.connectedAccount.update as jest.Mock).mockResolvedValue({
        ...accounts[0],
        lastSyncedAt: new Date(),
      })

      const result = await service.syncUserAccounts(userId)

      expect(result.success).toBe(true)
      expect(result.totalAccounts).toBe(1)
      expect(result.syncedAccounts).toBe(1)
    })

    it("should handle sync failures gracefully", async () => {
      const userId = "user-1"
      const accounts = [
        {
          id: "account-1",
          userId,
          provider: ConnectedProvider.GOOGLE_CALENDAR,
          providerAccountId: "user@gmail.com",
          accessToken: null, // Expired token
          refreshToken: "refresh-123",
          expiresAt: new Date(Date.now() - 3600000), // Expired
        },
      ]

      // Suppress logger.error for this test
      const loggerErrorSpy = jest.spyOn(service["logger"], "error").mockImplementation()

      ;(mockPrisma.connectedAccount.findMany as jest.Mock).mockResolvedValue(
        accounts,
      )
      const mockRefreshAccessToken = jest
        .fn()
        .mockRejectedValue(new Error("Token refresh failed"))
      ;(mockGoogleOAuth.createOAuthClient as jest.Mock).mockReturnValue({
        setCredentials: jest.fn(),
        refreshAccessToken: mockRefreshAccessToken,
      })

      const result = await service.syncUserAccounts(userId)

      expect(result.success).toBe(false)
      expect(result.failedAccounts.length).toBeGreaterThan(0)
      expect(result.failedAccounts[0].accountId).toBe("account-1")

      // Restore logger
      loggerErrorSpy.mockRestore()
    })
  })

  describe("syncAccountById", () => {
    it("should sync account by ID", async () => {
      const accountId = "account-1"
      const account = {
        id: accountId,
        userId: "user-1",
        provider: ConnectedProvider.GOOGLE_CALENDAR,
        providerAccountId: "user@gmail.com",
        accessToken: "token-123",
        refreshToken: "refresh-123",
        expiresAt: new Date(Date.now() + 3600000),
      }

      ;(mockPrisma.connectedAccount.findUnique as jest.Mock).mockResolvedValue(
        account,
      )
      ;(mockGoogleOAuth.createOAuthClient as jest.Mock).mockReturnValue({
        setCredentials: jest.fn(),
        refreshAccessToken: jest.fn().mockResolvedValue({
          credentials: {
            access_token: "new-token",
            refresh_token: "new-refresh",
            expiry_date: Date.now() + 3600000,
          },
        }),
      })

      const { google } = require("googleapis")
      const mockCalendar = {
        events: {
          list: jest.fn().mockResolvedValue({
            data: {
              items: [],
              nextPageToken: undefined,
            },
          }),
        },
      }
      google.calendar = jest.fn(() => mockCalendar)

      ;(mockPrisma.meetingPreference.findUnique as jest.Mock).mockResolvedValue({
        id: "pref-1",
        userId: account.userId,
        leadMinutes: 15,
        defaultNotetaker: false,
      })
      ;(mockCalendarService.upsertEvents as jest.Mock).mockResolvedValue([])
      ;(mockPrisma.connectedAccount.update as jest.Mock).mockResolvedValue({
        ...account,
        lastSyncedAt: new Date(),
      })

      await service.syncAccountById(accountId)

      expect(mockPrisma.connectedAccount.findUnique).toHaveBeenCalledWith({
        where: { id: accountId },
      })
    })

    it("should not sync if account not found", async () => {
      ;(mockPrisma.connectedAccount.findUnique as jest.Mock).mockResolvedValue(
        null,
      )

      await service.syncAccountById("invalid-id")

      expect(mockGoogleOAuth.createOAuthClient).not.toHaveBeenCalled()
    })

    it("should not sync if account is not Google Calendar", async () => {
      const account = {
        id: "account-1",
        userId: "user-1",
        provider: ConnectedProvider.LINKEDIN,
        providerAccountId: "linkedin-id",
      }

      ;(mockPrisma.connectedAccount.findUnique as jest.Mock).mockResolvedValue(
        account,
      )

      await service.syncAccountById("account-1")

      expect(mockGoogleOAuth.createOAuthClient).not.toHaveBeenCalled()
    })
  })
})

