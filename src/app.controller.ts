import { Controller, Get, Res } from "@nestjs/common"
import { AppService } from "./app.service"
import { Public } from "nest-keycloak-connect"
import type { Response } from "express"

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello()
  }

  @Get("health/db")
  @Public()
  async checkDatabase() {
    return this.appService.testConnection()
  }

  @Get("favicon.ico")
  @Public()
  getFavicon(@Res() res: Response) {
    res.status(204).end()
  }
}
