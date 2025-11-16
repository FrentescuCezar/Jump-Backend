import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common"
import {
  CalendarEvent,
  CalendarEventStatus,
  ConnectedProvider,
  MeetingPlatform,
  RecallBot,
  RecallBotStatus,
  Prisma,
} from "@prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import { NotificationsService } from "../examples/services/notifications.service"
import { ChatGateway } from "../examples/chat.gateway"

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly chatGateway: ChatGateway,
  ) {}

  async listUpcomingEvents(userId: string) {
    const now = new Date()
    const where = {
      userId,
      deletedAt: null,
      startTime: {
        gte: new Date(now.getTime() - 60 * 60 * 1000),
      },
      endTime: {
        gte: now,
      },
      NOT: {
        recallBot: {
          status: RecallBotStatus.DONE,
        },
      },
    } as Prisma.CalendarEventWhereInput
    return this.prisma.calendarEvent.findMany({
      where,
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

  async listPastEvents(userId: string) {
    const now = new Date()
    const where = {
      userId,
      deletedAt: null,
      OR: [
        {
          endTime: {
            lt: now,
          },
        },
        {
          recallBot: {
            status: RecallBotStatus.DONE,
          },
        },
      ],
    } as Prisma.CalendarEventWhereInput
    return this.prisma.calendarEvent.findMany({
      where,
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

  async listUpdatedEvents(userId: string, updatedSince: Date) {
    const now = new Date()
    const windowStart = new Date(now.getTime() - 60 * 60 * 1000)
    const updatedWhere = {
      userId,
      deletedAt: null,
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
    } as Prisma.CalendarEventWhereInput
    const events = await this.prisma.calendarEvent.findMany({
      where: updatedWhere,
      include: {
        recallBot: true,
        connectedAccount: true,
      },
      orderBy: {
        startTime: "asc",
      },
      take: 50,
    })

    const deletedEvents = await this.prisma.calendarEvent.findMany({
      where: {
        userId,
        deletedAt: {
          gte: updatedSince,
        },
      },
      select: { id: true },
    })

    return { events, deletedIds: deletedEvents.map((event) => event.id) }
  }

  async toggleNotetaker(eventId: string, userId: string, enabled: boolean) {
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id: eventId },
      include: { recallBot: true },
    })
    if (!event || event.userId !== userId) {
      throw new NotFoundException("Calendar event not found")
    }

    // Notetaker can only be enabled for events with a meeting URL
    if (enabled && !event.meetingUrl) {
      throw new BadRequestException(
        "Notetaker cannot be enabled for events without a meeting URL",
      )
    }

    const updated = await this.prisma.calendarEvent.update({
      where: { id: eventId },
      data: { notetakerEnabled: enabled },
      include: { recallBot: true },
    })

    const now = new Date()
    const updatedHasActiveBot = this.hasActiveRecallBot(updated.recallBot)

    const shouldSchedule =
      enabled &&
      !!updated.meetingUrl &&
      updated.startTime > now &&
      !updatedHasActiveBot

    const shouldCancel = !enabled && this.hasActiveRecallBot(event.recallBot)

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
    const now = new Date()

    for (const input of inputs) {
      const existingEvent = existingMap.get(input.externalEventId)
      const eventIsInPast = input.startTime <= now
      const hasMeetingUrl = !!input.meetingUrl
      let notetakerEnabled: boolean
      if (!hasMeetingUrl) {
        notetakerEnabled = false
      } else if (existingEvent) {
        notetakerEnabled = existingEvent.notetakerEnabled
      } else if (eventIsInPast) {
        notetakerEnabled = false
      } else {
        notetakerEnabled = defaultNotetaker
      }
      const nextStatus = this.resolveEventStatus({
        existingEvent,
        input,
        now,
      })

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
        status: nextStatus,
        notetakerEnabled,
        metadata: Prisma.JsonNull,
        deletedAt: null,
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

      const hasActiveBot = this.hasActiveRecallBot(eventWithBot.recallBot)

      const shouldSchedule =
        notetakerEnabled &&
        !!eventWithBot.meetingUrl &&
        eventWithBot.startTime > now &&
        !hasActiveBot

      const shouldCancel =
        (!notetakerEnabled || !eventWithBot.meetingUrl) && hasActiveBot

      results.push({
        event: eventWithBot,
        shouldScheduleBot: shouldSchedule,
        shouldCancelBot: shouldCancel,
      })

      if (existingEvent) {
        const changes = this.detectEventChanges(existingEvent, eventWithBot)
        if (changes.length) {
          const notification = await this.notifications.createNotification({
            userId,
            type: "calendar:event-updated",
            title: `${eventWithBot.title ?? "Calendar activity"} updated`,
            body: this.buildChangeSummary(eventWithBot.title, changes),
            payload: {
              source: "calendar",
              eventId: eventWithBot.id,
              meetingId: eventWithBot.id,
              changes,
              startTime: eventWithBot.startTime.toISOString(),
              endTime: eventWithBot.endTime.toISOString(),
              eventAction: "updated",
            },
          })
          this.chatGateway?.emitNotification(notification)
        }
      } else {
        const creationHighlights = this.buildCreationHighlights(eventWithBot)
        const notification = await this.notifications.createNotification({
          userId,
          type: "calendar:event-created",
          title: `${eventWithBot.title ?? "Calendar activity"} added`,
          body: this.buildCreationSummary(eventWithBot, creationHighlights),
          payload: {
            source: "calendar",
            eventId: eventWithBot.id,
            meetingId: eventWithBot.id,
            changes: creationHighlights,
            startTime: eventWithBot.startTime.toISOString(),
            endTime: eventWithBot.endTime.toISOString(),
            eventAction: "created",
          },
        })
        this.chatGateway?.emitNotification(notification)
      }
    }

    return results
  }

  async markEventsDeleted(
    connectedAccountId: string,
    externalEventIds: string[],
  ) {
    if (!externalEventIds.length) {
      return []
    }

    const events = await this.prisma.calendarEvent.findMany({
      where: {
        connectedAccountId,
        externalEventId: {
          in: externalEventIds,
        },
      },
      include: { recallBot: true },
    })

    if (!events.length) {
      return []
    }

    const updateData: Prisma.CalendarEventUpdateManyMutationInput = {
      status: CalendarEventStatus.CANCELLED,
      deletedAt: new Date(),
    }

    await this.prisma.calendarEvent.updateMany({
      where: {
        connectedAccountId,
        externalEventId: {
          in: externalEventIds,
        },
      },
      data: updateData,
    })

    return events
  }

  async completePastEventsForAccount(connectedAccountId: string) {
    const now = new Date()
    await this.prisma.calendarEvent.updateMany({
      where: {
        connectedAccountId,
        deletedAt: null,
        status: CalendarEventStatus.UPCOMING,
        endTime: { lt: now },
      },
      data: {
        status: CalendarEventStatus.COMPLETED,
      },
    })
  }

  async getLatestProviderSyncAt(userId: string) {
    const account = await this.prisma.connectedAccount.findFirst({
      where: {
        userId,
        provider: ConnectedProvider.GOOGLE_CALENDAR,
      },
      orderBy: { lastSyncedAt: "desc" },
      select: { lastSyncedAt: true },
    })

    return account?.lastSyncedAt ?? null
  }

  private resolveEventStatus({
    existingEvent,
    input,
    now,
  }: {
    existingEvent?:
      | (CalendarEvent & { recallBot: RecallBot | null })
      | undefined
    input: UpsertCalendarEventInput
    now: Date
  }): CalendarEventStatus {
    if (input.status === CalendarEventStatus.CANCELLED) {
      return CalendarEventStatus.CANCELLED
    }

    if (existingEvent?.recallBot?.status === RecallBotStatus.DONE) {
      return CalendarEventStatus.COMPLETED
    }

    if (input.endTime.getTime() <= now.getTime()) {
      return CalendarEventStatus.COMPLETED
    }

    return CalendarEventStatus.UPCOMING
  }

  private detectEventChanges(
    previous: CalendarEvent,
    next: CalendarEvent,
  ): CalendarEventChange[] {
    const changes: CalendarEventChange[] = []

    if (previous.startTime.getTime() !== next.startTime.getTime()) {
      changes.push({
        field: "startTime",
        label: "Start time",
        previous: this.formatDateTime(previous.startTime, previous.timezone),
        current: this.formatDateTime(next.startTime, next.timezone),
        action: "updated",
      })
    }

    if (previous.endTime.getTime() !== next.endTime.getTime()) {
      changes.push({
        field: "endTime",
        label: "End time",
        previous: this.formatDateTime(previous.endTime, previous.timezone),
        current: this.formatDateTime(next.endTime, next.timezone),
        action: "updated",
      })
    }

    if ((previous.meetingUrl ?? null) !== (next.meetingUrl ?? null)) {
      const previousUrl = previous.meetingUrl ?? "None"
      const currentUrl = next.meetingUrl ?? "None"
      const action: CalendarChangeAction =
        next.meetingUrl && !previous.meetingUrl
          ? "added"
          : !next.meetingUrl && previous.meetingUrl
            ? "removed"
            : "updated"
      changes.push({
        field: "meetingUrl",
        label: "Meeting link",
        previous: previousUrl,
        current: currentUrl,
        action,
      })
    }

    if (previous.meetingPlatform !== next.meetingPlatform) {
      changes.push({
        field: "meetingPlatform",
        label: "Platform",
        previous: this.formatPlatform(previous.meetingPlatform),
        current: this.formatPlatform(next.meetingPlatform),
        action: "updated",
      })
    }

    if ((previous.location ?? null) !== (next.location ?? null)) {
      const action: CalendarChangeAction =
        next.location && !previous.location
          ? "added"
          : !next.location && previous.location
            ? "removed"
            : "updated"
      changes.push({
        field: "location",
        label: "Location",
        previous: previous.location ?? "None",
        current: next.location ?? "None",
        action,
      })
    }

    const previousTitle = (previous.title ?? "").trim()
    const currentTitle = (next.title ?? "").trim()
    if (previousTitle !== currentTitle) {
      changes.push({
        field: "title",
        label: "Title",
        previous: previous.title ?? "Untitled",
        current: next.title ?? "Untitled",
        action: "updated",
      })
    }

    return changes
  }

  private buildCreationHighlights(event: CalendarEvent): CalendarEventChange[] {
    const highlights: CalendarEventChange[] = [
      {
        field: "startTime",
        label: "Start time",
        previous: null,
        current: this.formatDateTime(event.startTime, event.timezone),
        action: "added",
      },
    ]

    if (event.meetingUrl) {
      highlights.push({
        field: "meetingUrl",
        label: "Meeting link",
        previous: null,
        current: event.meetingUrl,
        action: "added",
      })
    }

    if (event.location) {
      highlights.push({
        field: "location",
        label: "Location",
        previous: null,
        current: event.location,
        action: "added",
      })
    }

    if (event.meetingPlatform !== MeetingPlatform.UNKNOWN) {
      highlights.push({
        field: "meetingPlatform",
        label: "Platform",
        previous: null,
        current: this.formatPlatform(event.meetingPlatform),
        action: "added",
      })
    }

    return highlights
  }

  private buildCreationSummary(
    event: CalendarEvent,
    highlights: CalendarEventChange[],
  ) {
    const startDescriptor = `Starts ${this.formatDateTime(event.startTime, event.timezone)}`
    const additionalHighlights = highlights
      .filter((change) => change.field !== "startTime")
      .slice(0, 2)
      .map((change) => this.describeChange(change))
    const extraCount =
      highlights.length > additionalHighlights.length + 1
        ? highlights.length - (additionalHighlights.length + 1)
        : 0
    const parts = [startDescriptor, ...additionalHighlights]
    const suffix = extraCount > 0 ? ` (+${extraCount} more)` : ""
    return `${event.title ?? "Calendar activity"} added: ${parts.join(" • ")}${suffix}`
  }

  private buildChangeSummary(
    title: string | null | undefined,
    changes: CalendarEventChange[],
  ) {
    const summaryParts = changes.slice(0, 3).map((change) => {
      return this.describeChange(change)
    })
    const extraCount = changes.length - summaryParts.length
    const suffix = extraCount > 0 ? ` (+${extraCount} more)` : ""
    return `${title ?? "Calendar activity"} updated: ${summaryParts.join(" • ")}${suffix}`
  }

  private describeChange(change: CalendarEventChange) {
    const actionLabel = this.describeAction(change.action)
    const value =
      change.action === "removed"
        ? (change.previous ?? "Removed")
        : (change.current ?? "Updated")
    return `${change.label} ${actionLabel}${value ? `: ${value}` : ""}`
  }

  private describeAction(action: CalendarChangeAction | undefined) {
    switch (action) {
      case "added":
        return "added"
      case "removed":
        return "removed"
      case "updated":
      default:
        return "updated"
    }
  }

  private hasActiveRecallBot(bot: RecallBot | null) {
    if (!bot) {
      return false
    }

    return (
      bot.status === RecallBotStatus.SCHEDULED ||
      bot.status === RecallBotStatus.JOINING ||
      bot.status === RecallBotStatus.IN_CALL
    )
  }

  private formatDateTime(date: Date, timeZone?: string | null) {
    try {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: timeZone ?? undefined,
        timeZoneName: "short",
      }).format(date)
    } catch {
      return date.toLocaleString()
    }
  }

  private formatPlatform(platform: MeetingPlatform) {
    switch (platform) {
      case MeetingPlatform.ZOOM:
        return "Zoom"
      case MeetingPlatform.GOOGLE_MEET:
        return "Google Meet"
      case MeetingPlatform.MICROSOFT_TEAMS:
        return "Microsoft Teams"
      case MeetingPlatform.UNKNOWN:
      default:
        return "Unknown"
    }
  }
}

type CalendarChangeAction = "added" | "removed" | "updated"

type CalendarEventChange = {
  field: string
  label: string
  previous: string | null
  current: string | null
  action: CalendarChangeAction
}
