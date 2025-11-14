import { Module } from "@nestjs/common"
import { APP_INTERCEPTOR } from "@nestjs/core"
import { UsersController } from "./users.controller"
import { UsersService } from "./users.service"
import { EnsureDbUserInterceptor } from "./interceptors/ensure-db-user.interceptor"

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    {
      provide: APP_INTERCEPTOR,
      useClass: EnsureDbUserInterceptor,
    },
  ],
  exports: [UsersService],
})
export class UsersModule {}






