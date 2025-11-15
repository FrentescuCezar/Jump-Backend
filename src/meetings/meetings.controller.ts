import { Body, Controller, Get, Param, Post, Put, Res } from "@nestjs/common"
import type { Response } from "express"
import { ApiTags } from "@nestjs/swagger"
import { MeetingsService } from "./meetings.service"
import { CurrentDbUser } from "../users/decorators/current-db-user.decorator"
import type { User } from "@prisma/client"
import { MeetingDetailsDto } from "./dto/meeting-details.dto"
import {
  MeetingPreferenceDto,
  UpdateMeetingPreferenceDto,
} from "./dto/meeting-preference.dto"

@ApiTags("Meetings")
@Controller("meetings")
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Get(":id/details")
  async getDetails(
    @Param("id") meetingId: string,
    @CurrentDbUser() user: User,
  ): Promise<MeetingDetailsDto> {
    return this.meetingsService.getMeetingDetails(meetingId, user.id)
  }

  @Get(":id/media/transcript")
  async streamTranscript(
    @Param("id") meetingId: string,
    @CurrentDbUser() user: User,
    @Res() res: Response,
  ) {
    await this.meetingsService.streamTranscript(meetingId, user.id, res)
  }

  @Post(":id/ai/regenerate")
  async regenerateAiContent(
    @Param("id") meetingId: string,
    @CurrentDbUser() user: User,
  ) {
    await this.meetingsService.regenerateAiContent(meetingId, user.id)
    return { success: true }
  }

  @Get("preferences")
  async getPreferences(
    @CurrentDbUser() user: User,
  ): Promise<MeetingPreferenceDto> {
    return this.meetingsService.getMeetingPreference(user.id)
  }

  @Put("preferences")
  async updatePreferences(
    @Body() body: UpdateMeetingPreferenceDto,
    @CurrentDbUser() user: User,
  ): Promise<MeetingPreferenceDto> {
    return this.meetingsService.updateMeetingPreference(user.id, body)
  }
}
