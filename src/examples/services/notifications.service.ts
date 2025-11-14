import { Injectable } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { PrismaService } from "../../../prisma/prisma.service"
import type { ChatMessagePayload, ChatNotificationPayload } from "../types"

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string, take = 20): Promise<ChatNotificationPayload[]> {
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

    const payload = params.recipients.map((userId) =>
      this.prisma.notification.create({
        data: {
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
          } as Prisma.JsonObject,
        },
      }),
    )

    const inserted = await Promise.all(payload)
    return inserted.map((row) => this.toPayload(row))
  }

  private toPayload(row: {
    id: string
    userId: string
    type: string
    title: string
    body: string
    roomSlug: string | null
    messageId: string | null
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
      readAt: row.readAt ? row.readAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    }
  }
}

