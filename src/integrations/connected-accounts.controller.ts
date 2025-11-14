import { Controller, Delete, Get, Param } from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { ConnectedAccountsService } from "./connected-accounts.service"
import { CurrentDbUser } from "../users/decorators/current-db-user.decorator"
import type { User } from "@prisma/client"

@ApiTags("Integrations")
@Controller("integrations/connected-accounts")
export class ConnectedAccountsController {
  constructor(private readonly connectedAccounts: ConnectedAccountsService) {}

  @Get()
  async list(@CurrentDbUser() user: User) {
    return this.connectedAccounts.listForUser(user.id)
  }

  @Delete(":id")
  async disconnect(@Param("id") id: string, @CurrentDbUser() user: User) {
    await this.connectedAccounts.disconnect(id, user.id)
    return { success: true }
  }
}
