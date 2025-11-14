import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { HttpService } from "@nestjs/axios"
import { PrismaService } from "../../prisma/prisma.service"
import {
  CalendarEvent,
  CalendarEventStatus,
  MeetingMediaStatus,
  MeetingMediaType,
  Prisma,
  RecallBotStatus,
  RecallBot,
} from "@prisma/client"
import { AxiosRequestConfig } from "axios"

@Injectable()
export class RecallService {
  private readonly logger = new Logger(RecallService.name)
  private readonly apiKey: string
  private readonly apiBaseUrl: string
  private readonly leadMinutesDefault: number

  constructor(
    private readonly configService: ConfigService,
    private readonly http: HttpService,
    private readonly prisma: PrismaService,
  ) {
    this.apiKey = this.configService.getOrThrow<string>("RECALL_API_KEY")
    const region =
      this.configService.get<string>("RECALL_REGION") ?? "us-west-2"
    this.apiBaseUrl =
      this.configService.get<string>("RECALL_API_BASE_URL") ??
      `https://${region}.recall.ai/api/v1`
    this.leadMinutesDefault = parseInt(
      this.configService.get<string>("RECALL_LEAD_MINUTES", "10"),
      10,
    )
  }

  private get authHeaders(): AxiosRequestConfig["headers"] {
    return {
      Authorization: `Token ${this.apiKey}`,
    }
  }

  async ensureBotScheduled(event: CalendarEvent) {
    if (!event.meetingUrl) {
      return null
    }

    const existingBot = await this.prisma.recallBot.findUnique({
      where: { calendarEventId: event.id },
    })

    if (existingBot) {
      return existingBot
    }

    const payload = {
      meeting_url: event.meetingUrl,
      join_at: new Date(
        event.startTime.getTime() - this.leadMinutesDefault * 60 * 1000,
      ).toISOString(),
      bot_name: "Jump Notetaker",
      metadata: {
        calendarEventId: event.id,
        userId: event.userId,
      },
      recording_config: {
        transcript: {
          provider: {
            recallai_streaming: {},
          },
        },
        video_mixed_mp4: {},
      },
    }

    const response = await this.http.axiosRef.post(
      `${this.apiBaseUrl}/bot`,
      payload,
      {
        headers: this.authHeaders,
      },
    )

    const bot = await this.prisma.recallBot.create({
      data: {
        id: response.data.id,
        calendarEventId: event.id,
        joinAt: new Date(payload.join_at),
        meetingUrl: event.meetingUrl,
        meetingPlatform: event.meetingPlatform,
        status: RecallBotStatus.SCHEDULED,
      },
    })

    return bot
  }

  async cancelBotForEvent(eventId: string) {
    const bot = await this.prisma.recallBot.findUnique({
      where: { calendarEventId: eventId },
    })

    if (!bot) {
      return
    }

    try {
      await this.http.axiosRef.delete(`${this.apiBaseUrl}/bot/${bot.id}`, {
        headers: this.authHeaders,
      })
    } catch (error) {
      this.logger.warn(`Failed to cancel Recall bot ${bot.id}: ${error}`)
    }

    await this.prisma.recallBot.update({
      where: { id: bot.id },
      data: { status: RecallBotStatus.CANCELLED },
    })
  }

  async pollBotStatus(bot: RecallBot) {
    let response: { data: RecallBotApiResponse }
    try {
      response = await this.http.axiosRef.get(
        `${this.apiBaseUrl}/bot/${bot.id}`,
        {
          headers: this.authHeaders,
        },
      )
    } catch (error) {
      this.logger.warn(`Failed to poll bot ${bot.id}: ${error}`)
      return
    }

    const latestStatus = this.extractLatestStatus(response.data)
    if (!latestStatus?.code) {
      return
    }

    const mappedStatus = this.mapRecallStatus(latestStatus.code)
    if (!mappedStatus) {
      return
    }

    const statusChanged = bot.status !== mappedStatus
    if (statusChanged) {
      await this.markBotStatus(bot.id, mappedStatus, latestStatus)
      bot.status = mappedStatus
    }

    if (mappedStatus === RecallBotStatus.DONE && statusChanged) {
      await this.captureBotMedia(bot.id)
    } else if (mappedStatus === RecallBotStatus.FATAL && statusChanged) {
      this.logger.warn(
        `Recall bot ${bot.id} failed (${latestStatus.sub_code ?? "unknown"})`,
      )
    }
  }

