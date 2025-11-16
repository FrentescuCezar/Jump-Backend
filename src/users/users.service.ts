import { Injectable } from "@nestjs/common"
import { Prisma, User } from "@prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import { KeycloakAdminService } from "../keycloak/keycloak-admin.service"
import { RegisterUserDto } from "./dto/register-user.dto"
import { RegisteredUserDto } from "./dto/registered-user.dto"
import { AppError } from "../errors/app-error"
import { ErrorCodes, FieldErrorCodes } from "../errors/error-codes"
import { UserMapper } from "./user.mapper"
import type { AuthenticatedUser } from "../common/types/authenticated-user"

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keycloakAdmin: KeycloakAdminService,
  ) {}

  async register(dto: RegisterUserDto): Promise<RegisteredUserDto> {
    await this.validateEmailNotExists(dto.email)

    const keycloakId = await this.createKeycloakUser(dto)

    try {
      const user = await this.createDatabaseUser(dto, keycloakId)
      return UserMapper.toRegisteredDto(user)
    } catch (error) {
      await this.rollbackKeycloakUser(keycloakId)
      this.handleDatabaseError(error)
      throw error
    }
  }

  async ensureUserEntity(authUser: AuthenticatedUser): Promise<User> {
    if (!authUser?.sub) {
      throw new AppError(ErrorCodes.BAD_REQUEST, {
        params: { resource: "Keycloak subject" },
      })
    }

    const existing = await this.prisma.user.findUnique({
      where: { keycloakId: authUser.sub },
    })
    if (existing) {
      return existing
    }

    const profile = await this.keycloakAdmin.findUserById(authUser.sub)
    const email = profile.email ?? authUser.email
    if (!email) {
      throw new AppError(ErrorCodes.BAD_REQUEST, {
        fields: [{ field: "email", code: FieldErrorCodes.REQUIRED }],
      })
    }

    const name = this.buildDisplayName({
      firstName: profile.firstName ?? authUser.given_name,
      lastName: profile.lastName ?? authUser.family_name,
      fallback:
        profile.username ??
        authUser.preferred_username ??
        profile.email ??
        authUser.name ??
        email,
    })

    try {
      return await this.prisma.user.create({
        data: {
          keycloakId: authUser.sub,
          email,
          name,
        },
      })
    } catch (error) {
      const recovered = await this.recoverOnDuplicate(authUser.sub, error)
      if (recovered) {
        return recovered
      }
      this.handleDatabaseError(error)
      throw error
    }
  }

  private async recoverOnDuplicate(
    keycloakId: string,
    error: unknown,
  ): Promise<User | null> {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await this.prisma.user.findUnique({
        where: { keycloakId },
      })
      if (existing) {
        return existing
      }
    }
    return null
  }

  private buildDisplayName({
    firstName,
    lastName,
    fallback,
  }: {
    firstName?: string
    lastName?: string
    fallback: string
  }) {
    const parts = [firstName, lastName].filter(Boolean).join(" ").trim()
    return parts.length ? parts : fallback
  }

  private async validateEmailNotExists(email: string): Promise<void> {
    const emailExists = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })

    if (emailExists) {
      throw new AppError(ErrorCodes.CONFLICT, {
        fields: [{ field: "email", code: FieldErrorCodes.DUPLICATE }],
      })
    }
  }

  private async createKeycloakUser(dto: RegisterUserDto): Promise<string> {
    return await this.keycloakAdmin.createUser({
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      password: dto.password,
    })
  }

  private async createDatabaseUser(
    dto: RegisterUserDto,
    keycloakId: string,
  ): Promise<User> {
    const fullName = dto.lastName
      ? `${dto.firstName} ${dto.lastName}`
      : dto.firstName

    return await this.prisma.user.create({
      data: {
        keycloakId,
        email: dto.email,
        name: fullName,
      },
    })
  }

  private async rollbackKeycloakUser(keycloakId: string): Promise<void> {
    await this.keycloakAdmin.deleteUser(keycloakId).catch(() => {})
  }

  private handleDatabaseError(error: unknown): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AppError(ErrorCodes.CONFLICT, {
        fields: [{ field: "email", code: FieldErrorCodes.DUPLICATE }],
      })
    }
  }
}
