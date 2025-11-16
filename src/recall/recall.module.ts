import { Module } from "@nestjs/common"
import { HttpModule } from "@nestjs/axios"
import { RecallService } from "./recall.service"
import { RecallPollingService } from "./recall-polling.service"
import { AiModule } from "../ai/ai.module"

@Module({
  imports: [HttpModule, AiModule],
  providers: [RecallService, RecallPollingService],
  exports: [RecallService],
})
export class RecallModule {}
