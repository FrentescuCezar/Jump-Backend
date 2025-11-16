import { createParamDecorator, ExecutionContext } from "@nestjs/common"
import type { Request } from "express"
import type { User } from "@prisma/client"

type RequestWithDbUser = Request & { dbUser?: User }

export const CurrentDbUserOptional = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): User | null => {
    const request = ctx.switchToHttp().getRequest<RequestWithDbUser>()
    return request.dbUser ?? null
  },
)
