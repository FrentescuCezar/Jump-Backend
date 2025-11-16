import { Controller, Get, Put, Body } from "@nestjs/common"
import { ApiTags, ApiOperation } from "@nestjs/swagger"
import { OnboardingService } from "./onboarding.service"
import { CurrentDbUser } from "../users/decorators/current-db-user.decorator"
import type { User } from "@prisma/client"
import type { OnboardingStateDto } from "./dto/onboarding-state.dto"
import type { UpdateOnboardingPreferencesDto } from "./dto/update-onboarding-preferences.dto"

@ApiTags("Onboarding")
@Controller("onboarding")
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get("state")
  @ApiOperation({ summary: "Get onboarding state" })
  async getState(@CurrentDbUser() user: User): Promise<OnboardingStateDto> {
    return this.onboardingService.getState(user.id)
  }

  @Put("preferences")
  @ApiOperation({ summary: "Update onboarding preferences" })
  async updatePreferences(
    @CurrentDbUser() user: User,
    @Body() dto: UpdateOnboardingPreferencesDto,
  ): Promise<OnboardingStateDto> {
    return this.onboardingService.updatePreferences(user.id, dto)
  }
}

