import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets"
import { Logger, OnModuleDestroy } from "@nestjs/common"
import type { Server, Socket } from "socket.io"
import {
  Subject,
  Subscription,
  debounceTime,
  groupBy,
  map,
  mergeMap,
  throttleTime,
} from "rxjs"
import { ChatTokenService } from "./services/chat-token.service"
import { ChatService } from "./services/chat.service"
import { NotificationsService } from "./services/notifications.service"
import { MeetingChatService } from "../meetings/services/meeting-chat.service"
import type { ChatMessagePayload, ChatNotificationPayload } from "./types"
import type { MeetingChatMessagePayload } from "../meetings/types/chat.types"

type ClientToServerEvents = {
  "chat:join": (roomSlug: string) => void
  "chat:leave": (roomSlug: string) => void
  "chat:send": (payload: { roomSlug: string; body: string }) => void
  "chat:typing": (payload: { roomSlug: string }) => void
  "chat:read": (payload: { roomSlug: string; messageIds: string[] }) => void
  "meeting:join": (payload: { meetingId: string }) => void
  "meeting:leave": (payload: { meetingId: string }) => void
  "meeting:send": (payload: {
    meetingId: string
    body: string
    clientMessageId?: string
  }) => void
  "meeting:typing": (payload: { meetingId: string }) => void
  "meeting:read": (payload: { meetingId: string; messageIds: string[] }) => void
  "user:ping": () => void
}

type ServerToClientEvents = {
  "chat:new": (message: ChatMessagePayload) => void
  "chat:typing": (payload: {
    roomSlug: string
    userId: string
    name: string
  }) => void
  "chat:error": (payload: { message: string }) => void
  "chat:read": (payload: {
    roomSlug: string
    userId: string
    updates: { messageId: string; readBy: string[] }[]
  }) => void
  "user:presence": (payload: {
    userId: string
    status: "online" | "away"
  }) => void
  "meeting:new": (message: MeetingChatMessagePayload) => void
  "meeting:typing": (payload: {
    meetingId: string
    userId: string
    name: string
  }) => void
  "meeting:error": (payload: {
    message: string
    clientMessageId?: string
  }) => void
  "meeting:read": (payload: {
    meetingId: string
    userId: string
    updates: { messageId: string; readBy: string[] }[]
  }) => void
  "meeting:presence": (payload: {
    meetingId: string
    userCount: number
  }) => void
  "notification:new": (payload: ChatNotificationPayload) => void
  "calendar:sync": (payload: {
    userId: string
    providerSyncedAt: string
  }) => void
}

interface SocketData {
  userId: string
  name: string
  email?: string | null
  rooms?: Set<string>
}

type ChatSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>

