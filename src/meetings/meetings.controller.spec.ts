import { Test, TestingModule } from "@nestjs/testing"
import { MeetingsController } from "./meetings.controller"
import { MeetingsService } from "./meetings.service"
import { MeetingChatService } from "./services/meeting-chat.service"
import { createMockPrisma } from "../../test/helpers/mocks.helper"

describe("MeetingsController", () => {
  let controller: MeetingsController
  let meetingsService: MeetingsService
  let meetingChatService: MeetingChatService

  const mockMeetingsService = {
    getMeetingDetails: jest.fn(),
    getMeetingActivity: jest.fn(),
    streamTranscript: jest.fn(),
    getVideoPlaybackUrl: jest.fn(),
    regenerateAiContent: jest.fn(),
    listMeetingShares: jest.fn(),
    addMeetingShare: jest.fn(),
    getMeetingPreference: jest.fn(),
    updateMeetingPreference: jest.fn(),
  }
  const mockMeetingChatService = {
    getHistory: jest.fn(),
    markMessagesRead: jest.fn(),
  }

  const mockUser = {
    id: "user-1",
    email: "test@example.com",
    name: "Test User",
    keycloakId: "keycloak-1",
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeetingsController],
      providers: [
        {
          provide: MeetingsService,
          useValue: mockMeetingsService,
        },
        {
          provide: MeetingChatService,
          useValue: mockMeetingChatService,
        },
      ],
    }).compile()

    controller = module.get<MeetingsController>(MeetingsController)
    meetingsService = module.get<MeetingsService>(MeetingsService)
    meetingChatService = module.get<MeetingChatService>(MeetingChatService)

    jest.clearAllMocks()
  })

  describe("getDetails", () => {
    it("should return meeting details", async () => {
      const meetingDetails = {
        event: {
          id: "meeting-1",
          title: "Test Meeting",
        },
        recallBot: null,
        media: [],
        insight: null,
        socialPosts: [],
      }

      ;(mockMeetingsService.getMeetingDetails as jest.Mock).mockResolvedValue(
        meetingDetails,
      )

      const result = await controller.getDetails("meeting-1", mockUser as any)

      expect(result.event.id).toBe("meeting-1")
      expect(mockMeetingsService.getMeetingDetails).toHaveBeenCalledWith(
        "meeting-1",
        mockUser.id,
      )
    })
  })

  describe("getActivity", () => {
    it("should return meeting activity", async () => {
      const activity = {
        viewerRole: "owner" as const,
        details: {
          event: { id: "meeting-1" },
        },
        shareCount: 2,
      }

      ;(mockMeetingsService.getMeetingActivity as jest.Mock).mockResolvedValue(
        activity,
      )

      const result = await controller.getActivity("meeting-1", mockUser as any)

      expect(result.viewerRole).toBe("owner")
      expect(result.shareCount).toBe(2)
    })
  })

  describe("streamTranscript", () => {
    it("should stream transcript", async () => {
      const mockResponse = {
        setHeader: jest.fn(),
      }

      ;(mockMeetingsService.streamTranscript as jest.Mock).mockResolvedValue(
        undefined,
      )

      await controller.streamTranscript("meeting-1", mockUser as any, mockResponse as any)

      expect(mockMeetingsService.streamTranscript).toHaveBeenCalledWith(
        "meeting-1",
        mockUser.id,
        mockResponse,
      )
    })
  })

  describe("getVideoPlaybackUrl", () => {
    it("should return video playback URL", async () => {
      const videoUrl = {
        downloadUrl: "https://example.com/video.mp4",
        expiresAt: new Date().toISOString(),
      }

      ;(mockMeetingsService.getVideoPlaybackUrl as jest.Mock).mockResolvedValue(
        videoUrl,
      )

      const result = await controller.getVideoPlaybackUrl(
        "meeting-1",
        mockUser as any,
      )

      expect(result.downloadUrl).toBe(videoUrl.downloadUrl)
    })
  })

  describe("regenerateAiContent", () => {
    it("should regenerate AI content", async () => {
      ;(mockMeetingsService.regenerateAiContent as jest.Mock).mockResolvedValue(
        undefined,
      )

      const result = await controller.regenerateAiContent(
        "meeting-1",
        mockUser as any,
      )

      expect(result.success).toBe(true)
      expect(mockMeetingsService.regenerateAiContent).toHaveBeenCalledWith(
        "meeting-1",
        mockUser.id,
      )
    })
  })

  describe("listShares", () => {
    it("should return meeting shares", async () => {
      const shares = [
        {
          id: "share-1",
          email: "guest@example.com",
          createdAt: new Date().toISOString(),
        },
      ]

      ;(mockMeetingsService.listMeetingShares as jest.Mock).mockResolvedValue(
        shares,
      )

      const result = await controller.listShares("meeting-1", mockUser as any)

      expect(result).toHaveLength(1)
      expect(result[0].email).toBe("guest@example.com")
    })
  })

  describe("createShare", () => {
    it("should create meeting share", async () => {
      const share = {
        id: "share-1",
        email: "guest@example.com",
        createdAt: new Date().toISOString(),
      }

      ;(mockMeetingsService.addMeetingShare as jest.Mock).mockResolvedValue(
        share,
      )

      const result = await controller.createShare(
        "meeting-1",
        { email: "guest@example.com" },
        mockUser as any,
      )

      expect(result.email).toBe("guest@example.com")
      expect(mockMeetingsService.addMeetingShare).toHaveBeenCalledWith(
        "meeting-1",
        mockUser.id,
        "guest@example.com",
      )
    })
  })

  describe("getChatHistory", () => {
    it("should return chat history", async () => {
      const history = {
        messages: [],
        hasMore: false,
      }

      ;(mockMeetingChatService.getHistory as jest.Mock).mockResolvedValue(
        history,
      )

      const result = await controller.getChatHistory(
        "meeting-1",
        { limit: 30 },
        mockUser as any,
      )

      expect(mockMeetingChatService.getHistory).toHaveBeenCalledWith({
        meetingId: "meeting-1",
        viewer: mockUser,
        limit: 30,
        before: undefined,
      })
    })
  })

  describe("markChatRead", () => {
    it("should mark messages as read", async () => {
      ;(mockMeetingChatService.markMessagesRead as jest.Mock).mockResolvedValue(
        { success: true },
      )

      const result = await controller.markChatRead(
        "meeting-1",
        { messageIds: ["msg-1", "msg-2"] },
        mockUser as any,
      )

      expect(mockMeetingChatService.markMessagesRead).toHaveBeenCalledWith({
        meetingId: "meeting-1",
        viewer: mockUser,
        messageIds: ["msg-1", "msg-2"],
      })
    })
  })

  describe("getPreferences", () => {
    it("should return meeting preferences", async () => {
      const preferences = {
        leadMinutes: 15,
        defaultNotetaker: true,
      }

      ;(mockMeetingsService.getMeetingPreference as jest.Mock).mockResolvedValue(
        preferences,
      )

      const result = await controller.getPreferences(mockUser as any)

      expect(result.leadMinutes).toBe(15)
      expect(result.defaultNotetaker).toBe(true)
    })
  })

  describe("updatePreferences", () => {
    it("should update meeting preferences", async () => {
      const dto = {
        leadMinutes: 20,
        defaultNotetaker: false,
      }
      const updated = {
        leadMinutes: 20,
        defaultNotetaker: false,
      }

      ;(mockMeetingsService.updateMeetingPreference as jest.Mock).mockResolvedValue(
        updated,
      )

      const result = await controller.updatePreferences(dto, mockUser as any)

      expect(result.leadMinutes).toBe(20)
      expect(mockMeetingsService.updateMeetingPreference).toHaveBeenCalledWith(
        mockUser.id,
        dto,
      )
    })
  })
})

