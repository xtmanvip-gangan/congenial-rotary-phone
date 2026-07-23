import { Body, Controller, Get, Headers, Post } from '@nestjs/common'
import { AuthService } from './auth.service.js'
import { MiniappLoginDto } from './dto/miniapp-login.dto.js'

type MiniappAuthService = AuthService & {
  loginWithMiniappCode: (code: string) => ReturnType<AuthService['loginWithWecomCode']>
}

@Controller('miniapp/auth')
export class MiniappAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: MiniappLoginDto) {
    return (this.authService as MiniappAuthService).loginWithMiniappCode(dto.code)
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
