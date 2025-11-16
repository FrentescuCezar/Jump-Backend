import { ApiProperty } from "@nestjs/swagger"
import { ArrayMinSize, IsArray, IsString } from "class-validator"

export class MarkMessagesReadDto {
  @ApiProperty({
    type: [String],
    description: "IDs of messages that have been read",
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  messageIds!: string[]
}
