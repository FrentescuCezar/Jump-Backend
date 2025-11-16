import { RecallBotStatus } from "@prisma/client"

/**
 * Mock responses for Recall.ai API
 */
export const mockRecallApi = {
  /**
   * Mock response for creating a bot
   */
  createBot: (botId: string = `bot-${Date.now()}`) => ({
    data: {
      id: botId,
      status: { code: "scheduled" },
    },
  }),

  /**
   * Mock response for getting bot status
   */
  getBot: (status: string = "in_call_recording", botId?: string) => ({
    data: {
      id: botId || `bot-${Date.now()}`,
      status: { code: status },
      status_changes: [{ code: status, updated_at: new Date().toISOString() }],
      recordings: [],
    },
  }),

  /**
   * Mock response for bot with completed recording and media
   */
  getBotWithMedia: (botId?: string) => ({
    data: {
      id: botId || `bot-${Date.now()}`,
      status: { code: "done" },
      status_changes: [{ code: "done", updated_at: new Date().toISOString() }],
      recordings: [
        {
          id: `rec-${Date.now()}`,
          created_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          media_shortcuts: {
            transcript: {
              id: "transcript-1",
              format: "json",
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              status: { code: "ready" },
              data: {
                download_url: "https://recall.ai/transcript.json",
              },
            },
            video_mixed: {
              id: "video-1",
              format: "mp4",
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              status: { code: "ready" },
              data: {
                download_url: "https://recall.ai/video.mp4",
              },
            },
            participant_events: {
              id: "events-1",
              format: "json",
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              status: { code: "ready" },
              data: {
                download_url: "https://recall.ai/events.json",
              },
            },
            meeting_metadata: {
              id: "metadata-1",
              format: "json",
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              status: { code: "ready" },
              data: {
                download_url: "https://recall.ai/metadata.json",
              },
            },
          },
        },
      ],
    },
  }),

  /**
   * Mock response for deleting a bot
   */
  deleteBot: () => ({
    data: { success: true },
  }),

  /**
   * Mock error response
   */
  error: (status: number = 404, message: string = "Not found") => {
    const error: any = new Error(message)
    error.response = {
      status,
      data: { error: message },
    }
    return error
  },
}

/**
 * Mock responses for OpenAI API
 */
export const mockOpenAiApi = {
  /**
   * Mock response for chat completion (social media post)
   */
  chatCompletion: (content: string = "Mock AI-generated post") => ({
    choices: [
      {
        message: {
          role: "assistant",
          content,
        },
      },
    ],
  }),

  /**
   * Mock response for follow-up email
   */
  followUpEmail: (content: string = "Mock follow-up email") => ({
    choices: [
      {
        message: {
          role: "assistant",
          content,
        },
      },
    ],
  }),
}

/**
 * Mock responses for LinkedIn API
 */
export const mockLinkedInApi = {
  /**
   * Mock response for posting to LinkedIn
   */
  createPost: (postId: string = `urn:li:activity:${Date.now()}`) => ({
    data: {
      id: postId,
    },
  }),

  /**
   * Mock response for refreshing token
   */
  refreshToken: (accessToken: string = "new-access-token") => ({
    access_token: accessToken,
    expires_in: 3600,
  }),
}

/**
 * Mock responses for Facebook API
 */
export const mockFacebookApi = {
  /**
   * Mock response for posting to Facebook
   */
  createPost: (postId: string = `${Date.now()}`) => ({
    data: {
      id: postId,
    },
  }),

  /**
   * Mock response for refreshing token
   */
  refreshToken: (accessToken: string = "new-access-token") => ({
    access_token: accessToken,
    expires_in: 3600,
  }),
}

/**
 * Mock transcript data
 */
export const mockTranscript = {
  segments: [
    {
      speaker: "Speaker 1",
      text: "Hello, welcome to the meeting.",
      start: 0.0,
      end: 3.5,
    },
    {
      speaker: "Speaker 2",
      text: "Thank you for having me.",
      start: 3.5,
      end: 6.0,
    },
    {
      speaker: "Speaker 1",
      text: "Let's discuss the quarterly results.",
      start: 6.0,
      end: 10.0,
    },
  ],
}

/**
 * Helper to create mock Prisma service
 */
export const createMockPrisma = () => ({
  user: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  calendarEvent: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  recallBot: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  meetingMedia: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  meetingInsight: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  socialPost: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  automation: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  connectedAccount: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  meetingPreference: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  automationPreference: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  meetingShare: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  meetingChatThread: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  meetingChatMessage: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  meetingChatReceipt: {
    create: jest.fn(),
    createMany: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn((callback) => callback(jest.fn())),
})
