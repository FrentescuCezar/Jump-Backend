import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator"
import { SocialChannel } from "@prisma/client"

export class UpdateAutomationDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsEnum(SocialChannel)
  channel?: SocialChannel

  @IsOptional()
  @IsString()
  promptTemplate?: string

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>
}
