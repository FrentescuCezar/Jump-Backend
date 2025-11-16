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
  CalendarEventStatus,
  MeetingPlatform,
  ConnectedProvider,
} from "@prisma/client"

describe("Calendar (e2e)", () => {
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

    // Create authenticated user
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

  describe("GET /calendar/events", () => {
    it("should return empty list when user has no events", async () => {
      const response = await request(app.getHttpServer())
        .get("/calendar/events")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200)

      expect(response.body).toHaveProperty("events")
      expect(response.body.events).toEqual([])
      expect(response.body).toHaveProperty("serverTimestamp")
    })

    it("should return upcoming events for the authenticated user", async () => {
      // Create a connected account first
      const account = await dbHelper.createConnectedAccount(
        userId,
        ConnectedProvider.GOOGLE_CALENDAR,
      )

      // Create an upcoming event
      const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours from now
      const event = await dbHelper.createEvent(userId, {
        connectedAccountId: account.id,
        title: "Upcoming Meeting",
        startTime: futureTime,
        endTime: new Date(futureTime.getTime() + 60 * 60 * 1000),
        status: CalendarEventStatus.UPCOMING,
      })

      const response = await request(app.getHttpServer())
        .get("/calendar/events")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200)

      expect(response.body.events.length).toBeGreaterThanOrEqual(1)
      const foundEvent = response.body.events.find((e: any) => e.id === event.id)
      expect(foundEvent).toBeTruthy()
      expect(foundEvent.title).toBe("Upcoming Meeting")
      expect(foundEvent.status).toBe("UPCOMING")
    })

    it("should include notetaker status in response", async () => {
      const account = await dbHelper.createConnectedAccount(
        userId,
        ConnectedProvider.GOOGLE_CALENDAR,
      )

      const event = await dbHelper.createEvent(userId, {
        connectedAccountId: account.id,
        notetakerEnabled: true,
      })

      const response = await request(app.getHttpServer())
        .get("/calendar/events")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200)

      const foundEvent = response.body.events.find((e: any) => e.id === event.id)
      expect(foundEvent).toBeTruthy()
      expect(foundEvent.notetakerEnabled).toBe(true)
    })
  })

  describe("PATCH /calendar/events/:id/notetaker", () => {
    it("should return 404 for non-existent event", async () => {
      await request(app.getHttpServer())
        .patch("/calendar/events/non-existent-id/notetaker")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ enabled: true })
        .expect(404)
    })
  })
})
