import { forwardRef, Module } from "@nestjs/common"
import { HttpModule } from "@nestjs/axios"
import { ConnectedAccountsController } from "./connected-accounts.controller"
import { ConnectedAccountsService } from "./connected-accounts.service"
import { GoogleOAuthService } from "./google/google-oauth.service"
import { GoogleOAuthController } from "./google/google-oauth.controller"
import { CalendarModule } from "../calendar/calendar.module"

@Module({
  imports: [HttpModule, forwardRef(() => CalendarModule)],
  controllers: [ConnectedAccountsController, GoogleOAuthController],
  providers: [ConnectedAccountsService, GoogleOAuthService],
  exports: [ConnectedAccountsService, GoogleOAuthService],
})
export class IntegrationsModule {}
