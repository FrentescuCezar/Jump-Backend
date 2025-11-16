import { IsEmail } from "class-validator"

export class CreateMeetingShareDto {
  @IsEmail()
  email: string
}

export class MeetingShareDto {
  id: string
  email: string
  invitedByUserId?: string | null
  createdAt: string
}
