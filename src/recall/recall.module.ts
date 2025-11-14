import { Module } from "@nestjs/common"
import { HttpModule } from "@nestjs/axios"
import { RecallService } from "./recall.service"
import { RecallPollingService } from "./recall-polling.service"

@Module({
  imports: [HttpModule],
  providers: [RecallService, RecallPollingService],
  exports: [RecallService],
})
export class RecallModule {}

