import { Controller, Get, Headers } from '@nestjs/common'
import { AuthService } from '../auth/auth.service.js'
import { DashboardService } from './dashboard.service.js'

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly authService: AuthService,
    private readonly dashboardService: DashboardService,
  ) {}

  @Get()
  getDashboard(@Headers('authorization') authorization?: string) {
    return this.dashboardService.getDashboard(
      this.authService.getCurrentUserFromAuthHeader(authorization),
    )
  }
}
