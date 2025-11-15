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
    return this.prisma.automation.create({
      data: {
        userId,
        name: dto.name,
        channel: dto.channel ?? SocialChannel.LINKEDIN,
        promptTemplate: dto.promptTemplate,
        isEnabled: dto.isEnabled ?? true,
        config: dto.config
          ? (dto.config as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    })
  }

  async update(id: string, userId: string, dto: UpdateAutomationDto) {
    const automation = await this.prisma.automation.findUnique({
      where: { id },
    })
    if (!automation || automation.userId !== userId) {
      throw new AppError(ErrorCodes.NOT_FOUND, {
        params: { resource: "Automation" },
      })
    }

    const data: Prisma.AutomationUpdateInput = {
      name: dto.name ?? automation.name,
      channel: dto.channel ?? automation.channel,
      promptTemplate: dto.promptTemplate ?? automation.promptTemplate,
      isEnabled:
        dto.isEnabled !== undefined ? dto.isEnabled : automation.isEnabled,
    }

    if (dto.config !== undefined) {
      data.config = (dto.config as Prisma.InputJsonValue) ?? Prisma.JsonNull
    }

    return this.prisma.automation.update({
      where: { id },
      data,
    })
  }
}
