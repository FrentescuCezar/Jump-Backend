export interface ChatMessagePayload {
  id: string
  roomId: string
  roomSlug: string
  senderId: string
  senderName: string
  body: string
  createdAt: string
  readBy: string[]
}

export interface ChatRoomSummary {
  id: string
  slug: string
  name: string
  description: string
  theme: string
  participants: string[]
  lastMessage: ChatMessagePayload | null
  unreadCount: number
}

export interface ChatHistoryPayload {
  room: ChatRoomSummary
  messages: ChatMessagePayload[]
  nextCursor: string | null
}

export interface ChatNotificationPayload {
  id: string
  userId: string
  type: string
  title: string
  body: string
  roomSlug: string | null
  messageId: string | null
  payload?: Record<string, unknown> | null
  readAt: string | null
  createdAt: string
}
