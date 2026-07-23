import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { NotificationsService } from './notifications.service.js'

@Module({
  imports: [AuthModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
