// Mock Keycloak admin client before any imports
jest.mock("@keycloak/keycloak-admin-client", () => ({
  default: jest.fn().mockImplementation(() => ({
    auth: jest.fn(),
    users: {
      find: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      del: jest.fn(),
    },
  })),
}))

import { Test, TestingModule } from "@nestjs/testing"
import { UsersService } from "./users.service"
import { PrismaService } from "../../prisma/prisma.service"
import { KeycloakAdminService } from "../keycloak/keycloak-admin.service"
import { AppError } from "../errors/app-error"
import { Prisma } from "@prisma/client"
import { createMockPrisma } from "../../test/helpers/mocks.helper"

describe("UsersService", () => {
  let service: UsersService
  let prisma: PrismaService

  const mockPrisma = createMockPrisma()
  const mockKeycloakAdmin = {
    createUser: jest.fn(),
    deleteUser: jest.fn(),
    findUserById: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: KeycloakAdminService,
          useValue: mockKeycloakAdmin,
        },
      ],
    }).compile()

    service = module.get<UsersService>(UsersService)
    prisma = module.get<PrismaService>(PrismaService)

    jest.clearAllMocks()
  })

  describe("register", () => {
    it("should register a new user successfully", async () => {
      const dto = {
        email: "test@example.com",
        firstName: "John",
        lastName: "Doe",
        password: "password123",
      }

      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null)
      ;(mockKeycloakAdmin.createUser as jest.Mock).mockResolvedValue("keycloak-123")
      ;(mockPrisma.user.create as jest.Mock).mockResolvedValue({
        id: "user-1",
        keycloakId: "keycloak-123",
        email: dto.email,
        name: "John Doe",
      })

      const result = await service.register(dto)

      expect(result.email).toBe(dto.email)
      expect(mockKeycloakAdmin.createUser).toHaveBeenCalledWith({
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        password: dto.password,
      })
      expect(mockPrisma.user.create).toHaveBeenCalled()
    })

    it("should throw error if email already exists", async () => {
      const dto = {
        email: "existing@example.com",
        firstName: "John",
        lastName: "Doe",
        password: "password123",
      }

      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "existing-user",
      })

      await expect(service.register(dto)).rejects.toThrow(AppError)
      expect(mockKeycloakAdmin.createUser).not.toHaveBeenCalled()
    })

    it("should rollback Keycloak user if database creation fails", async () => {
      const dto = {
        email: "test@example.com",
        firstName: "John",
        lastName: "Doe",
        password: "password123",
      }

      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null)
      ;(mockKeycloakAdmin.createUser as jest.Mock).mockResolvedValue("keycloak-123")
      ;(mockPrisma.user.create as jest.Mock).mockRejectedValue(
        new Error("Database error"),
      )
      ;(mockKeycloakAdmin.deleteUser as jest.Mock).mockResolvedValue(undefined)

      await expect(service.register(dto)).rejects.toThrow()
      expect(mockKeycloakAdmin.deleteUser).toHaveBeenCalledWith("keycloak-123")
    })
  })

  describe("ensureUserEntity", () => {
    it("should return existing user if found", async () => {
      const authUser = {
        sub: "keycloak-123",
        email: "test@example.com",
      }
      const existingUser = {
        id: "user-1",
        keycloakId: "keycloak-123",
        email: "test@example.com",
        name: "Test User",
      }

      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(existingUser)

      const result = await service.ensureUserEntity(authUser as any)

      expect(result).toEqual(existingUser)
      expect(mockKeycloakAdmin.findUserById).not.toHaveBeenCalled()
    })

    it("should create new user if not found", async () => {
      const authUser = {
        sub: "keycloak-123",
        email: "test@example.com",
        given_name: "John",
        family_name: "Doe",
      }
      const keycloakProfile = {
        email: "test@example.com",
        firstName: "John",
        lastName: "Doe",
      }
      const newUser = {
        id: "user-1",
        keycloakId: "keycloak-123",
        email: "test@example.com",
        name: "John Doe",
      }

      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null)
      ;(mockKeycloakAdmin.findUserById as jest.Mock).mockResolvedValue(
        keycloakProfile,
      )
      ;(mockPrisma.user.create as jest.Mock).mockResolvedValue(newUser)

      const result = await service.ensureUserEntity(authUser as any)

      expect(result).toEqual(newUser)
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          keycloakId: authUser.sub,
          email: authUser.email,
          name: "John Doe",
        },
      })
    })

    it("should throw error if sub is missing", async () => {
      const authUser = {
        email: "test@example.com",
      }

      await expect(service.ensureUserEntity(authUser as any)).rejects.toThrow(
        AppError,
      )
    })

    it("should recover from duplicate key error", async () => {
      const authUser = {
        sub: "keycloak-123",
        email: "test@example.com",
      }
      const existingUser = {
        id: "user-1",
        keycloakId: "keycloak-123",
        email: "test@example.com",
        name: "Test User",
      }
      const duplicateError = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed",
        {
          code: "P2002",
          clientVersion: "5.0.0",
        } as any,
      )

      ;(mockPrisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingUser)
      ;(mockKeycloakAdmin.findUserById as jest.Mock).mockResolvedValue({
        email: "test@example.com",
      })
      ;(mockPrisma.user.create as jest.Mock).mockRejectedValue(duplicateError)

      const result = await service.ensureUserEntity(authUser as any)

      expect(result).toEqual(existingUser)
    })

    it("should build display name from firstName and lastName", async () => {
      const authUser = {
        sub: "keycloak-123",
        email: "test@example.com",
      }
      const keycloakProfile = {
        email: "test@example.com",
        firstName: "John",
        lastName: "Doe",
      }
      const newUser = {
        id: "user-1",
        keycloakId: "keycloak-123",
        email: "test@example.com",
        name: "John Doe",
      }

      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null)
      ;(mockKeycloakAdmin.findUserById as jest.Mock).mockResolvedValue(
        keycloakProfile,
      )
      ;(mockPrisma.user.create as jest.Mock).mockResolvedValue(newUser)

      await service.ensureUserEntity(authUser as any)

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          keycloakId: authUser.sub,
          email: authUser.email,
          name: "John Doe",
        },
      })
    })

    it("should use fallback name if firstName/lastName not available", async () => {
      const authUser = {
        sub: "keycloak-123",
        email: "test@example.com",
        preferred_username: "testuser",
      }
      const keycloakProfile = {
        email: "test@example.com",
        username: "testuser",
      }
      const newUser = {
        id: "user-1",
        keycloakId: "keycloak-123",
        email: "test@example.com",
        name: "testuser",
      }

      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null)
      ;(mockKeycloakAdmin.findUserById as jest.Mock).mockResolvedValue(
        keycloakProfile,
      )
      ;(mockPrisma.user.create as jest.Mock).mockResolvedValue(newUser)

      await service.ensureUserEntity(authUser as any)

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          keycloakId: authUser.sub,
          email: authUser.email,
          name: "testuser",
        },
      })
    })
  })
})
