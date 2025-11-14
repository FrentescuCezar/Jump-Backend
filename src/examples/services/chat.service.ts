import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import type { Prisma } from "@prisma/client"
import { PrismaService } from "../../../prisma/prisma.service"
import type {
  ChatHistoryPayload,
  ChatMessagePayload,
  ChatRoomSummary,
} from "../types"

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma as PrismaService & {
      chatRoom: PrismaService["chatRoom"]
      chatMessage: PrismaService["chatMessage"]
      notification: PrismaService["notification"]
    }
  }

  async createRoom(params: {
    creatorId: string
    name: string
    description: string
    theme?: string
    participants?: string[]
  }): Promise<ChatRoomSummary> {
    const participants = this.normalizeParticipants(
      params.creatorId,
      params.participants ?? [],
    )
    const name = params.name.trim()
    const description = params.description.trim()
    const slugBase = this.slugify(name)
    const slug = await this.generateUniqueSlug(slugBase)
    const theme = this.pickTheme(params.theme?.trim())

    const room = await this.db.chatRoom.create({
      data: {
        slug,
        name,
        description,
        theme,
        participants,
      },
    })

    return {
      id: room.id,
      slug: room.slug,
      name: room.name,
      description: room.description,
      theme: room.theme,
      participants: room.participants,
      lastMessage: null,
      unreadCount: 0,
    }
  }

  async listRoomsForUser(userId: string): Promise<ChatRoomSummary[]> {
    // Show all rooms - they're all public and anyone can join
    const rooms = await this.db.chatRoom.findMany({
      orderBy: { updatedAt: "desc" },
    })
    if (rooms.length === 0) {
      return []
    }

    const roomIds = rooms.map((room) => room.id)
    const latestMessages = await this.db.chatMessage.findMany({
      where: { roomId: { in: roomIds } },
      orderBy: { createdAt: "desc" },
      include: { receipts: true } as Record<string, unknown>,
    })

    const lastMessageMap = new Map<string, ChatMessagePayload>()
    for (const message of latestMessages) {
      if (!lastMessageMap.has(message.roomId)) {
        const room = rooms.find((item) => item.id === message.roomId)
        if (room) {
          lastMessageMap.set(
            message.roomId,
            this.toMessagePayload(message, room.slug),
          )
        }
      }
    }

    const unreadGroups = await this.db.notification.groupBy({
      by: ["roomSlug"],
      where: {
        userId,
        readAt: null,
        roomSlug: { not: null },
      },
      _count: { _all: true },
    })

    const unreadMap = new Map<string, number>()
    unreadGroups.forEach((group) => {
      if (group.roomSlug) {
        unreadMap.set(group.roomSlug, group._count._all)
      }
    })

    return rooms.map((room) => ({
      id: room.id,
      slug: room.slug,
      name: room.name,
      description: room.description,
      theme: room.theme,
      participants: room.participants,
      lastMessage: lastMessageMap.get(room.id) ?? null,
      unreadCount: unreadMap.get(room.slug) ?? 0,
    }))
  }

  async getRoomHistory(
    userId: string,
    roomSlug: string,
    limit: number,
    beforeMessageId?: string,
  ): Promise<ChatHistoryPayload> {
    const room = await this.fetchRoomForUser(userId, roomSlug)

    let createdBefore: Date | undefined
    if (beforeMessageId) {
      const pivot = await this.db.chatMessage.findUnique({
        where: { id: beforeMessageId },
        select: { createdAt: true },
      })
      createdBefore = pivot?.createdAt
    }

    // Get messages ordered by newest first, then reverse to show oldest to newest
    const messages = await this.db.chatMessage.findMany({
      where: {
        roomId: room.id,
        ...(createdBefore && { createdAt: { lt: createdBefore } }),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      include: { receipts: true } as Record<string, unknown>,
    })

    let nextCursor: string | null = null
    if (messages.length > limit) {
      const cursorMessage = messages.pop()
      nextCursor = cursorMessage?.id ?? null
    }

    // Reverse to show oldest to newest (for display)
    const reversedMessages = [...messages].reverse()
    const payloadMessages = reversedMessages.map((message) =>
      this.toMessagePayload(message, room.slug),
    )

    // lastMessage should be the newest (first in original DESC order, last after reverse)
    const newestMessage = messages.length > 0 ? messages[0] : null

    return {
      room: {
        id: room.id,
        slug: room.slug,
        name: room.name,
        description: room.description,
        theme: room.theme,
        participants: room.participants,
        lastMessage: newestMessage
          ? this.toMessagePayload(newestMessage, room.slug)
          : null,
        unreadCount: 0,
      },
      messages: payloadMessages,
      nextCursor,
    }
  }

  async createMessage(input: {
    roomSlug: string
    senderId: string
    senderName: string
    body: string
  }): Promise<{
    roomSlug: string
    message: ChatMessagePayload
    recipients: string[]
  }> {
    const room = await this.fetchRoomForUser(input.senderId, input.roomSlug)

    const entry = await this.db.chatMessage.create({
      data: {
        roomId: room.id,
        senderId: input.senderId,
        senderName: input.senderName,
        body: input.body,
        receipts: {
          create: {
            userId: input.senderId,
          },
        },
      } as Prisma.ChatMessageUncheckedCreateInput,
      include: { receipts: true } as Record<string, unknown>,
    })

    // Update room timestamp (fire and forget for better performance)
    this.db.chatRoom
      .update({
        where: { id: room.id },
        data: { updatedAt: entry.createdAt },
      })
      .catch(() => {
        // Ignore errors - timestamp update is not critical
      })

    return {
      roomSlug: room.slug,
      message: this.toMessagePayload(entry, room.slug),
      recipients: room.participants.filter((id) => id !== input.senderId),
    }
  }

  async ensureMembership(userId: string, roomSlug: string) {
    return this.fetchRoomForUser(userId, roomSlug)
  }

  async markMessagesRead(params: {
    userId: string
    roomSlug: string
    messageIds: string[]
  }) {
    if (!params.messageIds?.length) {
      return []
    }

    const room = await this.fetchRoomForUser(params.userId, params.roomSlug)

    const messages = await this.db.chatMessage.findMany({
      where: {
        roomId: room.id,
        id: { in: params.messageIds },
      },
      select: { id: true },
    })

    if (messages.length === 0) {
      return []
    }

    await (this.prisma as any).chatMessageReceipt.createMany({
      data: messages.map((message) => ({
        messageId: message.id,
        userId: params.userId,
      })),
      skipDuplicates: true,
    })

    const updated = await this.db.chatMessage.findMany({
      where: { id: { in: messages.map((message) => message.id) } },
      include: { receipts: true } as Record<string, unknown>,
    })

    return updated.map((message) => ({
      id: message.id,
      readBy:
        (message as { receipts?: { userId: string }[] }).receipts?.map(
          (receipt) => receipt.userId,
        ) ?? [],
    }))
  }

  private toMessagePayload(
    message: {
      id: string
      roomId: string
      senderId: string
      senderName: string
      body: string
      createdAt: Date
      receipts?: { userId: string }[]
    },
    roomSlug: string,
  ): ChatMessagePayload {
    return {
      id: message.id,
      roomId: message.roomId,
      roomSlug,
      senderId: message.senderId,
      senderName: message.senderName,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      readBy: message.receipts?.map((receipt) => receipt.userId) ?? [],
    }
  }

  private async fetchRoomForUser(userId: string, roomSlug: string) {
    const room = await this.db.chatRoom.findUnique({
      where: { slug: roomSlug },
    })
    if (!room) {
      throw new NotFoundException("Room not found")
    }
    // All rooms are public - auto-join if user is not already a participant
    if (!room.participants.includes(userId)) {
      const updatedParticipants = [...room.participants, userId]
      await this.db.chatRoom.update({
        where: { id: room.id },
        data: { participants: updatedParticipants },
      })
      room.participants = updatedParticipants
    }
    return room
  }

  private normalizeParticipants(creatorId: string, provided: string[]) {
    const unique = new Set<string>()
    provided.forEach((participant) => {
      const id = participant.trim()
      if (id && id !== creatorId) {
        unique.add(id)
      }
    })
    unique.add(creatorId)
    // Empty array means public room (just creator), which is allowed
    return Array.from(unique)
  }

  private slugify(input: string) {
    const slug = input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
    if (slug) {
      return slug
    }
    return `room-${Date.now().toString(36)}`
  }

  private async generateUniqueSlug(base: string) {
    let slug = base
    let attempt = 1
    while (true) {
      const existing = await this.db.chatRoom.findUnique({ where: { slug } })
      if (!existing) {
        return slug
      }
      attempt += 1
      slug = `${base}-${attempt}`
    }
  }

  private pickTheme(preferred?: string) {
    if (preferred && this.isValidHexColor(preferred)) {
      return preferred
    }
    const palette = ["#2563eb", "#ea580c", "#16a34a", "#9333ea"]
    const index = Math.floor(Math.random() * palette.length)
    return palette[index]
  }

  private isValidHexColor(value: string) {
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim())
  }
}
