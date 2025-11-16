import { IsBoolean, IsInt, Max, Min, IsOptional } from "class-validator"

export class MeetingPreferenceDto {
  leadMinutes!: number
  defaultNotetaker!: boolean
}

export class UpdateMeetingPreferenceDto {
  @IsInt()
  @Min(1)
  @Max(60)
  leadMinutes!: number

  @IsOptional()
  @IsBoolean()
  defaultNotetaker?: boolean
}
