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

function buildRedirectUrl(baseUrl: string, params: Record<string, string>) {
  const url = new URL(baseUrl)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value)
    }
  })
  return url.toString()
}

@ApiTags("Integrations")
@Controller("integrations/google/oauth")
export class GoogleOAuthController {
  constructor(
    private readonly googleOAuth: GoogleOAuthService,
    private readonly calendarSync: CalendarSyncService,
  ) {}

  @Get("url")
  async getAuthUrl(
    @CurrentDbUser() user: User,
    @Query("redirect") redirect?: string,
  ) {
    const url = this.googleOAuth.buildAuthorizationUrl(user.id, redirect)
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
      const { account, redirectUri } =
        await this.googleOAuth.handleOAuthCallback(code, state)
      if (account?.id) {
        await this.calendarSync.syncAccountById(account.id)
      }
      return res.redirect(
        buildRedirectUrl(redirectUri, {
          status: "success",
        }),
      )
    } catch (error) {
      console.error("Google OAuth error", error)
      const redirectBase = this.googleOAuth.settingsRedirectBase
      return res.redirect(
        buildRedirectUrl(redirectBase, {
          status: "error",
        }),
      )
    }
  }
}
