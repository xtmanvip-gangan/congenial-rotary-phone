import { Module } from '@nestjs/common'
import { AccessModule } from '../access/access.module.js'
import { AuthModule } from '../auth/auth.module.js'
import { IncidentsService } from './incidents.service.js'
import { JobRunService } from './job-run.service.js'
import { OperationsController } from './operations.controller.js'

@Module({
  imports: [AccessModule, AuthModule],
  controllers: [OperationsController],
  providers: [IncidentsService, JobRunService],
  exports: [IncidentsService, JobRunService],
})
export class OperationsModule {}
