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
import { LinkedInOAuthService } from "./linkedin-oauth.service"
import { CurrentDbUser } from "../../users/decorators/current-db-user.decorator"

@ApiTags("Integrations")
@Controller("integrations/linkedin/oauth")
export class LinkedInOAuthController {
  private readonly logger = new Logger(LinkedInOAuthController.name)

  constructor(private readonly linkedInOAuth: LinkedInOAuthService) {}

  @Get("url")
  async getUrl(@CurrentDbUser() user: User) {
    const url = this.linkedInOAuth.buildAuthorizationUrl(user.id)
    return { url }
  }

  @Get("callback")
  @Public()
  async handleCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("error") error: string,
    @Query("error_description") errorDescription: string,
    @Res() res: Response,
  ) {
    // Check for OAuth errors from LinkedIn
    if (error) {
      this.logger.error(
        `LinkedIn OAuth error: ${error} - ${errorDescription || "No description"}`,
      )
      return res.redirect(
        `${this.linkedInOAuth.settingsRedirectBase}&status=error&error=${encodeURIComponent(error)}&description=${encodeURIComponent(errorDescription || "")}`,
      )
    }

    if (!code || !state) {
      this.logger.warn("Missing OAuth parameters", { code: !!code, state: !!state })
      throw new BadRequestException("Missing OAuth parameters")
    }

    try {
      this.logger.log("Processing LinkedIn OAuth callback")
      await this.linkedInOAuth.handleCallback(code, state)
      this.logger.log("LinkedIn OAuth callback successful")
      return res.redirect(
        `${this.linkedInOAuth.settingsRedirectBase}&status=success`,
      )
    } catch (error) {
      this.logger.error(
        `LinkedIn OAuth callback failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      return res.redirect(
        `${this.linkedInOAuth.settingsRedirectBase}&status=error&message=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`,
      )
    }
  }
}


