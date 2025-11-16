import { BadRequestException, Injectable } from "@nestjs/common"
import {
  AutomationPreference,
  ConnectedAccount,
  ConnectedProvider,
  MeetingPreference,
} from "@prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import {
  OnboardingStateDto,
  OnboardingGoogleAccountDto,
} from "./dto/onboarding-state.dto"
import { UpdateOnboardingPreferencesDto } from "./dto/update-onboarding-preferences.dto"

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getState(userId: string): Promise<OnboardingStateDto> {
    const [accounts, meetingPreference, automationPreference, user] =
      await Promise.all([
        this.prisma.connectedAccount.findMany({
          where: { userId },
          orderBy: { linkedAt: "asc" },
        }),
        this.findOrCreateMeetingPreference(userId),
        this.findOrCreateAutomationPreference(userId),
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { onboardingCompletedAt: true },
        }),
      ])

    return this.buildState({
      accounts,
      meetingPreference,
      automationPreference,
      onboardingCompletedAt: user?.onboardingCompletedAt ?? null,
    })
  }

  async updatePreferences(
    userId: string,
    dto: UpdateOnboardingPreferencesDto,
  ): Promise<OnboardingStateDto> {
    await this.prisma.$transaction(async (tx) => {
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

      await tx.automationPreference.upsert({
        where: { userId },
        create: {
          userId,
          generateTranscripts: dto.generateTranscripts,
          createEmailDrafts: dto.createEmailDrafts,
          generateSocialPosts: dto.generateSocialPosts,
        },
        update: {
          generateTranscripts: dto.generateTranscripts,
          createEmailDrafts: dto.createEmailDrafts,
          generateSocialPosts: dto.generateSocialPosts,
        },
      })

      if (dto.completeOnboarding) {
        const hasGoogleAccount = await tx.connectedAccount.count({
          where: {
            userId,
            provider: ConnectedProvider.GOOGLE_CALENDAR,
          },
        })

        if (!hasGoogleAccount) {
          throw new BadRequestException(
            "Connect at least one Google Calendar to complete onboarding",
          )
        }

        await tx.user.update({
          where: { id: userId },
          data: { onboardingCompletedAt: new Date() },
        })
      }
    })

    return this.getState(userId)
  }

  private async findOrCreateMeetingPreference(userId: string) {
    let preference = await this.prisma.meetingPreference.findUnique({
      where: { userId },
    })
    if (!preference) {
      preference = await this.prisma.meetingPreference.create({
        data: { userId },
      })
    }
    return preference
  }

  private async findOrCreateAutomationPreference(userId: string) {
    let preference = await this.prisma.automationPreference.findUnique({
      where: { userId },
    })
    if (!preference) {
      preference = await this.prisma.automationPreference.create({
        data: { userId },
      })
    }
    return preference
  }

  private buildState({
    accounts,
    meetingPreference,
    automationPreference,
    onboardingCompletedAt,
  }: {
    accounts: ConnectedAccount[]
    meetingPreference: MeetingPreference
    automationPreference: AutomationPreference
    onboardingCompletedAt: Date | null
  }): OnboardingStateDto {
    const googleAccounts = accounts.filter(
      (account) => account.provider === ConnectedProvider.GOOGLE_CALENDAR,
    )

    const hasGoogleCalendar = googleAccounts.length > 0

    return {
      hasGoogleCalendar,
      isComplete: hasGoogleCalendar && !!onboardingCompletedAt,
      completedAt: onboardingCompletedAt
        ? onboardingCompletedAt.toISOString()
        : null,
      googleAccounts: googleAccounts.map((account) =>
        this.toGoogleAccountDto(account),
      ),
      socialConnections: {
        linkedin: accounts.some(
          (account) => account.provider === ConnectedProvider.LINKEDIN,
        ),
        facebook: accounts.some(
          (account) => account.provider === ConnectedProvider.FACEBOOK,
        ),
      },
      meetingPreference: {
        leadMinutes: meetingPreference.leadMinutes,
        defaultNotetaker: meetingPreference.defaultNotetaker,
      },
      automationPreferences: {
        generateTranscripts: automationPreference.generateTranscripts,
        createEmailDrafts: automationPreference.createEmailDrafts,
        generateSocialPosts: automationPreference.generateSocialPosts,
      },
    }
  }

  private toGoogleAccountDto(
    account: ConnectedAccount,
  ): OnboardingGoogleAccountDto {
    const metadata = (account.metadata ?? null) as Record<
      string,
      unknown
    > | null
    const email =
      metadata && typeof metadata.email === "string" ? metadata.email : null

    return {
      id: account.id,
      providerAccountId: account.providerAccountId,
      email,
      label: account.label ?? email,
      linkedAt: account.linkedAt.toISOString(),
      lastSyncedAt: account.lastSyncedAt
        ? account.lastSyncedAt.toISOString()
        : null,
    }
  }
}
