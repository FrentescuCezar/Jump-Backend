import { ApiProperty } from "@nestjs/swagger"
import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator"

export class UpdateOnboardingPreferencesDto {
  @ApiProperty({ minimum: 1, maximum: 60 })
  @IsInt()
  @Min(1)
  @Max(60)
  leadMinutes!: number

  @ApiProperty()
  @IsBoolean()
  autoJoinMeetings!: boolean

  @ApiProperty()
  @IsBoolean()
  generateTranscripts!: boolean

  @ApiProperty()
  @IsBoolean()
  createEmailDrafts!: boolean

  @ApiProperty()
  @IsBoolean()
  generateSocialPosts!: boolean

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  completeOnboarding?: boolean
}

