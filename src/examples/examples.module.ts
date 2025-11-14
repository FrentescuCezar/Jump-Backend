import { Module } from "@nestjs/common"
import { InsightsController } from "./insights.controller"
import { PlannerController } from "./planner.controller"
import { ExamplesSeedService } from "./examples.seed"
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

@Module({
  providers: [
    PlannerService,
    PlannerDeltaSyncService,
    PulseService,
    ExamplesSeedService,
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
})
export class ExamplesModule {}
