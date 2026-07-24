import { Controller, Get, Headers, Param } from '@nestjs/common'
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

  @Get('operators/:operatorId')
  getOperatorOverview(
    @Headers('authorization') authorization: string | undefined,
    @Param('operatorId') operatorId: string,
  ) {
    return this.dashboardService.getOperatorOverview(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      operatorId,
    )
  }
}
