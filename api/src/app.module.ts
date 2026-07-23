import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller.js'
import { AppService } from './app.service.js'
import { ExportsModule } from './modules/exports/exports.module.js'
import { ActivitiesModule } from './modules/activities/activities.module.js'
import { AccessModule } from './modules/access/access.module.js'
import { ActivationModule } from './modules/activation/activation.module.js'
import { AnchorsModule } from './modules/anchors/anchors.module.js'
import { AuthModule } from './modules/auth/auth.module.js'
import { HealthModule } from './modules/health/health.module.js'
import { TencentMeetingModule } from './modules/integrations/tencent-meeting/tencent-meeting.module.js'
import { NotificationsModule } from './modules/notifications/notifications.module.js'
import { OnboardingModule } from './modules/onboarding/onboarding.module.js'
import { OperatorsModule } from './modules/operators/operators.module.js'
import { SubmissionsModule } from './modules/submissions/submissions.module.js'
import { StaffModule } from './modules/staff/staff.module.js'
import { TrainingModule } from './modules/training/training.module.js'
import { PrismaModule } from './prisma/prisma.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    AccessModule,
    ActivationModule,
    AnchorsModule,
    HealthModule,
    TencentMeetingModule,
    AuthModule,
    ExportsModule,
    ActivitiesModule,
    OperatorsModule,
    SubmissionsModule,
    NotificationsModule,
    OnboardingModule,
    StaffModule,
    TrainingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
