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
import { CreateStaffDto } from './dto/create-staff.dto.js'
import { UpdateStaffRolesDto } from './dto/update-staff-roles.dto.js'
import { UpdateStaffStatusDto } from './dto/update-staff-status.dto.js'
import { StaffService } from './staff.service.js'

@Controller('staff')
export class StaffController {
  constructor(
    private readonly authService: AuthService,
    private readonly staffService: StaffService,
  ) {}

  @Get()
  list(@Headers('authorization') authorization?: string) {
    return this.staffService.listStaff(
      this.authService.getCurrentUserFromAuthHeader(authorization),
    )
  }

  @Post()
  create(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CreateStaffDto,
  ) {
    return this.staffService.createStaff(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      dto,
    )
  }

  @Patch(':staffId/roles')
  updateRoles(
    @Headers('authorization') authorization: string | undefined,
    @Param('staffId') staffId: string,
    @Body() dto: UpdateStaffRolesDto,
  ) {
    return this.staffService.updateRoles(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      staffId,
      dto.roles,
    )
  }

  @Patch(':staffId/status')
  updateStatus(
    @Headers('authorization') authorization: string | undefined,
    @Param('staffId') staffId: string,
    @Body() dto: UpdateStaffStatusDto,
  ) {
    return this.staffService.updateStatus(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      staffId,
      dto.status,
    )
  }

  @Get('operators/active')
  listActiveOperators(@Headers('authorization') authorization?: string) {
    return this.staffService.listActiveOperators(
      this.authService.getCurrentUserFromAuthHeader(authorization),
    )
  }
}
