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
import { UsersController } from "./users.controller"
import { UsersService } from "./users.service"

describe("UsersController", () => {
  let controller: UsersController
  let usersService: UsersService

  const mockUsersService = {
    register: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile()

    controller = module.get<UsersController>(UsersController)
    usersService = module.get<UsersService>(UsersService)

    jest.clearAllMocks()
  })

  describe("register", () => {
    it("should register a new user", async () => {
      const dto = {
        email: "test@example.com",
        firstName: "John",
        lastName: "Doe",
        password: "password123",
      }
      const registeredUser = {
        id: "user-1",
        email: dto.email,
        name: "John Doe",
      }

      ;(mockUsersService.register as jest.Mock).mockResolvedValue(registeredUser)

      const result = await controller.register(dto)

      expect(result).toEqual(registeredUser)
      expect(mockUsersService.register).toHaveBeenCalledWith(dto)
    })
  })

  describe("adminEndpoint", () => {
    it("should return admin message", async () => {
      const result = await controller.adminEndpoint()

      expect(result.message).toBe(
        "This endpoint is protected and requires ADMIN role",
      )
      expect(result.timestamp).toBeDefined()
    })
  })
})

