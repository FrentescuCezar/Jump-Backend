import { PlannerEntry, PlannerProject } from "@prisma/client"

export type PlannerEntryWithProject = PlannerEntry & {
  project: PlannerProject
}

