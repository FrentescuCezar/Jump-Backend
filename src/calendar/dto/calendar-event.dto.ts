import {
  CalendarEventStatus,
  ConnectedProvider,
  MeetingPlatform,
  RecallBotStatus,
} from "@prisma/client"

export class CalendarEventDto {
  id: string
  title?: string | null
  description?: string | null
  location?: string | null
  startTime: string
  endTime: string
  timezone?: string | null
  meetingUrl?: string | null
  meetingPlatform: MeetingPlatform
  htmlLink?: string | null
  calendarTitle?: string | null
  provider: ConnectedProvider
  accountLabel?: string | null
  notetakerEnabled: boolean
  status: CalendarEventStatus
  botStatus?: RecallBotStatus | null
  reminders?: Record<string, unknown> | null
  recurrence?: string[] | null
  creatorEmail?: string | null
  creatorDisplayName?: string | null
}
