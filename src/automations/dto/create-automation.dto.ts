import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator"
import { SocialChannel } from "@prisma/client"

export class CreateAutomationDto {
  @IsString()
  name!: string

  @IsEnum(SocialChannel)
  channel!: SocialChannel

  @IsString()
  promptTemplate!: string

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>
}


