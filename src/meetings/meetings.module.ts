import { Module } from "@nestjs/common"
import { MeetingsController } from "./meetings.controller"
import { MeetingsService } from "./meetings.service"
import { MeetingChatService } from "./services/meeting-chat.service"
import { RecallModule } from "../recall/recall.module"
import { AiModule } from "../ai/ai.module"

@Module({
  imports: [RecallModule, AiModule],
  controllers: [MeetingsController],
  providers: [MeetingsService, MeetingChatService],
  exports: [MeetingsService, MeetingChatService],
})
export class MeetingsModule {}
