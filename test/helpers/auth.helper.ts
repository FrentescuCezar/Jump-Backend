import { PrismaService } from "../../../prisma/prisma.service"
import * as jwt from "jsonwebtoken"
import type { User } from "@prisma/client"

/**
 * Helper for authentication in tests
 */
export class AuthHelper {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a user and generate a JWT token for them
   */
  async createAuthenticatedUser(overrides?: {
    email?: string
    name?: string
    keycloakId?: string
  }): Promise<{ user: User; token: string }> {
    // Ensure emails are unique to avoid race conditions in tests
    const uniqueSuffix = Math.floor(Math.random() * 1_000_000)
    const emailAddress =
      overrides?.email ?? `test-${Date.now()}-${uniqueSuffix}@example.com`
    const keycloakId =
      overrides?.keycloakId ?? `keycloak-${Date.now()}-${Math.random()}`

    try {
      const user = await this.prisma.user.create({
        data: {
          email: emailAddress,
          name: overrides?.name || "Test User",
          keycloakId,
        },
      })

      // Generate a mock JWT token
      const tokenPayload = {
        sub: keycloakId,
        email: emailAddress,
        preferred_username: emailAddress,
        name: overrides?.name ?? "Test User",
        realm_access: {
          roles: ["user"],
        },
      }

      const token = jwt.sign(
        tokenPayload,
        process.env.JWT_SECRET || "test-secret-key",
        { expiresIn: "1h" },
      )

      return { user, token }
    } catch (error: any) {
      // If a duplicate email error occurs, fallback to existing user
      if (
        error?.code === "P2002" ||
        (error?.message ?? "").toString().includes("Unique constraint failed")
      ) {
        const existing = await this.prisma.user.findUnique({
          where: { email: emailAddress },
        })
        if (existing) {
          const token = jwt.sign(
            {
              sub: existing.keycloakId,
              email: existing.email,
              preferred_username: existing.email,
              realm_access: { roles: ["user"] },
            },
            process.env.JWT_SECRET || "test-secret-key",
            { expiresIn: "1h" },
          )
          return { user: existing, token }
        }
      }
      throw error
    }
  }

  /**
   * Get authorization headers for supertest requests
   */
  getAuthHeaders(token: string): { Authorization: string } {
    return {
      Authorization: `Bearer ${token}`,
    }
  }

  /**
   * Create multiple authenticated users (useful for testing permissions)
   */
  async createMultipleUsers(count: number): Promise<
    Array<{
      user: User
      token: string
    }>
  > {
    const users = []
    for (let i = 0; i < count; i++) {
      users.push(await this.createAuthenticatedUser())
    }
    return users
  }
}
