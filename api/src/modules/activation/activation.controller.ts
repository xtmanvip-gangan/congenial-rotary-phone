import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common'
import type { ActivationTaskStatus } from '@prisma/client'
import { AuthService } from '../auth/auth.service.js'
import { ActivationService } from './activation.service.js'
import { CreateActivationTaskDto } from './dto/create-activation-task.dto.js'

@Controller('activation-tasks')
export class ActivationController {
  constructor(
    private readonly authService: AuthService,
    private readonly activationService: ActivationService,
  ) {}

  @Get()
  list(
    @Headers('authorization') authorization?: string,
    @Query('status') status?: ActivationTaskStatus,
  ) {
    return this.activationService.list(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      status,
    )
  }

  @Post()
  create(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CreateActivationTaskDto,
  ) {
    return this.activationService.create(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      dto,
    )
  }

  @Post(':taskId/send')
  send(
    @Headers('authorization') authorization: string | undefined,
    @Param('taskId') taskId: string,
  ) {
    return this.activationService.sendInvitation(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      taskId,
    )
  }

  @Post(':taskId/cancel')
  cancel(
    @Headers('authorization') authorization: string | undefined,
    @Param('taskId') taskId: string,
  ) {
    return this.activationService.cancel(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      taskId,
    )
  }
}
