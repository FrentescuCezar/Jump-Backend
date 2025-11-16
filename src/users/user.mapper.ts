import { User } from "@prisma/client"
import { RegisteredUserDto } from "./dto/registered-user.dto"

export class UserMapper {
  static toRegisteredDto(user: User): RegisteredUserDto {
    return {
      id: user.id,
      keycloakId: user.keycloakId,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    }
  }
}
