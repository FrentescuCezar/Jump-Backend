import { Injectable } from "@nestjs/common"
import type { Response } from "express"
import {
  CalendarEvent,
  ConnectedAccount,
  MeetingInsight,
  MeetingMedia,
  MeetingMediaStatus,
  MeetingMediaType,
  MeetingPreference,
  RecallBot,
  SocialPost,
} from "@prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import { RecallService } from "../recall/recall.service"
import { AiContentService } from "../ai/ai-content.service"
import { CalendarEventDto } from "../calendar/dto/calendar-event.dto"
import {
  MeetingDetailsDto,
  MeetingInsightDto,
  MeetingMediaDto,
  RecallBotDto,
  SocialPostDto,
} from "./dto/meeting-details.dto"
import {
  MeetingPreferenceDto,
  UpdateMeetingPreferenceDto,
} from "./dto/meeting-preference.dto"
import { AppError } from "../errors/app-error"
import { ErrorCodes } from "../errors/error-codes"

type MeetingEvent = CalendarEvent & {
  connectedAccount: ConnectedAccount
  recallBot: (RecallBot & { media: MeetingMedia[] }) | null
  meetingInsights: MeetingInsight[]
  socialPosts: SocialPost[]
}

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recallService: RecallService,
    private readonly aiContent: AiContentService,
  ) {}

  async getMeetingDetails(
    meetingId: string,
    userId: string,
  ): Promise<MeetingDetailsDto> {
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id: meetingId },
      include: {
        connectedAccount: true,
        recallBot: {
          include: {
            media: true,
          },
        },
        meetingInsights: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        socialPosts: {
          orderBy: { createdAt: "desc" },
        },
      },
    })

    if (!event || event.userId !== userId) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        params: { resource: "Meeting" },
      })
    }

    const meeting = event as MeetingEvent
    const [latestInsight] = meeting.meetingInsights
    const media = meeting.recallBot?.media ?? []

    return {
      event: this.toCalendarEventDto(meeting),
      recallBot: meeting.recallBot
        ? this.toRecallBotDto(meeting.recallBot)
        : null,
      media: media.map((item) => this.toMeetingMediaDto(item)),
      insight: latestInsight ? this.toMeetingInsightDto(latestInsight) : null,
      socialPosts: meeting.socialPosts.map((post) =>
        this.toSocialPostDto(post),
      ),
    }
  }

  async streamTranscript(
    meetingId: string,
    userId: string,
    response: Response,
  ) {
    const media = await this.getTranscriptMedia(meetingId, userId)
    await this.recallService.proxyMediaDownload(media, response, {
      fallbackContentType: "application/json",
    })
  }

  async regenerateAiContent(meetingId: string, userId: string) {
    await this.ensureOwnership(meetingId, userId)
    await this.aiContent.generateMeetingContent(meetingId, {
      regenerate: true,
    })
  }

  async getMeetingPreference(userId: string): Promise<MeetingPreferenceDto> {
    const preference = await this.findOrCreatePreference(userId)
    return this.toMeetingPreferenceDto(preference)
  }

  async updateMeetingPreference(
    userId: string,
    dto: UpdateMeetingPreferenceDto,
  ): Promise<MeetingPreferenceDto> {
    const preference = await this.prisma.meetingPreference.upsert({
      where: { userId },
      create: {
        userId,
        leadMinutes: dto.leadMinutes,
      },
      update: {
        leadMinutes: dto.leadMinutes,
      },
    })

    return this.toMeetingPreferenceDto(preference)
  }

  private async getTranscriptMedia(meetingId: string, userId: string) {
    const media = await this.prisma.meetingMedia.findFirst({
      where: {
        type: MeetingMediaType.TRANSCRIPT,
        recallBot: {
          calendarEventId: meetingId,
        },
      },
      include: {
        recallBot: {
          include: {
            calendarEvent: true,
          },
        },
      },
    })

    if (!media || media.recallBot?.calendarEvent.userId !== userId) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        params: { resource: "MeetingTranscript" },
      })
    }
    if (!media.downloadUrl) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        params: { resource: "MeetingTranscript" },
      })
    }
    return media
  }

  private async ensureOwnership(meetingId: string, userId: string) {
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id: meetingId },
      select: { id: true, userId: true },
    })
    if (!event || event.userId !== userId) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        params: { resource: "Meeting" },
      })
    }
  }

  private toCalendarEventDto(event: MeetingEvent): CalendarEventDto {
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
      htmlLink: event.htmlLink,
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

  private toRecallBotDto(bot: RecallBot): RecallBotDto {
    return {
      id: bot.id,
      status: bot.status,
      meetingPlatform: bot.meetingPlatform,
      meetingUrl: bot.meetingUrl,
      joinAt: bot.joinAt.toISOString(),
      metadata: (bot.metadata as Record<string, unknown>) ?? null,
    }
  }

  private toMeetingMediaDto(media: MeetingMedia): MeetingMediaDto {
    const available =
      media.status === MeetingMediaStatus.STORED && !!media.downloadUrl
    return {
      id: media.id,
      type: media.type,
      status: media.status,
      expiresAt: media.expiresAt ? media.expiresAt.toISOString() : null,
      available,
    }
  }

  private toMeetingInsightDto(insight: MeetingInsight): MeetingInsightDto {
    return {
      id: insight.id,
      summary: insight.summary,
      followUpEmail: insight.followUpEmail,
      generatedAt: insight.generatedAt
        ? insight.generatedAt.toISOString()
        : null,
    }
  }

  private toSocialPostDto(post: SocialPost): SocialPostDto {
    return {
      id: post.id,
      channel: post.channel,
      status: post.status,
      content: post.content,
      automationId: post.automationId,
      publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
      error: post.error,
    }
  }

  private async findOrCreatePreference(userId: string) {
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

  private toMeetingPreferenceDto(
    preference: MeetingPreference,
  ): MeetingPreferenceDto {
    return {
      leadMinutes: preference.leadMinutes,
    }
  }
}
