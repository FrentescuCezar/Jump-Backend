import {
  Controller,
  Get,
  Query,
  Res,
  BadRequestException,
} from "@nestjs/common"
import type { Response } from "express"
import { Public } from "nest-keycloak-connect"
import { ApiTags } from "@nestjs/swagger"
import { GoogleOAuthService } from "./google-oauth.service"
import { CalendarSyncService } from "../../calendar/calendar-sync.service"
import { CurrentDbUser } from "../../users/decorators/current-db-user.decorator"
import type { User } from "@prisma/client"

@ApiTags("Integrations")
@Controller("integrations/google/oauth")
export class GoogleOAuthController {
  constructor(
    private readonly googleOAuth: GoogleOAuthService,
    private readonly calendarSync: CalendarSyncService,
  ) {}

  @Get("url")
  async getAuthUrl(@CurrentDbUser() user: User) {
    const url = this.googleOAuth.buildAuthorizationUrl(user.id)
    return { url }
  }

  @Get("callback")
  @Public()
  async handleCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() res: Response,
  ) {
    if (!code || !state) {
      throw new BadRequestException("Missing OAuth parameters")
    }

    try {
      const { redirectUri, account } =
        await this.googleOAuth.handleOAuthCallback(code, state)
      if (account?.id) {
        await this.calendarSync.syncAccountById(account.id)
      }
      return res.redirect(`${redirectUri}&status=success`)
    } catch (error) {
      console.error("Google OAuth error", error)
      const redirectBase = this.googleOAuth.settingsRedirectBase
      return res.redirect(`${redirectBase}&status=error`)
    }
  }
}
