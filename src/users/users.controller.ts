import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common"
import { Public, Roles } from "nest-keycloak-connect"
import { UsersService } from "./users.service"
import { RegisterUserDto } from "./dto/register-user.dto"
import { RegisteredUserDto } from "./dto/registered-user.dto"
import {
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
  ApiOkResponse,
} from "@nestjs/swagger"

@ApiTags("Users")
@Controller("user")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Register a new user via Keycloak" })
  @ApiCreatedResponse({ type: RegisteredUserDto })
  async register(@Body() dto: RegisterUserDto): Promise<RegisteredUserDto> {
    return this.usersService.register(dto)
  }

  @Roles("ADMIN")
  @Get("admin")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Admin-only endpoint" })
  @ApiOkResponse({ description: "Admin access granted" })
  async adminEndpoint(): Promise<{ message: string; timestamp: string }> {
    return {
      message: "This endpoint is protected and requires ADMIN role",
      timestamp: new Date().toISOString(),
    }
  }
}
