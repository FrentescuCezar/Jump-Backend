import { Body, Controller, Get, Post } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"
import { PlannerService } from "./services/planner.service"
import type {
  PlannerEntriesPayload,
  PlannerProjectsPayload,
  PlannerDeltaSyncPayload,
} from "./types/planner.types"
import { PlannerRangeDto } from "./dto/planner-range.dto"
import { CreatePlannerEntryDto } from "./dto/create-planner-entry.dto"
import { PlannerDeltaSyncDto } from "./dto/planner-delta-sync.dto"
import { PlannerDeltaSyncService } from "./services/planner-delta-sync.service"

@ApiTags("Examples")
@Controller("examples/planner")
export class PlannerController {
  constructor(
    private readonly plannerService: PlannerService,
    private readonly deltaSyncService: PlannerDeltaSyncService,
  ) {}

  @Post("query")
  @ApiOperation({
    summary: "Timesheet-style range query",
    description:
      "Protected endpoint used by the TanStack Query example. Requires a valid Keycloak token.",
  })
  query(@Body() dto: PlannerRangeDto): Promise<PlannerEntriesPayload> {
    return this.plannerService.getPlannerEntries(dto)
  }

  @Post("entries")
  @ApiOperation({
    summary: "Create a new focus entry",
    description:
      "Validates hours, activity type and project assignment before persisting.",
  })
  createEntry(@Body() dto: CreatePlannerEntryDto) {
    return this.plannerService.createPlannerEntry(dto)
  }

  @Post("delta-sync")
  @ApiOperation({
    summary: "Delta sync - fetch only updated entries",
    description:
      "Returns only entries created or updated since the provided timestamp. Used for efficient polling.",
  })
  deltaSync(
    @Body() dto: PlannerDeltaSyncDto,
  ): Promise<PlannerDeltaSyncPayload> {
    return this.deltaSyncService.getDeltaSync(dto)
  }

  @Get("projects")
  @ApiOperation({
    summary: "Catalog of projects and templates",
    description:
      "Lightweight metadata endpoint used to hydrate dropdowns and template shortcuts.",
  })
  projects(): Promise<PlannerProjectsPayload> {
    return this.plannerService.getPlannerProjects()
  }
}
