export interface MeetingChatMessagePayload {
  id: string
  meetingId: string
  senderId: string
  senderName: string
  body: string
  createdAt: string
  readBy: string[]
  clientMessageId?: string
}

export interface MeetingChatHistoryPayload {
  meetingId: string
  messages: MeetingChatMessagePayload[]
  nextCursor: string | null
}

