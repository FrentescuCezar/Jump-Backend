import { Injectable } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { PrismaService } from "../../../prisma/prisma.service"
import type { ChatMessagePayload, ChatNotificationPayload } from "../types"
import type { MeetingChatMessagePayload } from "../../meetings/types/chat.types"

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(
    userId: string,
    take = 20,
  ): Promise<ChatNotificationPayload[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
    })
    return rows.map((row) => this.toPayload(row))
  }

  async markAsRead(userId: string, notificationId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, id: notificationId, readAt: null },
      data: { readAt: new Date() },
    })
  }

  async markRoomAsRead(userId: string, roomSlug: string) {
    await this.prisma.notification.updateMany({
      where: { userId, roomSlug, readAt: null },
      data: { readAt: new Date() },
    })
  }

  async createChatNotifications(params: {
    recipients: string[]
    message: ChatMessagePayload
  }): Promise<ChatNotificationPayload[]> {
    if (params.recipients.length === 0) {
      return []
    }

    return Promise.all(
      params.recipients.map((userId) =>
        this.createNotification({
          userId,
          type: "chat:new-message",
          title: `New message in ${params.message.roomSlug}`,
          body: `${params.message.senderName}: ${params.message.body}`,
          roomSlug: params.message.roomSlug,
          messageId: params.message.id,
          payload: {
            roomSlug: params.message.roomSlug,
            senderId: params.message.senderId,
            senderName: params.message.senderName,
            preview: params.message.body,
          },
        }),
      ),
    )
  }

  async createMeetingChatNotifications(params: {
    recipients: string[]
    meetingId: string
    meetingTitle: string
    message: MeetingChatMessagePayload
  }): Promise<ChatNotificationPayload[]> {
    if (params.recipients.length === 0) {
      return []
    }

    return Promise.all(
      params.recipients.map((userId) =>
        this.createNotification({
          userId,
          type: "meeting-chat:new-message",
          title: `New message in ${params.meetingTitle}`,
          body: `${params.message.senderName}: ${params.message.body}`,
          messageId: params.message.id,
          payload: {
            meetingId: params.meetingId,
            messageId: params.message.id,
            source: "meeting",
          },
        }),
      ),
    )
  }

  async createNotification(params: {
    userId: string
    type: string
    title: string
    body: string
    payload?: Prisma.JsonValue | null
    roomSlug?: string | null
    messageId?: string | null
  }): Promise<ChatNotificationPayload> {
    const row = await this.prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        roomSlug: params.roomSlug,
        messageId: params.messageId,
        payload: params.payload ?? Prisma.JsonNull,
      },
    })

    return this.toPayload(row)
  }

  private toPayload(row: {
    id: string
    userId: string
    type: string
    title: string
    body: string
    roomSlug: string | null
    messageId: string | null
    payload: Prisma.JsonValue
    readAt: Date | null
    createdAt: Date
  }): ChatNotificationPayload {
    return {
      id: row.id,
      userId: row.userId,
      type: row.type,
      title: row.title,
      body: row.body,
      roomSlug: row.roomSlug,
      messageId: row.messageId,
      payload:
        row.payload && !this.isJsonNull(row.payload)
          ? (row.payload as Record<string, unknown>)
          : null,
      readAt: row.readAt ? row.readAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    }
  }

  private isJsonNull(value: Prisma.JsonValue) {
    return (
      value === null ||
      value === (Prisma.JsonNull as unknown as Prisma.JsonValue)
    )
  }
}
