import { Injectable, NotFoundException } from "@nestjs/common"
import {
  CalendarEvent,
  CalendarEventStatus,
  MeetingPlatform,
  RecallBot,
  Prisma,
} from "@prisma/client"
import { PrismaService } from "../../prisma/prisma.service"

export type UpsertCalendarEventInput = {
  externalEventId: string
  calendarId?: string | null
  calendarTitle?: string | null
  title?: string | null
  description?: string | null
  location?: string | null
  meetingUrl?: string | null
  meetingPlatform: MeetingPlatform
  htmlLink?: string | null
  startTime: Date
  endTime: Date
  timezone?: string | null
  attendees?: Record<string, unknown>[] | null
  reminders?: Record<string, unknown> | null
  recurrence?: string[] | null
  creatorEmail?: string | null
  creatorDisplayName?: string | null
  deduplicationKey: string
  status?: CalendarEventStatus
}

export type UpsertEventResult = {
  event: CalendarEvent & { recallBot: RecallBot | null }
  shouldScheduleBot: boolean
  shouldCancelBot: boolean
}

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  listUpcomingEvents(userId: string) {
    const now = new Date()
    return this.prisma.calendarEvent.findMany({
      where: {
        userId,
        startTime: {
          gte: new Date(now.getTime() - 60 * 60 * 1000),
        },
      },
      include: {
        recallBot: true,
        connectedAccount: true,
      },
      orderBy: {
        startTime: "asc",
      },
      take: 50,
    })
  }

  listPastEvents(userId: string) {
    return this.prisma.calendarEvent.findMany({
      where: {
        userId,
        status: CalendarEventStatus.COMPLETED,
      },
      include: {
        recallBot: true,
        connectedAccount: true,
      },
      orderBy: {
        startTime: "desc",
      },
      take: 50,
    })
  }

  listUpdatedEvents(userId: string, updatedSince: Date) {
    const now = new Date()
    const windowStart = new Date(now.getTime() - 60 * 60 * 1000)

    return this.prisma.calendarEvent.findMany({
      where: {
        userId,
        startTime: {
          gte: windowStart,
        },
        OR: [
          { updatedAt: { gte: updatedSince } },
          {
            recallBot: {
              is: {
                updatedAt: { gte: updatedSince },
              },
            },
          },
        ],
      },
      include: {
        recallBot: true,
        connectedAccount: true,
      },
      orderBy: {
        startTime: "asc",
      },
      take: 50,
    })
  }

  async toggleNotetaker(eventId: string, userId: string, enabled: boolean) {
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id: eventId },
      include: { recallBot: true },
    })
    if (!event || event.userId !== userId) {
      throw new NotFoundException("Calendar event not found")
    }

    const updated = await this.prisma.calendarEvent.update({
      where: { id: eventId },
      data: { notetakerEnabled: enabled },
      include: { recallBot: true },
    })

    const shouldSchedule =
      enabled &&
      updated.meetingUrl &&
      updated.startTime > new Date() &&
      !updated.recallBot

    const shouldCancel = !enabled && !!event.recallBot

    return { event: updated, shouldSchedule, shouldCancel }
  }

  async upsertEvents(
    userId: string,
    connectedAccountId: string,
    inputs: UpsertCalendarEventInput[],
    defaultNotetaker: boolean,
  ): Promise<UpsertEventResult[]> {
    if (!inputs.length) {
      return []
    }

    const existing = await this.prisma.calendarEvent.findMany({
      where: {
        connectedAccountId,
        externalEventId: {
          in: inputs.map((event) => event.externalEventId),
        },
      },
      include: { recallBot: true },
    })

    const existingMap = new Map(
      existing.map((event) => [event.externalEventId, event]),
    )
    const results: UpsertEventResult[] = []

    for (const input of inputs) {
      const existingEvent = existingMap.get(input.externalEventId)
      const notetakerEnabled = existingEvent
        ? existingEvent.notetakerEnabled
        : defaultNotetaker

      const baseData = {
        calendarId: input.calendarId,
        calendarTitle: input.calendarTitle,
        title: input.title,
        description: input.description,
        location: input.location,
        meetingUrl: input.meetingUrl,
        meetingPlatform: input.meetingPlatform,
        htmlLink: input.htmlLink,
        startTime: input.startTime,
        endTime: input.endTime,
        timezone: input.timezone,
        attendees: input.attendees
          ? (input.attendees as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        reminders: input.reminders
          ? (input.reminders as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        recurrence: input.recurrence
          ? (input.recurrence as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        creatorEmail: input.creatorEmail,
        creatorDisplayName: input.creatorDisplayName,
        deduplicationKey: input.deduplicationKey,
        status: input.status ?? CalendarEventStatus.UPCOMING,
        notetakerEnabled,
        metadata: Prisma.JsonNull,
      }

      const event = await this.prisma.calendarEvent.upsert({
        where: {
          connectedAccountId_externalEventId: {
            connectedAccountId,
            externalEventId: input.externalEventId,
          },
        },
        create: {
          userId,
          connectedAccountId,
          externalEventId: input.externalEventId,
          ...baseData,
        },
        update: {
          ...baseData,
          userId,
          connectedAccountId,
        },
        include: { recallBot: true },
      })
      const eventWithBot = event as CalendarEvent & {
        recallBot: RecallBot | null
      }

      const shouldSchedule =
        notetakerEnabled &&
        !!eventWithBot.meetingUrl &&
        eventWithBot.startTime > new Date() &&
        !eventWithBot.recallBot

      const shouldCancel =
        (!notetakerEnabled || !eventWithBot.meetingUrl) &&
        !!eventWithBot.recallBot

      results.push({
        event: eventWithBot,
        shouldScheduleBot: shouldSchedule,
        shouldCancelBot: shouldCancel,
      })
    }

    return results
  }
}
