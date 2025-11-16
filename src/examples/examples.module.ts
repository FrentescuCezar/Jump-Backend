import { Module } from "@nestjs/common"
import { ChatController } from "./chat.controller"
import { ChatAuthController } from "./chat-auth.controller"
import { NotificationsController } from "./notifications.controller"
import { ChatService } from "./services/chat.service"
import { NotificationsService } from "./services/notifications.service"
import { ChatTokenService } from "./services/chat-token.service"
import { ChatGateway } from "./chat.gateway"

@Module({
  providers: [ChatService, NotificationsService, ChatTokenService, ChatGateway],
  controllers: [ChatController, ChatAuthController, NotificationsController],
  exports: [ChatGateway, NotificationsService],
})
export class ExamplesModule {}
