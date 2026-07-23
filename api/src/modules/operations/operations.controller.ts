import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common'
import { AuthService } from '../auth/auth.service.js'
import { IncidentsService } from './incidents.service.js'
import { JobRunService } from './job-run.service.js'

@Controller('operations')
export class OperationsController {
  constructor(
    private readonly authService: AuthService,
    private readonly incidents: IncidentsService,
    private readonly jobRuns: JobRunService,
  ) {}

  @Get('job-runs')
  async listJobRuns(@Headers('authorization') authorization?: string) {
    const user =
      this.authService.getCurrentUserFromAuthHeader(authorization)
    await this.incidents.requireOperationsAccess(user)
    return this.jobRuns.list()
  }

  @Get('incidents')
  listIncidents(
    @Headers('authorization') authorization?: string,
    @Query('status') status?: 'open' | 'recovered' | 'closed',
  ) {
    return this.incidents.list(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      status,
    )
  }

  @Post('incidents/:incidentId/close')
  closeIncident(
    @Headers('authorization') authorization: string | undefined,
    @Param('incidentId') incidentId: string,
    @Body() body: { reason?: string },
  ) {
    return this.incidents.close(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      incidentId,
      body.reason?.trim() || '人工确认已处理',
    )
  }
}
