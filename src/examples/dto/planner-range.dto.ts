import { ApiProperty } from "@nestjs/swagger"
import { IsNotEmpty, IsString } from "class-validator"

export class PlannerRangeDto {
  @ApiProperty({
    example: "usr_1",
    description: "User ID to fetch entries for",
  })
  @IsString()
  @IsNotEmpty()
  userId!: string

  @ApiProperty({
    example: "2025-01-01",
    description: "Start date in ISO format (YYYY-MM-DD)",
  })
  @IsString()
  @IsNotEmpty()
  start!: string

  @ApiProperty({
    example: "2025-01-31",
    description: "End date in ISO format (YYYY-MM-DD)",
  })
  @IsString()
  @IsNotEmpty()
  end!: string
}

