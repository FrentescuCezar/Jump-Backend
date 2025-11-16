import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator"

export class UpdateOnboardingPreferencesDto {
  @IsInt()
  @Min(1)
  @Max(60)
  leadMinutes!: number

  @IsBoolean()
  autoJoinMeetings!: boolean

  @IsBoolean()
  generateTranscripts!: boolean

  @IsBoolean()
  createEmailDrafts!: boolean

  @IsBoolean()
  generateSocialPosts!: boolean

  @IsOptional()
  @IsBoolean()
  completeOnboarding?: boolean
}
