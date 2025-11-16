import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { HttpService } from "@nestjs/axios"
import OpenAI from "openai"
import PQueue from "p-queue"
import {
  Automation,
  CalendarEvent,
  MeetingInsight,
  MeetingMedia,
  MeetingMediaStatus,
  MeetingMediaType,
  Prisma,
  RecallBot,
  SocialPostStatus,
  User,
} from "@prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import { AppError } from "../errors/app-error"
import { ErrorCodes } from "../errors/error-codes"

type MeetingContext = CalendarEvent & {
  user: User
  recallBot: (RecallBot & { media: MeetingMedia[] }) | null
  meetingInsights: MeetingInsight[]
}

type InsightResult = {
  summary: string
  followUpEmail: string
}

@Injectable()
export class AiContentService {
  private readonly logger = new Logger(AiContentService.name)
  private readonly openAi: OpenAI | null
  private readonly model: string
  private readonly queue: PQueue
  private readonly transcriptCharLimit: number
  private readonly transcriptSegmentLimit: number
  private readonly transcriptDownloadTimeout: number
  private readonly socialWordLimit: number

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly http: HttpService,
  ) {
    const apiKey = this.configService.get<string>("OPENAI_API_KEY")
    this.openAi = apiKey ? new OpenAI({ apiKey }) : null
    this.model = this.configService.get<string>("OPENAI_MODEL") ?? "gpt-4o-mini"
    const concurrency = Number(
      this.configService.get<string>("AI_QUEUE_CONCURRENCY") ?? 2,
    )
    this.queue = new PQueue({ concurrency })
    this.transcriptCharLimit = Number(
      this.configService.get<string>("AI_TRANSCRIPT_CHAR_LIMIT") ?? 20000,
    )
    this.transcriptSegmentLimit = Number(
      this.configService.get<string>("AI_TRANSCRIPT_SEGMENT_LIMIT") ?? 75,
    )
    this.transcriptDownloadTimeout = Number(
      this.configService.get<string>("AI_TRANSCRIPT_DOWNLOAD_TIMEOUT_MS") ??
        15000,
    )
    this.socialWordLimit = Number(
      this.configService.get<string>("AI_SOCIAL_WORD_LIMIT") ?? 90,
    )
  }

  queueMeetingGeneration(eventId: string) {
    this.queue.add(async () => {
      try {
        await this.generateMeetingContent(eventId)
      } catch (error) {
        this.logger.error(
          `AI content generation failed for meeting ${eventId}`,
          error instanceof Error ? error.stack : String(error),
        )
      }
    })
  }

  async generateMeetingContent(
    eventId: string,
    options?: { regenerate?: boolean },
  ) {
    await this.runGeneration(eventId, options)
  }

  private async runGeneration(
    eventId: string,
    options?: { regenerate?: boolean },
  ) {
    const meeting = await this.loadMeetingContext(eventId)
    const transcriptMedia = this.pickTranscriptMedia(meeting)
    if (!transcriptMedia) {
      this.logger.warn(
        `No transcript available for meeting ${eventId}, skipping AI generation`,
      )
      return
    }

    const transcriptPayload = await this.fetchTranscriptPayload(transcriptMedia)
    const transcriptText = this.formatTranscript(transcriptPayload)

    const insightResult = await this.generateInsightContent(
      meeting,
      transcriptText,
    )
    await this.saveMeetingInsight(meeting, insightResult)
    await this.generateSocialDrafts(meeting, transcriptText, options)
  }

  private async loadMeetingContext(eventId: string): Promise<MeetingContext> {
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id: eventId },
      include: {
        user: true,
        recallBot: {
          include: {
            media: true,
          },
        },
        meetingInsights: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    })

    if (!event) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        params: { resource: "Meeting" },
      })
    }

    return event
  }

  private pickTranscriptMedia(meeting: MeetingContext) {
    return meeting.recallBot?.media.find(
      (media) =>
        media.type === MeetingMediaType.TRANSCRIPT &&
        media.status === MeetingMediaStatus.STORED &&
        !!media.downloadUrl,
    )
  }

  private async fetchTranscriptPayload(media: MeetingMedia) {
    const response = await this.http.axiosRef.get(media.downloadUrl!, {
      timeout: this.transcriptDownloadTimeout,
    })
    return response.data
  }

  private formatTranscript(payload: unknown): string {
    const lines: string[] = []

    if (Array.isArray(payload)) {
      for (const segment of payload.slice(0, this.transcriptSegmentLimit)) {
        const formatted = this.formatTranscriptSegment(segment)
        if (formatted) {
          lines.push(formatted)
        }
      }
    } else if (
      payload &&
      typeof payload === "object" &&
      Array.isArray((payload as any).segments)
    ) {
      const segments = (payload as any).segments as unknown[]
      for (const segment of segments.slice(0, this.transcriptSegmentLimit)) {
        const formatted = this.formatTranscriptSegment(segment)
        if (formatted) {
          lines.push(formatted)
        }
      }
    }

    if (!lines.length) {
      const fallback = JSON.stringify(payload)
      return fallback.substring(0, this.transcriptCharLimit)
    }

    const compiled = lines.join("\n")
    return compiled.length > this.transcriptCharLimit
      ? compiled.substring(0, this.transcriptCharLimit)
      : compiled
  }

  private formatTranscriptSegment(segment: unknown): string | null {
    if (!segment || typeof segment !== "object") {
      return null
    }

    const participant =
      (segment as any)?.participant?.name ??
      (segment as any)?.speaker ??
      (segment as any)?.participant?.email ??
      "Speaker"
    const text =
      (segment as any)?.text ??
      (segment as any)?.message ??
      (segment as any)?.body ??
      this.joinWords((segment as any)?.words)

    if (!text) {
      return null
    }
    return `${participant}: ${text}`
  }

  private joinWords(words: unknown): string | null {
    if (!Array.isArray(words)) {
      return null
    }
    const collected = words
      .map((word) => word?.text)
      .filter((value): value is string => typeof value === "string")
    if (!collected.length) {
      return null
    }
    return collected.join(" ")
  }

  private async generateInsightContent(
    meeting: MeetingContext,
    transcript: string,
  ): Promise<InsightResult> {
    const attendees = this.extractAttendeeNames(meeting)
    const agenda =
      meeting.description ??
      (Array.isArray(meeting.recurrence) ? meeting.recurrence.join(", ") : null)

    if (!this.openAi) {
      return this.buildFallbackInsight(meeting, transcript)
    }

    try {
      const completion = await this.openAi.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You create factual meeting summaries grounded in the provided transcript. Respond with JSON: {"summary":"...","followUpEmail":"..."}.',
          },
          {
            role: "user",
            content: [
              `Meeting title: ${meeting.title ?? "Untitled Meeting"}`,
              `Meeting date: ${meeting.startTime.toISOString()}`,
              `Attendees: ${attendees.join(", ") || "Not listed"}`,
              agenda ? `Agenda/Description: ${agenda}` : "",
              "Transcript excerpt:",
              transcript,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      })
      const content = completion.choices[0]?.message?.content
      if (!content) {
        throw new Error("Empty OpenAI response")
      }
      const parsed = JSON.parse(content) as Partial<InsightResult>
      if (!parsed.summary || !parsed.followUpEmail) {
        throw new Error("Incomplete AI response")
      }
      return {
        summary: parsed.summary,
        followUpEmail: parsed.followUpEmail,
      }
    } catch (error) {
      this.logger.warn(
        `OpenAI insight generation failed for meeting ${meeting.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return this.buildFallbackInsight(meeting, transcript)
    }
  }

  private buildFallbackInsight(
    meeting: MeetingContext,
    transcript: string,
  ): InsightResult {
    const summaryExcerpt = transcript.substring(0, 500)
    const summary = [
      `Summary for ${meeting.title ?? "the meeting"} on ${meeting.startTime.toDateString()}:`,
      summaryExcerpt || "Transcript not available.",
    ].join("\n\n")

    const followUpEmail = [
      `Hi team,`,
      "",
      `Thank you for the conversation about "${meeting.title ?? "our meeting"}".`,
      "",
      "Key takeaways:",
      summaryExcerpt
        ? `- ${summaryExcerpt.replace(/\n/g, "\n- ").substring(0, 400)}`
        : "- Transcript is still processing. I'll send a detailed recap shortly.",
      "",
      "Next steps:",
      "- Please review the notes above and reply with any corrections.",
      "- Let me know if you'd like to schedule a follow-up.",
      "",
      "Best,",
      meeting.user.name ?? "Your advisor",
    ].join("\n")

    return { summary, followUpEmail }
  }

  private async saveMeetingInsight(
    meeting: MeetingContext,
    result: InsightResult,
  ) {
    const existing = meeting.meetingInsights[0]
    const data = {
      summary: result.summary,
      followUpEmail: result.followUpEmail,
      generatedAt: new Date(),
      metadata: Prisma.JsonNull,
    }
    if (existing) {
      await this.prisma.meetingInsight.update({
        where: { id: existing.id },
        data,
      })
    } else {
      await this.prisma.meetingInsight.create({
        data: {
          calendarEventId: meeting.id,
          ...data,
        },
      })
    }
  }

  private async generateSocialDrafts(
    meeting: MeetingContext,
    transcript: string,
    options?: { regenerate?: boolean },
  ) {
    const automations = await this.prisma.automation.findMany({
      where: {
        userId: meeting.userId,
        isEnabled: true,
      },
      orderBy: { createdAt: "asc" },
    })

    if (!automations.length) {
      return
    }

    await this.prisma.socialPost.deleteMany({
      where: {
        calendarEventId: meeting.id,
        status: {
          in: [SocialPostStatus.DRAFT, SocialPostStatus.READY],
        },
      },
    })

    for (const automation of automations) {
      const content = await this.createSocialPostContent(
        meeting,
        transcript,
        automation,
      )
      await this.prisma.socialPost.create({
        data: {
          calendarEventId: meeting.id,
          userId: meeting.userId,
          automationId: automation.id,
          channel: automation.channel,
          content,
          status: SocialPostStatus.DRAFT,
          metadata: Prisma.JsonNull,
        },
      })
    }
  }

  private async createSocialPostContent(
    meeting: MeetingContext,
    transcript: string,
    automation: Automation,
  ) {
    if (!this.openAi) {
      return this.applyTemplateFallback(
        automation.promptTemplate,
        meeting,
        transcript,
      )
    }

    try {
      const completion = await this.openAi.chat.completions.create({
        model: this.model,
        temperature: 0.5,
        messages: [
          {
            role: "system",
            content:
              "You craft concise social media posts grounded in the provided transcript. Stay compliant, avoid hallucinations, and keep the tone professional but warm.",
          },
          {
            role: "user",
            content: [
              `Channel: ${automation.channel}`,
              `Automation "${automation.name}" instructions: ${automation.promptTemplate}`,
              `Meeting: ${meeting.title ?? "Untitled"} on ${meeting.startTime.toDateString()}`,
              `Transcript excerpt:`,
              transcript,
              "",
              `Constraints: <= ${this.socialWordLimit} words. Do not add hashtags unless explicitly requested in the template.`,
            ].join("\n"),
          },
        ],
      })

      const text = completion.choices[0]?.message?.content
      if (!text) {
        throw new Error("Empty OpenAI response")
      }
      return text.trim()
    } catch (error) {
      this.logger.warn(
        `OpenAI social generation failed for meeting ${meeting.id} automation ${automation.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return this.applyTemplateFallback(
        automation.promptTemplate,
        meeting,
        transcript,
      )
    }
  }

  private applyTemplateFallback(
    template: string,
    meeting: MeetingContext,
    transcript: string,
  ) {
    const advisor = meeting.user.name ?? "Our team"
    const meetingTitle = meeting.title ?? "our recent meeting"
    const meetingDate = meeting.startTime.toDateString()
    const highlight = this.extractTranscriptHighlight(transcript)
    const sanitizedInstruction = template
      ? template.replace(/#\w+/g, "").trim()
      : ""
    const hashtags = this.extractTemplateHashtags(template)

    const segments = [
      `${advisor} met for "${meetingTitle}" on ${meetingDate} to align on client goals.`,
      highlight ? `Key takeaway: ${highlight}` : null,
      sanitizedInstruction
        ? `Focus: ${sanitizedInstruction.substring(0, 200)}`
        : null,
      hashtags.length ? hashtags.join(" ") : null,
    ].filter((segment): segment is string => Boolean(segment))

    const drafted = segments.join("\n\n")
    return this.trimToWordLimit(drafted)
  }

  private extractAttendeeNames(meeting: MeetingContext): string[] {
    const attendees = meeting.attendees as
      | Array<{ displayName?: string; email?: string }>
      | null
      | undefined
    if (!attendees?.length) {
      return []
    }
    return attendees
      .map((attendee) => attendee.displayName ?? attendee.email ?? "")
      .filter((name): name is string => !!name)
  }

  private trimToWordLimit(text: string) {
    const words = text.trim().split(/\s+/)
    if (words.length <= this.socialWordLimit) {
      return text.trim()
    }
    return `${words.slice(0, this.socialWordLimit).join(" ")}…`
  }

  private extractTranscriptHighlight(transcript: string) {
    if (!transcript.trim()) {
      return ""
    }
    const flattened = transcript.replace(/\s+/g, " ").trim()
    const sentences = flattened
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => sentence.length > 0)
    if (sentences.length === 0) {
      return flattened.substring(0, 200)
    }
    return sentences.slice(0, 2).join(" ").substring(0, 400)
  }

  private extractTemplateHashtags(template: string) {
    if (!template) {
      return []
    }
    const matches = template.match(/#[\p{L}\p{N}_]+/giu) ?? []
    return Array.from(new Set(matches)).slice(0, 5)
  }
}
