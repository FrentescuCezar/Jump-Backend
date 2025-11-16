import { Test, TestingModule } from "@nestjs/testing"
import { AutomationsController } from "./automations.controller"
import { AutomationsService } from "./automations.service"
import { SocialChannel } from "@prisma/client"

describe("AutomationsController", () => {
  let controller: AutomationsController
  let automationsService: AutomationsService

  const mockAutomationsService = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  }

  const mockUser = {
    id: "user-1",
    email: "test@example.com",
    name: "Test User",
    keycloakId: "keycloak-1",
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AutomationsController],
      providers: [
        {
          provide: AutomationsService,
          useValue: mockAutomationsService,
        },
      ],
    }).compile()

    controller = module.get<AutomationsController>(AutomationsController)
    automationsService = module.get<AutomationsService>(AutomationsService)

    jest.clearAllMocks()
  })

  describe("list", () => {
    it("should return list of automations", async () => {
      const automations = [
        {
          id: "auto-1",
          name: "LinkedIn Automation",
          channel: SocialChannel.LINKEDIN,
          isEnabled: true,
        },
      ]

      ;(mockAutomationsService.list as jest.Mock).mockResolvedValue(automations)

      const result = await controller.list(mockUser as any)

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe("LinkedIn Automation")
      expect(mockAutomationsService.list).toHaveBeenCalledWith(mockUser.id)
    })
  })

  describe("create", () => {
    it("should create new automation", async () => {
      const dto = {
        name: "New Automation",
        channel: SocialChannel.LINKEDIN,
        promptTemplate: "Create a post",
        isEnabled: true,
      }
      const automation = {
        id: "auto-1",
        ...dto,
        userId: mockUser.id,
        createdAt: new Date(),
      }

      ;(mockAutomationsService.create as jest.Mock).mockResolvedValue(automation)

      const result = await controller.create(mockUser as any, dto)

      expect(result.name).toBe("New Automation")
      expect(mockAutomationsService.create).toHaveBeenCalledWith(
        mockUser.id,
        dto,
      )
    })
  })

  describe("update", () => {
    it("should update existing automation", async () => {
      const dto = {
        name: "Updated Automation",
      }
      const automation = {
        id: "auto-1",
        name: "Updated Automation",
        channel: SocialChannel.LINKEDIN,
        isEnabled: true,
      }

      ;(mockAutomationsService.update as jest.Mock).mockResolvedValue(automation)

      const result = await controller.update("auto-1", mockUser as any, dto)

      expect(result.name).toBe("Updated Automation")
      expect(mockAutomationsService.update).toHaveBeenCalledWith(
        "auto-1",
        mockUser.id,
        dto,
      )
    })
  })
})

