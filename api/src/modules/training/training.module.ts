import { Module } from '@nestjs/common'
import { AccessModule } from '../access/access.module.js'
import { AuthModule } from '../auth/auth.module.js'
import { TencentMeetingModule } from '../integrations/tencent-meeting/tencent-meeting.module.js'
import { NotificationsModule } from '../notifications/notifications.module.js'
import { TrainingController } from './training.controller.js'
import { TrainingAttendanceService } from './training-attendance.service.js'
import { TrainingAttendanceImportService } from './training-attendance-import.service.js'
import { TrainingMeetingsService } from './training-meetings.service.js'
import { TrainingNotificationsService } from './training-notifications.service.js'
import { TrainingRecommendationsService } from './training-recommendations.service.js'
import { TrainingOperationsService } from './training-operations.service.js'
import { TrainingService } from './training.service.js'
import { OperationsModule } from '../operations/operations.module.js'

@Module({
  imports: [
    AccessModule,
    AuthModule,
    TencentMeetingModule,
    NotificationsModule,
    OperationsModule,
  ],
  controllers: [TrainingController],
  providers: [
    TrainingService,
    TrainingMeetingsService,
    TrainingAttendanceService,
    TrainingAttendanceImportService,
    TrainingNotificationsService,
    TrainingRecommendationsService,
    TrainingOperationsService,
  ],
  exports: [TrainingService, TrainingNotificationsService],
})
export class TrainingModule {}
