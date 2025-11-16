import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { Transform } from "class-transformer"
import { IsArray, IsInt, IsOptional, IsString, Min } from "class-validator"

export class MeetingChatHistoryQueryDto {
  @ApiPropertyOptional({
    description: "Cursor – message ID to page before (exclusive)",
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

export class MeetingChatReadDto {
  @ApiProperty({
    type: [String],
    description: "IDs of messages that have been read",
  })
  @IsArray()
  @IsString({ each: true })
  messageIds!: string[]
}

export class MeetingChatMessageDto {
  @ApiProperty()
  id!: string

  @ApiProperty()
  meetingId!: string

  @ApiProperty()
  senderId!: string

  @ApiProperty()
  senderName!: string

  @ApiProperty()
  body!: string

  @ApiProperty()
  createdAt!: string

  @ApiProperty({
    type: [String],
  })
  readBy!: string[]
}

export class MeetingChatHistoryDto {
  @ApiProperty()
  meetingId!: string

  @ApiProperty({
    type: [MeetingChatMessageDto],
  })
  messages!: MeetingChatMessageDto[]

  @ApiProperty({
    nullable: true,
  })
  nextCursor!: string | null
}

