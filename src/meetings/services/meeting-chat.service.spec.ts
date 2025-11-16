import { Test, TestingModule } from "@nestjs/testing"
import { ForbiddenException, NotFoundException } from "@nestjs/common"
import { MeetingChatService } from "./meeting-chat.service"
import { PrismaService } from "../../../prisma/prisma.service"
import { createMockPrisma } from "../../../test/helpers/mocks.helper"

describe("MeetingChatService", () => {
  let service: MeetingChatService
  let prisma: PrismaService

  const mockPrisma = createMockPrisma()

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeetingChatService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile()

    service = module.get<MeetingChatService>(MeetingChatService)
    prisma = module.get<PrismaService>(PrismaService)

    jest.clearAllMocks()
  })

  describe("getHistory", () => {
    it("should return chat history for meeting", async () => {
      const meetingId = "meeting-1"
      const viewer = {
        id: "user-1",
        email: "user@example.com",
        name: "Test User",
      }

      const meeting = {
        id: meetingId,
        userId: "user-1",
        title: "Test Meeting",
      }

      const thread = {
        id: "thread-1",
        meetingId,
      }

      const messages = [
        {
          id: "msg-1",
          threadId: thread.id,
          senderId: "user-1",
          senderName: "Test User",
          senderEmail: "user@example.com",
          body: "Hello",
          createdAt: new Date(),
          receipts: [],
        },
      ]

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        meeting,
      )
      ;(mockPrisma.meetingChatThread.findUnique as jest.Mock).mockResolvedValue(
        thread,
      )
      ;(mockPrisma.meetingChatMessage.findUnique as jest.Mock).mockResolvedValue(
        null,
      )
      ;(mockPrisma.meetingChatMessage.findMany as jest.Mock).mockResolvedValue(
        messages,
      )

      const result = await service.getHistory({
        meetingId,
        viewer,
        limit: 30,
      })

      expect(result.meetingId).toBe(meetingId)
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].body).toBe("Hello")
    })

    it("should throw NotFoundException if meeting not found", async () => {
      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(null)

      await expect(
        service.getHistory({
          meetingId: "invalid-id",
          viewer: { id: "user-1" },
          limit: 30,
        }),
      ).rejects.toThrow(NotFoundException)
    })

    it("should throw ForbiddenException if user doesn't have access", async () => {
      const meeting = {
        id: "meeting-1",
        userId: "other-user",
        title: "Test Meeting",
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        meeting,
      )

      await expect(
        service.getHistory({
          meetingId: "meeting-1",
          viewer: { id: "user-1" },
          limit: 30,
        }),
      ).rejects.toThrow(ForbiddenException)
    })
  })

  describe("markMessagesRead", () => {
    it("should mark messages as read", async () => {
      const meetingId = "meeting-1"
      const viewer = {
        id: "user-1",
        email: "user@example.com",
        name: "Test User",
      }

      const meeting = {
        id: meetingId,
        userId: "user-1",
        title: "Test Meeting",
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        meeting,
      )
      const messages = [
        { id: "msg-1" },
        { id: "msg-2" },
      ]
      const updatedMessages = [
        {
          id: "msg-1",
          receipts: [{ userId: "user-1" }],
        },
        {
          id: "msg-2",
          receipts: [{ userId: "user-1" }],
        },
      ]

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        meeting,
      )
      ;(mockPrisma.meetingChatThread.findUnique as jest.Mock).mockResolvedValue(
        { id: "thread-1", meetingId },
      )
      ;(mockPrisma.meetingChatMessage.findMany as jest.Mock)
        .mockResolvedValueOnce(messages)
        .mockResolvedValueOnce(updatedMessages)
      ;(mockPrisma.meetingChatReceipt.createMany as jest.Mock).mockResolvedValue(
        { count: 2 },
      )

      const result = await service.markMessagesRead({
        meetingId,
        viewer,
        messageIds: ["msg-1", "msg-2"],
      })

      expect(result).toBeDefined()
      expect(result).toHaveLength(2)
      expect(mockPrisma.meetingChatReceipt.createMany).toHaveBeenCalled()
    })
  })
})

