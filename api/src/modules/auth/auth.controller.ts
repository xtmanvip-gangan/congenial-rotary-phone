import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
} from '@nestjs/common'
import { AuthService } from './auth.service.js'
import { PasswordLoginDto } from './dto/password-login.dto.js'
import { WecomCallbackDto } from './dto/wecom-callback.dto.js'
import { LoginRateLimiterService } from '../../common/security/login-rate-limiter.service.js'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly loginRateLimiter: LoginRateLimiterService,
  ) {}

  @Get('wecom/url')
  getWecomLoginUrl(@Query('state') state?: string) {
    return this.authService.getWecomLoginUrl(state)
  }

  @Post('wecom/callback')
  callback(@Body() dto: WecomCallbackDto) {
    return this.authService.loginWithWecomCode(dto.code)
  }

  @Post('login')
  async login(
    @Body() dto: PasswordLoginDto,
    @Headers('x-forwarded-for') forwardedFor?: string,
    @Headers('x-real-ip') realIp?: string,
  ) {
    const source = forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown'
    this.loginRateLimiter.assertAllowed(dto.username, source)
    try {
      const result = await this.authService.loginWithPassword(
        dto.username,
        dto.password,
      )
      this.loginRateLimiter.clear(dto.username, source)
      return result
    } catch (error) {
      this.loginRateLimiter.recordFailure(dto.username, source)
      throw error
    }
  }

  @Get('me')
  getCurrentUser(@Headers('authorization') authorization?: string) {
    return this.authService.getCurrentUserFromAuthHeader(authorization)
  }

  @Post('logout')
  logout() {
    return {
      ok: true,
    }
  }
}
