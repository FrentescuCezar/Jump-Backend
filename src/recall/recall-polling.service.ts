import { Injectable, Logger } from "@nestjs/common"
import { Cron } from "@nestjs/schedule"
import { RecallBotStatus } from "@prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import { RecallService } from "./recall.service"

@Injectable()
export class RecallPollingService {
  private readonly logger = new Logger(RecallPollingService.name)
  private readonly batchSize: number

  constructor(
    private readonly prisma: PrismaService,
    private readonly recallService: RecallService,
  ) {
    this.batchSize = Number(process.env.RECALL_POLL_BATCH_SIZE ?? 25)
  }

  @Cron("*/15 * * * * *")
  async pollActiveBots() {
    const bots = await this.prisma.recallBot.findMany({
      where: {
        status: {
          in: [
            RecallBotStatus.SCHEDULED,
            RecallBotStatus.JOINING,
            RecallBotStatus.IN_CALL,
          ],
        },
      },
      orderBy: { createdAt: "asc" },
      take: this.batchSize,
    })

    for (const bot of bots) {
      try {
        await this.recallService.pollBotStatus(bot)
      } catch (error) {
        this.logger.warn(
          `Failed to poll bot ${bot.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }
  }
}
