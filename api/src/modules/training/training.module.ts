import { Module } from '@nestjs/common'
import { AccessModule } from '../access/access.module.js'
import { AuthModule } from '../auth/auth.module.js'
import { TencentMeetingModule } from '../integrations/tencent-meeting/tencent-meeting.module.js'
import { TrainingController } from './training.controller.js'
import { TrainingAttendanceService } from './training-attendance.service.js'
import { TrainingMeetingsService } from './training-meetings.service.js'
import { TrainingService } from './training.service.js'

@Module({
  imports: [AccessModule, AuthModule, TencentMeetingModule],
  controllers: [TrainingController],
  providers: [
    TrainingService,
    TrainingMeetingsService,
    TrainingAttendanceService,
  ],
  exports: [TrainingService],
})
export class TrainingModule {}
