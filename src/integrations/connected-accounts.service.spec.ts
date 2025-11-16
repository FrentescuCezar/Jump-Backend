import { Test, TestingModule } from "@nestjs/testing"
import { NotFoundException } from "@nestjs/common"
import { ConnectedAccountsService } from "./connected-accounts.service"
import { PrismaService } from "../../prisma/prisma.service"
import { ConnectedProvider } from "@prisma/client"
import { createMockPrisma } from "../../test/helpers/mocks.helper"

describe("ConnectedAccountsService", () => {
  let service: ConnectedAccountsService
  let prisma: PrismaService

  const mockPrisma = createMockPrisma()

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectedAccountsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile()

    service = module.get<ConnectedAccountsService>(ConnectedAccountsService)
    prisma = module.get<PrismaService>(PrismaService)

    jest.clearAllMocks()
  })

  describe("listForUser", () => {
    it("should return list of connected accounts", async () => {
      const userId = "user-1"
      const accounts = [
        {
          id: "account-1",
          userId,
          provider: ConnectedProvider.GOOGLE_CALENDAR,
          providerAccountId: "user@gmail.com",
          label: "Google Calendar",
          scopes: ["calendar.readonly"],
          accessToken: "token-123",
          refreshToken: "refresh-123",
          expiresAt: new Date(),
          metadata: { email: "user@gmail.com" },
          linkedAt: new Date(),
          lastSyncedAt: new Date(),
        },
      ]

      ;(mockPrisma.connectedAccount.findMany as jest.Mock).mockResolvedValue(
        accounts,
      )

      const result = await service.listForUser(userId)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("account-1")
      expect(result[0].provider).toBe(ConnectedProvider.GOOGLE_CALENDAR)
    })
  })

  describe("getById", () => {
    it("should return account if found and belongs to user", async () => {
      const accountId = "account-1"
      const userId = "user-1"
      const account = {
        id: accountId,
        userId,
        provider: ConnectedProvider.GOOGLE_CALENDAR,
      }

      ;(mockPrisma.connectedAccount.findUnique as jest.Mock).mockResolvedValue(
        account,
      )

      const result = await service.getById(accountId, userId)

      expect(result).toEqual(account)
    })

    it("should throw NotFoundException if account not found", async () => {
      ;(mockPrisma.connectedAccount.findUnique as jest.Mock).mockResolvedValue(
        null,
      )

      await expect(service.getById("invalid-id", "user-1")).rejects.toThrow(
        NotFoundException,
      )
    })

    it("should throw NotFoundException if account belongs to different user", async () => {
      const account = {
        id: "account-1",
        userId: "other-user",
        provider: ConnectedProvider.GOOGLE_CALENDAR,
      }

      ;(mockPrisma.connectedAccount.findUnique as jest.Mock).mockResolvedValue(
        account,
      )

      await expect(service.getById("account-1", "user-1")).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe("findById", () => {
    it("should return account if found", async () => {
      const account = {
        id: "account-1",
        provider: ConnectedProvider.GOOGLE_CALENDAR,
      }

      ;(mockPrisma.connectedAccount.findUnique as jest.Mock).mockResolvedValue(
        account,
      )

      const result = await service.findById("account-1")

      expect(result).toEqual(account)
    })
  })

  describe("findLatestByProvider", () => {
    it("should return latest account for provider", async () => {
      const userId = "user-1"
      const account = {
        id: "account-1",
        userId,
        provider: ConnectedProvider.GOOGLE_CALENDAR,
        linkedAt: new Date(),
      }

      ;(mockPrisma.connectedAccount.findFirst as jest.Mock).mockResolvedValue(
        account,
      )

      const result = await service.findLatestByProvider(
        userId,
        ConnectedProvider.GOOGLE_CALENDAR,
      )

      expect(result).toEqual(account)
    })
  })

  describe("upsertAccount", () => {
    it("should create new account if not exists", async () => {
      const userId = "user-1"
      const accountData = {
        label: "Google Calendar",
        scopes: ["calendar.readonly"],
        accessToken: "token-123",
        refreshToken: "refresh-123",
        expiresAt: new Date(),
        metadata: { email: "user@gmail.com" },
        linkedAt: new Date(),
      }
      const createdAccount = {
        id: "account-1",
        userId,
        provider: ConnectedProvider.GOOGLE_CALENDAR,
        providerAccountId: "user@gmail.com",
        ...accountData,
      }

      ;(mockPrisma.connectedAccount.upsert as jest.Mock).mockResolvedValue(
        createdAccount,
      )

      const result = await service.upsertAccount(
        userId,
        ConnectedProvider.GOOGLE_CALENDAR,
        "user@gmail.com",
        accountData,
      )

      expect(result).toEqual(createdAccount)
      expect(mockPrisma.connectedAccount.upsert).toHaveBeenCalled()
    })

    it("should update existing account if exists", async () => {
      const userId = "user-1"
      const accountData = {
        label: "Updated Label",
        scopes: ["calendar.readonly"],
        accessToken: "new-token",
      }
      const updatedAccount = {
        id: "account-1",
        userId,
        provider: ConnectedProvider.GOOGLE_CALENDAR,
        providerAccountId: "user@gmail.com",
        ...accountData,
      }

      ;(mockPrisma.connectedAccount.upsert as jest.Mock).mockResolvedValue(
        updatedAccount,
      )

      const result = await service.upsertAccount(
        userId,
        ConnectedProvider.GOOGLE_CALENDAR,
        "user@gmail.com",
        accountData,
      )

      expect(result).toEqual(updatedAccount)
    })
  })

  describe("disconnect", () => {
    it("should delete account if found and belongs to user", async () => {
      const accountId = "account-1"
      const userId = "user-1"
      const account = {
        id: accountId,
        userId,
        provider: ConnectedProvider.GOOGLE_CALENDAR,
      }

      ;(mockPrisma.connectedAccount.findUnique as jest.Mock).mockResolvedValue(
        account,
      )
      ;(mockPrisma.connectedAccount.delete as jest.Mock).mockResolvedValue(
        account,
      )

      await service.disconnect(accountId, userId)

      expect(mockPrisma.connectedAccount.delete).toHaveBeenCalledWith({
        where: { id: accountId },
      })
    })

    it("should throw NotFoundException if account not found", async () => {
      ;(mockPrisma.connectedAccount.findUnique as jest.Mock).mockResolvedValue(
        null,
      )

      await expect(service.disconnect("invalid-id", "user-1")).rejects.toThrow(
        NotFoundException,
      )
    })
  })
})

