import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import type { JwtPayload } from "jsonwebtoken"
import jwt from "jsonwebtoken"

@Injectable()
export class ChatTokenService {
  private readonly secret: string
  private readonly audience: string

  constructor(private readonly configService: ConfigService) {
    this.secret = this.configService.getOrThrow<string>("CHAT_TOKEN_SECRET")
    this.audience =
      this.configService.get<string>("CHAT_TOKEN_AUDIENCE") ?? "jump-chat"
  }

  issue(userId: string, claims: Record<string, unknown> = {}) {
    return jwt.sign({ sub: userId, ...claims }, this.secret, {
      expiresIn: "15m",
      audience: this.audience,
    })
  }

  verify(token: string) {
    const payload = jwt.verify(token, this.secret, {
      audience: this.audience,
    })
    if (typeof payload === "string") {
      throw new Error("Invalid chat token payload")
    }
    return payload
  }
}
