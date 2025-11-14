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
    PrismaModule,
    KeycloakModule,
    UsersModule,
    ExamplesModule,
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
