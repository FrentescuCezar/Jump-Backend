import { Test, TestingModule } from "@nestjs/testing"
import { ConnectedAccountsController } from "./connected-accounts.controller"
import { ConnectedAccountsService } from "./connected-accounts.service"
import { ConnectedProvider } from "@prisma/client"

describe("ConnectedAccountsController", () => {
  let controller: ConnectedAccountsController
  let connectedAccountsService: ConnectedAccountsService

  const mockConnectedAccountsService = {
    listForUser: jest.fn(),
    disconnect: jest.fn(),
  }

  const mockUser = {
    id: "user-1",
    email: "test@example.com",
    name: "Test User",
    keycloakId: "keycloak-1",
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConnectedAccountsController],
      providers: [
        {
          provide: ConnectedAccountsService,
          useValue: mockConnectedAccountsService,
        },
      ],
    }).compile()

    controller = module.get<ConnectedAccountsController>(
      ConnectedAccountsController,
    )
    connectedAccountsService = module.get<ConnectedAccountsService>(
      ConnectedAccountsService,
    )

    jest.clearAllMocks()
  })

  describe("list", () => {
    it("should return list of connected accounts", async () => {
      const accounts = [
        {
          id: "account-1",
          provider: ConnectedProvider.GOOGLE_CALENDAR,
          label: "Google Calendar",
          scopes: ["calendar.readonly"],
          metadata: { email: "user@gmail.com" },
          expiresAt: null,
          linkedAt: new Date().toISOString(),
          lastSyncedAt: null,
        },
      ]

      ;(mockConnectedAccountsService.listForUser as jest.Mock).mockResolvedValue(
        accounts,
      )

      const result = await controller.list(mockUser as any)

      expect(result).toEqual(accounts)
      expect(mockConnectedAccountsService.listForUser).toHaveBeenCalledWith(
        mockUser.id,
      )
    })
  })

  describe("disconnect", () => {
    it("should disconnect account", async () => {
      ;(mockConnectedAccountsService.disconnect as jest.Mock).mockResolvedValue(
        undefined,
      )

      const result = await controller.disconnect("account-1", mockUser as any)

      expect(result.success).toBe(true)
      expect(mockConnectedAccountsService.disconnect).toHaveBeenCalledWith(
        "account-1",
        mockUser.id,
      )
    })
  })
})

