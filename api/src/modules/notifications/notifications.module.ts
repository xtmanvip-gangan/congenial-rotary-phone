import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { NotificationsService } from './notifications.service.js'
import { OperationsModule } from '../operations/operations.module.js'

@Module({
  imports: [AuthModule, OperationsModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