@WebSocketGateway({
  cors: {
    origin:
      process.env.CORS_ORIGIN?.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean) ?? "*",
    credentials: true,
  },
  transports: ["websocket"],
})
export class ChatGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  private readonly logger = new Logger(ChatGateway.name)

  @WebSocketServer()
  private server!: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >

  private readonly typing$ = new Subject<{
    roomSlug: string
    userId: string
    name: string
  }>()
  private readonly meetingTyping$ = new Subject<{
    meetingId: string
    userId: string
    name: string
  }>()
  private readonly presence$ = new Subject<{ userId: string }>()
  private readonly subscriptions: Subscription[] = []
  private readonly userRooms = new Map<string, Map<string, number>>()

  constructor(
    private readonly chatTokens: ChatTokenService,
    private readonly chatService: ChatService,
    private readonly meetingChat: MeetingChatService,
    private readonly notifications: NotificationsService,
  ) {}

  afterInit() {
    this.subscriptions.push(
      this.typing$
        .pipe(
          throttleTime(600, undefined, {
            leading: true,
            trailing: true,
          }),
        )
        .subscribe((event) => {
          this.server.to(event.roomSlug).emit("chat:typing", event)
        }),
    )

    this.subscriptions.push(
      this.meetingTyping$
        .pipe(
          throttleTime(600, undefined, {
            leading: true,
            trailing: true,
          }),
        )
        .subscribe((event) => {
          const room = this.meetingRoomSlug(event.meetingId)
          this.server.to(room).emit("meeting:typing", event)
        }),
    )

    this.subscriptions.push(
      this.presence$
        .pipe(
          groupBy((event) => event.userId),
          mergeMap((group$) =>
            group$.pipe(
              debounceTime(30_000),
              map((event) => event.userId),
            ),
          ),
        )
        .subscribe((userId) => {
          this.server
            .to(`user:${userId}`)
            .emit("user:presence", { userId, status: "away" })
        }),
    )
  }

  async handleConnection(socket: ChatSocket) {
    try {
      const token = this.extractToken(socket)
      if (!token) {
        throw new Error("Missing chat token")
      }
      const payload = this.chatTokens.verify(token)
      const userId = payload.sub
      if (!userId || typeof userId !== "string") {
        throw new Error("Invalid chat token payload")
      }
      socket.data.userId = userId
      socket.data.name =
        (payload.name as string) ??
        (payload.preferred_username as string) ??
        userId
      socket.data.email = (payload.email as string) ?? null

      socket.join(`user:${userId}`)
      socket.emit("user:presence", { userId, status: "online" })
      this.presence$.next({ userId })
    } catch (error) {
      this.logger.warn(
        `Socket authentication failed: ${(error as Error).message}`,
      )
      socket.disconnect(true)
    }
  }

  handleDisconnect(socket: ChatSocket) {
    const userId = socket.data.userId
    if (userId) {
      this.server
        .to(`user:${userId}`)
        .emit("user:presence", { userId, status: "away" })
      const rooms = socket.data.rooms ?? new Set<string>()
      const meetingIds = new Set<string>()
      rooms.forEach((roomSlug) => {
        this.decrementUserRoom(userId, roomSlug)
        if (roomSlug.startsWith("meeting:")) {
          meetingIds.add(roomSlug.replace("meeting:", ""))
        }
      })
      meetingIds.forEach((meetingId) => this.emitMeetingPresence(meetingId))
      socket.data.rooms?.clear()
    }
  }

  @SubscribeMessage("chat:join")
  async joinRoom(
    @MessageBody() roomSlug: string,
    @ConnectedSocket() socket: ChatSocket,
  ) {
    if (!roomSlug || typeof roomSlug !== "string") {
      return
    }
    const userId = socket.data.userId
    if (!userId) {
      return
    }
    try {
      await this.chatService.ensureMembership(userId, roomSlug)
      socket.join(roomSlug)
      socket.data.rooms = socket.data.rooms ?? new Set<string>()
      socket.data.rooms.add(roomSlug)
      this.incrementUserRoom(userId, roomSlug)
    } catch (error) {
      socket.emit("chat:error", {
        message: (error as Error).message,
      })
    }
  }

  @SubscribeMessage("chat:leave")
  leaveRoom(
    @MessageBody() roomSlug: string,
    @ConnectedSocket() socket: ChatSocket,
  ) {
    if (!roomSlug) return
    socket.leave(roomSlug)
    const userId = socket.data.userId
    socket.data.rooms?.delete(roomSlug)
    if (userId) {
      this.decrementUserRoom(userId, roomSlug)
    }
  }

  @SubscribeMessage("meeting:join")
  async joinMeeting(
    @MessageBody() payload: { meetingId: string },
    @ConnectedSocket() socket: ChatSocket,
  ) {
    if (!payload?.meetingId) {
      return
    }
    const userId = socket.data.userId
    if (!userId) {
      return
    }
    try {
      await this.meetingChat.ensureMembership(payload.meetingId, {
        id: userId,
        email: socket.data.email ?? undefined,
        name: socket.data.name,
      })
      const roomSlug = this.meetingRoomSlug(payload.meetingId)
      socket.join(roomSlug)
      socket.data.rooms = socket.data.rooms ?? new Set<string>()
      socket.data.rooms.add(roomSlug)
      this.incrementUserRoom(userId, roomSlug)
      this.emitMeetingPresence(payload.meetingId)
    } catch (error) {
      socket.emit("meeting:error", {
        message: (error as Error).message,
      })
    }
  }

  @SubscribeMessage("meeting:leave")
  leaveMeeting(
    @MessageBody() payload: { meetingId: string },
    @ConnectedSocket() socket: ChatSocket,
  ) {
    if (!payload?.meetingId) {
      return
    }
    const roomSlug = this.meetingRoomSlug(payload.meetingId)
    socket.leave(roomSlug)
    socket.data.rooms?.delete(roomSlug)
    const userId = socket.data.userId
    if (userId) {
      this.decrementUserRoom(userId, roomSlug)
      this.emitMeetingPresence(payload.meetingId)
    }
  }

  @SubscribeMessage("chat:typing")
  handleTyping(
    @MessageBody() payload: { roomSlug: string },
    @ConnectedSocket() socket: ChatSocket,
  ) {
    if (!payload?.roomSlug) {
      return
    }
    this.typing$.next({
      roomSlug: payload.roomSlug,
      userId: socket.data.userId,
      name: socket.data.name,
    })
  }

  @SubscribeMessage("meeting:typing")
  handleMeetingTyping(
    @MessageBody() payload: { meetingId: string },
    @ConnectedSocket() socket: ChatSocket,
  ) {
    if (!payload?.meetingId) {
      return
    }
    if (!socket.data.userId) {
      return
    }
    this.meetingTyping$.next({
      meetingId: payload.meetingId,
      userId: socket.data.userId,
      name: socket.data.name,
    })
  }

  @SubscribeMessage("chat:read")
  async handleRead(
    @MessageBody() payload: { roomSlug: string; messageIds: string[] },
    @ConnectedSocket() socket: ChatSocket,
  ) {
    if (!payload?.roomSlug || !Array.isArray(payload.messageIds)) {
      return
    }
    const userId = socket.data.userId
    if (!userId) {
      return
    }
    try {
      const updates = await this.chatService.markMessagesRead({
        userId,
        roomSlug: payload.roomSlug,
        messageIds: payload.messageIds,
      })
      if (updates.length === 0) {
        return
      }
      this.server.to(payload.roomSlug).emit("chat:read", {
        roomSlug: payload.roomSlug,
        userId,
        updates: updates.map((update) => ({
          messageId: update.id,
          readBy: update.readBy,
        })),
      })
    } catch (error) {
      socket.emit("chat:error", {
        message: (error as Error).message,
      })
    }
  }

  @SubscribeMessage("meeting:read")
  async handleMeetingRead(
    @MessageBody() payload: { meetingId: string; messageIds: string[] },
    @ConnectedSocket() socket: ChatSocket,
  ) {
    if (!payload?.meetingId || !Array.isArray(payload.messageIds)) {
      return
    }
    const userId = socket.data.userId
    if (!userId) {
      return
    }
    try {
      const updates = await this.meetingChat.markMessagesRead({
        meetingId: payload.meetingId,
        viewer: {
          id: userId,
          email: socket.data.email ?? undefined,
          name: socket.data.name,
        },
        messageIds: payload.messageIds,
      })
      if (!updates.length) {
        return
      }
      const roomSlug = this.meetingRoomSlug(payload.meetingId)
      const formattedUpdates = updates.map((update) => ({
        messageId: update.id,
        readBy: update.readBy,
      }))
      this.server.to(roomSlug).emit("meeting:read", {
        meetingId: payload.meetingId,
        userId,
        updates: formattedUpdates,
      })
    } catch (error) {
      socket.emit("meeting:error", {
        message: (error as Error).message,
      })
    }
  }

  @SubscribeMessage("user:ping")
  handlePing(@ConnectedSocket() socket: ChatSocket) {
    const userId = socket.data.userId
    if (!userId) return
    this.server
      .to(`user:${userId}`)
      .emit("user:presence", { userId, status: "online" })
    this.presence$.next({ userId })
  }

  @SubscribeMessage("chat:send")
  async handleSend(
    @MessageBody() payload: { roomSlug: string; body: string },
    @ConnectedSocket() socket: ChatSocket,
  ) {
    if (!payload?.roomSlug || !payload.body) {
      return
    }
    const trimmed = payload.body.trim()
    if (!trimmed) {
      return
    }

    try {
      const { message, roomSlug, recipients } =
        await this.chatService.createMessage({
          roomSlug: payload.roomSlug,
          senderId: socket.data.userId,
          senderName: socket.data.name,
          body: trimmed,
        })

      this.server.to(roomSlug).emit("chat:new", message)

      const offlineRecipients = recipients.filter(
        (recipient) => !this.isUserWatchingRoom(recipient, roomSlug),
      )

      const notifications = await this.notifications.createChatNotifications({
        recipients: offlineRecipients,
        message,
      })

      notifications.forEach((notification) => {
        this.emitNotification(notification)
      })
    } catch (error) {
      socket.emit("chat:error", {
        message: (error as Error).message,
      })
    }
  }

  @SubscribeMessage("meeting:send")
  async handleMeetingSend(
    @MessageBody()
    payload: { meetingId: string; body: string; clientMessageId?: string },
    @ConnectedSocket() socket: ChatSocket,
  ) {
    if (!payload?.meetingId || !payload.body) {
      return
    }
    const userId = socket.data.userId
    if (!userId) {
      return
    }
    const trimmed = payload.body.trim()
    if (!trimmed) {
      return
    }
    try {
      const { message, meetingId, recipients, meetingTitle } =
        await this.meetingChat.createMessage({
          meetingId: payload.meetingId,
          viewer: {
            id: userId,
            email: socket.data.email ?? undefined,
            name: socket.data.name,
          },
          body: trimmed,
          clientMessageId: payload.clientMessageId,
        })
      const roomSlug = this.meetingRoomSlug(meetingId)
      this.server.to(roomSlug).emit("meeting:new", message)

      const offlineRecipients = recipients.filter(
        (recipient) => !this.isUserWatchingRoom(recipient, roomSlug),
      )

      if (offlineRecipients.length) {
        const notifications =
          await this.notifications.createMeetingChatNotifications({
            recipients: offlineRecipients,
            meetingId,
            meetingTitle,
            message,
          })
        notifications.forEach((notification) => {
          this.emitNotification(notification)
        })
      }
    } catch (error) {
      socket.emit("meeting:error", {
        message: (error as Error).message,
        clientMessageId: payload.clientMessageId,
      })
    }
  }

  onModuleDestroy() {
    this.subscriptions.forEach((sub) => sub.unsubscribe())
  }

  emitNotification(notification: ChatNotificationPayload) {
    if (!notification?.userId) {
      return
    }
    this.server
      .to(`user:${notification.userId}`)
      .emit("notification:new", notification)
  }

  private extractToken(socket: ChatSocket) {
    const auth =
      socket.handshake.auth?.token ?? socket.handshake.headers?.authorization
    if (typeof auth === "string" && auth.startsWith("Bearer ")) {
      return auth.slice(7)
    }
    if (typeof auth === "string") {
      return auth
    }
    return undefined
  }

  private meetingRoomSlug(meetingId: string) {
    return `meeting:${meetingId}`
  }

  private incrementUserRoom(userId: string, roomSlug: string) {
    const roomMap = this.userRooms.get(userId) ?? new Map<string, number>()
    const current = roomMap.get(roomSlug) ?? 0
    roomMap.set(roomSlug, current + 1)
    this.userRooms.set(userId, roomMap)
  }

  private decrementUserRoom(userId: string, roomSlug: string) {
    const roomMap = this.userRooms.get(userId)
    if (!roomMap) {
      return
    }
    const current = (roomMap.get(roomSlug) ?? 0) - 1
    if (current <= 0) {
      roomMap.delete(roomSlug)
    } else {
      roomMap.set(roomSlug, current)
    }
    if (roomMap.size === 0) {
      this.userRooms.delete(userId)
    }
  }

  private isUserWatchingRoom(userId: string, roomSlug: string) {
    return (this.userRooms.get(userId)?.get(roomSlug) ?? 0) > 0
  }

  private emitMeetingPresence(meetingId: string) {
    const roomSlug = this.meetingRoomSlug(meetingId)
    const userCount =
      this.server.sockets.adapter.rooms.get(roomSlug)?.size ?? 0
    this.server
      .to(roomSlug)
      .emit("meeting:presence", { meetingId, userCount })
  }

  emitCalendarSync(userId: string, providerSyncedAt: string) {
    this.server
      .to(`user:${userId}`)
      .emit("calendar:sync", { userId, providerSyncedAt })
  }
}
