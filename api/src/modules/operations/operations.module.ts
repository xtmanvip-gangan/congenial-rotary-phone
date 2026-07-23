import { Module } from '@nestjs/common'
import { AccessModule } from '../access/access.module.js'
import { AuthModule } from '../auth/auth.module.js'
import { IncidentsService } from './incidents.service.js'
import { JobRunService } from './job-run.service.js'
import { OperationsController } from './operations.controller.js'
import { MaintenanceService } from './maintenance.service.js'

@Module({
  imports: [AccessModule, AuthModule],
  controllers: [OperationsController],
  providers: [IncidentsService, JobRunService, MaintenanceService],
  exports: [IncidentsService, JobRunService],
})
export class OperationsModule {}
