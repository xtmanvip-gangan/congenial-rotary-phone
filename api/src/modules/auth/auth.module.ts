import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { MiniappAuthController } from './miniapp-auth.controller.js'
import { WecomService } from './wecom.service.js'

@Module({
  controllers: [AuthController, MiniappAuthController],
  providers: [AuthService, WecomService],
  exports: [AuthService, WecomService],
})
export class AuthModule {}
