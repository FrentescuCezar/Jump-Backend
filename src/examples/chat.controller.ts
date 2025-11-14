import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"
import { ChatService } from "./services/chat.service"
import { NotificationsService } from "./services/notifications.service"
import { ChatHistoryQueryDto } from "./dto/chat-history-query.dto"
import { CreateChatRoomDto } from "./dto/create-chat-room.dto"
import { MarkMessagesReadDto } from "./dto/mark-messages-read.dto"
import type { AuthenticatedRequest } from "../keycloak/authenticated-request.type"

@ApiTags("Examples")
@Controller("examples/chat")
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get("rooms")
  @ApiOperation({
    summary: "List chat rooms for the current user",
    description:
      "Returns a lightweight summary with the last message and unread count per room.",
  })
  rooms(@Req() req: AuthenticatedRequest) {
    return this.chatService.listRoomsForUser(req.user.sub)
  }

  @Get("rooms/:slug/messages")
  @ApiOperation({
    summary: "Scroll chat history",
    description:
      "Returns messages ordered ascending. Pass the `before` cursor to paginate older history.",
  })
  async history(
    @Param("slug") slug: string,
    @Query() query: ChatHistoryQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const limit = query.limit ?? 30
    const history = await this.chatService.getRoomHistory(
      req.user.sub,
      slug,
      limit,
      query.before,
    )
    await this.notificationsService.markRoomAsRead(req.user.sub, slug)
    return history
  }

  @Post("rooms")
  @ApiOperation({
    summary: "Create a new chat room",
    description:
      "Creates a channel and shares it with the provided participants (creator is included automatically).",
  })
  createRoom(@Body() dto: CreateChatRoomDto, @Req() req: AuthenticatedRequest) {
    return this.chatService.createRoom({
      creatorId: req.user.sub,
      name: dto.name,
      description: dto.description,
      theme: dto.theme,
      participants: dto.participants ?? [],
    })
  }

  @Post("rooms/:slug/read")
  @ApiOperation({
    summary: "Mark chat messages as read",
    description: "Stores read receipts for the provided message IDs.",
  })
  markMessagesRead(
    @Param("slug") slug: string,
    @Body() dto: MarkMessagesReadDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chatService.markMessagesRead({
      userId: req.user.sub,
      roomSlug: slug,
      messageIds: dto.messageIds,
    })
  }
}
