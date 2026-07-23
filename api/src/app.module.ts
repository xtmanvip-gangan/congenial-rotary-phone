import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller.js'
import { AppService } from './app.service.js'
import { ExportsModule } from './modules/exports/exports.module.js'
import { ActivitiesModule } from './modules/activities/activities.module.js'
import { AuthModule } from './modules/auth/auth.module.js'
import { HealthModule } from './modules/health/health.module.js'
import { NotificationsModule } from './modules/notifications/notifications.module.js'
import { OperatorsModule } from './modules/operators/operators.module.js'
import { SubmissionsModule } from './modules/submissions/submissions.module.js'
import { PrismaModule } from './prisma/prisma.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    ExportsModule,
    ActivitiesModule,
    OperatorsModule,
    SubmissionsModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
