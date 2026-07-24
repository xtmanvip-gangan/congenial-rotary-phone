import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import {
  AdminAnchorsController,
  AnchorsController,
  OperatorAnchorsController,
  OperatorAssignmentsController,
} from './anchors.controller.js'
import { AnchorsService } from './anchors.service.js'

@Module({
  imports: [AuthModule],
  controllers: [
    AnchorsController,
    OperatorAnchorsController,
    OperatorAssignmentsController,
    AdminAnchorsController,
  ],
  providers: [AnchorsService],
  exports: [AnchorsService],
})
export class AnchorsModule {}
