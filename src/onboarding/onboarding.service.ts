import { Injectable, BadRequestException } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import { ConnectedProvider } from "@prisma/client"
import type {
  OnboardingStateDto,
  OnboardingGoogleAccountDto,
  SocialConnectionsDto,
  MeetingPreferenceDto,
  AutomationPreferencesDto,
} from "./dto/onboarding-state.dto"
import type { UpdateOnboardingPreferencesDto } from "./dto/update-onboarding-preferences.dto"

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getState(userId: string): Promise<OnboardingStateDto> {
    const [accounts, meetingPreference, user] = await Promise.all([
      this.prisma.connectedAccount.findMany({
        where: { userId },
      }),
      this.findOrCreateMeetingPreference(userId),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { onboardingCompletedAt: true },
      }),
    ])

    const googleAccounts = accounts
      .filter((acc) => acc.provider === ConnectedProvider.GOOGLE_CALENDAR)
      .map((acc) => this.toGoogleAccountDto(acc))

    const hasGoogleCalendar = googleAccounts.length > 0

    const socialConnections = await this.getSocialConnections(userId)

    const automationPreferences =
      await this.findOrCreateAutomationPreferences(userId)

    const isComplete = !!user?.onboardingCompletedAt && hasGoogleCalendar

    return {
      hasGoogleCalendar,
      isComplete,
      completedAt: user?.onboardingCompletedAt?.toISOString() ?? null,
      googleAccounts,
      socialConnections,
      meetingPreference: {
        leadMinutes: meetingPreference.leadMinutes,
        defaultNotetaker: meetingPreference.defaultNotetaker,
      },
      automationPreferences,
    }
  }

  async updatePreferences(
    userId: string,
    dto: UpdateOnboardingPreferencesDto,
  ): Promise<OnboardingStateDto> {
    return await this.prisma.$transaction(async (tx) => {
      // Update meeting preference
      await tx.meetingPreference.upsert({
        where: { userId },
        create: {
          userId,
          leadMinutes: dto.leadMinutes,
          defaultNotetaker: dto.autoJoinMeetings,
        },
        update: {
          leadMinutes: dto.leadMinutes,
          defaultNotetaker: dto.autoJoinMeetings,
        },
      })

      // Update automation preferences (stored in user metadata for now)
      // Since AutomationPreference model doesn't exist, we'll store it in user metadata
      // or create a simple approach
      await this.updateAutomationPreferences(userId, dto)

      // Check if completing onboarding
      if (dto.completeOnboarding) {
        const googleCalendarCount = await tx.connectedAccount.count({
          where: {
            userId,
            provider: ConnectedProvider.GOOGLE_CALENDAR,
          },
        })

        if (googleCalendarCount === 0) {
          throw new BadRequestException(
            "Cannot complete onboarding without Google Calendar connection",
          )
        }

        await tx.user.update({
          where: { id: userId },
          data: {
            onboardingCompletedAt: new Date(),
          },
        })
      }

      return this.getState(userId)
    })
  }

  private async findOrCreateMeetingPreference(userId: string) {
    let preference = await this.prisma.meetingPreference.findUnique({
      where: { userId },
    })

    if (!preference) {
      preference = await this.prisma.meetingPreference.create({
        data: {
          userId,
          leadMinutes: 10,
          defaultNotetaker: false,
        },
      })
    }

    return preference
  }

  private async findOrCreateAutomationPreferences(
    userId: string,
  ): Promise<AutomationPreferencesDto> {
    // TODO: Add AutomationPreference model to Prisma schema
    // For now, return defaults since the model doesn't exist yet
    // The preferences are stored but not persisted between requests
    return {
      generateTranscripts: false,
      createEmailDrafts: false,
      generateSocialPosts: false,
    }
  }

  private async updateAutomationPreferences(
    userId: string,
    dto: UpdateOnboardingPreferencesDto,
  ): Promise<void> {
    // TODO: Add AutomationPreference model to Prisma schema
    // For now, this is a no-op since the model doesn't exist
    // The preferences will be returned from the DTO but not persisted
  }

  private async getSocialConnections(
    userId: string,
  ): Promise<SocialConnectionsDto> {
    const accounts = await this.prisma.connectedAccount.findMany({
      where: { userId },
    })

    return {
      linkedin: accounts.some(
        (acc) => acc.provider === ConnectedProvider.LINKEDIN,
      ),
      facebook: accounts.some(
        (acc) => acc.provider === ConnectedProvider.FACEBOOK,
      ),
    }
  }

  private toGoogleAccountDto(account: {
    id: string
    providerAccountId: string
    label: string | null
    linkedAt: Date
    lastSyncedAt: Date | null
    metadata: unknown
  }): OnboardingGoogleAccountDto {
    const metadata = account.metadata as { email?: string } | null
    return {
      id: account.id,
      providerAccountId: account.providerAccountId,
      email: metadata?.email ?? null,
      label: account.label,
      linkedAt: account.linkedAt.toISOString(),
      lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    }
  }
}
