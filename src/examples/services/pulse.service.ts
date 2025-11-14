import { Injectable } from "@nestjs/common"
import { subDays, startOfDay } from "date-fns"
import { PrismaService } from "../../../prisma/prisma.service"
import type { PulseResponse, PulseSpotlight } from "../types/pulse.types"
import type { PlannerEntryWithProject } from "../types/planner.types"
import { MOCK_EXPERIMENTS } from "../data/pulse.data"

@Injectable()
export class PulseService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma as PrismaService & {
      plannerEntry: {
        findMany: (...args: any[]) => Promise<PlannerEntryWithProject[]>
      }
      plannerProject: {
        findMany: (...args: any[]) => Promise<
          Array<{
            id: string
            name: string
            color: string
            defaultActivity: string
            blockedBy: string[] | null
            entries?: Array<{ hours: number }>
          }>
        >
      }
    }
  }

  async getPulse(): Promise<PulseResponse> {
    const lookbackStart = subDays(startOfDay(new Date()), 21)

    const recentEntries = await this.db.plannerEntry.findMany({
      where: { date: { gte: lookbackStart } },
      include: { project: true },
      orderBy: { date: "asc" },
    })

    const totalHours = recentEntries.reduce(
      (sum, entry) => sum + entry.hours,
      0,
    )
    const avgSessionLength =
      recentEntries.length > 0 ? totalHours / recentEntries.length : 0

    const contextSwitches = this.calculateContextSwitches(recentEntries)
    const spotlight = await this.buildSpotlight(lookbackStart)

    return {
      lastUpdated: new Date().toISOString(),
      summary: {
        focusHours: Number(totalHours.toFixed(1)),
        contextSwitches,
        avgSessionLength: Number(avgSessionLength.toFixed(1)),
        focusStreak: this.calculateFocusStreak(recentEntries),
      },
      spotlight,
      experiments: MOCK_EXPERIMENTS,
    }
  }

  private calculateContextSwitches(entries: PlannerEntryWithProject[]): number {
    const map = new Map<string, Set<string>>()
    for (const entry of entries) {
      const key = entry.date.toISOString().slice(0, 10)
      if (!map.has(key)) {
        map.set(key, new Set())
      }
      map.get(key)!.add(entry.projectId)
    }
    return Array.from(map.values()).reduce(
      (acc, projects) => acc + Math.max(0, projects.size - 1),
      0,
    )
  }

  private async buildSpotlight(lookbackStart: Date): Promise<PulseSpotlight[]> {
    const projects = await this.db.plannerProject.findMany({
      include: {
        entries: {
          where: { date: { gte: lookbackStart } },
          select: { hours: true },
        },
      },
    })

    return projects.map((project) => {
      const projectHours = (project.entries ?? []).reduce(
        (sum, entry) => sum + entry.hours,
        0,
      )
      const sentiment = Math.min(
        0.95,
        Number((0.6 + projectHours / 120).toFixed(2)),
      )
      const status =
        sentiment > 0.82 ? "ahead" : sentiment > 0.7 ? "on-track" : "at-risk"

      return {
        projectId: project.id,
        projectName: project.name,
        sentiment,
        status,
        blockers: project.blockedBy ?? [],
      }
    })
  }

  private calculateFocusStreak(entries: PlannerEntryWithProject[]): number {
    const totals = new Map<string, number>()
    for (const entry of entries) {
      const key = entry.date.toISOString().slice(0, 10)
      totals.set(key, (totals.get(key) ?? 0) + entry.hours)
    }

    const sortedDates = Array.from(totals.keys()).sort((a, b) =>
      a > b ? -1 : 1,
    )

    let streak = 0
    for (const date of sortedDates) {
      if ((totals.get(date) ?? 0) >= 4) {
        streak += 1
      } else {
        break
      }
    }
    return streak
  }
}




