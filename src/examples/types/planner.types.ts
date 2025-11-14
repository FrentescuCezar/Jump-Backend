export type FocusActivityType = "deep-work" | "review" | "support"

export interface PlannerProject {
  id: string
  name: string
  color: string
  defaultActivity: FocusActivityType
  blockedBy?: string[]
}

export interface PlannerTemplate {
  id: string
  name: string
  icon: string
  projectId: string
  activityType: FocusActivityType
  hours: number
  description: string
}

export interface PlannerEntry {
  id: string
  userId: string
  date: string
  projectId: string
  projectName: string
  activityType: FocusActivityType
  hours: number
  description: string
  createdAt: string
  updatedAt: string
}

export interface PlannerEntriesPayload {
  range: { start: string; end: string }
  entries: PlannerEntry[]
  totals: {
    totalHours: number
    daysWithEntries: number
  }
  serverTimestamp: string
}

export interface PlannerProjectsPayload {
  projects: PlannerProject[]
  templates: PlannerTemplate[]
  serverTimestamp: string
}

export interface PlannerDeltaSyncPayload {
  entries: PlannerEntry[]
  deletedIds: string[]
  serverTimestamp: string
}

export type PlannerEntryWithProject = {
  id: string
  userId: string
  date: Date
  projectId: string
  activityType: string
  hours: number
  description: string
  createdAt: Date
  updatedAt: Date
  project: {
    id: string
    name: string
    color: string
    defaultActivity: string
    blockedBy?: string[] | null
  }
}
