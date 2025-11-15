import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Query,
  Res,
} from "@nestjs/common"
import type { Response } from "express"
import { ApiTags } from "@nestjs/swagger"
import { Public } from "nest-keycloak-connect"
import type { User } from "@prisma/client"
import { FacebookOAuthService } from "./facebook-oauth.service"
import { CurrentDbUser } from "../../users/decorators/current-db-user.decorator"

@ApiTags("Integrations")
@Controller("integrations/facebook/oauth")
export class FacebookOAuthController {
  private readonly logger = new Logger(FacebookOAuthController.name)

  constructor(private readonly facebookOAuth: FacebookOAuthService) {}

  @Get("url")
  async getUrl(@CurrentDbUser() user: User) {
    return { url: this.facebookOAuth.buildAuthorizationUrl(user.id) }
  }

  @Get("callback")
  @Public()
  async handleCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("error") error: string,
    @Query("error_description") errorDescription: string,
    @Query("error_reason") errorReason: string,
    @Res() res: Response,
  ) {
    // Check for OAuth errors from Facebook
    if (error) {
      this.logger.error(
        `Facebook OAuth error: ${error} - ${errorDescription || errorReason || "No description"}`,
      )
      return res.redirect(
        `${this.facebookOAuth.settingsRedirectBase}&status=error&error=${encodeURIComponent(error)}&description=${encodeURIComponent(errorDescription || errorReason || "")}`,
      )
    }

    if (!code || !state) {
      this.logger.warn("Missing OAuth parameters", { code: !!code, state: !!state })
      throw new BadRequestException("Missing OAuth parameters")
    }

    try {
      this.logger.log("Processing Facebook OAuth callback")
      await this.facebookOAuth.handleCallback(code, state)
      this.logger.log("Facebook OAuth callback successful")
      return res.redirect(
        `${this.facebookOAuth.settingsRedirectBase}&status=success`,
      )
    } catch (error) {
      this.logger.error(
        `Facebook OAuth callback failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      return res.redirect(
        `${this.facebookOAuth.settingsRedirectBase}&status=error&message=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`,
      )
    }
  }
}



