import { Test, TestingModule } from "@nestjs/testing"
import { RecallPollingService } from "./recall-polling.service"
import { PrismaService } from "../../prisma/prisma.service"
import { RecallService } from "./recall.service"
import { RecallBotStatus } from "@prisma/client"
import { createMockPrisma } from "../../test/helpers/mocks.helper"

describe("RecallPollingService", () => {
  let service: RecallPollingService
  let prisma: PrismaService
  let recallService: RecallService

  const mockPrisma = createMockPrisma()
  const mockRecallService = {
    pollBotStatus: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecallPollingService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: RecallService,
          useValue: mockRecallService,
        },
      ],
    }).compile()

    service = module.get<RecallPollingService>(RecallPollingService)
    prisma = module.get<PrismaService>(PrismaService)
    recallService = module.get<RecallService>(RecallService)

    jest.clearAllMocks()
  })

  describe("pollActiveBots", () => {
    it("should poll active bots successfully", async () => {
      const bots = [
        {
          id: "bot-1",
          status: RecallBotStatus.SCHEDULED,
          calendarEvent: {
            id: "event-1",
            title: "Test Meeting",
          },
        },
        {
          id: "bot-2",
          status: RecallBotStatus.IN_CALL,
          calendarEvent: {
            id: "event-2",
            title: "Another Meeting",
          },
        },
      ]

      ;(mockPrisma.recallBot.findMany as jest.Mock).mockResolvedValue(bots)
      ;(mockRecallService.pollBotStatus as jest.Mock).mockResolvedValue(undefined)

      // Suppress logger
      const loggerWarnSpy = jest
        .spyOn(service["logger"], "warn")
        .mockImplementation()

      await service.pollActiveBots()

      expect(mockPrisma.recallBot.findMany).toHaveBeenCalledWith({
        where: {
          status: {
            in: [
              RecallBotStatus.SCHEDULED,
              RecallBotStatus.JOINING,
              RecallBotStatus.IN_CALL,
            ],
          },
        },
        orderBy: { createdAt: "asc" },
        take: 25,
        include: {
          calendarEvent: true,
        },
      })
      expect(mockRecallService.pollBotStatus).toHaveBeenCalledTimes(2)
      expect(mockRecallService.pollBotStatus).toHaveBeenCalledWith(bots[0])
      expect(mockRecallService.pollBotStatus).toHaveBeenCalledWith(bots[1])

      loggerWarnSpy.mockRestore()
    })

    it("should handle polling failures gracefully", async () => {
      const bots = [
        {
          id: "bot-1",
          status: RecallBotStatus.SCHEDULED,
          calendarEvent: {
            id: "event-1",
            title: "Test Meeting",
          },
        },
      ]

      ;(mockPrisma.recallBot.findMany as jest.Mock).mockResolvedValue(bots)
      ;(mockRecallService.pollBotStatus as jest.Mock).mockRejectedValue(
        new Error("Polling failed"),
      )

      const loggerWarnSpy = jest
        .spyOn(service["logger"], "warn")
        .mockImplementation()

      await service.pollActiveBots()

      expect(mockRecallService.pollBotStatus).toHaveBeenCalled()
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to poll bot"),
      )

      loggerWarnSpy.mockRestore()
    })

    it("should handle non-Error exceptions", async () => {
      const bots = [
        {
          id: "bot-1",
          status: RecallBotStatus.SCHEDULED,
          calendarEvent: {
            id: "event-1",
            title: "Test Meeting",
          },
        },
      ]

      ;(mockPrisma.recallBot.findMany as jest.Mock).mockResolvedValue(bots)
      ;(mockRecallService.pollBotStatus as jest.Mock).mockRejectedValue(
        "String error",
      )

      const loggerWarnSpy = jest
        .spyOn(service["logger"], "warn")
        .mockImplementation()

      await service.pollActiveBots()

      expect(mockRecallService.pollBotStatus).toHaveBeenCalled()
      expect(loggerWarnSpy).toHaveBeenCalled()

      loggerWarnSpy.mockRestore()
    })

    it("should respect batch size limit", async () => {
      const bots = Array.from({ length: 30 }, (_, i) => ({
        id: `bot-${i}`,
        status: RecallBotStatus.SCHEDULED,
        calendarEvent: {
          id: `event-${i}`,
          title: `Meeting ${i}`,
        },
      }))

      ;(mockPrisma.recallBot.findMany as jest.Mock).mockResolvedValue(bots.slice(0, 25))
      ;(mockRecallService.pollBotStatus as jest.Mock).mockResolvedValue(undefined)

      const loggerWarnSpy = jest
        .spyOn(service["logger"], "warn")
        .mockImplementation()

      await service.pollActiveBots()

      expect(mockPrisma.recallBot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 25,
        }),
      )
      expect(mockRecallService.pollBotStatus).toHaveBeenCalledTimes(25)

      loggerWarnSpy.mockRestore()
    })

    it("should handle empty bot list", async () => {
      ;(mockPrisma.recallBot.findMany as jest.Mock).mockResolvedValue([])

      await service.pollActiveBots()

      expect(mockPrisma.recallBot.findMany).toHaveBeenCalled()
      expect(mockRecallService.pollBotStatus).not.toHaveBeenCalled()
    })
  })
})

