import { Module } from "@nestjs/common"
import { MeetingsController } from "./meetings.controller"
import { MeetingsService } from "./meetings.service"
import { RecallModule } from "../recall/recall.module"
import { AiModule } from "../ai/ai.module"

@Module({
  imports: [RecallModule, AiModule],
  controllers: [MeetingsController],
  providers: [MeetingsService],
  exports: [MeetingsService],
})
export class MeetingsModule {}



