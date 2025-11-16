import { Module } from "@nestjs/common"
import { KeycloakAdminService } from "../../src/keycloak/keycloak-admin.service"

/**
 * Mock Keycloak module for e2e tests
 * This avoids ES module issues with @keycloak/keycloak-admin-client
 */
@Module({
  providers: [
    {
      provide: KeycloakAdminService,
      useValue: {
        findUserByEmail: jest.fn(),
        createUser: jest.fn(),
        updateUser: jest.fn(),
        deleteUser: jest.fn(),
      },
    },
  ],
  exports: [KeycloakAdminService],
})
export class MockKeycloakModule {}

