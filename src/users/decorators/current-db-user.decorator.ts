import { createParamDecorator, ExecutionContext } from "@nestjs/common"
import type { Request } from "express"
import type { User } from "@prisma/client"
import { AppError } from "../../errors/app-error"
import { ErrorCodes } from "../../errors/error-codes"

type RequestWithDbUser = Request & { dbUser?: User }

export const CurrentDbUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest<RequestWithDbUser>()
    if (!request.dbUser) {
      throw new AppError(ErrorCodes.UNAUTHORIZED)
    }
    return request.dbUser
  },
)
