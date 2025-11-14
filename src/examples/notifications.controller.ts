import { Controller, Get, Param, Post, Req } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"
import { NotificationsService } from "./services/notifications.service"
import type { AuthenticatedRequest } from "../keycloak/authenticated-request.type"

@ApiTags("Examples")
@Controller("examples/notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: "List the latest notifications for the authenticated user",
  })
  list(@Req() req: AuthenticatedRequest) {
    return this.notifications.listForUser(req.user.sub)
  }

  @Post(":id/read")
  @ApiOperation({
    summary: "Mark a notification as read",
  })
  async markRead(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    await this.notifications.markAsRead(req.user.sub, id)
    return { ok: true }
  }
}
