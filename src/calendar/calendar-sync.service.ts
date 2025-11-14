import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import {
  CalendarEventStatus,
  ConnectedAccount,
  ConnectedProvider,
  MeetingPlatform,
} from "@prisma/client"
import { google, type calendar_v3 } from "googleapis"
import { addDays } from "date-fns"
import { PrismaService } from "../../prisma/prisma.service"
import { CalendarService, UpsertCalendarEventInput } from "./calendar.service"
import { RecallService } from "../recall/recall.service"
import { GoogleOAuthService } from "../integrations/google/google-oauth.service"

@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly calendarService: CalendarService,
    private readonly recallService: RecallService,
    private readonly googleOAuth: GoogleOAuthService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async syncAllAccounts() {
    const googleAccounts = await this.prisma.connectedAccount.findMany({
      where: { provider: ConnectedProvider.GOOGLE_CALENDAR },
    })

    for (const account of googleAccounts) {
      try {
        await this.syncGoogleAccount(account)
      } catch (error) {
        this.logger.error(
          `Failed to sync account ${account.id} (${account.label ?? account.providerAccountId}): ${error}`,
        )
      }
    }
  }

  async syncAccountById(accountId: string) {
    const account = await this.prisma.connectedAccount.findUnique({
      where: { id: accountId },
    })
    if (!account || account.provider !== ConnectedProvider.GOOGLE_CALENDAR) {
      return
    }
    await this.syncGoogleAccount(account)
  }

  private async syncGoogleAccount(account: ConnectedAccount) {
    const client = this.googleOAuth.createOAuthClient({
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      expiryDate: account.expiresAt?.getTime(),
    })

    // Refresh access token if needed
    if (
      (!account.accessToken || this.isExpired(account.expiresAt)) &&
      account.refreshToken
    ) {
      const { credentials } = await client.refreshAccessToken()
      await this.prisma.connectedAccount.update({
        where: { id: account.id },
        data: {
          accessToken: credentials.access_token ?? account.accessToken,
          refreshToken: credentials.refresh_token ?? account.refreshToken,
          expiresAt: credentials.expiry_date
            ? new Date(credentials.expiry_date)
            : account.expiresAt,
        },
      })
    }

    const calendar = google.calendar({ version: "v3", auth: client })
    const events = await this.fetchCalendarWindow(calendar)

    const eventInputs = events
      .map((event) => this.transformGoogleEvent(event))
      .filter((event): event is UpsertCalendarEventInput => !!event)

    const preference = await this.getUserPreference(account.userId)

    const upsertResults = await this.calendarService.upsertEvents(
      account.userId,
      account.id,
      eventInputs,
      preference.defaultNotetaker,
    )

    for (const result of upsertResults) {
      if (result.shouldScheduleBot) {
        await this.recallService.ensureBotScheduled(result.event)
      }
      if (result.shouldCancelBot) {
        await this.recallService.cancelBotForEvent(result.event.id)
      }
    }

    await this.prisma.connectedAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date() },
    })
  }

  private async fetchCalendarWindow(
    calendar: calendar_v3.Calendar,
  ): Promise<calendar_v3.Schema$Event[]> {
    const timeMin = new Date()
    const timeMax = addDays(timeMin, 28)
    let pageToken: string | undefined
    const allEvents: calendar_v3.Schema$Event[] = []

    do {
      const response = await calendar.events.list({
        calendarId: "primary",
        singleEvents: true,
        orderBy: "startTime",
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        pageToken,
        maxResults: 2500,
      })
      const data = response.data
      pageToken = data.nextPageToken ?? undefined
      if (data.items?.length) {
        allEvents.push(...data.items)
      }
    } while (pageToken)

    return allEvents
  }

  private transformGoogleEvent(
    event: calendar_v3.Schema$Event,
  ): UpsertCalendarEventInput | undefined {
    if (!event.id || !event.start || !event.end) {
      return undefined
    }

    const start = this.parseDate(event.start)
    const end = this.parseDate(event.end)
    if (!start || !end) {
      return undefined
    }

    const meetingInfo = this.extractMeetingInfo(event)

    // Extract reminders
    const reminders = event.reminders
      ? {
          useDefault: event.reminders.useDefault ?? false,
          overrides: event.reminders.overrides ?? [],
        }
      : null

    // Extract recurrence rules
    const recurrence = event.recurrence ?? null

    // Extract creator info
    const creatorEmail = event.creator?.email ?? null
    const creatorDisplayName = event.creator?.displayName ?? null

    return {
      externalEventId: event.id,
      calendarId: event.organizer?.email ?? undefined,
      calendarTitle: event.organizer?.displayName ?? event.summary ?? undefined,
      title: event.summary ?? "Untitled Meeting",
      description: event.description ?? undefined,
      location: event.location ?? undefined,
      meetingUrl: meetingInfo.url,
      meetingPlatform: meetingInfo.platform,
      htmlLink: event.htmlLink ?? undefined,
      startTime: start,
      endTime: end,
      timezone: event.start.timeZone ?? event.end.timeZone ?? undefined,
      attendees: event.attendees as any,
      reminders: reminders as any,
      recurrence: recurrence as any,
      creatorEmail: creatorEmail,
      creatorDisplayName: creatorDisplayName,
      deduplicationKey: `${meetingInfo.url ?? "no-link"}:${start.toISOString()}:${event.id}`,
      status:
        event.status === "cancelled"
          ? CalendarEventStatus.CANCELLED
          : CalendarEventStatus.UPCOMING,
    }
  }

  private parseDate(dateInput: calendar_v3.Schema$EventDateTime) {
    const value = dateInput.dateTime ?? dateInput.date
    if (!value) return undefined
    return new Date(value)
  }

  private extractMeetingInfo(event: calendar_v3.Schema$Event) {
    const possibleFields = [
      event.hangoutLink,
      event.location,
      event.description,
      event.conferenceData?.entryPoints?.map((entry) => entry.uri).join(" "),
    ]
    const match = this.findMeetingUrl(possibleFields.filter(Boolean).join(" "))
    return match
  }

  private findMeetingUrl(text: string) {
    if (!text) {
      return { url: null, platform: MeetingPlatform.UNKNOWN }
    }

    const patterns = [
      {
        regex: /(https?:\/\/[\w.-]*zoom\.us\/[^\s]+)/i,
        platform: MeetingPlatform.ZOOM,
      },
      {
        regex: /(https?:\/\/meet\.google\.com\/[^\s]+)/i,
        platform: MeetingPlatform.GOOGLE_MEET,
      },
      {
        regex: /(https?:\/\/teams\.microsoft\.com\/[^\s]+)/i,
        platform: MeetingPlatform.MICROSOFT_TEAMS,
      },
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern.regex)
      if (match) {
        return { url: match[0], platform: pattern.platform }
      }
    }

    return { url: null, platform: MeetingPlatform.UNKNOWN }
  }

  private async getUserPreference(userId: string) {
    let preference = await this.prisma.meetingPreference.findUnique({
      where: { userId },
    })
    if (!preference) {
      preference = await this.prisma.meetingPreference.create({
        data: { userId },
      })
    }
    return preference
  }

  private isExpired(expiresAt?: Date | null) {
    if (!expiresAt) return true
    return expiresAt.getTime() <= Date.now() + 60 * 1000
  }
}
