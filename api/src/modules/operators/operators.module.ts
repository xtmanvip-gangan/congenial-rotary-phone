import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { OperatorsController } from './operators.controller.js'
import { OperatorsService } from './operators.service.js'

@Module({
  imports: [AuthModule],
  controllers: [OperatorsController],
  providers: [OperatorsService],
  exports: [OperatorsService],
})
export class OperatorsModule {}
