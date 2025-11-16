import { Module } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"
import { ConfigModule } from "@nestjs/config"
import { ScheduleModule } from "@nestjs/schedule"
import { PrismaModule } from "../../prisma/prisma.module"
import { KeycloakModule } from "../../src/keycloak/keycloak.module"
import { KeycloakAdminService } from "../../src/keycloak/keycloak-admin.service"
import { UsersModule } from "../../src/users/users.module"
import { ExamplesModule } from "../../src/examples/examples.module"
import { IntegrationsModule } from "../../src/integrations/integrations.module"
import { CalendarModule } from "../../src/calendar/calendar.module"
import { RecallModule } from "../../src/recall/recall.module"
import { AppController } from "../../src/app.controller"
import { AppService } from "../../src/app.service"
import { MockAuthGuard, MockResourceGuard, MockRoleGuard } from "./e2e-module.helper"
import { PrismaService } from "../../prisma/prisma.service"

/**
 * Test AppModule that replaces Keycloak guards with mocks
 * This bypasses Keycloak authentication entirely for e2e tests
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV}.local`,
        `.env.${process.env.NODE_ENV}`,
        ".env",
      ],
      cache: true,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    KeycloakModule, // Import it but we'll override KeycloakAdminService in tests
    UsersModule,
    ExamplesModule,
    IntegrationsModule,
    CalendarModule,
    RecallModule,
    // Don't import KeycloakConnectModule - we're mocking the guards instead
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // KeycloakAdminService will be overridden in test files using .overrideProvider()
    // Provide mock guards as APP_GUARD instead of real Keycloak guards
    {
      provide: APP_GUARD,
      useFactory: (prisma: PrismaService) => new MockAuthGuard(prisma),
      inject: [PrismaService],
    },
    {
      provide: APP_GUARD,
      useClass: MockResourceGuard,
    },
    {
      provide: APP_GUARD,
      useClass: MockRoleGuard,
    },
  ],
})
export class TestAppModule {}

