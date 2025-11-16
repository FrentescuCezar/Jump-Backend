import { Test, TestingModule } from "@nestjs/testing"
import { AppService } from "./app.service"
import { PrismaService } from "../prisma/prisma.service"
import { createMockPrisma } from "../test/helpers/mocks.helper"

describe("AppService", () => {
  let service: AppService
  let prisma: PrismaService

  const mockPrisma = createMockPrisma()
  mockPrisma.$queryRaw = jest.fn()

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile()

    service = module.get<AppService>(AppService)
    prisma = module.get<PrismaService>(PrismaService)

    jest.clearAllMocks()
  })

  describe("getHello", () => {
    it("should return 'Hello World!'", () => {
      const result = service.getHello()
      expect(result).toBe("Hello World!")
    })
  })

  describe("testConnection", () => {
    it("should return connected true when database is accessible", async () => {
      ;(mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([
        { "?column?": 1 },
      ])

      const result = await service.testConnection()

      expect(result.connected).toBe(true)
      expect(result.message).toBe(
        "Successfully connected to Supabase via Prisma",
      )
    })

    it("should return connected false when database connection fails", async () => {
      const error = new Error("Connection failed")
      ;(mockPrisma.$queryRaw as jest.Mock).mockRejectedValue(error)

      const result = await service.testConnection()

      expect(result.connected).toBe(false)
      expect(result.error).toBe("Connection failed")
    })

    it("should handle non-Error exceptions", async () => {
      ;(mockPrisma.$queryRaw as jest.Mock).mockRejectedValue("String error")

      const result = await service.testConnection()

      expect(result.connected).toBe(false)
      expect(result.error).toBe("Unable to connect to Supabase")
    })
  })
})
