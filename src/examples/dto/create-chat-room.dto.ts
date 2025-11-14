import { ApiProperty } from "@nestjs/swagger"
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator"

export class CreateChatRoomDto {
  @ApiProperty({
    example: "Platform Firewatch",
    description: "Human-friendly room name",
    minLength: 3,
    maxLength: 80,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  name!: string

  @ApiProperty({
    example: "Escalations channel for on-call engineers",
    description: "One-line description shown in the sidebar",
    minLength: 5,
    maxLength: 160,
  })
  @IsString()
  @MinLength(5)
  @MaxLength(160)
  description!: string

  @ApiProperty({
    example: "#2563eb",
    description: "Optional hex color to tint the channel badge",
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
    message: "Theme must be a valid hex color (e.g. #2563eb)",
  })
  theme?: string

  @ApiProperty({
    type: [String],
    example: [],
    description:
      "Optional user IDs to add to the room (creator is included automatically). If empty, the room is public and anyone can join.",
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(3, { each: true })
  participants?: string[]
}
