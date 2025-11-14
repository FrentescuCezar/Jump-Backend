import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { CalendarService } from "./calendar.service"
import { RecallService } from "../recall/recall.service"
import { CalendarEventDto } from "./dto/calendar-event.dto"
import { ToggleNotetakerDto } from "./dto/toggle-notetaker.dto"
import { CurrentDbUser } from "../users/decorators/current-db-user.decorator"
import type {
  CalendarEvent,
  ConnectedAccount,
  RecallBot,
  User,
} from "@prisma/client"
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
  ) {}

  @Get("events")
  async listEvents(
    @CurrentDbUser() user: User,
  ): Promise<CalendarEventsPayloadDto> {
    const events = await this.calendarService.listUpcomingEvents(user.id)
    return {
      events: events.map((event) => this.toCalendarEventDto(event)),
      serverTimestamp: new Date().toISOString(),
    }
  }

  @Get("events/delta-sync")
  async deltaSync(
    @Query() query: CalendarEventsDeltaQueryDto,
    @CurrentDbUser() user: User,
  ): Promise<CalendarEventsDeltaResponseDto> {
    const updatedSince = new Date(query.updatedSince)
    const events = await this.calendarService.listUpdatedEvents(
      user.id,
      updatedSince,
    )

    return {
      events: events.map((event) => this.toCalendarEventDto(event)),
      deletedIds: [],
      serverTimestamp: new Date().toISOString(),
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
}
