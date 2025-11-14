import { ConnectedProvider } from "@prisma/client"

export class ConnectedAccountDto {
  id: string
  provider: ConnectedProvider
  label?: string | null
  scopes: string[]
  metadata?: Record<string, unknown> | null
  expiresAt?: string | null
  linkedAt: string
  lastSyncedAt?: string | null
}
