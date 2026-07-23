import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from '@nestjs/common'
import { AuthService } from '../auth/auth.service.js'
import { CreateOperatorDto } from './dto/create-operator.dto.js'
import { UpdateOperatorStatusDto } from './dto/update-operator-status.dto.js'
import { OperatorsService } from './operators.service.js'

@Controller('operators')
export class OperatorsController {
  constructor(
    private readonly authService: AuthService,
    private readonly operatorsService: OperatorsService,
  ) {}

  @Get()
  async listOperators(@Headers('authorization') authorization?: string) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.operatorsService.listOperators(currentUser)
  }

  @Post()
  async createOperator(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CreateOperatorDto,
  ) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.operatorsService.createOperator(currentUser, dto)
  }

  @Patch(':operatorId/status')
  async updateOperatorStatus(
    @Headers('authorization') authorization: string | undefined,
    @Param('operatorId') operatorId: string,
    @Body() dto: UpdateOperatorStatusDto,
  ) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.operatorsService.updateOperatorStatus(currentUser, operatorId, dto.status)
  }
}
