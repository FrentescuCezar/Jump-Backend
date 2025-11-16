import { Test, TestingModule } from "@nestjs/testing"
import { MeetingsService } from "./meetings.service"
import { PrismaService } from "../../prisma/prisma.service"
import { RecallService } from "../recall/recall.service"
import { AiContentService } from "../ai/ai-content.service"
import {
  MeetingMediaType,
  MeetingMediaStatus,
  SocialPostStatus,
  CalendarEventStatus,
  RecallBotStatus,
  ConnectedProvider,
} from "@prisma/client"
import { createMockPrisma } from "../../test/helpers/mocks.helper"
import { AppError } from "../errors/app-error"
import { ErrorCodes } from "../errors/error-codes"

// Mock p-queue to avoid ES module issues
jest.mock("p-queue", () => {
  return jest.fn().mockImplementation(() => ({
    add: jest.fn((fn) => Promise.resolve(fn())),
  }))
})

describe("MeetingsService", () => {
  let service: MeetingsService
  let prisma: PrismaService
  let recallService: RecallService
  let aiContent: AiContentService

  const mockPrisma = createMockPrisma()
  const mockRecallService = {
    proxyMediaDownload: jest.fn(),
    refreshVideoMedia: jest.fn(),
  }
  const mockAiContent = {
    generateMeetingContent: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeetingsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: RecallService,
          useValue: mockRecallService,
        },
        {
          provide: AiContentService,
          useValue: mockAiContent,
        },
      ],
    }).compile()

    service = module.get<MeetingsService>(MeetingsService)
    prisma = module.get<PrismaService>(PrismaService)
    recallService = module.get<RecallService>(RecallService)
    aiContent = module.get<AiContentService>(AiContentService)

    jest.clearAllMocks()
  })

  describe("getMeetingDetails", () => {
    it("should return meeting details for owner", async () => {
      const meetingId = "meeting-1"
      const userId = "user-1"
      const meeting = {
        id: meetingId,
        userId,
        title: "Test Meeting",
        startTime: new Date(),
        endTime: new Date(),
        connectedAccount: {
          provider: ConnectedProvider.GOOGLE_CALENDAR,
          label: "Google Calendar",
        },
        recallBot: {
          id: "bot-1",
          status: RecallBotStatus.DONE,
          joinAt: new Date(),
          meetingUrl: "https://zoom.us/j/123",
          meetingPlatform: "ZOOM" as const,
          metadata: null,
          media: [],
        },
        meetingInsights: [],
        socialPosts: [],
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        meeting,
      )

      const result = await service.getMeetingDetails(meetingId, userId)

      expect(result.event.id).toBe(meetingId)
      expect(result.recallBot).toBeDefined()
      expect(mockPrisma.calendarEvent.findUnique).toHaveBeenCalledWith({
        where: { id: meetingId },
        include: expect.any(Object),
      })
    })

    it("should throw NotFoundException for non-existent meeting", async () => {
      const meetingId = "non-existent"
      const userId = "user-1"

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        null,
      )

      await expect(
        service.getMeetingDetails(meetingId, userId),
      ).rejects.toThrow(AppError)
    })

    it("should include media in response", async () => {
      const meetingId = "meeting-1"
      const userId = "user-1"
      const meeting = {
        id: meetingId,
        userId,
        title: "Test Meeting",
        startTime: new Date(),
        endTime: new Date(),
        connectedAccount: {
          provider: ConnectedProvider.GOOGLE_CALENDAR,
          label: "Google Calendar",
        },
        recallBot: {
          id: "bot-1",
          status: RecallBotStatus.DONE,
          joinAt: new Date(),
          meetingUrl: "https://zoom.us/j/123",
          meetingPlatform: "ZOOM" as const,
          metadata: null,
          media: [
            {
              id: "media-1",
              type: MeetingMediaType.TRANSCRIPT,
              status: MeetingMediaStatus.STORED,
              downloadUrl: "https://example.com/transcript.json",
              expiresAt: null,
            },
          ],
        },
        meetingInsights: [],
        socialPosts: [],
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        meeting,
      )

      const result = await service.getMeetingDetails(meetingId, userId)

      expect(result.media).toHaveLength(1)
      expect(result.media[0].type).toBe(MeetingMediaType.TRANSCRIPT)
      expect(result.media[0].available).toBe(true)
    })

    it("should include social posts in response", async () => {
      const meetingId = "meeting-1"
      const userId = "user-1"
      const meeting = {
        id: meetingId,
        userId,
        title: "Test Meeting",
        startTime: new Date(),
        endTime: new Date(),
        connectedAccount: {
          provider: ConnectedProvider.GOOGLE_CALENDAR,
          label: "Google Calendar",
        },
        recallBot: null,
        meetingInsights: [],
        socialPosts: [
          {
            id: "post-1",
            channel: "LINKEDIN",
            status: SocialPostStatus.DRAFT,
            content: "Test post",
            automationId: "auto-1",
            publishedAt: null,
            error: null,
          },
        ],
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        meeting,
      )

      const result = await service.getMeetingDetails(meetingId, userId)

      expect(result.socialPosts).toHaveLength(1)
      expect(result.socialPosts[0].channel).toBe("LINKEDIN")
      expect(result.socialPosts[0].status).toBe(SocialPostStatus.DRAFT)
    })
  })

  describe("getMeetingActivity", () => {
    it("should return activity with owner role", async () => {
      const meetingId = "meeting-1"
      const user = {
        id: "user-1",
        email: "user@example.com",
      }
      const meeting = {
        id: meetingId,
        userId: user.id,
        title: "Test Meeting",
        startTime: new Date(),
        endTime: new Date(),
        connectedAccount: {
          provider: ConnectedProvider.GOOGLE_CALENDAR,
          label: "Google Calendar",
        },
        recallBot: null,
        meetingInsights: [],
        socialPosts: [],
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        meeting,
      )
      ;(mockPrisma.meetingShare.count as jest.Mock).mockResolvedValue(2)

      const result = await service.getMeetingActivity(meetingId, user as any)

      expect(result.viewerRole).toBe("owner")
      expect(result.shareCount).toBe(2)
    })

    it("should return activity with guest role for shared meeting", async () => {
      const meetingId = "meeting-1"
      const ownerId = "user-1"
      const guestUser = {
        id: "user-2",
        email: "guest@example.com",
      }
      const meeting = {
        id: meetingId,
        userId: ownerId,
        title: "Test Meeting",
        startTime: new Date(),
        endTime: new Date(),
        connectedAccount: {
          provider: ConnectedProvider.GOOGLE_CALENDAR,
          label: "Google Calendar",
        },
        recallBot: null,
        meetingInsights: [],
        socialPosts: [],
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        meeting,
      )
      ;(mockPrisma.meetingShare.findFirst as jest.Mock).mockResolvedValue({
        id: "share-1",
        email: "guest@example.com",
      })

      const result = await service.getMeetingActivity(
        meetingId,
        guestUser as any,
      )

      expect(result.viewerRole).toBe("guest")
      expect(result.shareCount).toBeUndefined()
    })
  })

  describe("streamTranscript", () => {
    it("should proxy transcript download", async () => {
      const meetingId = "meeting-1"
      const userId = "user-1"
      const media = {
        id: "media-1",
        type: MeetingMediaType.TRANSCRIPT,
        downloadUrl: "https://example.com/transcript.json",
        recallBot: {
          calendarEvent: {
            userId,
          },
        },
      }

      ;(mockPrisma.meetingMedia.findFirst as jest.Mock).mockResolvedValue(
        media,
      )
      ;(mockRecallService.proxyMediaDownload as jest.Mock).mockResolvedValue(
        undefined,
      )

      const mockResponse = {
        setHeader: jest.fn(),
      }

      await service.streamTranscript(meetingId, userId, mockResponse as any)

      expect(mockRecallService.proxyMediaDownload).toHaveBeenCalledWith(
        media,
        mockResponse,
        { fallbackContentType: "application/json" },
      )
    })

    it("should throw error for non-existent transcript", async () => {
      const meetingId = "meeting-1"
      const userId = "user-1"

      ;(mockPrisma.meetingMedia.findFirst as jest.Mock).mockResolvedValue(null)

      await expect(
        service.streamTranscript(meetingId, userId, {} as any),
      ).rejects.toThrow(AppError)
    })
  })

  describe("getVideoPlaybackUrl", () => {
    it("should return video playback URL", async () => {
      const meetingId = "meeting-1"
      const userId = "user-1"
      const event = {
        id: meetingId,
        userId,
        recallBot: {
          id: "bot-1",
        },
      }
      const media = {
        id: "media-1",
        downloadUrl: "https://example.com/video.mp4",
        expiresAt: new Date(Date.now() + 3600000),
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        event,
      )
      ;(mockRecallService.refreshVideoMedia as jest.Mock).mockResolvedValue(
        media,
      )

      const result = await service.getVideoPlaybackUrl(meetingId, userId)

      expect(result.downloadUrl).toBe(media.downloadUrl)
      expect(result.expiresAt).toBeDefined()
    })

    it("should throw error when no bot exists", async () => {
      const meetingId = "meeting-1"
      const userId = "user-1"
      const event = {
        id: meetingId,
        userId,
        recallBot: null,
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        event,
      )

      await expect(
        service.getVideoPlaybackUrl(meetingId, userId),
      ).rejects.toThrow(AppError)
    })
  })

  describe("regenerateAiContent", () => {
    it("should regenerate AI content for meeting", async () => {
      const meetingId = "meeting-1"
      const userId = "user-1"
      const event = {
        id: meetingId,
        userId,
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        event,
      )
      ;(mockAiContent.generateMeetingContent as jest.Mock).mockResolvedValue(
        undefined,
      )

      await service.regenerateAiContent(meetingId, userId)

      expect(mockAiContent.generateMeetingContent).toHaveBeenCalledWith(
        meetingId,
        { regenerate: true },
      )
    })

    it("should throw error for non-owned meeting", async () => {
      const meetingId = "meeting-1"
      const userId = "user-1"
      const event = {
        id: meetingId,
        userId: "user-2",
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        event,
      )

      await expect(
        service.regenerateAiContent(meetingId, userId),
      ).rejects.toThrow(AppError)
    })
  })

  describe("addMeetingShare", () => {
    it("should add share for meeting", async () => {
      const meetingId = "meeting-1"
      const ownerId = "user-1"
      const email = "guest@example.com"
      const share = {
        id: "share-1",
        calendarEventId: meetingId,
        email: "guest@example.com",
        invitedByUserId: ownerId,
        createdAt: new Date(),
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue({
        id: meetingId,
        userId: ownerId,
      })
      ;(mockPrisma.meetingShare.upsert as jest.Mock).mockResolvedValue(share)

      const result = await service.addMeetingShare(meetingId, ownerId, email)

      expect(result.email).toBe("guest@example.com")
      expect(mockPrisma.meetingShare.upsert).toHaveBeenCalled()
    })

    it("should normalize email address", async () => {
      const meetingId = "meeting-1"
      const ownerId = "user-1"
      const email = "  Guest@Example.COM  "

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue({
        id: meetingId,
        userId: ownerId,
      })
      ;(mockPrisma.meetingShare.upsert as jest.Mock).mockResolvedValue({
        id: "share-1",
        email: "guest@example.com",
        createdAt: new Date(),
      })

      await service.addMeetingShare(meetingId, ownerId, email)

      expect(mockPrisma.meetingShare.upsert).toHaveBeenCalledWith({
        where: {
          calendarEventId_email: {
            calendarEventId: meetingId,
            email: "guest@example.com",
          },
        },
        update: expect.any(Object),
        create: expect.objectContaining({
          email: "guest@example.com",
        }),
      })
    })
  })

  describe("getMeetingPreference", () => {
    it("should return meeting preferences", async () => {
      const userId = "user-1"
      const preference = {
        id: "pref-1",
        userId,
        leadMinutes: 15,
        defaultNotetaker: true,
      }

      ;(mockPrisma.meetingPreference.findUnique as jest.Mock).mockResolvedValue(
        preference,
      )

      const result = await service.getMeetingPreference(userId)

      expect(result.leadMinutes).toBe(15)
      expect(result.defaultNotetaker).toBe(true)
    })

    it("should create preference if not exists", async () => {
      const userId = "user-1"
      const preference = {
        id: "pref-1",
        userId,
        leadMinutes: 10,
        defaultNotetaker: true,
      }

      ;(mockPrisma.meetingPreference.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(preference)
      ;(mockPrisma.meetingPreference.create as jest.Mock).mockResolvedValue(
        preference,
      )

      const result = await service.getMeetingPreference(userId)

      expect(result).toBeDefined()
      expect(mockPrisma.meetingPreference.create).toHaveBeenCalledWith({
        data: { userId },
      })
    })
  })

  describe("updateMeetingPreference", () => {
    it("should update meeting preferences", async () => {
      const userId = "user-1"
      const dto = {
        leadMinutes: 20,
        defaultNotetaker: false,
      }
      const preference = {
        id: "pref-1",
        userId,
        ...dto,
      }

      ;(mockPrisma.meetingPreference.upsert as jest.Mock).mockResolvedValue(
        preference,
      )

      const result = await service.updateMeetingPreference(userId, dto)

      expect(result.leadMinutes).toBe(20)
      expect(result.defaultNotetaker).toBe(false)
      expect(mockPrisma.meetingPreference.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: expect.objectContaining({
          userId,
          leadMinutes: 20,
          defaultNotetaker: false,
        }),
        update: expect.objectContaining({
          leadMinutes: 20,
          defaultNotetaker: false,
        }),
      })
    })
  })
})

