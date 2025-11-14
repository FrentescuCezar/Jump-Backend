import { Global, Module } from "@nestjs/common"
import { KeycloakAdminService } from "./keycloak-admin.service"

@Global()
@Module({
  providers: [KeycloakAdminService],
  exports: [KeycloakAdminService],
})
export class KeycloakModule {}






