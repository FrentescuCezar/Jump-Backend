import { Module } from "@nestjs/common"
import { HttpModule } from "@nestjs/axios"
import { SocialController } from "./social.controller"
import { SocialPublishingService } from "./social-publishing.service"
import { IntegrationsModule } from "../integrations/integrations.module"

@Module({
  imports: [HttpModule, IntegrationsModule],
  controllers: [SocialController],
  providers: [SocialPublishingService],
  exports: [SocialPublishingService],
})
export class SocialModule {}
