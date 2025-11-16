import { Module } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"
import { ConfigModule, ConfigService } from "@nestjs/config"
import {
  AuthGuard,
  KeycloakConnectModule,
  ResourceGuard,
  RoleGuard,
} from "nest-keycloak-connect"
import { AppController } from "./app.controller"
import { AppService } from "./app.service"
import { PrismaModule } from "../prisma/prisma.module"
import { KeycloakModule } from "./keycloak/keycloak.module"
import { UsersModule } from "./users/users.module"
import { ExamplesModule } from "./examples/examples.module"
import { ScheduleModule } from "@nestjs/schedule"
import { IntegrationsModule } from "./integrations/integrations.module"
import { CalendarModule } from "./calendar/calendar.module"
import { RecallModule } from "./recall/recall.module"
import { MeetingsModule } from "./meetings/meetings.module"
import { AutomationsModule } from "./automations/automations.module"
import { SocialModule } from "./social/social.module"
import { OnboardingModule } from "./onboarding/onboarding.module"

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
    KeycloakModule,
    UsersModule,
    ExamplesModule,
    IntegrationsModule,
    CalendarModule,
    RecallModule,
    MeetingsModule,
    AutomationsModule,
    SocialModule,
    OnboardingModule,
    KeycloakConnectModule.registerAsync({
      useFactory: (configService: ConfigService) => {
        return {
          authServerUrl: configService.getOrThrow<string>("KEYCLOAK_BASE_URL"),
          realm: configService.getOrThrow<string>("KEYCLOAK_REALM"),
          clientId: configService.getOrThrow<string>("KEYCLOAK_CLIENT_ID"),
          bearerOnly:
            configService.getOrThrow<string>("KEYCLOAK_BEARER_ONLY") === "true",
          secret: configService.getOrThrow<string>("KEYCLOAK_CLIENT_SECRET"),
          cookieKey: "KEYCLOAK_JWT",
        }
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ResourceGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RoleGuard,
    },
  ],
})
export class AppModule {}
