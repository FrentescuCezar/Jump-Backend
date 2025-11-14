import { Controller, Get } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"
import { Public } from "nest-keycloak-connect"
import { PulseService } from "./services/pulse.service"
import type { PulseResponse } from "./types/pulse.types"

@ApiTags("Examples")
@Controller("examples")
export class InsightsController {
  constructor(private readonly pulseService: PulseService) {}

  @Get("pulse")
  @Public()
  @ApiOperation({
    summary: "Public demo endpoint for server component example",
    description:
      "Returns a DTO tailored for the Next.js server-rendered team insights page.",
  })
  getPulse(): Promise<PulseResponse> {
    return this.pulseService.getPulse()
  }
}
