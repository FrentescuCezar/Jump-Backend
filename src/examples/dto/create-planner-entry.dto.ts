import { ApiProperty } from "@nestjs/swagger"
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator"

const ACTIVITY_TYPES = ["deep-work", "review", "support"] as const
type ActivityType = (typeof ACTIVITY_TYPES)[number]

export class CreatePlannerEntryDto {
  @ApiProperty({
    example: "usr_1",
    description: "User ID creating the entry",
  })
  @IsString()
  @IsNotEmpty()
  userId!: string

  @ApiProperty({
    example: "2025-01-15",
    description: "Date in ISO format (YYYY-MM-DD)",
  })
  @IsString()
  @IsNotEmpty()
  date!: string

  @ApiProperty({
    example: "proj_1",
    description: "Project ID",
  })
  @IsString()
  @IsNotEmpty()
  projectId!: string

  @ApiProperty({
    example: "deep-work",
    enum: ACTIVITY_TYPES,
    description: "Activity type",
  })
  @IsEnum(ACTIVITY_TYPES)
  activityType!: ActivityType

  @ApiProperty({
    example: 4.5,
    description: "Hours worked (0.25 to 12)",
    minimum: 0.25,
    maximum: 12,
  })
  @IsNumber()
  @Min(0.25)
  @Max(12)
  hours!: number

  @ApiProperty({
    example: "Implemented user authentication flow",
    description: "Entry description",
    minLength: 4,
    maxLength: 240,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  @MaxLength(240)
  description!: string
}

