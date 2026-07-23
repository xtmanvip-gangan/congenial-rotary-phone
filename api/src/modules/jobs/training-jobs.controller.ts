import { Controller, Headers, Post } from '@nestjs/common'
import { AuthService } from '../auth/auth.service.js'
import { TrainingJobsService } from './training-jobs.service.js'

@Controller('jobs/training')
export class TrainingJobsController {
  constructor(
    private readonly authService: AuthService,
    private readonly trainingJobsService: TrainingJobsService,
  ) {}

  @Post('send-one-hour-reminders')
  sendOneHourReminders(
    @Headers('authorization') authorization?: string,
  ) {
    return this.trainingJobsService.sendOneHourReminders(
      this.authService.getCurrentUserFromAuthHeader(authorization),
    )
  }

  @Post('retry-failed-notifications')
  retryFailedNotifications(
    @Headers('authorization') authorization?: string,
  ) {
    return this.trainingJobsService.retryFailedNotifications(
      this.authService.getCurrentUserFromAuthHeader(authorization),
    )
  }
}
