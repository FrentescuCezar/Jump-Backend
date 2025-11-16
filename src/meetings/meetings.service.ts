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
  MeetingShare,
  RecallBot,
  SocialPost,
  User,
} from "@prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import { RecallService } from "../recall/recall.service"
import { AiContentService } from "../ai/ai-content.service"
import { CalendarEventDto } from "../calendar/dto/calendar-event.dto"
import {
  MeetingActivityDto,
  MeetingDetailsDto,
  MeetingInsightDto,
  MeetingMediaDto,
  MeetingViewerRole,
  RecallBotDto,
  SocialPostDto,
} from "./dto/meeting-details.dto"
import {
  MeetingPreferenceDto,
  UpdateMeetingPreferenceDto,
} from "./dto/meeting-preference.dto"
import { AppError } from "../errors/app-error"
import { ErrorCodes } from "../errors/error-codes"
import { MeetingShareDto } from "./dto/meeting-share.dto"

type MeetingEvent = CalendarEvent & {
  connectedAccount: ConnectedAccount
  recallBot: (RecallBot & { media: MeetingMedia[] }) | null
  meetingInsights: MeetingInsight[]
  socialPosts: SocialPost[]
}

type MeetingDetailsAccessOptions = {
  allowShared?: boolean
  viewerEmail?: string
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
    opts?: MeetingDetailsAccessOptions,
  ): Promise<MeetingDetailsDto> {
    const meeting = await this.findMeetingEvent(meetingId)

    if (!meeting) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        params: { resource: "Meeting" },
      })
    }

    await this.resolveViewerRole(meeting, userId, opts)

    return this.toMeetingDetailsDto(meeting)
  }

  async getMeetingActivity(
    meetingId: string,
    viewer: User,
  ): Promise<MeetingActivityDto> {
    const meeting = await this.findMeetingEvent(meetingId)

    if (!meeting) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        params: { resource: "Meeting" },
      })
    }

    const viewerRole = await this.resolveViewerRole(meeting, viewer.id, {
      allowShared: true,
      viewerEmail: viewer.email,
    })

    const shareCount =
      viewerRole === "owner"
        ? await this.prisma.meetingShare.count({
            where: { calendarEventId: meetingId },
          })
        : undefined

    return {
      viewerRole,
      details: this.toMeetingDetailsDto(meeting),
      ...(shareCount !== undefined ? { shareCount } : {}),
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

  async getVideoPlaybackUrl(meetingId: string, userId: string) {
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id: meetingId },
      include: {
        recallBot: true,
      },
    })

    if (!event || event.userId !== userId) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        params: { resource: "Meeting" },
      })
    }

    if (!event.recallBot) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        params: { resource: "MeetingVideo" },
      })
    }

    const media = await this.recallService.refreshVideoMedia(event.recallBot.id)
    if (!media?.downloadUrl) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        params: { resource: "MeetingVideo" },
      })
    }

    return {
      downloadUrl: media.downloadUrl,
      expiresAt: media.expiresAt ? media.expiresAt.toISOString() : null,
    }
  }

  async regenerateAiContent(meetingId: string, userId: string) {
    await this.ensureOwnership(meetingId, userId)
    await this.aiContent.generateMeetingContent(meetingId, {
      regenerate: true,
    })
  }

  async addMeetingShare(
    meetingId: string,
    ownerId: string,
    email: string,
  ): Promise<MeetingShareDto> {
    await this.ensureOwnership(meetingId, ownerId)
    const normalizedEmail = this.normalizeEmail(email)

    const share = await this.prisma.meetingShare.upsert({
      where: {
        calendarEventId_email: {
          calendarEventId: meetingId,
          email: normalizedEmail,
        },
      },
      update: {
        invitedByUserId: ownerId,
      },
      create: {
        calendarEventId: meetingId,
        email: normalizedEmail,
        invitedByUserId: ownerId,
      },
    })

    return this.toMeetingShareDto(share)
  }

  async listMeetingShares(
    meetingId: string,
    ownerId: string,
  ): Promise<MeetingShareDto[]> {
    await this.ensureOwnership(meetingId, ownerId)
    const shares = await this.prisma.meetingShare.findMany({
      where: { calendarEventId: meetingId },
      orderBy: { createdAt: "desc" },
    })
    return shares.map((share) => this.toMeetingShareDto(share))
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
        defaultNotetaker:
          dto.defaultNotetaker !== undefined ? dto.defaultNotetaker : true,
      },
      update: {
        leadMinutes: dto.leadMinutes,
        ...(dto.defaultNotetaker !== undefined && {
          defaultNotetaker: dto.defaultNotetaker,
        }),
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

  private async findMeetingEvent(
    meetingId: string,
  ): Promise<MeetingEvent | null> {
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

    return event ? (event as MeetingEvent) : null
  }

  private async resolveViewerRole(
    meeting: MeetingEvent,
    userId: string,
    opts?: MeetingDetailsAccessOptions,
  ): Promise<MeetingViewerRole> {
    if (meeting.userId === userId) {
      return "owner"
    }

    if (!opts?.allowShared || !opts.viewerEmail) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        params: { resource: "Meeting" },
      })
    }

    const hasAccess = await this.hasSharedAccess(meeting.id, opts.viewerEmail)

    if (!hasAccess) {
      throw new AppError(ErrorCodes.FORBIDDEN, {
        params: { resource: "Meeting" },
      })
    }

    return "guest"
  }

  private async hasSharedAccess(meetingId: string, email: string) {
    const normalizedEmail = this.normalizeEmail(email)
    const share = await this.prisma.meetingShare.findFirst({
      where: {
        calendarEventId: meetingId,
        email: normalizedEmail,
      },
    })
    return Boolean(share)
  }

  private toMeetingDetailsDto(meeting: MeetingEvent): MeetingDetailsDto {
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
      externalUrl:
        (post as SocialPost & { externalUrl?: string | null }).externalUrl ??
        null,
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
      defaultNotetaker: preference.defaultNotetaker,
    }
  }

  private toMeetingShareDto(share: MeetingShare): MeetingShareDto {
    return {
      id: share.id,
      email: share.email,
      invitedByUserId: share.invitedByUserId,
      createdAt: share.createdAt.toISOString(),
    }
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase()
  }
}
