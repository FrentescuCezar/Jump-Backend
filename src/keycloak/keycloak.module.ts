import { Global, Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { KeycloakAdminService } from "./keycloak-admin.service"

@Global()
@Module({
  imports: [ConfigModule],
  providers: [KeycloakAdminService],
  exports: [KeycloakAdminService],
})
export class KeycloakModule {}
