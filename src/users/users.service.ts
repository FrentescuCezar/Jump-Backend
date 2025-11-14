import { Injectable } from "@nestjs/common"
import { Prisma, User } from "@prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import { KeycloakAdminService } from "../keycloak/keycloak-admin.service"
import { RegisterUserDto } from "./dto/register-user.dto"
import { RegisteredUserDto } from "./dto/registered-user.dto"
import { AppError } from "../errors/app-error"
import { ErrorCodes, FieldErrorCodes } from "../errors/error-codes"
import { UserMapper } from "./user.mapper"

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
      attributes: {
        brand: [dto.brand],
      },
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
        brand: dto.brand,
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
