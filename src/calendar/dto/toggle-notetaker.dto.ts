import { IsBoolean } from "class-validator"

export class ToggleNotetakerDto {
  @IsBoolean()
  enabled!: boolean
}
