import { Test, TestingModule } from "@nestjs/testing"
import { CalendarController } from "./calendar.controller"
import { CalendarService } from "./calendar.service"
import { RecallService } from "../recall/recall.service"
import { CalendarSyncService } from "./calendar-sync.service"
import { PrismaService } from "../../prisma/prisma.service"
import { createMockPrisma } from "../../test/helpers/mocks.helper"
import {
  CalendarEventStatus,
  MeetingPlatform,
  RecallBotStatus,
  ConnectedProvider,
} from "@prisma/client"

describe("CalendarController", () => {
  let controller: CalendarController
  let calendarService: CalendarService
  let recallService: RecallService
  let calendarSyncService: CalendarSyncService

  const mockCalendarService = {
    listUpcomingEvents: jest.fn(),
    listPastEvents: jest.fn(),
    listUpdatedEvents: jest.fn(),
    toggleNotetaker: jest.fn(),
    getLatestProviderSyncAt: jest.fn(),
  }
  const mockRecallService = {
    ensureBotScheduled: jest.fn(),
    cancelBotForEvent: jest.fn(),
  }
  const mockCalendarSyncService = {
    syncUserAccounts: jest.fn(),
  }
  const mockPrisma = createMockPrisma()

  const mockUser = {
    id: "user-1",
    email: "test@example.com",
    name: "Test User",
    keycloakId: "keycloak-1",
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CalendarController],
      providers: [
        {
          provide: CalendarService,
          useValue: mockCalendarService,
        },
        {
          provide: RecallService,
          useValue: mockRecallService,
        },
        {
          provide: CalendarSyncService,
          useValue: mockCalendarSyncService,
        },
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile()

    controller = module.get<CalendarController>(CalendarController)
    calendarService = module.get<CalendarService>(CalendarService)
    recallService = module.get<RecallService>(RecallService)
    calendarSyncService = module.get<CalendarSyncService>(CalendarSyncService)

    jest.clearAllMocks()
  })

  describe("listEvents", () => {
    it("should return upcoming events", async () => {
      const events = [
        {
          id: "event-1",
          title: "Test Meeting",
          startTime: new Date(),
          endTime: new Date(),
          recallBot: null,
          connectedAccount: {
            provider: ConnectedProvider.GOOGLE_CALENDAR,
            label: "Google Calendar",
          },
        },
      ]

      ;(mockCalendarService.listUpcomingEvents as jest.Mock).mockResolvedValue(
        events,
      )
      ;(mockCalendarService.getLatestProviderSyncAt as jest.Mock).mockResolvedValue(
        new Date(),
      )

      const result = await controller.listEvents(mockUser as any)

      expect(result.events).toHaveLength(1)
      expect(result.events[0].id).toBe("event-1")
      expect(mockCalendarService.listUpcomingEvents).toHaveBeenCalledWith(
        mockUser.id,
      )
    })
  })

  describe("listUpcoming", () => {
    it("should return upcoming events", async () => {
      const events = [
        {
          id: "event-1",
          title: "Upcoming Meeting",
          startTime: new Date(),
          endTime: new Date(),
          recallBot: null,
          connectedAccount: {
            provider: ConnectedProvider.GOOGLE_CALENDAR,
            label: "Google Calendar",
          },
        },
      ]

      ;(mockCalendarService.listUpcomingEvents as jest.Mock).mockResolvedValue(
        events,
      )
      ;(mockCalendarService.getLatestProviderSyncAt as jest.Mock).mockResolvedValue(
        new Date(),
      )

      const result = await controller.listUpcoming(mockUser as any)

      expect(result.events).toHaveLength(1)
      expect(result.events[0].title).toBe("Upcoming Meeting")
    })
  })

  describe("listPast", () => {
    it("should return past events", async () => {
      const events = [
        {
          id: "event-1",
          title: "Past Meeting",
          startTime: new Date(Date.now() - 7200000),
          endTime: new Date(Date.now() - 3600000),
          recallBot: null,
          connectedAccount: {
            provider: ConnectedProvider.GOOGLE_CALENDAR,
            label: "Google Calendar",
          },
        },
      ]

      ;(mockCalendarService.listPastEvents as jest.Mock).mockResolvedValue(
        events,
      )
      ;(mockCalendarService.getLatestProviderSyncAt as jest.Mock).mockResolvedValue(
        new Date(),
      )

      const result = await controller.listPast(mockUser as any)

      expect(result.events).toHaveLength(1)
      expect(result.events[0].title).toBe("Past Meeting")
    })
  })

  describe("deltaSync", () => {
    it("should return delta sync data", async () => {
      const events = [
        {
          id: "event-1",
          title: "Updated Meeting",
          startTime: new Date(),
          endTime: new Date(),
          recallBot: null,
          connectedAccount: {
            provider: ConnectedProvider.GOOGLE_CALENDAR,
            label: "Google Calendar",
          },
        },
      ]

      ;(mockCalendarService.listUpdatedEvents as jest.Mock).mockResolvedValue({
        events,
        deletedIds: [],
      })
      ;(mockCalendarService.getLatestProviderSyncAt as jest.Mock).mockResolvedValue(
        new Date(),
      )

      const result = await controller.deltaSync(
        { updatedSince: new Date().toISOString() },
        mockUser as any,
      )

      expect(result.events).toHaveLength(1)
      expect(result.deletedIds).toEqual([])
      expect(result.serverTimestamp).toBeDefined()
    })
  })

  describe("syncNow", () => {
    it("should trigger calendar sync", async () => {
      ;(mockCalendarSyncService.syncUserAccounts as jest.Mock).mockResolvedValue(
        { success: true },
      )

      const result = await controller.syncNow(mockUser as any)

      expect(mockCalendarSyncService.syncUserAccounts).toHaveBeenCalledWith(
        mockUser.id,
      )
      expect(result).toBeDefined()
    })
  })

  describe("getWebhookStatus", () => {
    it("should return webhook status for connected accounts", async () => {
      const accounts = [
        {
          id: "account-1",
          label: "Google Calendar",
          providerAccountId: "user@gmail.com",
          calendarChannelId: "channel-123",
          calendarResourceId: "resource-456",
          calendarChannelExpiresAt: new Date(Date.now() + 3600000),
          lastSyncedAt: new Date(),
        },
      ]

      ;(mockPrisma.connectedAccount.findMany as jest.Mock).mockResolvedValue(
        accounts,
      )

      const result = await controller.getWebhookStatus(mockUser as any)

      expect(result.accounts).toHaveLength(1)
      expect(result.accounts[0].hasWebhook).toBe(true)
      expect(result.accounts[0].channelId).toBe("channel-123")
    })
  })

  describe("toggleNotetaker", () => {
    it("should enable notetaker and schedule bot", async () => {
      const event = {
        id: "event-1",
        title: "Test Meeting",
        notetakerEnabled: true,
      }

      ;(mockCalendarService.toggleNotetaker as jest.Mock).mockResolvedValue({
        event,
        shouldSchedule: true,
        shouldCancel: false,
      })
      ;(mockRecallService.ensureBotScheduled as jest.Mock).mockResolvedValue({
        id: "bot-1",
      })

      const result = await controller.toggleNotetaker(
        "event-1",
        { enabled: true },
        mockUser as any,
      )

      expect(result.success).toBe(true)
      expect(mockRecallService.ensureBotScheduled).toHaveBeenCalledWith(event)
      expect(mockRecallService.cancelBotForEvent).not.toHaveBeenCalled()
    })

    it("should disable notetaker and cancel bot", async () => {
      const event = {
        id: "event-1",
        title: "Test Meeting",
        notetakerEnabled: false,
      }

      ;(mockCalendarService.toggleNotetaker as jest.Mock).mockResolvedValue({
        event,
        shouldSchedule: false,
        shouldCancel: true,
      })
      ;(mockRecallService.cancelBotForEvent as jest.Mock).mockResolvedValue(
        undefined,
      )

      const result = await controller.toggleNotetaker(
        "event-1",
        { enabled: false },
        mockUser as any,
      )

      expect(result.success).toBe(true)
      expect(mockRecallService.cancelBotForEvent).toHaveBeenCalledWith(
        "event-1",
      )
      expect(mockRecallService.ensureBotScheduled).not.toHaveBeenCalled()
    })
  })
})

