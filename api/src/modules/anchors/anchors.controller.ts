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
import { AnchorsService } from './anchors.service.js'
import { ActivateAnchorDto } from './dto/activate-anchor.dto.js'
import { RejectAssignmentDto } from './dto/reject-assignment.dto.js'
import { SelectOperatorDto } from './dto/select-operator.dto.js'
import { UpdateAnchorDisplayNameDto } from './dto/update-anchor-display-name.dto.js'

@Controller('anchors')
export class AnchorsController {
  constructor(
    private readonly authService: AuthService,
    private readonly anchorsService: AnchorsService,
  ) {}

  @Get('me')
  me(@Headers('authorization') authorization?: string) {
    return this.anchorsService.getMyProfile(
      this.authService.getCurrentUserFromAuthHeader(authorization),
    )
  }

  @Post('activate')
  activate(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: ActivateAnchorDto,
  ) {
    return this.anchorsService.activate(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      dto,
    )
  }

  @Patch('me/display-name')
  updateDisplayName(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: UpdateAnchorDisplayNameDto,
  ) {
    return this.anchorsService.updateDisplayName(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      dto.anchorDisplayName,
    )
  }

  @Post('me/operator-selection')
  selectOperator(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: SelectOperatorDto,
  ) {
    return this.anchorsService.selectOperator(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      dto.operatorId,
    )
  }
}

@Controller('operators/me')
export class OperatorAnchorsController {
  constructor(
    private readonly authService: AuthService,
    private readonly anchorsService: AnchorsService,
  ) {}

  @Get('anchors')
  anchors(@Headers('authorization') authorization?: string) {
    return this.anchorsService.listMyAnchors(
      this.authService.getCurrentUserFromAuthHeader(authorization),
    )
  }

  @Get('assignments/pending')
  pending(@Headers('authorization') authorization?: string) {
    return this.anchorsService.listPendingAssignments(
      this.authService.getCurrentUserFromAuthHeader(authorization),
    )
  }
}

@Controller('operator-assignments')
export class OperatorAssignmentsController {
  constructor(
    private readonly authService: AuthService,
    private readonly anchorsService: AnchorsService,
  ) {}

  @Post(':assignmentId/confirm')
  confirm(
    @Headers('authorization') authorization: string | undefined,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.anchorsService.confirmAssignment(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      assignmentId,
    )
  }

  @Post(':assignmentId/reject')
  reject(
    @Headers('authorization') authorization: string | undefined,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: RejectAssignmentDto,
  ) {
    return this.anchorsService.rejectAssignment(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      assignmentId,
      dto.reason,
    )
  }
}
