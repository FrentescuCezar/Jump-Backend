import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common"
import type { Observable } from "rxjs"
import type { Request } from "express"
import type { User } from "@prisma/client"
import type { AuthenticatedUser } from "../../common/types/authenticated-user"
import { UsersService } from "../users.service"

type RequestWithUser = Request & {
  user?: AuthenticatedUser
  dbUser?: User
}

@Injectable()
export class EnsureDbUserInterceptor implements NestInterceptor {
  constructor(private readonly usersService: UsersService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<RequestWithUser>()
    const authUser = request?.user

    if (authUser?.sub) {
      request.dbUser = await this.usersService.ensureUserEntity(authUser)
    }

    return next.handle()
  }
}

