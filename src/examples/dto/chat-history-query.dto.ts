import { ApiPropertyOptional } from "@nestjs/swagger"
import { Transform } from "class-transformer"
import { IsInt, IsOptional, IsString, Min } from "class-validator"

export class ChatHistoryQueryDto {
  @ApiPropertyOptional({
    description: "Cursor – message ID to page before (exclusive)",
    example: "msg_01JEJ7QBKQ4K8KX3RYT8G9WJ8R",
  })
  @IsOptional()
  @IsString()
  before?: string

  @ApiPropertyOptional({
    description: "Maximum number of messages to return",
    example: 30,
    default: 30,
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? value : Number(value)))
  @IsInt()
  @Min(5)
  limit?: number
}
