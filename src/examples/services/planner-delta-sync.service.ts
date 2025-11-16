import { Injectable } from "@nestjs/common"
import { PrismaService } from "../../../prisma/prisma.service"
import { PlannerDeltaSyncDto } from "../dto/planner-delta-sync.dto"
import type {
  PlannerDeltaSyncPayload,
  PlannerEntry,
  PlannerEntryWithProject,
  FocusActivityType,
} from "../types/planner.types"

@Injectable()
export class PlannerDeltaSyncService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(dto: PlannerDeltaSyncDto) {
    const updatedSince = new Date(dto.updatedSince)

    const where: {
      userId: string
      OR: Array<{ createdAt: { gte: Date } } | { updatedAt: { gte: Date } }>
      date?: { gte: Date; lte: Date }
    } = {
      userId: dto.userId,
      OR: [
        { createdAt: { gte: updatedSince } },
        { updatedAt: { gte: updatedSince } },
      ],
    }

    if (dto.start && dto.end) {
      where.date = {
        gte: new Date(dto.start),
        lte: new Date(dto.end),
      }
    }

    return where
  }

  private toPlannerEntry(entry: PlannerEntryWithProject): PlannerEntry {
    const date = entry.date.toISOString().slice(0, 10)
    return {
      id: entry.id,
      userId: entry.userId,
      date,
      projectId: entry.projectId,
      projectName: entry.project.name,
      activityType: entry.activityType as FocusActivityType,
      hours: Number(entry.hours),
      description: entry.description,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    }
  }

  async getDeltaSync(
    dto: PlannerDeltaSyncDto,
  ): Promise<PlannerDeltaSyncPayload> {
    const where = this.buildWhere(dto)

    const entries = await this.prisma.plannerEntry.findMany({
      where,
      include: { project: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    })

    return {
      entries: entries.map((entry) => this.toPlannerEntry(entry)),
      deletedIds: [],
      serverTimestamp: new Date().toISOString(),
    }
  }
}
