import { TestingModuleBuilder } from "@nestjs/testing"
import { KeycloakAdminService } from "../../src/keycloak/keycloak-admin.service"
import { CanActivate, ExecutionContext, APP_GUARD } from "@nestjs/common"
import * as jwt from "jsonwebtoken"
import { PrismaService } from "../../prisma/prisma.service"
import { AuthGuard, ResourceGuard, RoleGuard } from "nest-keycloak-connect"

/**
 * Mock auth guard that extracts user info from JWT token
 * and sets it on the request for e2e tests
 */
export class MockAuthGuard implements CanActivate {
  constructor(private readonly prisma?: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers?.authorization

    // Allow requests without auth header (for @Public() endpoints)
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // Check if endpoint is marked as @Public() - if so, allow
      // Otherwise, reject
      return false
    }

    const token = authHeader.substring(7)
    try {
      // Decode the JWT token (we don't verify it in tests)
      const decoded = jwt.decode(token) as any

      if (!decoded?.sub) {
        return false
      }

      const keycloakId = decoded.sub as string
      const fallbackEmail =
        decoded.email || decoded.preferred_username || `test-${keycloakId}@example.com`
      const fallbackName = decoded.name || decoded.preferred_username || "Test User"

      // If PrismaService is available, find or create user in database
      if (this.prisma) {
        let user = await this.prisma.user.findUnique({
          where: { keycloakId },
        })

        if (!user) {
          // If user doesn't exist, create it (for tests)
          user = await this.prisma.user.create({
            data: {
              keycloakId,
              email: fallbackEmail,
              name: fallbackName,
            },
          })
        }

        // Set user on request (matching nest-keycloak-connect format)
        request.user = {
          sub: keycloakId,
          email: user.email,
          preferred_username: user.email,
          name: user.name,
          realm_access: {
            roles: decoded.realm_access?.roles || ["user"],
          },
        }
      } else {
        // Fallback: set user from token without database lookup
        request.user = {
          sub: keycloakId,
          email: fallbackEmail,
          preferred_username: decoded.preferred_username || decoded.email || fallbackEmail,
          name: fallbackName,
          realm_access: {
            roles: decoded.realm_access?.roles || ["user"],
          },
        }
      }

      return true
    } catch (error) {
      console.error("MockAuthGuard error:", error)
      return false
    }
  }
}

/**
 * Mock guards that always allow access
 */
export class MockResourceGuard implements CanActivate {
  canActivate(): boolean {
    return true
  }
}

export class MockRoleGuard implements CanActivate {
  canActivate(): boolean {
    return true
  }
}

/**
 * Helper to override Keycloak services and guards in e2e tests
 * This avoids ES module issues with @keycloak/keycloak-admin-client
 * and bypasses Keycloak token verification entirely
 * 
 * What this does:
 * 1. Replaces KeycloakAdminService with mocks
 * 2. Replaces AuthGuard, ResourceGuard, RoleGuard with mocks that:
 *    - Accept any JWT token (no Keycloak verification)
 *    - Extract user info from token payload
 *    - Set request.user for controllers to use
 * 3. This allows tests to use mock JWT tokens without needing a real Keycloak server
 */
export function overrideKeycloakModules(
  builder: TestingModuleBuilder,
): TestingModuleBuilder {
  // First, override the KeycloakAdminService
  let testBuilder = builder.overrideProvider(KeycloakAdminService).useValue({
    findUserByEmail: jest.fn().mockResolvedValue(null),
    createUser: jest.fn().mockResolvedValue({ id: "user-123" }),
    updateUser: jest.fn().mockResolvedValue({}),
    deleteUser: jest.fn().mockResolvedValue(undefined),
  })

  // Override APP_GUARD providers - these are registered in AppModule
  // Since APP_GUARD is a multi-provider, we need to override each instance
  // The order matters: AuthGuard, ResourceGuard, RoleGuard (as in AppModule)
  testBuilder = testBuilder
    .overrideProvider(APP_GUARD)
    .useFactory({
      factory: (prisma: PrismaService) => new MockAuthGuard(prisma),
      inject: [PrismaService],
    })
    .overrideProvider(APP_GUARD)
    .useClass(MockResourceGuard)
    .overrideProvider(APP_GUARD)
    .useClass(MockRoleGuard)

  // Also override guard classes directly as a fallback
  // This ensures guards are replaced even if APP_GUARD override doesn't work
  return testBuilder
    .overrideGuard(AuthGuard)
    .useFactory({
      factory: (prisma: PrismaService) => new MockAuthGuard(prisma),
      inject: [PrismaService],
    })
    .overrideGuard(ResourceGuard)
    .useClass(MockResourceGuard)
    .overrideGuard(RoleGuard)
    .useClass(MockRoleGuard)
}

