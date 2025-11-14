import { ApiProperty } from "@nestjs/swagger"
import { IsNotEmpty, IsOptional, IsString } from "class-validator"

export class PlannerDeltaSyncDto {
  @ApiProperty({
    example: "usr_1",
    description: "User ID to fetch entries for",
  })
  @IsString()
  @IsNotEmpty()
  userId!: string

  @ApiProperty({
    example: "2025-02-18T07:20:12Z",
    description:
      "ISO timestamp - return only entries created or updated after this time",
  })
  @IsString()
  @IsNotEmpty()
  updatedSince!: string

  @ApiProperty({
    example: "2025-01-01",
    description:
      "Optional: Start date filter (only return entries within this range)",
    required: false,
  })
  @IsString()
  @IsOptional()
  start?: string

  @ApiProperty({
    example: "2025-03-31",
    description:
      "Optional: End date filter (only return entries within this range)",
    required: false,
  })
  @IsString()
  @IsOptional()
  end?: string
}

