import { ApiProperty } from "@nestjs/swagger"

export class OnboardingGoogleAccountDto {
  @ApiProperty()
  id!: string

  @ApiProperty()
  providerAccountId!: string

  @ApiProperty({ nullable: true })
  email!: string | null

  @ApiProperty({ nullable: true })
  label!: string | null

  @ApiProperty()
  linkedAt!: string

  @ApiProperty({ nullable: true })
  lastSyncedAt!: string | null
}

export class SocialConnectionsDto {
  @ApiProperty()
  linkedin!: boolean

  @ApiProperty()
  facebook!: boolean
}

export class MeetingPreferenceDto {
  @ApiProperty()
  leadMinutes!: number

  @ApiProperty()
  defaultNotetaker!: boolean
}

export class AutomationPreferencesDto {
  @ApiProperty()
  generateTranscripts!: boolean

  @ApiProperty()
  createEmailDrafts!: boolean

  @ApiProperty()
  generateSocialPosts!: boolean
}

export class OnboardingStateDto {
  @ApiProperty()
  hasGoogleCalendar!: boolean

  @ApiProperty()
  isComplete!: boolean

  @ApiProperty({ nullable: true })
  completedAt!: string | null

  @ApiProperty({ type: [OnboardingGoogleAccountDto] })
  googleAccounts!: OnboardingGoogleAccountDto[]

  @ApiProperty({ type: SocialConnectionsDto })
  socialConnections!: SocialConnectionsDto

  @ApiProperty({ type: MeetingPreferenceDto })
  meetingPreference!: MeetingPreferenceDto

  @ApiProperty({ type: AutomationPreferencesDto })
  automationPreferences!: AutomationPreferencesDto
}

