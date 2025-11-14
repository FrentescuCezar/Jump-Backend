export interface PulseSpotlight {
  projectId: string
  projectName: string
  sentiment: number
  status: "ahead" | "on-track" | "at-risk"
  blockers: string[]
}

export interface PulseExperiment {
  id: string
  title: string
  owner: string
  eta: string
  confidence: number
  impact: string
}

export interface PulseResponse {
  lastUpdated: string
  summary: {
    focusHours: number
    contextSwitches: number
    avgSessionLength: number
    focusStreak: number
  }
  spotlight: PulseSpotlight[]
  experiments: PulseExperiment[]
}




