import { MeetingPreferenceDto } from "../../meetings/dto/meeting-preference.dto"

export class OnboardingGoogleAccountDto {
  id!: string
  providerAccountId!: string
  email!: string | null
  label!: string | null
  linkedAt!: string
  lastSyncedAt!: string | null
}

export class OnboardingSocialConnectionsDto {
  linkedin!: boolean
  facebook!: boolean
}

export class OnboardingAutomationPreferencesDto {
  generateTranscripts!: boolean
  createEmailDrafts!: boolean
  generateSocialPosts!: boolean
}

export class OnboardingStateDto {
  hasGoogleCalendar!: boolean
  isComplete!: boolean
  completedAt!: string | null
  googleAccounts!: OnboardingGoogleAccountDto[]
  socialConnections!: OnboardingSocialConnectionsDto
  meetingPreference!: MeetingPreferenceDto
  automationPreferences!: OnboardingAutomationPreferencesDto
}
