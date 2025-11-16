import { Module } from "@nestjs/common"
import { InsightsController } from "./insights.controller"
import { PlannerController } from "./planner.controller"
import { PlannerService } from "./services/planner.service"
import { PlannerDeltaSyncService } from "./services/planner-delta-sync.service"
import { PulseService } from "./services/pulse.service"
import { ChatController } from "./chat.controller"
import { ChatAuthController } from "./chat-auth.controller"
import { NotificationsController } from "./notifications.controller"
import { ChatService } from "./services/chat.service"
import { NotificationsService } from "./services/notifications.service"
import { ChatTokenService } from "./services/chat-token.service"
import { ChatGateway } from "./chat.gateway"
import { MeetingsModule } from "../meetings/meetings.module"

@Module({
  imports: [MeetingsModule],
  providers: [
    PlannerService,
    PlannerDeltaSyncService,
    PulseService,
    ChatService,
    NotificationsService,
    ChatTokenService,
    ChatGateway,
  ],
  controllers: [
    InsightsController,
    PlannerController,
    ChatController,
    ChatAuthController,
    NotificationsController,
  ],
  exports: [ChatGateway, NotificationsService],
})
export class ExamplesModule {}
