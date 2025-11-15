import { forwardRef, Module } from "@nestjs/common"
import { HttpModule } from "@nestjs/axios"
import { ConnectedAccountsController } from "./connected-accounts.controller"
import { ConnectedAccountsService } from "./connected-accounts.service"
import { GoogleOAuthService } from "./google/google-oauth.service"
import { GoogleOAuthController } from "./google/google-oauth.controller"
import { LinkedInOAuthService } from "./linkedin/linkedin-oauth.service"
import { LinkedInOAuthController } from "./linkedin/linkedin-oauth.controller"
import { FacebookOAuthService } from "./facebook/facebook-oauth.service"
import { FacebookOAuthController } from "./facebook/facebook-oauth.controller"
import { CalendarModule } from "../calendar/calendar.module"

@Module({
  imports: [HttpModule, forwardRef(() => CalendarModule)],
  controllers: [
    ConnectedAccountsController,
    GoogleOAuthController,
    LinkedInOAuthController,
    FacebookOAuthController,
  ],
  providers: [
    ConnectedAccountsService,
    GoogleOAuthService,
    LinkedInOAuthService,
    FacebookOAuthService,
  ],
  exports: [
    ConnectedAccountsService,
    GoogleOAuthService,
    LinkedInOAuthService,
    FacebookOAuthService,
  ],
})
export class IntegrationsModule {}
