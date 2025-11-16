export type SyncTriggerSource = "scheduler" | "manual" | "oauth"

export type AccountSyncResult = {
  accountId: string
  status: "synced" | "skipped" | "error"
  message?: string
}

export type CalendarSyncSummary = {
  success: boolean
  totalAccounts: number
  syncedAccounts: number
  skippedAccounts: number
  failedAccounts: Array<{
    accountId: string
    message: string
  }>
}
