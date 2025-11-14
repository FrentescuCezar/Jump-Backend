import { Controller, Post, Req } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"
import { ChatTokenService } from "./services/chat-token.service"
import type { AuthenticatedRequest } from "../keycloak/authenticated-request.type"

@ApiTags("Auth")
@Controller("auth")
export class ChatAuthController {
  constructor(private readonly chatTokens: ChatTokenService) {}

  @Post("chat-token")
  @ApiOperation({
    summary: "Mint a short-lived chat token",
    description:
      "Exchanges the Keycloak JWT for a 15 minute socket token signed by the API.",
  })
  issue(@Req() req: AuthenticatedRequest) {
    const user = req.user
    const displayName = user.name ?? user.preferred_username ?? user.sub
    return {
      token: this.chatTokens.issue(user.sub, {
        name: displayName,
        preferred_username: user.preferred_username,
      }),
    }
  }
}
