import { Injectable, Logger, OnModuleInit } from "@nestjs/common"
import { subDays } from "date-fns"
import { Prisma } from "@prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library"

@Injectable()
export class ExamplesSeedService implements OnModuleInit {
  private readonly logger = new Logger(ExamplesSeedService.name)

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Wait a bit for PrismaService to establish connection
    await this.waitForDatabase()
    await this.ensureSeedData()
  }

  private async waitForDatabase(maxRetries = 10, baseDelay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Try a simple query to verify connection
        await this.prisma.$queryRaw`SELECT 1`
        this.logger.debug("Database connection verified")
        return
      } catch (error) {
        if (attempt === maxRetries) {
          this.logger.error(
            `Failed to connect to database after ${maxRetries} attempts. ` +
              "Please check your DATABASE_URL and ensure the database is accessible.",
          )
          throw error
        }
        const delay = baseDelay * Math.pow(2, attempt - 1)
        this.logger.debug(
          `Database connection attempt ${attempt}/${maxRetries} failed. Retrying in ${delay}ms...`,
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  private async ensureSeedData() {
    await this.seedPlannerExample()
    await this.seedChatExample()
  }

  private async seedPlannerExample() {
    try {
      const hasProjects = await this.prisma.plannerProject.count()
      if (hasProjects > 0) {
        return
      }
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === "P1001") {
          this.logger.error(
            "Cannot reach database server. Please check:\n" +
              "1. DATABASE_URL is correctly set\n" +
              "2. Database server is running and accessible\n" +
              "3. Network connectivity (firewall, VPN, etc.)\n" +
              "4. SSL mode is set correctly (sslmode=require for Supabase)",
          )
      }
      throw error
    }

    this.logger.log("Seeding planner example data…")

    try {
      const [designSystem, mobileApp, aiCopilot] = await Promise.all([
        this.prisma.plannerProject.create({
          data: {
            name: "Design System 2.0",
            color: "#2563eb",
            defaultActivity: "deep-work",
            blockedBy: ["Awaiting audit on typography tokens"],
          },
        }),
        this.prisma.plannerProject.create({
          data: {
            name: "Mobile Experience",
            color: "#059669",
            defaultActivity: "review",
            blockedBy: ["Push notification reliability"],
          },
        }),
        this.prisma.plannerProject.create({
          data: {
            name: "AI Copilot",
            color: "#c026d3",
            defaultActivity: "deep-work",
            blockedBy: ["Latency spikes on summariser"],
          },
        }),
      ])

      await this.prisma.plannerTemplate.createMany({
        data: [
          {
            name: "Deep focus",
            icon: "TimerReset",
            projectId: aiCopilot.id,
            activityType: "deep-work",
            hours: 3,
            description: "Heads-down experimentation on copilots",
          },
          {
            name: "Review loop",
            icon: "Redo2",
            projectId: designSystem.id,
            activityType: "review",
            hours: 1.5,
            description: "Async review of token proposals",
          },
          {
            name: "Support window",
            icon: "LifeBuoy",
            projectId: mobileApp.id,
            activityType: "support",
            hours: 2,
            description: "Partner hand-offs + QA triage",
          },
        ],
      })

      const projects = [designSystem, mobileApp, aiCopilot]
      const users = ["usr_demo_a", "usr_demo_b"]
      const today = new Date()

      await Promise.all(
        Array.from({ length: 24 }).map(async (_item, index) => {
          const date = subDays(today, index)
          const project = projects[index % projects.length]
          const userId = users[index % users.length]
          const hours = 1 + ((index * 37) % 4)
          const activity =
            index % 3 === 0
              ? "deep-work"
              : index % 3 === 1
                ? "review"
                : "support"

          await this.prisma.plannerEntry.create({
            data: {
              userId,
              date,
              projectId: project.id,
              activityType: activity,
              hours,
              description: `Focus block on ${project.name} (${activity})`,
            },
          })
        }),
      )

      this.logger.log("Successfully seeded planner example data")
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === "P1001") {
          this.logger.error(
            "Database connection error during seeding. Please check:\n" +
              "1. DATABASE_URL is correctly set\n" +
              "2. Database server is running and accessible\n" +
              "3. Network connectivity (firewall, VPN, etc.)\n" +
              "4. SSL mode is set correctly (sslmode=require for Supabase)",
          )
        }
      this.logger.error("Failed to seed planner example data", error)
      throw error
    }
  }

  private async seedChatExample() {
    try {
      const hasRooms = await this.prisma.chatRoom.count()
      if (hasRooms > 0) {
        return
      }
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === "P1001") {
        this.logger.error(
          "Cannot reach database server for chat seed. Please verify DATABASE_URL and connectivity.",
        )
      }
      throw error
    }

    this.logger.log("Seeding chat example data…")

    try {
      const [dailySync, releaseWatch] = await Promise.all([
        this.prisma.chatRoom.create({
          data: {
            slug: "daily-sync",
            name: "Daily Sync",
            description: "Morning check-in for the platform trio.",
            theme: "#2563eb",
            participants: ["usr_demo_a", "usr_demo_b", "usr_demo_c"],
          },
        }),
        this.prisma.chatRoom.create({
          data: {
            slug: "release-watch",
            name: "Release Watch",
            description: "Escalations channel while the rollout is live.",
            theme: "#ea580c",
            participants: ["usr_demo_a", "usr_demo_b"],
          },
        }),
      ])

      const firstDailyMessage = await this.prisma.chatMessage.create({
        data: {
          roomId: dailySync.id,
          senderId: "usr_demo_a",
          senderName: "Nora Mayer",
          body: "Need someone to cover EU standup while I'm out tomorrow.",
        },
      })

      await this.prisma.chatMessage.createMany({
        data: [
          {
            roomId: dailySync.id,
            senderId: "usr_demo_b",
            senderName: "Ibrahim Costa",
            body: "I can cover. Will sync with Matei on the retro notes.",
          },
          {
            roomId: dailySync.id,
            senderId: "usr_demo_c",
            senderName: "Matei Dragomir",
            body: "Thanks both! I'll upload the notes to Confluence so you have context.",
          },
          {
            roomId: releaseWatch.id,
            senderId: "usr_demo_b",
            senderName: "Ibrahim Costa",
            body: "Latency holding at P95 480 ms. Watching Grafana for another 30 minutes.",
          },
          {
            roomId: releaseWatch.id,
            senderId: "usr_demo_a",
            senderName: "Nora Mayer",
            body: "Copy that. PagerDuty silence expires at :45, please extend if needed.",
          },
        ],
      })

      await this.prisma.notification.createMany({
        data: [
          {
            userId: "usr_demo_b",
            type: "chat:new-message",
            title: "Need a standup cover",
            body: `${firstDailyMessage.senderName}: ${firstDailyMessage.body}`,
            roomSlug: dailySync.slug,
            messageId: firstDailyMessage.id,
            payload: {
              roomSlug: dailySync.slug,
              senderName: firstDailyMessage.senderName,
              preview: firstDailyMessage.body,
            } as Prisma.JsonObject,
          },
          {
            userId: "usr_demo_c",
            type: "chat:new-message",
            title: "Release war-room update",
            body: "Ibrahim Costa: Latency holding at P95 480 ms. Watching Grafana for another 30 minutes.",
            roomSlug: releaseWatch.slug,
            messageId: null,
            payload: {
              roomSlug: releaseWatch.slug,
              senderName: "Ibrahim Costa",
              preview: "Latency holding at P95 480 ms…",
            } as Prisma.JsonObject,
          },
        ],
      })

      this.logger.log("Successfully seeded chat example data")
    } catch (error) {
      this.logger.error("Failed to seed chat example data", error as Error)
      throw error
    }
  }
}
