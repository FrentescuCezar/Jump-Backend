import { IsInt, Max, Min } from "class-validator"

export class MeetingPreferenceDto {
  leadMinutes!: number
}

export class UpdateMeetingPreferenceDto {
  @IsInt()
  @Min(1)
  @Max(60)
  leadMinutes!: number
}

