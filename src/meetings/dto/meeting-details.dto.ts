import {
  MeetingMediaStatus,
  MeetingMediaType,
  MeetingPlatform,
  RecallBotStatus,
  SocialChannel,
  SocialPostStatus,
} from "@prisma/client"
import { CalendarEventDto } from "../../calendar/dto/calendar-event.dto"

export class RecallBotDto {
  id: string
  status: RecallBotStatus
  meetingPlatform: MeetingPlatform
  meetingUrl: string
  joinAt: string
  metadata?: Record<string, unknown> | null
}

export class MeetingMediaDto {
  id: string
  type: MeetingMediaType
  status: MeetingMediaStatus
  expiresAt?: string | null
  available: boolean
}

export class MeetingInsightDto {
  id: string
  summary?: string | null
  followUpEmail?: string | null
  generatedAt?: string | null
}

export class SocialPostDto {
  id: string
  channel: SocialChannel
  status: SocialPostStatus
  content: string
  automationId?: string | null
  publishedAt?: string | null
  error?: string | null
}

export class MeetingDetailsDto {
  event: CalendarEventDto
  recallBot?: RecallBotDto | null
  media: MeetingMediaDto[]
  insight?: MeetingInsightDto | null
  socialPosts: SocialPostDto[]
}



