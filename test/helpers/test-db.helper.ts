import { PrismaService } from "../../../prisma/prisma.service"
import type {
  User,
  CalendarEvent,
  RecallBot,
  ConnectedAccount,
  Automation,
  MeetingPreference,
} from "@prisma/client"

/**
 * Helper class for managing test database state
 * Use this in E2E tests to create test data and clean up
 */
export class TestDbHelper {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Clean up all test data
   * Call this in afterAll hooks
   */
  async cleanup() {
    // Delete in reverse order of dependencies
    await this.prisma.socialPost.deleteMany({})
    await this.prisma.meetingInsight.deleteMany({})
    await this.prisma.meetingMedia.deleteMany({})
    await this.prisma.recallBot.deleteMany({})
    await this.prisma.calendarEvent.deleteMany({})
    await this.prisma.automation.deleteMany({})
    await this.prisma.connectedAccount.deleteMany({})
    await this.prisma.meetingPreference.deleteMany({})
    await this.prisma.user.deleteMany({})
  }

  /**
   * Create a test user
   */
  async createUser(overrides?: Partial<User>): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: `test-${Date.now()}-${Math.random()}@example.com`,
        name: "Test User",
        ...overrides,
      },
    })
  }

  /**
   * Create a test calendar event
   * If connectedAccountId is not provided, creates a Google Calendar connected account first
   */
  async createEvent(
    userId: string,
    overrides?: Partial<CalendarEvent>,
  ): Promise<CalendarEvent> {
    const now = Date.now()

    // Extract relation fields from overrides to avoid conflicts
    const {
      userId: _userId,
      connectedAccountId: _connectedAccountId,
      user: _user,
      connectedAccount: _connectedAccount,
      ...restOverrides
    } = overrides || {}

    // Ensure we have a connectedAccountId
    let connectedAccountId = _connectedAccountId
    if (!connectedAccountId) {
      const account = await this.createConnectedAccount(
        userId,
        "GOOGLE_CALENDAR",
      )
      connectedAccountId = account.id
    }

    return this.prisma.calendarEvent.create({
      data: {
        userId,
        connectedAccountId,
        externalEventId: `ext-${now}`,
        title: "Test Meeting",
        meetingUrl: "https://zoom.us/j/123456",
        meetingPlatform: "ZOOM",
        startTime: new Date(now + 3600000), // 1 hour from now
        endTime: new Date(now + 7200000), // 2 hours from now
        deduplicationKey: `key-${now}`,
        status: "UPCOMING",
        ...restOverrides,
      },
    })
  }

  /**
   * Create a past calendar event (for testing completed meetings)
   * If connectedAccountId is not provided, creates a Google Calendar connected account first
   */
  async createPastEvent(
    userId: string,
    overrides?: Partial<CalendarEvent>,
  ): Promise<CalendarEvent> {
    const now = Date.now()

    // Extract relation fields from overrides to avoid conflicts
    const {
      userId: _userId,
      connectedAccountId: _connectedAccountId,
      user: _user,
      connectedAccount: _connectedAccount,
      ...restOverrides
    } = overrides || {}

    // Ensure we have a connectedAccountId
    let connectedAccountId = _connectedAccountId
    if (!connectedAccountId) {
      const account = await this.createConnectedAccount(
        userId,
        "GOOGLE_CALENDAR",
      )
      connectedAccountId = account.id
    }

    return this.prisma.calendarEvent.create({
      data: {
        userId,
        connectedAccountId,
        externalEventId: `ext-past-${now}`,
        title: "Past Meeting",
        meetingUrl: "https://zoom.us/j/789",
        meetingPlatform: "ZOOM",
        startTime: new Date(now - 7200000), // 2 hours ago
        endTime: new Date(now - 3600000), // 1 hour ago
        deduplicationKey: `key-past-${now}`,
        status: "COMPLETED",
        ...restOverrides,
      },
    })
  }

  /**
   * Create a recall bot
   * Ensures the calendar event exists before creating the bot
   */
  async createBot(
    calendarEventId: string,
    overrides?: Partial<RecallBot>,
  ): Promise<RecallBot> {
    // Verify calendar event exists (will throw if not)
    await this.prisma.calendarEvent.findUniqueOrThrow({
      where: { id: calendarEventId },
    })

    return this.prisma.recallBot.create({
      data: {
        id: `bot-${Date.now()}-${Math.floor(Math.random()*1_000_000)}`,
        calendarEventId,
        meetingUrl: "https://zoom.us/j/123456",
        meetingPlatform: "ZOOM",
        status: "SCHEDULED",
        leadTimeMinutes: 10,
        joinAt: new Date(Date.now() + 3000000),
        ...overrides,
      },
    })
  }

  /**
   * Create a connected account (OAuth)
   * Ensures the user exists before creating the connected account
   */
  async createConnectedAccount(
    userId: string,
    provider: "GOOGLE_CALENDAR" | "LINKEDIN" | "FACEBOOK",
    overrides?: Partial<ConnectedAccount>,
  ): Promise<ConnectedAccount> {
    // Extract relation fields from overrides to avoid conflicts
    const { userId: _userId, user: _user, ...restOverrides } = overrides || {}

    // Verify user exists (will throw if not)
    await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    })

    return this.prisma.connectedAccount.create({
      data: {
        userId,
        provider,
        providerAccountId: `provider-${Date.now()}`,
        label: `${provider} Account`,
        accessToken: "mock-access-token",
        refreshToken: "mock-refresh-token",
        expiresAt: new Date(Date.now() + 3600000),
        scopes: [],
        ...restOverrides,
      },
    })
  }

  /**
   * Create an automation
   * Ensures the user exists before creating the automation
   */
  async createAutomation(
    userId: string,
    overrides?: Partial<Automation>,
  ): Promise<Automation> {
    // Verify user exists (will throw if not)
    await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    })

    return this.prisma.automation.create({
      data: {
        userId,
        name: "Test Automation",
        channel: "LINKEDIN",
        promptTemplate: "Generate a post about: {{summary}}",
        isEnabled: true,
        ...overrides,
      },
    })
  }

  /**
   * Create meeting preferences
   * Ensures the user exists before creating the preference
   */
  async createMeetingPreference(
    userId: string,
    overrides?: Partial<MeetingPreference>,
  ): Promise<MeetingPreference> {
    // Extract relation fields from overrides to avoid conflicts
    const { userId: _userId, user: _user, ...restOverrides } = overrides || {}

    // Verify user exists (will throw if not)
    await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    })

    return this.prisma.meetingPreference.create({
      data: {
        userId,
        leadMinutes: 10,
        ...restOverrides,
      },
    })
  }
}
