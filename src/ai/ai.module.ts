import { Module } from "@nestjs/common"
import { HttpModule } from "@nestjs/axios"
import { AiContentService } from "./ai-content.service"

@Module({
  imports: [HttpModule],
  providers: [AiContentService],
  exports: [AiContentService],
})
export class AiModule {}