  private async markBotStatus(
    botId: string,
    status: RecallBotStatus,
    metadata?: Record<string, unknown>,
  ) {
    await this.prisma.recallBot.updateMany({
      where: { id: botId },
      data: {
        status,
        metadata: metadata
          ? (metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    })
  }

  private async captureBotMedia(botId: string) {
    const response = await this.http.axiosRef.get(
      `${this.apiBaseUrl}/bot/${botId}`,
      {
        headers: this.authHeaders,
      },
    )
    const recallBot = await this.prisma.recallBot.findUnique({
      where: { id: botId },
      include: { calendarEvent: true },
    })
    if (!recallBot) {
      this.logger.warn(`Received media for unknown bot ${botId}`)
      return
    }

    const recordings = response.data?.recordings ?? []
    for (const recording of recordings) {
      const shortcuts = recording?.media_shortcuts ?? {}
      await this.upsertMeetingMedia(
        botId,
        MeetingMediaType.TRANSCRIPT,
        shortcuts.transcript,
        recording,
      )
      await this.upsertMeetingMedia(
        botId,
        MeetingMediaType.VIDEO,
        shortcuts.video_mixed,
        recording,
      )
      await this.upsertMeetingMedia(
        botId,
        MeetingMediaType.PARTICIPANT_EVENTS,
        shortcuts.participant_events,
        recording,
      )
      await this.upsertMeetingMedia(
        botId,
        MeetingMediaType.METADATA,
        shortcuts.meeting_metadata,
        recording,
      )
    }

    await this.prisma.calendarEvent.updateMany({
      where: { id: recallBot.calendarEventId },
      data: { status: CalendarEventStatus.COMPLETED },
    })
  }

  private async upsertMeetingMedia(
    botId: string,
    type: MeetingMediaType,
    shortcut: RecallMediaShortcut | undefined,
    recording: RecallRecording,
  ) {
    if (!shortcut?.data?.download_url) {
      return
    }

    const existing = await this.prisma.meetingMedia.findFirst({
      where: { recallBotId: botId, type },
    })

    const mediaPayload = (shortcut as Prisma.InputJsonValue) ?? Prisma.JsonNull
    const expiresAt = shortcut.expires_at ? new Date(shortcut.expires_at) : null
    const mediaCreate: Prisma.MeetingMediaUncheckedCreateInput = {
      recallBotId: botId,
      type,
      status: MeetingMediaStatus.STORED,
      downloadUrl: shortcut.data.download_url,
      storagePath: null,
      payload: mediaPayload,
      expiresAt,
    }
    const mediaUpdate: Prisma.MeetingMediaUncheckedUpdateInput = {
      status: MeetingMediaStatus.STORED,
      downloadUrl: shortcut.data.download_url,
      storagePath: null,
      payload: mediaPayload,
      expiresAt,
      type,
    }

    if (existing) {
      await this.prisma.meetingMedia.update({
        where: { id: existing.id },
        data: mediaUpdate,
      })
    } else {
      await this.prisma.meetingMedia.create({ data: mediaCreate })
    }
  }
  private extractLatestStatus(
    payload: RecallBotApiResponse,
  ): RecallStatusChange | null {
    const changes = payload?.status_changes ?? []
    if (changes.length > 0) {
      return changes[changes.length - 1]
    }
    return payload?.status ?? null
  }

  private mapRecallStatus(code: string): RecallBotStatus | null {
    switch (code) {
      case "joining_call":
      case "in_waiting_room":
        return RecallBotStatus.JOINING
      case "in_call_not_recording":
      case "in_call_recording":
      case "call_ended":
        return RecallBotStatus.IN_CALL
      case "done":
        return RecallBotStatus.DONE
      case "fatal":
      case "recording_permission_denied":
        return RecallBotStatus.FATAL
      default:
        return null
    }
  }
}

type RecallMediaShortcut = {
  id?: string
  format?: string
  created_at?: string
  expires_at?: string
  status?: { code: string; sub_code?: string | null; updated_at?: string }
  data?: { download_url?: string }
}

type RecallRecording = {
  id?: string
  created_at?: string
  completed_at?: string
  media_shortcuts?: Record<string, RecallMediaShortcut>
}

type RecallStatusChange = {
  code: string
  sub_code?: string | null
  updated_at?: string
}

type RecallBotApiResponse = {
  status?: RecallStatusChange
  status_changes?: RecallStatusChange[]
  recordings?: RecallRecording[]
}
