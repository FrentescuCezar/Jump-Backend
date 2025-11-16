import { Body, Controller, Get, Put } from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import type { User } from "@prisma/client"
import { CurrentDbUser } from "../users/decorators/current-db-user.decorator"
import { OnboardingService } from "./onboarding.service"
import { OnboardingStateDto } from "./dto/onboarding-state.dto"
import { UpdateOnboardingPreferencesDto } from "./dto/update-onboarding-preferences.dto"

@ApiTags("Onboarding")
@Controller("onboarding")
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get("state")
  getState(@CurrentDbUser() user: User): Promise<OnboardingStateDto> {
    return this.onboarding.getState(user.id)
  }

  @Put("preferences")
  updatePreferences(
    @CurrentDbUser() user: User,
    @Body() body: UpdateOnboardingPreferencesDto,
  ): Promise<OnboardingStateDto> {
    return this.onboarding.updatePreferences(user.id, body)
  }
}
