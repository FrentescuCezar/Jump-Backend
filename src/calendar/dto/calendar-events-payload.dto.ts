import { CalendarEventDto } from "./calendar-event.dto"
import { IsISO8601 } from "class-validator"

export class CalendarEventsPayloadDto {
  events: CalendarEventDto[]
  serverTimestamp: string
  providerSyncedAt: string | null
}

export class CalendarEventsDeltaResponseDto {
  events: CalendarEventDto[]
  deletedIds: string[]
  serverTimestamp: string
  providerSyncedAt: string | null
}

export class CalendarEventsDeltaQueryDto {
  @IsISO8601()
  updatedSince!: string
}
