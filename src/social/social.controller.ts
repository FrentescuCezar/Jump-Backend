import { Controller, Param, Post } from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import type { User } from "@prisma/client"
import { CurrentDbUser } from "../users/decorators/current-db-user.decorator"
import { SocialPublishingService } from "./social-publishing.service"

@ApiTags("Social")
@Controller("social")
export class SocialController {
  constructor(private readonly socialPublishing: SocialPublishingService) {}

  @Post("publish/:id")
  async publish(@Param("id") id: string, @CurrentDbUser() user: User) {
    const post = await this.socialPublishing.publishPost(id, user.id)
    return { post }
  }
}
