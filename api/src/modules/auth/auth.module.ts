import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { MiniappAuthController } from './miniapp-auth.controller.js'
import { WecomService } from './wecom.service.js'
import { LoginRateLimiterService } from '../../common/security/login-rate-limiter.service.js'

@Module({
  controllers: [AuthController, MiniappAuthController],
  providers: [AuthService, WecomService, LoginRateLimiterService],
  exports: [AuthService, WecomService],
})
export class AuthModule {}
