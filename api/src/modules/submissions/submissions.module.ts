import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { NotificationsModule } from '../notifications/notifications.module.js'
import { SubmissionsController } from './submissions.controller.js'
import { SubmissionsService } from './submissions.service.js'

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
