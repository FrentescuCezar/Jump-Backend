import { Injectable, NotFoundException } from "@nestjs/common"
import { ConnectedAccount, ConnectedProvider, Prisma } from "@prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import { ConnectedAccountDto } from "./dto/connected-account.dto"

@Injectable()
export class ConnectedAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string): Promise<ConnectedAccountDto[]> {
    const accounts = await this.prisma.connectedAccount.findMany({
      where: { userId },
      orderBy: { linkedAt: "desc" },
    })

    return accounts.map((account) => this.toDto(account))
  }

  async getById(id: string, userId: string) {
    const account = await this.prisma.connectedAccount.findUnique({
      where: { id },
    })
    if (!account || account.userId !== userId) {
      throw new NotFoundException("Connected account not found")
    }
    return account
  }

  async findById(id: string) {
    return this.prisma.connectedAccount.findUnique({
      where: { id },
    })
  }

  async findLatestByProvider(userId: string, provider: ConnectedProvider) {
    return this.prisma.connectedAccount.findFirst({
      where: { userId, provider },
      orderBy: { linkedAt: "desc" },
    })
  }

  async upsertAccount(
    userId: string,
    provider: ConnectedProvider,
    providerAccountId: string,
    data: {
      label?: string | null
      scopes?: string[]
      accessToken?: string | null
      refreshToken?: string | null
      expiresAt?: Date | null
      metadata?: Prisma.InputJsonValue | null
      linkedAt?: Date
    },
  ) {
    const account = await this.prisma.connectedAccount.upsert({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId,
        },
      },
      create: {
        userId,
        provider,
        providerAccountId,
        label: data.label ?? null,
        scopes: data.scopes ?? [],
        accessToken: data.accessToken ?? null,
        refreshToken: data.refreshToken ?? null,
        expiresAt: data.expiresAt ?? null,
        metadata: data.metadata ?? Prisma.JsonNull,
        linkedAt: data.linkedAt ?? new Date(),
      },
      update: {
        label: data.label ?? null,
        scopes: data.scopes ? { set: data.scopes } : undefined,
        accessToken: data.accessToken ?? null,
        refreshToken: data.refreshToken ?? null,
        expiresAt: data.expiresAt ?? null,
        metadata: data.metadata ?? Prisma.JsonNull,
        lastSyncedAt: data.linkedAt ?? undefined,
        user: {
          connect: { id: userId },
        },
      },
    })

    return account
  }

  async disconnect(id: string, userId: string) {
    await this.getById(id, userId)
    await this.prisma.connectedAccount.delete({
      where: { id },
    })
  }

  private toDto(account: ConnectedAccount): ConnectedAccountDto {
    return {
      id: account.id,
      provider: account.provider,
      label: account.label,
      scopes: account.scopes ?? [],
      metadata: (account.metadata as Record<string, unknown>) ?? null,
      expiresAt: account.expiresAt ? account.expiresAt.toISOString() : null,
      linkedAt: account.linkedAt.toISOString(),
      lastSyncedAt: account.lastSyncedAt
        ? account.lastSyncedAt.toISOString()
        : null,
    }
  }
}
