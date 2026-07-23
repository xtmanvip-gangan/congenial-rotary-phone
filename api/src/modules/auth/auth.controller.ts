import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common'
import { AuthService } from './auth.service.js'
import { PasswordLoginDto } from './dto/password-login.dto.js'
import { WecomCallbackDto } from './dto/wecom-callback.dto.js'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('wecom/url')
  getWecomLoginUrl(@Query('state') state?: string) {
    return this.authService.getWecomLoginUrl(state)
  }

  @Post('wecom/callback')
  callback(@Body() dto: WecomCallbackDto) {
    return this.authService.loginWithWecomCode(dto.code)
  }

  @Post('login')
  login(@Body() dto: PasswordLoginDto) {
    return this.authService.loginWithPassword(dto.username, dto.password)
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
