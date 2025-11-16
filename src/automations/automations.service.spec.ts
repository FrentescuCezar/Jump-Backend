import { Test, TestingModule } from "@nestjs/testing"
import { AutomationsService } from "./automations.service"
import { PrismaService } from "../../prisma/prisma.service"
import { SocialChannel } from "@prisma/client"
import { createMockPrisma } from "../../test/helpers/mocks.helper"
import { AppError } from "../errors/app-error"
import { ErrorCodes } from "../errors/error-codes"

describe("AutomationsService", () => {
  let service: AutomationsService
  let prisma: PrismaService

  const mockPrisma = createMockPrisma()

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutomationsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile()

    service = module.get<AutomationsService>(AutomationsService)
    prisma = module.get<PrismaService>(PrismaService)

    jest.clearAllMocks()
  })

  describe("list", () => {
    it("should return automations for user", async () => {
      const userId = "user-1"
      const automations = [
        {
          id: "auto-1",
          userId,
          name: "LinkedIn Automation",
          channel: SocialChannel.LINKEDIN,
          promptTemplate: "Create a post",
          isEnabled: true,
          createdAt: new Date(),
        },
        {
          id: "auto-2",
          userId,
          name: "Facebook Automation",
          channel: SocialChannel.FACEBOOK,
          promptTemplate: "Create a post",
          isEnabled: false,
          createdAt: new Date(),
        },
      ]

      ;(mockPrisma.automation.findMany as jest.Mock).mockResolvedValue(
        automations,
      )

      const result = await service.list(userId)

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe("LinkedIn Automation")
      expect(mockPrisma.automation.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: "desc" },
      })
    })
  })

  describe("create", () => {
    it("should create new automation", async () => {
      const userId = "user-1"
      const dto = {
        name: "New Automation",
        channel: SocialChannel.LINKEDIN,
        promptTemplate: "Create a post about {{summary}}",
        isEnabled: true,
      }
      const automation = {
        id: "auto-1",
        userId,
        ...dto,
        config: null,
        createdAt: new Date(),
      }

      ;(mockPrisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = mockPrisma
          return callback(tx)
        },
      )
      ;(mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      })
      ;(mockPrisma.automation.create as jest.Mock).mockResolvedValue(
        automation,
      )

      const result = await service.create(userId, dto)

      expect(result.name).toBe("New Automation")
      expect(result.channel).toBe(SocialChannel.LINKEDIN)
      expect(mockPrisma.automation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          name: dto.name,
          channel: dto.channel,
          promptTemplate: dto.promptTemplate,
          isEnabled: dto.isEnabled,
        }),
      })
    })

    it("should disable other automations for same channel when enabling new one", async () => {
      const userId = "user-1"
      const dto = {
        name: "New Automation",
        channel: SocialChannel.LINKEDIN,
        promptTemplate: "Create a post",
        isEnabled: true,
      }
      const automation = {
        id: "auto-1",
        userId,
        ...dto,
        config: null,
        createdAt: new Date(),
      }

      ;(mockPrisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = mockPrisma
          return callback(tx)
        },
      )
      ;(mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({
        count: 2,
      })
      ;(mockPrisma.automation.create as jest.Mock).mockResolvedValue(
        automation,
      )

      await service.create(userId, dto)

      expect(mockPrisma.automation.updateMany).toHaveBeenCalledWith({
        where: {
          userId,
          channel: SocialChannel.LINKEDIN,
        },
        data: { isEnabled: false },
      })
    })

    it("should use default channel when not provided", async () => {
      const userId = "user-1"
      const dto = {
        name: "New Automation",
        promptTemplate: "Create a post",
      }
      const automation = {
        id: "auto-1",
        userId,
        ...dto,
        channel: SocialChannel.LINKEDIN,
        isEnabled: true,
        config: null,
        createdAt: new Date(),
      }

      ;(mockPrisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = mockPrisma
          return callback(tx)
        },
      )
      ;(mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      })
      ;(mockPrisma.automation.create as jest.Mock).mockResolvedValue(
        automation,
      )

      const result = await service.create(userId, dto)

      expect(result.channel).toBe(SocialChannel.LINKEDIN)
    })
  })

  describe("update", () => {
    it("should update existing automation", async () => {
      const automationId = "auto-1"
      const userId = "user-1"
      const existingAutomation = {
        id: automationId,
        userId,
        name: "Old Name",
        channel: SocialChannel.LINKEDIN,
        promptTemplate: "Old template",
        isEnabled: true,
      }
      const dto = {
        name: "Updated Name",
        promptTemplate: "Updated template",
      }
      const updatedAutomation = {
        ...existingAutomation,
        ...dto,
      }

      ;(mockPrisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = mockPrisma
          return callback(tx)
        },
      )
      ;(mockPrisma.automation.findUnique as jest.Mock).mockResolvedValue(
        existingAutomation,
      )
      ;(mockPrisma.automation.update as jest.Mock).mockResolvedValue(
        updatedAutomation,
      )
      ;(mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      })

      const result = await service.update(automationId, userId, dto)

      expect(result.name).toBe("Updated Name")
      expect(result.promptTemplate).toBe("Updated template")
      expect(mockPrisma.automation.update).toHaveBeenCalledWith({
        where: { id: automationId },
        data: expect.objectContaining({
          name: dto.name,
          promptTemplate: dto.promptTemplate,
        }),
      })
    })

    it("should throw NotFoundException for non-existent automation", async () => {
      const automationId = "non-existent"
      const userId = "user-1"
      const dto = {
        name: "Updated Name",
      }

      ;(mockPrisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = mockPrisma
          return callback(tx)
        },
      )
      ;(mockPrisma.automation.findUnique as jest.Mock).mockResolvedValue(null)

      await expect(
        service.update(automationId, userId, dto),
      ).rejects.toThrow(AppError)
    })

    it("should throw NotFoundException for automation owned by different user", async () => {
      const automationId = "auto-1"
      const userId = "user-1"
      const existingAutomation = {
        id: automationId,
        userId: "user-2",
        name: "Other User's Automation",
        channel: SocialChannel.LINKEDIN,
        promptTemplate: "Template",
        isEnabled: true,
      }
      const dto = {
        name: "Updated Name",
      }

      ;(mockPrisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = mockPrisma
          return callback(tx)
        },
      )
      ;(mockPrisma.automation.findUnique as jest.Mock).mockResolvedValue(
        existingAutomation,
      )

      await expect(
        service.update(automationId, userId, dto),
      ).rejects.toThrow(AppError)
    })

    it("should disable other automations when enabling updated one", async () => {
      const automationId = "auto-1"
      const userId = "user-1"
      const existingAutomation = {
        id: automationId,
        userId,
        name: "Automation",
        channel: SocialChannel.LINKEDIN,
        promptTemplate: "Template",
        isEnabled: false,
      }
      const dto = {
        isEnabled: true,
      }

      ;(mockPrisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = mockPrisma
          return callback(tx)
        },
      )
      ;(mockPrisma.automation.findUnique as jest.Mock).mockResolvedValue(
        existingAutomation,
      )
      ;(mockPrisma.automation.update as jest.Mock).mockResolvedValue({
        ...existingAutomation,
        isEnabled: true,
      })
      ;(mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      })

      await service.update(automationId, userId, dto)

      expect(mockPrisma.automation.updateMany).toHaveBeenCalledWith({
        where: {
          userId,
          channel: SocialChannel.LINKEDIN,
          NOT: { id: automationId },
        },
        data: { isEnabled: false },
      })
    })

    it("should update channel and disable other automations for new channel", async () => {
      const automationId = "auto-1"
      const userId = "user-1"
      const existingAutomation = {
        id: automationId,
        userId,
        name: "Automation",
        channel: SocialChannel.LINKEDIN,
        promptTemplate: "Template",
        isEnabled: true,
      }
      const dto = {
        channel: SocialChannel.FACEBOOK,
        isEnabled: true,
      }

      ;(mockPrisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = mockPrisma
          return callback(tx)
        },
      )
      ;(mockPrisma.automation.findUnique as jest.Mock).mockResolvedValue(
        existingAutomation,
      )
      ;(mockPrisma.automation.update as jest.Mock).mockResolvedValue({
        ...existingAutomation,
        channel: SocialChannel.FACEBOOK,
      })
      ;(mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      })

      const result = await service.update(automationId, userId, dto)

      expect(result.channel).toBe(SocialChannel.FACEBOOK)
      expect(mockPrisma.automation.updateMany).toHaveBeenCalledWith({
        where: {
          userId,
          channel: SocialChannel.FACEBOOK,
          NOT: { id: automationId },
        },
        data: { isEnabled: false },
      })
    })
  })
})

