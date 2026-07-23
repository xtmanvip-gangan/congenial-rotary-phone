import { Module } from '@nestjs/common'
import { AccessModule } from '../access/access.module.js'
import { AuthModule } from '../auth/auth.module.js'
import { TrainingController } from './training.controller.js'
import { TrainingService } from './training.service.js'

@Module({
  imports: [AccessModule, AuthModule],
  controllers: [TrainingController],
  providers: [TrainingService],
  exports: [TrainingService],
})
export class TrainingModule {}
