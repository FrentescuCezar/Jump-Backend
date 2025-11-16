import { Injectable } from "@nestjs/common"
import { AppError } from "../../errors/app-error"
import { ErrorCodes, FieldErrorCodes } from "../../errors/error-codes"
import { PrismaService } from "../../../prisma/prisma.service"
import { PlannerRangeDto } from "../dto/planner-range.dto"
import { CreatePlannerEntryDto } from "../dto/create-planner-entry.dto"
import type {
  PlannerEntry,
  PlannerEntriesPayload,
  PlannerProjectsPayload,
  PlannerEntryWithProject,
  FocusActivityType,
} from "../types/planner.types"

@Injectable()
export class PlannerService {
  private readonly activityTypes: FocusActivityType[] = [
    "deep-work",
    "review",
    "support",
  ]

  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma as PrismaService & {
      plannerEntry: {
        findMany: (...args: any[]) => Promise<PlannerEntryWithProject[]>
        create: (...args: any[]) => Promise<PlannerEntryWithProject>
      }
      plannerProject: {
        findMany: (...args: any[]) => Promise<
          Array<{
            id: string
            name: string
            color: string
            defaultActivity: string
            blockedBy: string[] | null
          }>
        >
        findUnique: (...args: any[]) => Promise<{
          id: string
          name: string
          color: string
          defaultActivity: string
          blockedBy: string[] | null
        } | null>
      }
      plannerTemplate: {
        findMany: (...args: any[]) => Promise<
          Array<{
            id: string
            name: string
            icon: string
            projectId: string
            activityType: string
            hours: number
            description: string
          }>
        >
      }
    }
  }

  async getPlannerEntries(
    dto: PlannerRangeDto,
  ): Promise<PlannerEntriesPayload> {
    const startDate = new Date(dto.start)
    const endDate = new Date(dto.end)

    const entries = await this.db.plannerEntry.findMany({
      where: {
        userId: dto.userId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: { project: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    })

    const serialized = entries.map((entry) => this.toPlannerEntry(entry))
    const daysWithEntries = new Set(serialized.map((entry) => entry.date)).size
    const totalHours = serialized.reduce((sum, entry) => sum + entry.hours, 0)

    return {
      range: {
        start: dto.start.slice(0, 10),
        end: dto.end.slice(0, 10),
      },
      entries: serialized,
      totals: {
        totalHours: Number(totalHours.toFixed(1)),
        daysWithEntries,
      },
      serverTimestamp: new Date().toISOString(),
    }
  }

  async createPlannerEntry(dto: CreatePlannerEntryDto) {
    const project = await this.db.plannerProject.findUnique({
      where: { id: dto.projectId },
    })

    if (!project) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        params: { resource: "Project" },
      })
    }

    if (!this.activityTypes.includes(dto.activityType)) {
      throw new AppError(ErrorCodes.VALIDATION, {
        fields: [{ field: "activityType", code: FieldErrorCodes.INVALID }],
      })
    }

    const entry = await this.db.plannerEntry.create({
      data: {
        userId: dto.userId,
        date: new Date(dto.date),
        projectId: dto.projectId,
        activityType: dto.activityType,
        hours: Number(dto.hours),
        description: dto.description,
      },
      include: { project: true },
    })

    return {
      entry: this.toPlannerEntry(entry),
      serverTimestamp: new Date().toISOString(),
    }
  }

  async getPlannerProjects(): Promise<PlannerProjectsPayload> {
    const [projects, templates] = await Promise.all([
      this.db.plannerProject.findMany({
        orderBy: { name: "asc" },
      }),
      this.db.plannerTemplate.findMany({
        orderBy: { name: "asc" },
      }),
    ])

    return {
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        color: project.color,
        defaultActivity: project.defaultActivity as FocusActivityType,
        blockedBy: project.blockedBy ?? [],
      })),
      templates: templates.map((template) => ({
        id: template.id,
        name: template.name,
        icon: template.icon,
        projectId: template.projectId,
        activityType: template.activityType as FocusActivityType,
        hours: template.hours,
        description: template.description,
      })),
      serverTimestamp: new Date().toISOString(),
    }
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
}
