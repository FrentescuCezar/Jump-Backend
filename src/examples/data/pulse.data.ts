import type { PulseExperiment } from "../types/pulse.types"

export const MOCK_EXPERIMENTS: PulseExperiment[] = [
  {
    id: "exp-bundler",
    title: "Edge bundler warm cache",
    owner: "Alex Lee",
    eta: "2025-03-12",
    confidence: 0.78,
    impact: "Shaves 35 ms from first byte for client routes",
  },
  {
    id: "exp-calendar",
    title: "Offline calendar queue",
    owner: "Priya Natarajan",
    eta: "2025-02-28",
    confidence: 0.64,
    impact: "Prevents duplicate timesheet posts on flaky Wi-Fi",
  },
  {
    id: "exp-search",
    title: "Vectorised catalog search",
    owner: "Matei Dragomir",
    eta: "2025-03-05",
    confidence: 0.71,
    impact: "Cuts project lookup time by 45%",
  },
]
