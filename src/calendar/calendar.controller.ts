import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  HttpCode,
} from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { CalendarService } from "./calendar.service"
import { RecallService } from "../recall/recall.service"
import { CalendarSyncService } from "./calendar-sync.service"
import { CalendarEventDto } from "./dto/calendar-event.dto"
import { ToggleNotetakerDto } from "./dto/toggle-notetaker.dto"
import { CurrentDbUser } from "../users/decorators/current-db-user.decorator"
import type {
  CalendarEvent,
  ConnectedAccount,
  RecallBot,
  User,
} from "@prisma/client"
import { ConnectedProvider } from "@prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import {
  CalendarEventsDeltaQueryDto,
  CalendarEventsDeltaResponseDto,
  CalendarEventsPayloadDto,
} from "./dto/calendar-events-payload.dto"

@ApiTags("Calendar")
@Controller("calendar")
export class CalendarController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly recallService: RecallService,
    private readonly calendarSyncService: CalendarSyncService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("events")
  async listEvents(
    @CurrentDbUser() user: User,
  ): Promise<CalendarEventsPayloadDto> {
    const events = await this.calendarService.listUpcomingEvents(user.id)
    return this.buildEventsPayload(user.id, events)
  }

  @Get("events/upcoming")
  async listUpcoming(
    @CurrentDbUser() user: User,
  ): Promise<CalendarEventsPayloadDto> {
    const events = await this.calendarService.listUpcomingEvents(user.id)
    return this.buildEventsPayload(user.id, events)
  }

  @Get("events/past")
  async listPast(
    @CurrentDbUser() user: User,
  ): Promise<CalendarEventsPayloadDto> {
    const events = await this.calendarService.listPastEvents(user.id)
    return this.buildEventsPayload(user.id, events)
  }

  @Get("events/delta-sync")
  async deltaSync(
    @Query() query: CalendarEventsDeltaQueryDto,
    @CurrentDbUser() user: User,
  ): Promise<CalendarEventsDeltaResponseDto> {
    const updatedSince = new Date(query.updatedSince)
    const { events, deletedIds } = await this.calendarService.listUpdatedEvents(
      user.id,
      updatedSince,
    )
    const providerSyncedAt = await this.calendarService.getLatestProviderSyncAt(
      user.id,
    )

    return {
      events: events.map((event) => this.toCalendarEventDto(event)),
      deletedIds,
      serverTimestamp: new Date().toISOString(),
      providerSyncedAt: providerSyncedAt
        ? providerSyncedAt.toISOString()
        : null,
    }
  }

  @Post("sync-now")
  @HttpCode(202)
  async syncNow(@CurrentDbUser() user: User) {
    return this.calendarSyncService.syncUserAccounts(user.id)
  }

  @Get("webhook-status")
  async getWebhookStatus(@CurrentDbUser() user: User) {
    const accounts = await this.prisma.connectedAccount.findMany({
      where: {
        userId: user.id,
        provider: ConnectedProvider.GOOGLE_CALENDAR,
      },
      select: {
        id: true,
        label: true,
        providerAccountId: true,
        calendarChannelId: true,
        calendarResourceId: true,
        calendarChannelExpiresAt: true,
        lastSyncedAt: true,
      },
    })

    return {
      accounts: accounts.map((account) => ({
        id: account.id,
        label: account.label,
        email: account.providerAccountId,
        hasWebhook: !!account.calendarChannelId,
        channelId: account.calendarChannelId,
        resourceId: account.calendarResourceId,
        expiresAt: account.calendarChannelExpiresAt?.toISOString() ?? null,
        lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
      })),
    }
  }

  @Patch("events/:id/notetaker")
  async toggleNotetaker(
    @Param("id") eventId: string,
    @Body() body: ToggleNotetakerDto,
    @CurrentDbUser() user: User,
  ) {
    const result = await this.calendarService.toggleNotetaker(
      eventId,
      user.id,
      body.enabled,
    )

    if (result.shouldSchedule) {
      await this.recallService.ensureBotScheduled(result.event)
    } else if (result.shouldCancel) {
      await this.recallService.cancelBotForEvent(result.event.id)
    }

    return { success: true }
  }

  private toCalendarEventDto(
    event: CalendarEvent & {
      recallBot: RecallBot | null
      connectedAccount: ConnectedAccount
    },
  ): CalendarEventDto {
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      location: (event as any).location ?? null,
      startTime: event.startTime.toISOString(),
      endTime: event.endTime.toISOString(),
      timezone: event.timezone,
      meetingUrl: event.meetingUrl,
      meetingPlatform: event.meetingPlatform,
      htmlLink: null,
      calendarTitle: event.calendarTitle,
      provider: event.connectedAccount.provider,
      accountLabel: event.connectedAccount.label,
      notetakerEnabled: event.notetakerEnabled,
      status: event.status,
      botStatus: event.recallBot?.status ?? null,
      reminders: (event as any).reminders as Record<string, unknown> | null,
      recurrence: (event as any).recurrence as string[] | null,
      creatorEmail: (event as any).creatorEmail ?? null,
      creatorDisplayName: (event as any).creatorDisplayName ?? null,
    }
  }

  private async buildEventsPayload(
    userId: string,
    events: Array<
      CalendarEvent & {
        recallBot: RecallBot | null
        connectedAccount: ConnectedAccount
      }
    >,
  ): Promise<CalendarEventsPayloadDto> {
    const providerSyncedAt =
      await this.calendarService.getLatestProviderSyncAt(userId)
    return {
      events: events.map((event) => this.toCalendarEventDto(event)),
      serverTimestamp: new Date().toISOString(),
      providerSyncedAt: providerSyncedAt
        ? providerSyncedAt.toISOString()
        : null,
    }
  }
}
