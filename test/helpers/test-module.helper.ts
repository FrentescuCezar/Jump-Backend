import { Test, TestingModuleBuilder } from "@nestjs/testing"
import { HttpService } from "@nestjs/axios"
import { TestAppModule } from "./test-app.module"
import { KeycloakAdminService } from "../../src/keycloak/keycloak-admin.service"

/**
 * Helper to create a testing module with all necessary overrides for e2e tests
 * This ensures consistent setup across all e2e test files
 */
export function createTestModule(): TestingModuleBuilder {
  return Test.createTestingModule({
    imports: [TestAppModule],
  })
    .overrideProvider(HttpService)
    .useValue({
      axiosRef: {
        post: jest.fn(),
        get: jest.fn(),
        delete: jest.fn(),
        patch: jest.fn(),
        put: jest.fn(),
      },
    })
    .overrideProvider(KeycloakAdminService)
    .useValue({
      findUserByEmail: jest.fn().mockResolvedValue(null),
      findUserById: jest.fn().mockResolvedValue({ id: "user-123", email: "test@example.com" }),
      createUser: jest.fn().mockResolvedValue({ id: "user-123" }),
      updateUser: jest.fn().mockResolvedValue({}),
      deleteUser: jest.fn().mockResolvedValue(undefined),
    })
}

