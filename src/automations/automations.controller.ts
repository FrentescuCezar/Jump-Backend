import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import type { User } from "@prisma/client"
import { AutomationsService } from "./automations.service"
import { CreateAutomationDto } from "./dto/create-automation.dto"
import { UpdateAutomationDto } from "./dto/update-automation.dto"
import { CurrentDbUser } from "../users/decorators/current-db-user.decorator"

@ApiTags("Automations")
@Controller("automations")
export class AutomationsController {
  constructor(private readonly automationsService: AutomationsService) {}

  @Get()
  list(@CurrentDbUser() user: User) {
    return this.automationsService.list(user.id)
  }

  @Post()
  create(@CurrentDbUser() user: User, @Body() body: CreateAutomationDto) {
    return this.automationsService.create(user.id, body)
  }

  @Put(":id")
  update(
    @Param("id") id: string,
    @CurrentDbUser() user: User,
    @Body() body: UpdateAutomationDto,
  ) {
    return this.automationsService.update(id, user.id, body)
  }
}
