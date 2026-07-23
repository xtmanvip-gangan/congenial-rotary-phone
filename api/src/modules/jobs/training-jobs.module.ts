import { Module } from '@nestjs/common'
import { AccessModule } from '../access/access.module.js'
import { AuthModule } from '../auth/auth.module.js'
import { NotificationsModule } from '../notifications/notifications.module.js'
import { TrainingModule } from '../training/training.module.js'
import { TrainingJobsController } from './training-jobs.controller.js'
import { TrainingJobsService } from './training-jobs.service.js'

@Module({
  imports: [
    AccessModule,
    AuthModule,
    NotificationsModule,
    TrainingModule,
  ],
  controllers: [TrainingJobsController],
  providers: [TrainingJobsService],
})
export class TrainingJobsModule {}
