import { forwardRef, Module } from "@nestjs/common"
import { CalendarController } from "./calendar.controller"
import { CalendarService } from "./calendar.service"
import { CalendarSyncService } from "./calendar-sync.service"
import { IntegrationsModule } from "../integrations/integrations.module"
import { RecallModule } from "../recall/recall.module"

@Module({
  imports: [forwardRef(() => IntegrationsModule), RecallModule],
  controllers: [CalendarController],
  providers: [CalendarService, CalendarSyncService],
  exports: [CalendarService, CalendarSyncService],
})
export class CalendarModule {}


