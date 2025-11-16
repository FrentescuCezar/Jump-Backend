import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
} from "@nestjs/common"
import type { Response } from "express"
import { ApiTags } from "@nestjs/swagger"
import { MeetingsService } from "./meetings.service"
import { CurrentDbUser } from "../users/decorators/current-db-user.decorator"
import type { User } from "@prisma/client"
import {
  MeetingActivityDto,
  MeetingDetailsDto,
} from "./dto/meeting-details.dto"
import {
  MeetingPreferenceDto,
  UpdateMeetingPreferenceDto,
} from "./dto/meeting-preference.dto"
import { CreateMeetingShareDto, MeetingShareDto } from "./dto/meeting-share.dto"
import {
  MeetingChatHistoryDto,
  MeetingChatHistoryQueryDto,
  MeetingChatReadDto,
} from "./dto/meeting-chat.dto"
import { MeetingChatService } from "./services/meeting-chat.service"

@ApiTags("Meetings")
@Controller("meetings")
export class MeetingsController {
  constructor(
    private readonly meetingsService: MeetingsService,
    private readonly meetingChat: MeetingChatService,
  ) {}

  @Get(":id/details")
  async getDetails(
    @Param("id") meetingId: string,
    @CurrentDbUser() user: User,
  ): Promise<MeetingDetailsDto> {
    return this.meetingsService.getMeetingDetails(meetingId, user.id)
  }

  @Get(":id/activity")
  async getActivity(
    @Param("id") meetingId: string,
    @CurrentDbUser() user: User,
  ): Promise<MeetingActivityDto> {
    return this.meetingsService.getMeetingActivity(meetingId, user)
  }

  @Get(":id/media/transcript")
  async streamTranscript(
    @Param("id") meetingId: string,
    @CurrentDbUser() user: User,
    @Res() res: Response,
  ) {
    await this.meetingsService.streamTranscript(meetingId, user.id, res)
  }

  @Get(":id/media/video")
  async getVideoPlaybackUrl(
    @Param("id") meetingId: string,
    @CurrentDbUser() user: User,
  ) {
    return this.meetingsService.getVideoPlaybackUrl(meetingId, user.id)
  }

  @Post(":id/ai/regenerate")
  async regenerateAiContent(
    @Param("id") meetingId: string,
    @CurrentDbUser() user: User,
  ) {
    await this.meetingsService.regenerateAiContent(meetingId, user.id)
    return { success: true }
  }

  @Get(":id/shares")
  async listShares(
    @Param("id") meetingId: string,
    @CurrentDbUser() user: User,
  ): Promise<MeetingShareDto[]> {
    return this.meetingsService.listMeetingShares(meetingId, user.id)
  }

  @Post(":id/shares")
  async createShare(
    @Param("id") meetingId: string,
    @Body() body: CreateMeetingShareDto,
    @CurrentDbUser() user: User,
  ): Promise<MeetingShareDto> {
    return this.meetingsService.addMeetingShare(meetingId, user.id, body.email)
  }

  @Get(":id/chat/messages")
  async getChatHistory(
    @Param("id") meetingId: string,
    @Query() query: MeetingChatHistoryQueryDto,
    @CurrentDbUser() user: User,
  ): Promise<MeetingChatHistoryDto> {
    const limit = query.limit ?? 30
    return this.meetingChat.getHistory({
      meetingId,
      viewer: user,
      limit,
      before: query.before,
    })
  }

  @Post(":id/chat/read")
  async markChatRead(
    @Param("id") meetingId: string,
    @Body() body: MeetingChatReadDto,
    @CurrentDbUser() user: User,
  ) {
    return this.meetingChat.markMessagesRead({
      meetingId,
      viewer: user,
      messageIds: body.messageIds,
    })
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
