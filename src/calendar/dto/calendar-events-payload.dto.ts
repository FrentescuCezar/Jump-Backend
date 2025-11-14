import { CalendarEventDto } from "./calendar-event.dto"
import { IsISO8601 } from "class-validator"

export class CalendarEventsPayloadDto {
  events: CalendarEventDto[]
  serverTimestamp: string
}

export class CalendarEventsDeltaResponseDto {
  events: CalendarEventDto[]
  deletedIds: string[]
  serverTimestamp: string
}

export class CalendarEventsDeltaQueryDto {
  @IsISO8601()
  updatedSince!: string
}


