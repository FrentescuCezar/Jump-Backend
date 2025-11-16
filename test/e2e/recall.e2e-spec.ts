import { TestingModule } from "@nestjs/testing"
import { INestApplication } from "@nestjs/common"
import request from "supertest"
import { PrismaService } from "../../prisma/prisma.service"
import { HttpService } from "@nestjs/axios"
import { TestDbHelper } from "../helpers/test-db.helper"
import { AuthHelper } from "../helpers/auth.helper"
import { mockRecallApi } from "../helpers/mocks.helper"
import { createTestModule } from "../helpers/test-module.helper"
import {
  MeetingPlatform,
  RecallBotStatus,
  ConnectedProvider,
} from "@prisma/client"

describe("Recall Bot (e2e)", () => {
  let app: INestApplication
  let prisma: PrismaService
  let httpService: HttpService
  let dbHelper: TestDbHelper
  let authHelper: AuthHelper
  let authToken: string
  let userId: string

  beforeAll(async () => {
    const moduleFixture: TestingModule = await createTestModule().compile()

    app = moduleFixture.createNestApplication()
    await app.init()

    prisma = moduleFixture.get<PrismaService>(PrismaService)
    httpService = moduleFixture.get<HttpService>(HttpService)
    dbHelper = new TestDbHelper(prisma)
    authHelper = new AuthHelper(prisma)

    const { user, token } = await authHelper.createAuthenticatedUser()
    userId = user.id
    authToken = token
  })

  afterAll(async () => {
    await dbHelper.cleanup()
    await app.close()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("Bot Scheduling via Calendar", () => {
    it("should schedule a bot when enabling notetaker", async () => {
      const account = await dbHelper.createConnectedAccount(
        userId,
        ConnectedProvider.GOOGLE_CALENDAR,
      )

      const event = await dbHelper.createEvent(userId, {
        connectedAccountId: account.id,
        meetingUrl: "https://zoom.us/j/123456",
        meetingPlatform: MeetingPlatform.ZOOM,
        notetakerEnabled: false,
      })

      const mockBotId = `bot-${Date.now()}`
      ;(httpService.axiosRef.post as jest.Mock).mockResolvedValueOnce(
        mockRecallApi.createBot(mockBotId),
      )

      await request(app.getHttpServer())
        .patch(`/calendar/events/${event.id}/notetaker`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ enabled: true })
        .expect(200)

      // Verify bot was created in database
      const bot = await prisma.recallBot.findUnique({
        where: { calendarEventId: event.id },
      })

      expect(bot).toBeTruthy()
      expect(bot?.id).toBe(mockBotId)
      expect(bot?.status).toBe(RecallBotStatus.SCHEDULED)
      expect(bot?.meetingUrl).toBe("https://zoom.us/j/123456")
      expect(bot?.meetingPlatform).toBe(MeetingPlatform.ZOOM)

      // Verify Recall API was called
      expect(httpService.axiosRef.post).toHaveBeenCalledWith(
        expect.stringContaining("/bot"),
        expect.objectContaining({
          meeting_url: "https://zoom.us/j/123456",
          bot_name: "Jump Notetaker",
        }),
        expect.any(Object),
      )
    })

    it("should include bot status in calendar events list", async () => {
      const account = await dbHelper.createConnectedAccount(
        userId,
        ConnectedProvider.GOOGLE_CALENDAR,
      )

      // Create event with future start time to be included in upcoming events
      const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours from now
      const event = await dbHelper.createEvent(userId, {
        connectedAccountId: account.id,
        meetingUrl: "https://zoom.us/j/123456",
        meetingPlatform: MeetingPlatform.ZOOM,
        notetakerEnabled: true,
        startTime: futureTime,
        endTime: new Date(futureTime.getTime() + 60 * 60 * 1000),
      })

      // Create bot directly using Prisma to avoid helper lookup issues
      const bot = await prisma.recallBot.create({
        data: {
          id: `bot-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
          calendarEventId: event.id,
          meetingUrl: "https://zoom.us/j/123456",
          meetingPlatform: MeetingPlatform.ZOOM,
          status: RecallBotStatus.IN_CALL,
          leadTimeMinutes: 10,
          joinAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      })

      const response = await request(app.getHttpServer())
        .get("/calendar/events")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200)

      const eventData = response.body.events.find((e: any) => e.id === event.id)
      expect(eventData).toBeTruthy()
      // Bot status should be included in the response
      expect(eventData).toHaveProperty("botStatus")
      // The bot status should match what we created
      expect(eventData.botStatus).toBe(RecallBotStatus.IN_CALL)
      expect(eventData.notetakerEnabled).toBe(true)
    })

  })
})
