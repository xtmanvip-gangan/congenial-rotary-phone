import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { ActivationController } from './activation.controller.js'
import { ActivationService } from './activation.service.js'

@Module({
  imports: [AuthModule],
  controllers: [ActivationController],
  providers: [ActivationService],
  exports: [ActivationService],
})
export class ActivationModule {}
