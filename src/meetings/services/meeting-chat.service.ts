import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import type { Prisma } from "@prisma/client"
import { PrismaService } from "../../../prisma/prisma.service"
import type { MeetingChatHistoryPayload } from "../types/chat.types"
import type { MeetingChatMessagePayload } from "../types/chat.types"

type ViewerContext = {
  id: string
  email?: string | null
  name?: string | null
}

@Injectable()
export class MeetingChatService {
  constructor(private readonly prisma: PrismaService) {}

  async getHistory(params: {
    meetingId: string
    viewer: ViewerContext
    limit: number
    before?: string
  }): Promise<MeetingChatHistoryPayload> {
    const { meeting } = await this.ensureAccess(params.meetingId, params.viewer)
    const thread = await this.ensureThread(meeting.id)

    let createdBefore: Date | undefined
    if (params.before) {
      const pivot = await this.prisma.meetingChatMessage.findUnique({
        where: { id: params.before },
        select: { createdAt: true },
      })
      createdBefore = pivot?.createdAt
    }

    const messages = await this.prisma.meetingChatMessage.findMany({
      where: {
        threadId: thread.id,
        ...(createdBefore && { createdAt: { lt: createdBefore } }),
      },
      orderBy: { createdAt: "desc" },
      take: params.limit + 1,
      include: {
        receipts: true,
      },
    })

    let nextCursor: string | null = null
    if (messages.length > params.limit) {
      const cursor = messages.pop()
      nextCursor = cursor?.id ?? null
    }

    const ordered = [...messages].reverse()

    return {
      meetingId: meeting.id,
      messages: ordered.map((message) => this.toPayload(message, meeting.id)),
      nextCursor,
    }
  }

  async ensureMembership(meetingId: string, viewer: ViewerContext) {
    return this.ensureAccess(meetingId, viewer)
  }

  async createMessage(params: {
    meetingId: string
    viewer: ViewerContext
    body: string
    clientMessageId?: string
  }): Promise<{
    meetingId: string
    message: MeetingChatMessagePayload
    recipients: string[]
    meetingTitle: string
  }> {
    const { meeting } = await this.ensureAccess(params.meetingId, params.viewer)
    const thread = await this.ensureThread(meeting.id)

    const entry = await this.prisma.meetingChatMessage.create({
      data: {
        threadId: thread.id,
        senderId: params.viewer.id,
        senderName: params.viewer.name ?? "Unknown user",
        senderEmail: params.viewer.email ?? null,
        body: params.body,
        receipts: {
          create: {
            userId: params.viewer.id,
          },
        },
      } as Prisma.MeetingChatMessageUncheckedCreateInput,
      include: {
        receipts: true,
      },
    })

    this.prisma.meetingChatThread
      .update({
        where: { id: thread.id },
        data: { updatedAt: entry.createdAt },
      })
      .catch(() => undefined)

    const participantIds = await this.resolveParticipantUserIds(
      meeting.id,
      meeting.userId,
    )

    const payload: MeetingChatMessagePayload = {
      ...this.toPayload(entry, meeting.id),
      ...(params.clientMessageId && {
        clientMessageId: params.clientMessageId,
      }),
    }

    return {
      meetingId: meeting.id,
      message: payload,
      meetingTitle: meeting.title ?? "Meeting",
      recipients: participantIds.filter((id) => id !== params.viewer.id),
    }
  }

  async markMessagesRead(params: {
    meetingId: string
    viewer: ViewerContext
    messageIds: string[]
  }) {
    if (!params.messageIds?.length) {
      return []
    }

    const { meeting } = await this.ensureAccess(params.meetingId, params.viewer)
    const thread = await this.ensureThread(meeting.id)

    const messages = await this.prisma.meetingChatMessage.findMany({
      where: {
        threadId: thread.id,
        id: { in: params.messageIds },
      },
      select: { id: true },
    })

    if (!messages.length) {
      return []
    }

    await this.prisma.meetingChatReceipt.createMany({
      data: messages.map((message) => ({
        messageId: message.id,
        userId: params.viewer.id,
      })),
      skipDuplicates: true,
    })

    const updated = await this.prisma.meetingChatMessage.findMany({
      where: { id: { in: messages.map((message) => message.id) } },
      include: { receipts: true },
    })

    return updated.map((message) => ({
      id: message.id,
      readBy: message.receipts.map((receipt) => receipt.userId),
    }))
  }

  private async ensureThread(meetingId: string) {
    const existing = await this.prisma.meetingChatThread.findUnique({
      where: { calendarEventId: meetingId },
    })
    if (existing) {
      return existing
    }
    return this.prisma.meetingChatThread.create({
      data: {
        calendarEventId: meetingId,
      },
    })
  }

  private async ensureAccess(meetingId: string, viewer: ViewerContext) {
    const meeting = await this.prisma.calendarEvent.findUnique({
      where: { id: meetingId },
    })
    if (!meeting) {
      throw new NotFoundException("Meeting not found")
    }
    if (meeting.userId === viewer.id) {
      return { meeting, role: "owner" as const }
    }
    if (!viewer.email) {
      throw new ForbiddenException("You are not allowed to view this meeting")
    }
    const normalized = this.normalizeEmail(viewer.email)
    const share = await this.prisma.meetingShare.findFirst({
      where: { calendarEventId: meeting.id, email: normalized },
    })
    if (!share) {
      throw new ForbiddenException("You are not allowed to view this meeting")
    }
    return { meeting, role: "guest" as const }
  }

  private async resolveParticipantUserIds(
    meetingId: string,
    ownerId: string,
  ): Promise<string[]> {
    const shares = await this.prisma.meetingShare.findMany({
      where: { calendarEventId: meetingId },
      select: { email: true },
    })
    const emails = shares.map((share) => share.email)
    const users = emails.length
      ? await this.prisma.user.findMany({
          where: {
            email: {
              in: emails,
            },
          },
          select: { id: true },
        })
      : []
    const ids = new Set<string>([ownerId])
    users.forEach((user) => ids.add(user.id))
    return Array.from(ids)
  }

  private toPayload(
    message: Prisma.MeetingChatMessageGetPayload<{
      include: { receipts: true }
    }>,
    meetingId: string,
  ): MeetingChatMessagePayload {
    return {
      id: message.id,
      meetingId,
      senderId: message.senderId,
      senderName: message.senderName,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      readBy: message.receipts.map((receipt) => receipt.userId),
    }
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase()
  }
}

