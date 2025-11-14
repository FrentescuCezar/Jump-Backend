import { Injectable, Logger, HttpStatus } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import KeycloakAdminClient from "@keycloak/keycloak-admin-client"
import type UserRepresentation from "@keycloak/keycloak-admin-client/lib/defs/userRepresentation"
import { AppError } from "../errors/app-error"
import { ErrorCodes, FieldErrorCodes } from "../errors/error-codes"

interface CreateKeycloakUserInput {
  email: string
  firstName: string
  lastName?: string
  password: string
  attributes?: UserRepresentation["attributes"]
}

@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name)
  private readonly client: KeycloakAdminClient
  private readonly realm: string
  private readonly adminClientId: string
  private readonly adminClientSecret: string

  constructor(private readonly configService: ConfigService) {
    this.realm = this.configService.getOrThrow<string>("KEYCLOAK_REALM")
    this.client = new KeycloakAdminClient({
      baseUrl: this.configService.getOrThrow<string>("KEYCLOAK_BASE_URL"),
      realmName: this.realm,
    })
    this.adminClientId =
      this.configService.get<string>("KEYCLOAK_ADMIN_CLIENT_ID") ??
      this.configService.getOrThrow<string>("KEYCLOAK_CLIENT_ID")
    this.adminClientSecret =
      this.configService.get<string>("KEYCLOAK_ADMIN_CLIENT_SECRET") ??
      this.configService.getOrThrow<string>("KEYCLOAK_CLIENT_SECRET")
  }

  async createUser(input: CreateKeycloakUserInput): Promise<string> {
    await this.authenticate()

    try {
      const response = await this.client.users.create({
        realm: this.realm,
        email: input.email,
        username: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        enabled: true,
        emailVerified: false,
        attributes: input.attributes,
        credentials: [
          {
            type: "password",
            value: input.password,
            temporary: false,
          },
        ],
      })

      return response.id ?? (await this.findUserIdByEmail(input.email))
    } catch (error) {
      const status = this.extractStatus(error)
      if (status === HttpStatus.CONFLICT) {
        throw new AppError(ErrorCodes.CONFLICT, {
          fields: [{ field: "email", code: FieldErrorCodes.DUPLICATE }],
        })
      }

      const debugInfo = this.formatDebug(error)
      this.logger.error(
        "Unexpected error while creating Keycloak user",
        debugInfo,
      )

      throw new AppError(ErrorCodes.INTERNAL, {
        debug: debugInfo,
      })
    }
  }

  async findUserById(id: string): Promise<UserRepresentation> {
    await this.authenticate()
    try {
      const user = await this.client.users.findOne({
        realm: this.realm,
        id,
      })

      if (!user) {
        throw new AppError(ErrorCodes.NOT_FOUND, {
          params: { resource: "Keycloak user" },
        })
      }

      return user
    } catch (error) {
      const status = this.extractStatus(error)
      if (status === HttpStatus.NOT_FOUND) {
        throw new AppError(ErrorCodes.NOT_FOUND, {
          params: { resource: "Keycloak user" },
        })
      }

      const debugInfo = this.formatDebug(error)
      this.logger.error(
        `Unexpected error while fetching Keycloak user ${id}`,
        debugInfo,
      )
      throw new AppError(ErrorCodes.INTERNAL, {
        debug: debugInfo,
      })
    }
  }

  async deleteUser(id: string): Promise<void> {
    if (!id) return

    await this.authenticate()
    try {
      await this.client.users.del({
        realm: this.realm,
        id,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown cleanup error"
      this.logger.warn(`Failed to cleanup Keycloak user ${id}: ${message}`)
    }
  }

  private async authenticate() {
    await this.client.auth({
      grantType: "client_credentials",
      clientId: this.adminClientId,
      clientSecret: this.adminClientSecret,
    })
  }

  private async findUserIdByEmail(email: string): Promise<string> {
    const matches = await this.client.users.find({
      realm: this.realm,
      email,
      exact: true,
    })

    const user = matches[0]
    if (!user?.id) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        params: { resource: "Keycloak user" },
      })
    }

    return user.id
  }

  private extractStatus(error: unknown): number | undefined {
    if (this.isHttpError(error) && typeof error.response?.status === "number") {
      return error.response.status
    }

    return undefined
  }

  private formatDebug(error: unknown): string {
    if (this.isHttpError(error)) {
      return JSON.stringify({
        status: error.response?.status,
        data: error.response?.data,
      })
    }

    if (error instanceof Error) {
      return error.message
    }

    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }

  private isHttpError(
    error: unknown,
  ): error is { response?: { status?: number; data?: unknown } } {
    return (
      typeof error === "object" &&
      error !== null &&
      "response" in error &&
      typeof (error as { response?: unknown }).response === "object"
    )
  }
}
