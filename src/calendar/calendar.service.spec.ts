import { Test, TestingModule } from "@nestjs/testing"
import { NotFoundException, BadRequestException } from "@nestjs/common"
import { CalendarService } from "./calendar.service"
import { PrismaService } from "../../prisma/prisma.service"
import { NotificationsService } from "../examples/services/notifications.service"
import { ChatGateway } from "../examples/chat.gateway"
import {
  CalendarEventStatus,
  MeetingPlatform,
  RecallBotStatus,
  ConnectedProvider,
} from "@prisma/client"
import { createMockPrisma } from "../../test/helpers/mocks.helper"

// Mock p-queue to avoid ES module issues
jest.mock("p-queue", () => {
  return jest.fn().mockImplementation(() => ({
    add: jest.fn((fn) => Promise.resolve(fn())),
  }))
})

describe("CalendarService", () => {
  let service: CalendarService
  let prisma: PrismaService
  let notifications: NotificationsService
  let chatGateway: ChatGateway

  const mockPrisma = createMockPrisma()
  const mockNotifications = {
    createNotification: jest.fn(),
  }
  const mockChatGateway = {
    emitNotification: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: NotificationsService,
          useValue: mockNotifications,
        },
        {
          provide: ChatGateway,
          useValue: mockChatGateway,
        },
      ],
    }).compile()

    service = module.get<CalendarService>(CalendarService)
    prisma = module.get<PrismaService>(PrismaService)
    notifications = module.get<NotificationsService>(NotificationsService)
    chatGateway = module.get<ChatGateway>(ChatGateway)

    jest.clearAllMocks()
  })

  describe("listUpcomingEvents", () => {
    it("should return upcoming events for user", async () => {
      const userId = "user-1"
      const now = new Date()
      const futureEvent = {
        id: "event-1",
        userId,
        title: "Future Meeting",
        startTime: new Date(now.getTime() + 3600000),
        endTime: new Date(now.getTime() + 7200000),
        deletedAt: null,
        recallBot: null,
        connectedAccount: {
          provider: ConnectedProvider.GOOGLE_CALENDAR,
          label: "Google Calendar",
        },
      }

      ;(mockPrisma.calendarEvent.findMany as jest.Mock).mockResolvedValue([
        futureEvent,
      ])

      const result = await service.listUpcomingEvents(userId)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("event-1")
      expect(mockPrisma.calendarEvent.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId,
          deletedAt: null,
          startTime: expect.any(Object),
          endTime: expect.any(Object),
        }),
        include: {
          recallBot: true,
          connectedAccount: true,
        },
        orderBy: { startTime: "asc" },
        take: 50,
      })
    })

    it("should exclude events with DONE bots", async () => {
      const userId = "user-1"
      ;(mockPrisma.calendarEvent.findMany as jest.Mock).mockResolvedValue([])

      await service.listUpcomingEvents(userId)

      expect(mockPrisma.calendarEvent.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          NOT: {
            recallBot: {
              status: RecallBotStatus.DONE,
            },
          },
        }),
        include: expect.any(Object),
        orderBy: expect.any(Object),
        take: 50,
      })
    })
  })

  describe("listPastEvents", () => {
    it("should return past events for user", async () => {
      const userId = "user-1"
      const pastEvent = {
        id: "event-1",
        userId,
        title: "Past Meeting",
        startTime: new Date(Date.now() - 7200000),
        endTime: new Date(Date.now() - 3600000),
        deletedAt: null,
        recallBot: null,
        connectedAccount: {
          provider: ConnectedProvider.GOOGLE_CALENDAR,
          label: "Google Calendar",
        },
      }

      ;(mockPrisma.calendarEvent.findMany as jest.Mock).mockResolvedValue([
        pastEvent,
      ])

      const result = await service.listPastEvents(userId)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("event-1")
      expect(mockPrisma.calendarEvent.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId,
          deletedAt: null,
          OR: expect.any(Array),
        }),
        include: expect.any(Object),
        orderBy: { startTime: "desc" },
        take: 50,
      })
    })
  })

  describe("toggleNotetaker", () => {
    it("should enable notetaker for event with meeting URL", async () => {
      const eventId = "event-1"
      const userId = "user-1"
      const futureTime = new Date(Date.now() + 3600000) // 1 hour from now
      const event = {
        id: eventId,
        userId,
        meetingUrl: "https://zoom.us/j/123456",
        startTime: futureTime,
        notetakerEnabled: false,
        recallBot: null,
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        event,
      )
      ;(mockPrisma.calendarEvent.update as jest.Mock).mockResolvedValue({
        ...event,
        notetakerEnabled: true,
      })

      const result = await service.toggleNotetaker(eventId, userId, true)

      expect(result.event.notetakerEnabled).toBe(true)
      expect(result.shouldSchedule).toBe(true)
      expect(mockPrisma.calendarEvent.update).toHaveBeenCalledWith({
        where: { id: eventId },
        data: { notetakerEnabled: true },
        include: { recallBot: true },
      })
    })

    it("should throw NotFoundException for non-existent event", async () => {
      const eventId = "event-1"
      const userId = "user-1"

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        null,
      )

      await expect(
        service.toggleNotetaker(eventId, userId, true),
      ).rejects.toThrow(NotFoundException)
    })

    it("should throw NotFoundException for event owned by different user", async () => {
      const eventId = "event-1"
      const userId = "user-1"
      const event = {
        id: eventId,
        userId: "user-2",
        meetingUrl: "https://zoom.us/j/123456",
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        event,
      )

      await expect(
        service.toggleNotetaker(eventId, userId, true),
      ).rejects.toThrow(NotFoundException)
    })

    it("should throw BadRequestException when enabling without meeting URL", async () => {
      const eventId = "event-1"
      const userId = "user-1"
      const event = {
        id: eventId,
        userId,
        meetingUrl: null,
        notetakerEnabled: false,
        recallBot: null,
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        event,
      )

      await expect(
        service.toggleNotetaker(eventId, userId, true),
      ).rejects.toThrow(BadRequestException)
    })

    it("should disable notetaker and indicate cancellation needed", async () => {
      const eventId = "event-1"
      const userId = "user-1"
      const event = {
        id: eventId,
        userId,
        meetingUrl: "https://zoom.us/j/123456",
        notetakerEnabled: true,
        recallBot: {
          id: "bot-1",
          status: RecallBotStatus.SCHEDULED,
        },
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        event,
      )
      ;(mockPrisma.calendarEvent.update as jest.Mock).mockResolvedValue({
        ...event,
        notetakerEnabled: false,
      })

      const result = await service.toggleNotetaker(eventId, userId, false)

      expect(result.event.notetakerEnabled).toBe(false)
      expect(result.shouldCancel).toBe(true)
    })
  })

  describe("upsertEvents", () => {
    it("should create new events", async () => {
      const userId = "user-1"
      const connectedAccountId = "account-1"
      const now = new Date()
      const input = {
        externalEventId: "ext-1",
        title: "New Meeting",
        meetingUrl: "https://zoom.us/j/123",
        meetingPlatform: MeetingPlatform.ZOOM,
        startTime: new Date(now.getTime() + 3600000),
        endTime: new Date(now.getTime() + 7200000),
        deduplicationKey: "key-1",
      }

      ;(mockPrisma.calendarEvent.findMany as jest.Mock).mockResolvedValue([])
      ;(mockPrisma.calendarEvent.upsert as jest.Mock).mockResolvedValue({
        id: "event-1",
        userId,
        connectedAccountId,
        ...input,
        notetakerEnabled: true,
        recallBot: null,
      })
      ;(mockNotifications.createNotification as jest.Mock).mockResolvedValue({
        id: "notif-1",
      })

      const results = await service.upsertEvents(
        userId,
        connectedAccountId,
        [input],
        true,
      )

      expect(results).toHaveLength(1)
      expect(results[0].event.title).toBe("New Meeting")
      expect(results[0].shouldScheduleBot).toBe(true)
      expect(mockNotifications.createNotification).toHaveBeenCalled()
      expect(mockChatGateway.emitNotification).toHaveBeenCalled()
    })

    it("should update existing events", async () => {
      const userId = "user-1"
      const connectedAccountId = "account-1"
      const now = new Date()
      const existingEvent = {
        id: "event-1",
        userId,
        connectedAccountId,
        externalEventId: "ext-1",
        title: "Old Title",
        startTime: new Date(now.getTime() + 3600000),
        endTime: new Date(now.getTime() + 7200000),
        notetakerEnabled: true,
        recallBot: null,
      }

      const input = {
        externalEventId: "ext-1",
        title: "Updated Title",
        meetingUrl: "https://zoom.us/j/123",
        meetingPlatform: MeetingPlatform.ZOOM,
        startTime: new Date(now.getTime() + 3600000),
        endTime: new Date(now.getTime() + 7200000),
        deduplicationKey: "key-1",
      }

      ;(mockPrisma.calendarEvent.findMany as jest.Mock).mockResolvedValue([
        existingEvent,
      ])
      ;(mockPrisma.calendarEvent.upsert as jest.Mock).mockResolvedValue({
        ...existingEvent,
        ...input,
        recallBot: null,
      })
      ;(mockNotifications.createNotification as jest.Mock).mockResolvedValue({
        id: "notif-1",
      })

      const results = await service.upsertEvents(
        userId,
        connectedAccountId,
        [input],
        true,
      )

      expect(results).toHaveLength(1)
      expect(mockNotifications.createNotification).toHaveBeenCalled()
    })

    it("should not enable notetaker for past events", async () => {
      const userId = "user-1"
      const connectedAccountId = "account-1"
      const now = new Date()
      const input = {
        externalEventId: "ext-1",
        title: "Past Meeting",
        meetingUrl: "https://zoom.us/j/123",
        meetingPlatform: MeetingPlatform.ZOOM,
        startTime: new Date(now.getTime() - 3600000),
        endTime: new Date(now.getTime() - 1800000),
        deduplicationKey: "key-1",
      }

      ;(mockPrisma.calendarEvent.findMany as jest.Mock).mockResolvedValue([])
      ;(mockPrisma.calendarEvent.upsert as jest.Mock).mockResolvedValue({
        id: "event-1",
        userId,
        connectedAccountId,
        ...input,
        notetakerEnabled: false,
        recallBot: null,
      })

      const results = await service.upsertEvents(
        userId,
        connectedAccountId,
        [input],
        true,
      )

      expect(results[0].event.notetakerEnabled).toBe(false)
      expect(results[0].shouldScheduleBot).toBe(false)
    })

    it("should return empty array for empty input", async () => {
      const results = await service.upsertEvents(
        "user-1",
        "account-1",
        [],
        true,
      )

      expect(results).toEqual([])
      expect(mockPrisma.calendarEvent.findMany).not.toHaveBeenCalled()
    })

    it("should handle event with cancelled status", async () => {
      const now = new Date()
      const input = {
        externalEventId: "ext-1",
        title: "Cancelled Meeting",
        startTime: new Date(now.getTime() + 3600000),
        endTime: new Date(now.getTime() + 7200000),
        meetingPlatform: MeetingPlatform.ZOOM,
        deduplicationKey: "key-1",
        status: CalendarEventStatus.CANCELLED,
      }

      ;(mockPrisma.calendarEvent.findMany as jest.Mock).mockResolvedValue([])
      ;(mockPrisma.calendarEvent.upsert as jest.Mock).mockResolvedValue({
        id: "event-1",
        ...input,
        status: CalendarEventStatus.CANCELLED,
        recallBot: null,
      })

      const results = await service.upsertEvents("user-1", "account-1", [input], true)

      expect(results[0].event.status).toBe(CalendarEventStatus.CANCELLED)
    })

    it("should detect meeting URL changes", async () => {
      const now = new Date()
      const existingEvent = {
        id: "event-1",
        externalEventId: "ext-1",
        title: "Meeting",
        startTime: new Date(now.getTime() + 3600000),
        endTime: new Date(now.getTime() + 7200000),
        meetingUrl: null,
        meetingPlatform: MeetingPlatform.UNKNOWN,
        recallBot: null,
      }

      const input = {
        externalEventId: "ext-1",
        title: "Meeting",
        startTime: existingEvent.startTime,
        endTime: existingEvent.endTime,
        meetingUrl: "https://zoom.us/j/123",
        meetingPlatform: MeetingPlatform.ZOOM,
        deduplicationKey: "key-1",
      }

      ;(mockPrisma.calendarEvent.findMany as jest.Mock).mockResolvedValue([
        existingEvent,
      ])
      ;(mockPrisma.calendarEvent.upsert as jest.Mock).mockResolvedValue({
        ...existingEvent,
        meetingUrl: input.meetingUrl,
        meetingPlatform: input.meetingPlatform,
        recallBot: null,
      })
      ;(mockNotifications.createNotification as jest.Mock).mockResolvedValue({
        id: "notif-1",
      })

      await service.upsertEvents("user-1", "account-1", [input], true)

      expect(mockNotifications.createNotification).toHaveBeenCalled()
    })

    it("should handle event with past end time", async () => {
      const now = new Date()
      const input = {
        externalEventId: "ext-1",
        title: "Past Meeting",
        startTime: new Date(now.getTime() - 7200000),
        endTime: new Date(now.getTime() - 3600000), // Past
        meetingPlatform: MeetingPlatform.ZOOM,
        deduplicationKey: "key-1",
      }

      ;(mockPrisma.calendarEvent.findMany as jest.Mock).mockResolvedValue([])
      ;(mockPrisma.calendarEvent.upsert as jest.Mock).mockResolvedValue({
        id: "event-1",
        ...input,
        status: CalendarEventStatus.COMPLETED,
        recallBot: null,
      })

      const results = await service.upsertEvents("user-1", "account-1", [input], true)

      expect(results[0].event.status).toBe(CalendarEventStatus.COMPLETED)
    })

    it("should handle event with done bot status", async () => {
      const now = new Date()
      const existingEvent = {
        id: "event-1",
        externalEventId: "ext-1",
        title: "Meeting",
        startTime: new Date(now.getTime() + 3600000),
        endTime: new Date(now.getTime() + 7200000),
        recallBot: {
          id: "bot-1",
          status: RecallBotStatus.DONE,
        },
      }

      const input = {
        externalEventId: "ext-1",
        title: "Meeting",
        startTime: existingEvent.startTime,
        endTime: existingEvent.endTime,
        meetingPlatform: MeetingPlatform.ZOOM,
        deduplicationKey: "key-1",
      }

      ;(mockPrisma.calendarEvent.findMany as jest.Mock).mockResolvedValue([
        existingEvent,
      ])
      ;(mockPrisma.calendarEvent.upsert as jest.Mock).mockResolvedValue({
        ...existingEvent,
        status: CalendarEventStatus.COMPLETED,
      })

      const results = await service.upsertEvents("user-1", "account-1", [input], true)

      expect(results[0].event.status).toBe(CalendarEventStatus.COMPLETED)
    })
  })

  describe("markEventsDeleted", () => {
    it("should mark events as deleted", async () => {
      const connectedAccountId = "account-1"
      const externalEventIds = ["ext-1", "ext-2"]
      const events = [
        {
          id: "event-1",
          externalEventId: "ext-1",
          recallBot: null,
        },
        {
          id: "event-2",
          externalEventId: "ext-2",
          recallBot: null,
        },
      ]

      ;(mockPrisma.calendarEvent.findMany as jest.Mock).mockResolvedValue(
        events,
      )
      ;(mockPrisma.calendarEvent.updateMany as jest.Mock).mockResolvedValue({
        count: 2,
      })

      const result = await service.markEventsDeleted(
        connectedAccountId,
        externalEventIds,
      )

      expect(result).toHaveLength(2)
      expect(mockPrisma.calendarEvent.updateMany).toHaveBeenCalledWith({
        where: {
          connectedAccountId,
          externalEventId: { in: externalEventIds },
        },
        data: {
          status: CalendarEventStatus.CANCELLED,
          deletedAt: expect.any(Date),
        },
      })
    })

    it("should return empty array when no events found", async () => {
      ;(mockPrisma.calendarEvent.findMany as jest.Mock).mockResolvedValue([])

      const result = await service.markEventsDeleted("account-1", ["ext-1"])

      expect(result).toEqual([])
      expect(mockPrisma.calendarEvent.updateMany).not.toHaveBeenCalled()
    })
  })

  describe("completePastEventsForAccount", () => {
    it("should mark past events as completed", async () => {
      const connectedAccountId = "account-1"
      ;(mockPrisma.calendarEvent.updateMany as jest.Mock).mockResolvedValue({
        count: 3,
      })

      await service.completePastEventsForAccount(connectedAccountId)

      expect(mockPrisma.calendarEvent.updateMany).toHaveBeenCalledWith({
        where: {
          connectedAccountId,
          deletedAt: null,
          status: CalendarEventStatus.UPCOMING,
          endTime: { lt: expect.any(Date) },
        },
        data: {
          status: CalendarEventStatus.COMPLETED,
        },
      })
    })
  })

  describe("getLatestProviderSyncAt", () => {
    it("should return latest sync time for provider", async () => {
      const userId = "user-1"
      const lastSyncedAt = new Date()
      ;(mockPrisma.connectedAccount.findFirst as jest.Mock).mockResolvedValue({
        lastSyncedAt,
      })

      const result = await service.getLatestProviderSyncAt(userId)

      expect(result).toEqual(lastSyncedAt)
      expect(mockPrisma.connectedAccount.findFirst).toHaveBeenCalledWith({
        where: {
          userId,
          provider: ConnectedProvider.GOOGLE_CALENDAR,
        },
        orderBy: { lastSyncedAt: "desc" },
        select: { lastSyncedAt: true },
      })
    })

    it("should return null when no account found", async () => {
      const userId = "user-1"
      ;(mockPrisma.connectedAccount.findFirst as jest.Mock).mockResolvedValue(
        null,
      )

      const result = await service.getLatestProviderSyncAt(userId)

      expect(result).toBeNull()
    })
  })

  describe("edge cases", () => {
    it("should handle location changes in event updates", async () => {
      const now = new Date()
      const existingEvent = {
        id: "event-1",
        externalEventId: "ext-1",
        title: "Meeting",
        startTime: new Date(now.getTime() + 3600000),
        endTime: new Date(now.getTime() + 7200000),
        location: "Old Location",
        meetingPlatform: MeetingPlatform.UNKNOWN,
        recallBot: null,
      }

      const input = {
        externalEventId: "ext-1",
        title: "Meeting",
        startTime: existingEvent.startTime,
        endTime: existingEvent.endTime,
        location: "New Location",
        meetingPlatform: MeetingPlatform.UNKNOWN,
        deduplicationKey: "key-1",
      }

      ;(mockPrisma.calendarEvent.findMany as jest.Mock).mockResolvedValue([
        existingEvent,
      ])
      ;(mockPrisma.calendarEvent.upsert as jest.Mock).mockResolvedValue({
        ...existingEvent,
        location: input.location,
        recallBot: null,
      })
      ;(mockNotifications.createNotification as jest.Mock).mockResolvedValue({
        id: "notif-1",
      })

      await service.upsertEvents("user-1", "account-1", [input], true)

      expect(mockNotifications.createNotification).toHaveBeenCalled()
    })

    it("should handle title changes in event updates", async () => {
      const now = new Date()
      const existingEvent = {
        id: "event-1",
        externalEventId: "ext-1",
        title: "Old Title",
        startTime: new Date(now.getTime() + 3600000),
        endTime: new Date(now.getTime() + 7200000),
        meetingPlatform: MeetingPlatform.UNKNOWN,
        recallBot: null,
      }

      const input = {
        externalEventId: "ext-1",
        title: "New Title",
        startTime: existingEvent.startTime,
        endTime: existingEvent.endTime,
        meetingPlatform: MeetingPlatform.UNKNOWN,
        deduplicationKey: "key-1",
      }

      ;(mockPrisma.calendarEvent.findMany as jest.Mock).mockResolvedValue([
        existingEvent,
      ])
      ;(mockPrisma.calendarEvent.upsert as jest.Mock).mockResolvedValue({
        ...existingEvent,
        title: input.title,
        recallBot: null,
      })
      ;(mockNotifications.createNotification as jest.Mock).mockResolvedValue({
        id: "notif-1",
      })

      await service.upsertEvents("user-1", "account-1", [input], true)

      expect(mockNotifications.createNotification).toHaveBeenCalled()
    })

    it("should handle platform changes in event updates", async () => {
      const now = new Date()
      const existingEvent = {
        id: "event-1",
        externalEventId: "ext-1",
        title: "Meeting",
        startTime: new Date(now.getTime() + 3600000),
        endTime: new Date(now.getTime() + 7200000),
        meetingUrl: "https://zoom.us/j/123",
        meetingPlatform: MeetingPlatform.ZOOM,
        recallBot: null,
      }

      const input = {
        externalEventId: "ext-1",
        title: "Meeting",
        startTime: existingEvent.startTime,
        endTime: existingEvent.endTime,
        meetingUrl: "https://meet.google.com/abc",
        meetingPlatform: MeetingPlatform.GOOGLE_MEET,
        deduplicationKey: "key-1",
      }

      ;(mockPrisma.calendarEvent.findMany as jest.Mock).mockResolvedValue([
        existingEvent,
      ])
      ;(mockPrisma.calendarEvent.upsert as jest.Mock).mockResolvedValue({
        ...existingEvent,
        meetingPlatform: input.meetingPlatform,
        meetingUrl: input.meetingUrl,
        recallBot: null,
      })
      ;(mockNotifications.createNotification as jest.Mock).mockResolvedValue({
        id: "notif-1",
      })

      await service.upsertEvents("user-1", "account-1", [input], true)

      expect(mockNotifications.createNotification).toHaveBeenCalled()
    })

    it("should handle event with active bot preventing scheduling", async () => {
      const now = new Date()
      const input = {
        externalEventId: "ext-1",
        title: "Meeting",
        meetingUrl: "https://zoom.us/j/123",
        meetingPlatform: MeetingPlatform.ZOOM,
        startTime: new Date(now.getTime() + 3600000),
        endTime: new Date(now.getTime() + 7200000),
        deduplicationKey: "key-1",
      }

      ;(mockPrisma.calendarEvent.findMany as jest.Mock).mockResolvedValue([])
      ;(mockPrisma.calendarEvent.upsert as jest.Mock).mockResolvedValue({
        id: "event-1",
        ...input,
        notetakerEnabled: true,
        recallBot: {
          id: "bot-1",
          status: RecallBotStatus.SCHEDULED,
        },
      })

      const results = await service.upsertEvents("user-1", "account-1", [input], true)

      expect(results[0].shouldScheduleBot).toBe(false)
    })

    it("should handle markEventsDeleted with empty array", async () => {
      const result = await service.markEventsDeleted("account-1", [])

      expect(result).toEqual([])
      expect(mockPrisma.calendarEvent.findMany).not.toHaveBeenCalled()
    })
  })
})

