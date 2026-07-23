import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { ExportsController } from './exports.controller.js'
import { ExportsService } from './exports.service.js'

@Module({
  imports: [AuthModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
