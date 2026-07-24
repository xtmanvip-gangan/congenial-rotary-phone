import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { AuthService } from '../auth/auth.service.js'
import { AnchorsService } from './anchors.service.js'
import { AdminTransferAnchorsDto } from './dto/admin-transfer-anchors.dto.js'
import { RejectAssignmentDto } from './dto/reject-assignment.dto.js'
import { SelectOperatorDto } from './dto/select-operator.dto.js'
import { UpdateAnchorDisplayNameDto } from './dto/update-anchor-display-name.dto.js'
import { UpdateAnchorStatusDto } from './dto/update-anchor-status.dto.js'
import {
  UpdateLeaderNoteDto,
  UpsertDailyReviewDto,
} from './dto/upsert-daily-review.dto.js'
import {
  CreateQaRecordDto,
  UpdateQaFollowUpDto,
} from './dto/upsert-qa-record.dto.js'

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

  @Get('me/activation')
  activation(@Headers('authorization') authorization?: string) {
    return this.anchorsService.getMyActivation(
      this.authService.getCurrentUserFromAuthHeader(authorization),
    )
  }

  @Post('activate')
  activate(
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.anchorsService.activate(
      this.authService.getCurrentUserFromAuthHeader(authorization),
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

  @Get('anchors/:anchorId')
  anchorDetail(
    @Headers('authorization') authorization: string | undefined,
    @Param('anchorId') anchorId: string,
  ) {
    return this.anchorsService.getOperatorAnchorDetail(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      anchorId,
    )
  }

  @Patch('anchors/:anchorId/status')
  updateStatus(
    @Headers('authorization') authorization: string | undefined,
    @Param('anchorId') anchorId: string,
    @Body() dto: UpdateAnchorStatusDto,
  ) {
    return this.anchorsService.updateAnchorStatus(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      anchorId,
      dto.status,
    )
  }

  @Get('anchors/:anchorId/daily-reviews')
  listDailyReviews(
    @Headers('authorization') authorization: string | undefined,
    @Param('anchorId') anchorId: string,
  ) {
    return this.anchorsService.listDailyReviews(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      anchorId,
    )
  }

  @Post('anchors/:anchorId/daily-reviews')
  upsertDailyReview(
    @Headers('authorization') authorization: string | undefined,
    @Param('anchorId') anchorId: string,
    @Body() dto: UpsertDailyReviewDto,
  ) {
    return this.anchorsService.upsertDailyReview(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      anchorId,
      dto,
    )
  }

  @Get('anchors/:anchorId/qa-records')
  listQaRecords(
    @Headers('authorization') authorization: string | undefined,
    @Param('anchorId') anchorId: string,
  ) {
    return this.anchorsService.listQaRecords(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      anchorId,
    )
  }

  @Post('anchors/:anchorId/qa-records')
  createQaRecord(
    @Headers('authorization') authorization: string | undefined,
    @Param('anchorId') anchorId: string,
    @Body() dto: CreateQaRecordDto,
  ) {
    return this.anchorsService.createQaRecord(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      anchorId,
      dto,
    )
  }

  @Patch('qa-records/:recordId/follow-up')
  updateQaFollowUp(
    @Headers('authorization') authorization: string | undefined,
    @Param('recordId') recordId: string,
    @Body() dto: UpdateQaFollowUpDto,
  ) {
    return this.anchorsService.updateQaFollowUp(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      recordId,
      dto.resultFollowUp,
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

/** 超管：主播全景与调度 */
@Controller('admin/anchors')
export class AdminAnchorsController {
  constructor(
    private readonly authService: AuthService,
    private readonly anchorsService: AnchorsService,
  ) {}

  @Get()
  list(
    @Headers('authorization') authorization: string | undefined,
    @Query('operatorId') operatorId?: string,
    @Query('liveStatus') liveStatus?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.anchorsService.listAdminAnchors(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      { operatorId, liveStatus, keyword },
    )
  }

  @Get(':anchorId')
  detail(
    @Headers('authorization') authorization: string | undefined,
    @Param('anchorId') anchorId: string,
  ) {
    return this.anchorsService.getAdminAnchorDetail(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      anchorId,
    )
  }

  @Post('transfer')
  transfer(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: AdminTransferAnchorsDto,
  ) {
    return this.anchorsService.transferSelectedAnchors(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      dto.anchorIds,
      dto.targetOperatorId,
    )
  }

  @Patch('daily-reviews/:reviewId/leader-note')
  updateLeaderNote(
    @Headers('authorization') authorization: string | undefined,
    @Param('reviewId') reviewId: string,
    @Body() dto: UpdateLeaderNoteDto,
  ) {
    return this.anchorsService.updateDailyReviewLeaderNote(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      reviewId,
      dto.leaderNote,
    )
  }
}
