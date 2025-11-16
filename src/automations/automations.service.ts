import { Injectable } from "@nestjs/common"
import { Prisma, SocialChannel } from "@prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import { CreateAutomationDto } from "./dto/create-automation.dto"
import { UpdateAutomationDto } from "./dto/update-automation.dto"
import { AppError } from "../errors/app-error"
import { ErrorCodes } from "../errors/error-codes"

@Injectable()
export class AutomationsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.automation.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    })
  }

  create(userId: string, dto: CreateAutomationDto) {
    return this.prisma.$transaction(async (tx) => {
      const channel = dto.channel ?? SocialChannel.LINKEDIN
      const isEnabled = dto.isEnabled ?? true

      if (isEnabled) {
        await tx.automation.updateMany({
          where: {
            userId,
            channel,
          },
          data: { isEnabled: false },
        })
      }

      return tx.automation.create({
        data: {
          userId,
          name: dto.name,
          channel,
          promptTemplate: dto.promptTemplate,
          isEnabled,
          config: dto.config
            ? (dto.config as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      })
    })
  }

  async update(id: string, userId: string, dto: UpdateAutomationDto) {
    return this.prisma.$transaction(async (tx) => {
      const automation = await tx.automation.findUnique({
        where: { id },
      })
      if (!automation || automation.userId !== userId) {
        throw new AppError(ErrorCodes.NOT_FOUND, {
          params: { resource: "Automation" },
        })
      }

      const nextChannel = dto.channel ?? automation.channel
      const nextIsEnabled =
        dto.isEnabled !== undefined ? dto.isEnabled : automation.isEnabled

      const data: Prisma.AutomationUpdateInput = {
        name: dto.name ?? automation.name,
        channel: nextChannel,
        promptTemplate: dto.promptTemplate ?? automation.promptTemplate,
        isEnabled: nextIsEnabled,
      }

      if (dto.config !== undefined) {
        data.config = (dto.config as Prisma.InputJsonValue) ?? Prisma.JsonNull
      }

      const updated = await tx.automation.update({
        where: { id },
        data,
      })

      if (nextIsEnabled) {
        await tx.automation.updateMany({
          where: {
            userId,
            channel: nextChannel,
            NOT: { id: updated.id },
          },
          data: { isEnabled: false },
        })
      }

      return updated
    })
  }
}
