import { Test, TestingModule } from "@nestjs/testing"
import { ConfigService } from "@nestjs/config"
import { HttpService } from "@nestjs/axios"
import { AiContentService } from "./ai-content.service"
import { PrismaService } from "../../prisma/prisma.service"
import {
  MeetingMediaType,
  MeetingMediaStatus,
  SocialPostStatus,
  SocialChannel,
} from "@prisma/client"
import { createMockPrisma, mockOpenAiApi, mockTranscript } from "../../test/helpers/mocks.helper"
import { AppError } from "../errors/app-error"
import { ErrorCodes } from "../errors/error-codes"
import OpenAI from "openai"

// Mock p-queue to avoid ES module issues
jest.mock("p-queue", () => {
  return jest.fn().mockImplementation(() => ({
    add: jest.fn((fn) => Promise.resolve(fn())),
  }))
})

describe("AiContentService", () => {
  let service: AiContentService
  let prisma: PrismaService
  let httpService: HttpService
  let configService: ConfigService

  const mockPrisma = createMockPrisma()
  const mockHttpService = {
    axiosRef: {
      get: jest.fn(),
    },
  }
  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === "OPENAI_API_KEY") return "test-api-key"
      if (key === "OPENAI_MODEL") return "gpt-4o-mini"
      if (key === "AI_QUEUE_CONCURRENCY") return "2"
      if (key === "AI_TRANSCRIPT_CHAR_LIMIT") return "20000"
      if (key === "AI_TRANSCRIPT_SEGMENT_LIMIT") return "75"
      if (key === "AI_TRANSCRIPT_DOWNLOAD_TIMEOUT_MS") return "15000"
      if (key === "AI_SOCIAL_WORD_LIMIT") return "90"
      return undefined
    }),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiContentService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile()

    service = module.get<AiContentService>(AiContentService)
    prisma = module.get<PrismaService>(PrismaService)
    httpService = module.get<HttpService>(HttpService)
    configService = module.get<ConfigService>(ConfigService)

    jest.clearAllMocks()
  })

  describe("generateMeetingContent", () => {
    it("should generate meeting content with transcript", async () => {
      const eventId = "event-1"
      const meeting = {
        id: eventId,
        userId: "user-1",
        title: "Test Meeting",
        startTime: new Date(),
        description: "Meeting description",
        user: {
          id: "user-1",
          name: "Test User",
        },
        recallBot: {
          id: "bot-1",
          media: [
            {
              id: "media-1",
              type: MeetingMediaType.TRANSCRIPT,
              status: MeetingMediaStatus.STORED,
              downloadUrl: "https://example.com/transcript.json",
            },
          ],
        },
        meetingInsights: [],
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        meeting,
      )
      ;(mockHttpService.axiosRef.get as jest.Mock).mockResolvedValue({
        data: mockTranscript,
      })
      ;(mockPrisma.meetingInsight.findMany as jest.Mock).mockResolvedValue([])
      ;(mockPrisma.meetingInsight.create as jest.Mock).mockResolvedValue({
        id: "insight-1",
      })
      ;(mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([])

      // Mock OpenAI
      const mockOpenAi = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      summary: "Meeting summary",
                      followUpEmail: "Follow-up email content",
                    }),
                  },
                },
              ],
            }),
          },
        },
      }
      ;(service as any).openAi = mockOpenAi

      await service.generateMeetingContent(eventId)

      expect(mockPrisma.meetingInsight.create).toHaveBeenCalled()
      expect(mockOpenAi.chat.completions.create).toHaveBeenCalled()
    })

    it("should skip generation when no transcript available", async () => {
      const eventId = "event-1"
      const meeting = {
        id: eventId,
        userId: "user-1",
        title: "Test Meeting",
        startTime: new Date(),
        user: {
          id: "user-1",
          name: "Test User",
        },
        recallBot: {
          id: "bot-1",
          media: [],
        },
        meetingInsights: [],
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        meeting,
      )

      await service.generateMeetingContent(eventId)

      expect(mockHttpService.axiosRef.get).not.toHaveBeenCalled()
      expect(mockPrisma.meetingInsight.create).not.toHaveBeenCalled()
    })

    it("should use fallback when OpenAI is not configured", async () => {
      const eventId = "event-1"
      const meeting = {
        id: eventId,
        userId: "user-1",
        title: "Test Meeting",
        startTime: new Date(),
        user: {
          id: "user-1",
          name: "Test User",
        },
        recallBot: {
          id: "bot-1",
          media: [
            {
              id: "media-1",
              type: MeetingMediaType.TRANSCRIPT,
              status: MeetingMediaStatus.STORED,
              downloadUrl: "https://example.com/transcript.json",
            },
          ],
        },
        meetingInsights: [],
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        meeting,
      )
      ;(mockHttpService.axiosRef.get as jest.Mock).mockResolvedValue({
        data: mockTranscript,
      })
      ;(mockPrisma.meetingInsight.findMany as jest.Mock).mockResolvedValue([])
      ;(mockPrisma.meetingInsight.create as jest.Mock).mockResolvedValue({
        id: "insight-1",
      })
      ;(mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([])

      // Set OpenAI to null
      ;(service as any).openAi = null

      await service.generateMeetingContent(eventId)

      expect(mockPrisma.meetingInsight.create).toHaveBeenCalled()
      const createCall = (mockPrisma.meetingInsight.create as jest.Mock)
        .mock.calls[0][0]
      expect(createCall.data.summary).toContain("Test Meeting")
      expect(createCall.data.followUpEmail).toContain("Hi team")
    })

    it("should generate social posts for enabled automations", async () => {
      const eventId = "event-1"
      const meeting = {
        id: eventId,
        userId: "user-1",
        title: "Test Meeting",
        startTime: new Date(),
        user: {
          id: "user-1",
          name: "Test User",
        },
        recallBot: {
          id: "bot-1",
          media: [
            {
              id: "media-1",
              type: MeetingMediaType.TRANSCRIPT,
              status: MeetingMediaStatus.STORED,
              downloadUrl: "https://example.com/transcript.json",
            },
          ],
        },
        meetingInsights: [],
      }

      const automation = {
        id: "auto-1",
        userId: "user-1",
        name: "LinkedIn Automation",
        channel: SocialChannel.LINKEDIN,
        promptTemplate: "Create a post about the meeting",
        isEnabled: true,
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        meeting,
      )
      ;(mockHttpService.axiosRef.get as jest.Mock).mockResolvedValue({
        data: mockTranscript,
      })
      ;(mockPrisma.meetingInsight.findMany as jest.Mock).mockResolvedValue([])
      ;(mockPrisma.meetingInsight.create as jest.Mock).mockResolvedValue({
        id: "insight-1",
      })
      ;(mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([
        automation,
      ])
      ;(mockPrisma.socialPost.deleteMany as jest.Mock).mockResolvedValue({
        count: 0,
      })
      ;(mockPrisma.socialPost.create as jest.Mock).mockResolvedValue({
        id: "post-1",
      })

      // Mock OpenAI
      const mockOpenAi = {
        chat: {
          completions: {
            create: jest
              .fn()
              .mockResolvedValueOnce({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        summary: "Meeting summary",
                        followUpEmail: "Follow-up email",
                      }),
                    },
                  },
                ],
              })
              .mockResolvedValueOnce({
                choices: [
                  {
                    message: {
                      content: "Generated social media post",
                    },
                  },
                ],
              }),
          },
        },
      }
      ;(service as any).openAi = mockOpenAi

      await service.generateMeetingContent(eventId)

      expect(mockPrisma.socialPost.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          calendarEventId: eventId,
          userId: "user-1",
          automationId: automation.id,
          channel: SocialChannel.LINKEDIN,
          status: SocialPostStatus.DRAFT,
        }),
      })
    })

    it("should delete existing draft posts when regenerating", async () => {
      const eventId = "event-1"
      const meeting = {
        id: eventId,
        userId: "user-1",
        title: "Test Meeting",
        startTime: new Date(),
        user: {
          id: "user-1",
          name: "Test User",
        },
        recallBot: {
          id: "bot-1",
          media: [
            {
              id: "media-1",
              type: MeetingMediaType.TRANSCRIPT,
              status: MeetingMediaStatus.STORED,
              downloadUrl: "https://example.com/transcript.json",
            },
          ],
        },
        meetingInsights: [],
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        meeting,
      )
      ;(mockHttpService.axiosRef.get as jest.Mock).mockResolvedValue({
        data: mockTranscript,
      })
      ;(mockPrisma.meetingInsight.findMany as jest.Mock).mockResolvedValue([])
      ;(mockPrisma.meetingInsight.create as jest.Mock).mockResolvedValue({
        id: "insight-1",
      })
      ;(mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([
        {
          id: "auto-1",
          userId: "user-1",
          name: "Test Automation",
          channel: SocialChannel.LINKEDIN,
          promptTemplate: "Create a post",
          isEnabled: true,
        },
      ])
      ;(mockPrisma.socialPost.deleteMany as jest.Mock).mockResolvedValue({
        count: 2,
      })
      ;(mockPrisma.socialPost.create as jest.Mock).mockResolvedValue({
        id: "post-1",
      })

      // Mock OpenAI
      const mockOpenAi = {
        chat: {
          completions: {
            create: jest
              .fn()
              .mockResolvedValueOnce({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        summary: "Meeting summary",
                        followUpEmail: "Follow-up email",
                      }),
                    },
                  },
                ],
              })
              .mockResolvedValueOnce({
                choices: [
                  {
                    message: {
                      content: "Generated social post",
                    },
                  },
                ],
              }),
          },
        },
      }
      ;(service as any).openAi = mockOpenAi

      await service.generateMeetingContent(eventId, { regenerate: true })

      expect(mockPrisma.socialPost.deleteMany).toHaveBeenCalledWith({
        where: {
          calendarEventId: eventId,
          status: {
            in: [SocialPostStatus.DRAFT, SocialPostStatus.READY],
          },
        },
      })
    })

    it("should handle OpenAI errors gracefully", async () => {
      const eventId = "event-1"
      const meeting = {
        id: eventId,
        userId: "user-1",
        title: "Test Meeting",
        startTime: new Date(),
        user: {
          id: "user-1",
          name: "Test User",
        },
        recallBot: {
          id: "bot-1",
          media: [
            {
              id: "media-1",
              type: MeetingMediaType.TRANSCRIPT,
              status: MeetingMediaStatus.STORED,
              downloadUrl: "https://example.com/transcript.json",
            },
          ],
        },
        meetingInsights: [],
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        meeting,
      )
      ;(mockHttpService.axiosRef.get as jest.Mock).mockResolvedValue({
        data: mockTranscript,
      })
      ;(mockPrisma.meetingInsight.findMany as jest.Mock).mockResolvedValue([])
      ;(mockPrisma.meetingInsight.create as jest.Mock).mockResolvedValue({
        id: "insight-1",
      })
      ;(mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([])

      // Mock OpenAI to throw error
      const mockOpenAi = {
        chat: {
          completions: {
            create: jest.fn().mockRejectedValue(new Error("OpenAI error")),
          },
        },
      }
      ;(service as any).openAi = mockOpenAi

      await service.generateMeetingContent(eventId)

      // Should still create insight with fallback
      expect(mockPrisma.meetingInsight.create).toHaveBeenCalled()
    })
  })

  describe("queueMeetingGeneration", () => {
    it("should queue meeting generation", async () => {
      const eventId = "event-1"
      const generateSpy = jest.spyOn(service, "generateMeetingContent")

      await service.queueMeetingGeneration(eventId)

      // Queue should be processed immediately in test
      expect(generateSpy).toHaveBeenCalled()
    })

  })

  describe("edge cases", () => {
    it("should handle meeting with existing insight", async () => {
      const eventId = "event-1"
      const meeting = {
        id: eventId,
        userId: "user-1",
        title: "Test Meeting",
        startTime: new Date(),
        user: {
          id: "user-1",
          name: "Test User",
        },
        recallBot: {
          id: "bot-1",
          media: [
            {
              id: "media-1",
              type: MeetingMediaType.TRANSCRIPT,
              status: MeetingMediaStatus.STORED,
              downloadUrl: "https://example.com/transcript.json",
            },
          ],
        },
        meetingInsights: [
          {
            id: "insight-1",
            summary: "Old summary",
            followUpEmail: "Old email",
          },
        ],
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        meeting,
      )
      ;(mockHttpService.axiosRef.get as jest.Mock).mockResolvedValue({
        data: mockTranscript,
      })
      ;(mockPrisma.meetingInsight.findMany as jest.Mock).mockResolvedValue([
        meeting.meetingInsights[0],
      ])
      ;(mockPrisma.meetingInsight.update as jest.Mock).mockResolvedValue({
        id: "insight-1",
      })
      ;(mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([])

      const mockOpenAi = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      summary: "New summary",
                      followUpEmail: "New email",
                    }),
                  },
                },
              ],
            }),
          },
        },
      }
      ;(service as any).openAi = mockOpenAi

      await service.generateMeetingContent(eventId)

      expect(mockPrisma.meetingInsight.update).toHaveBeenCalled()
    })

    it("should handle transcript download timeout", async () => {
      const eventId = "event-1"
      const meeting = {
        id: eventId,
        userId: "user-1",
        title: "Test Meeting",
        startTime: new Date(),
        user: {
          id: "user-1",
          name: "Test User",
        },
        recallBot: {
          id: "bot-1",
          media: [
            {
              id: "media-1",
              type: MeetingMediaType.TRANSCRIPT,
              status: MeetingMediaStatus.STORED,
              downloadUrl: "https://example.com/transcript.json",
            },
          ],
        },
        meetingInsights: [],
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        meeting,
      )
      ;(mockHttpService.axiosRef.get as jest.Mock).mockRejectedValue(
        new Error("Timeout"),
      )
      ;(mockPrisma.meetingInsight.findMany as jest.Mock).mockResolvedValue([])

      // The error will be thrown and not caught, so we expect it to throw
      await expect(service.generateMeetingContent(eventId)).rejects.toThrow()
    })

    it("should handle disabled automations", async () => {
      const eventId = "event-1"
      const meeting = {
        id: eventId,
        userId: "user-1",
        title: "Test Meeting",
        startTime: new Date(),
        user: {
          id: "user-1",
          name: "Test User",
        },
        recallBot: {
          id: "bot-1",
          media: [
            {
              id: "media-1",
              type: MeetingMediaType.TRANSCRIPT,
              status: MeetingMediaStatus.STORED,
              downloadUrl: "https://example.com/transcript.json",
            },
          ],
        },
        meetingInsights: [],
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        meeting,
      )
      ;(mockHttpService.axiosRef.get as jest.Mock).mockResolvedValue({
        data: mockTranscript,
      })
      ;(mockPrisma.meetingInsight.findMany as jest.Mock).mockResolvedValue([])
      ;(mockPrisma.meetingInsight.create as jest.Mock).mockResolvedValue({
        id: "insight-1",
      })
      // Return empty array since disabled automations are filtered out by isEnabled: true
      ;(mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([])

      const mockOpenAi = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      summary: "Summary",
                      followUpEmail: "Email",
                    }),
                  },
                },
              ],
            }),
          },
        },
      }
      ;(service as any).openAi = mockOpenAi

      await service.generateMeetingContent(eventId)

      // No social posts should be created since no enabled automations
      expect(mockPrisma.socialPost.create).not.toHaveBeenCalled()
    })

    it("should handle empty OpenAI response", async () => {
      const eventId = "event-1"
      const meeting = {
        id: eventId,
        userId: "user-1",
        title: "Test Meeting",
        startTime: new Date(),
        user: {
          id: "user-1",
          name: "Test User",
        },
        recallBot: {
          id: "bot-1",
          media: [
            {
              id: "media-1",
              type: MeetingMediaType.TRANSCRIPT,
              status: MeetingMediaStatus.STORED,
              downloadUrl: "https://example.com/transcript.json",
            },
          ],
        },
        meetingInsights: [],
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        meeting,
      )
      ;(mockHttpService.axiosRef.get as jest.Mock).mockResolvedValue({
        data: mockTranscript,
      })
      ;(mockPrisma.meetingInsight.findMany as jest.Mock).mockResolvedValue([])
      ;(mockPrisma.meetingInsight.create as jest.Mock).mockResolvedValue({
        id: "insight-1",
      })
      ;(mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([])

      const mockOpenAi = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: null, // Empty response
                  },
                },
              ],
            }),
          },
        },
      }
      ;(service as any).openAi = mockOpenAi

      const loggerWarnSpy = jest
        .spyOn(service["logger"], "warn")
        .mockImplementation()

      await service.generateMeetingContent(eventId)

      // Should fall back to default insight
      expect(mockPrisma.meetingInsight.create).toHaveBeenCalled()
      expect(loggerWarnSpy).toHaveBeenCalled()

      loggerWarnSpy.mockRestore()
    })

    it("should handle incomplete AI response", async () => {
      const eventId = "event-1"
      const meeting = {
        id: eventId,
        userId: "user-1",
        title: "Test Meeting",
        startTime: new Date(),
        user: {
          id: "user-1",
          name: "Test User",
        },
        recallBot: {
          id: "bot-1",
          media: [
            {
              id: "media-1",
              type: MeetingMediaType.TRANSCRIPT,
              status: MeetingMediaStatus.STORED,
              downloadUrl: "https://example.com/transcript.json",
            },
          ],
        },
        meetingInsights: [],
      }

      ;(mockPrisma.calendarEvent.findUnique as jest.Mock).mockResolvedValue(
        meeting,
      )
      ;(mockHttpService.axiosRef.get as jest.Mock).mockResolvedValue({
        data: mockTranscript,
      })
      ;(mockPrisma.meetingInsight.findMany as jest.Mock).mockResolvedValue([])
      ;(mockPrisma.meetingInsight.create as jest.Mock).mockResolvedValue({
        id: "insight-1",
      })
      ;(mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([])

      const mockOpenAi = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      summary: "Summary only", // Missing followUpEmail
                    }),
                  },
                },
              ],
            }),
          },
        },
      }
      ;(service as any).openAi = mockOpenAi

      const loggerWarnSpy = jest
        .spyOn(service["logger"], "warn")
        .mockImplementation()

      await service.generateMeetingContent(eventId)

      // Should fall back to default insight
      expect(mockPrisma.meetingInsight.create).toHaveBeenCalled()
      expect(loggerWarnSpy).toHaveBeenCalled()

      loggerWarnSpy.mockRestore()
    })
  })
})

