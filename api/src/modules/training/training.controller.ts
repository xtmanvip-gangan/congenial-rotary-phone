import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from '@nestjs/common'
import { AuthService } from '../auth/auth.service.js'
import {
  CancelTrainingSessionDto,
  CompleteRegistrationDto,
} from './dto/complete-registration.dto.js'
import { CreateCourseDto } from './dto/create-course.dto.js'
import { CreateScheduleTemplateDto } from './dto/create-schedule-template.dto.js'
import { CreateSessionDto } from './dto/create-session.dto.js'
import {
  BulkOperatorRegisterDto,
  StaffRegisterSessionDto,
} from './dto/register-session.dto.js'
import { UpdateCourseDto } from './dto/update-course.dto.js'
import { RescheduleSessionDto } from './dto/reschedule-session.dto.js'
import {
  ResolveAttendanceMatchDto,
  ResolveAttendanceOutcomeDto,
} from './dto/resolve-attendance.dto.js'
import { TrainingAttendanceService } from './training-attendance.service.js'
import { TrainingService } from './training.service.js'

@Controller('training')
export class TrainingController {
  constructor(
    private readonly authService: AuthService,
    private readonly trainingService: TrainingService,
    private readonly trainingAttendanceService: TrainingAttendanceService,
  ) {}

  private user(authorization?: string) {
    return this.authService.getCurrentUserFromAuthHeader(authorization)
  }

  @Get('courses')
  listCourses(@Headers('authorization') authorization?: string) {
    return this.trainingService.listCourses(this.user(authorization))
  }

  @Post('courses')
  createCourse(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CreateCourseDto,
  ) {
    return this.trainingService.createCourse(this.user(authorization), dto)
  }

  @Patch('courses/:courseId')
  updateCourse(
    @Headers('authorization') authorization: string | undefined,
    @Param('courseId') courseId: string,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.trainingService.updateCourse(
      this.user(authorization),
      courseId,
      dto,
    )
  }

  @Get('schedule-templates')
  listTemplates(@Headers('authorization') authorization?: string) {
    return this.trainingService.listScheduleTemplates(
      this.user(authorization),
    )
  }

  @Post('schedule-templates')
  createTemplate(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CreateScheduleTemplateDto,
  ) {
    return this.trainingService.createScheduleTemplate(
      this.user(authorization),
      dto,
    )
  }

  @Post('sessions/generate-next-week')
  generateNextWeek(@Headers('authorization') authorization?: string) {
    return this.trainingService.generateNextWeekDrafts(
      this.user(authorization),
    )
  }

  @Get('sessions')
  listSessions(@Headers('authorization') authorization?: string) {
    return this.trainingService.listSessions(this.user(authorization))
  }

  @Post('sessions')
  createSession(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CreateSessionDto,
  ) {
    return this.trainingService.createSession(this.user(authorization), dto)
  }

  @Post('sessions/:sessionId/publish')
  publishSession(
    @Headers('authorization') authorization: string | undefined,
    @Param('sessionId') sessionId: string,
  ) {
    return this.trainingService.publishSession(
      this.user(authorization),
      sessionId,
    )
  }

  @Patch('sessions/:sessionId/reschedule')
  rescheduleSession(
    @Headers('authorization') authorization: string | undefined,
    @Param('sessionId') sessionId: string,
    @Body() dto: RescheduleSessionDto,
  ) {
    return this.trainingService.rescheduleSession(
      this.user(authorization),
      sessionId,
      dto,
    )
  }

  @Post('sessions/:sessionId/start')
  startSession(
    @Headers('authorization') authorization: string | undefined,
    @Param('sessionId') sessionId: string,
  ) {
    return this.trainingService.startSession(
      this.user(authorization),
      sessionId,
    )
  }

  @Post('sessions/:sessionId/end')
  endSession(
    @Headers('authorization') authorization: string | undefined,
    @Param('sessionId') sessionId: string,
  ) {
    return this.trainingService.endSession(
      this.user(authorization),
      sessionId,
    )
  }

  @Post('sessions/:sessionId/cancel')
  cancelSession(
    @Headers('authorization') authorization: string | undefined,
    @Param('sessionId') sessionId: string,
    @Body() dto: CancelTrainingSessionDto,
  ) {
    return this.trainingService.cancelSession(
      this.user(authorization),
      sessionId,
      dto.reason,
    )
  }

  @Post('sessions/:sessionId/register')
  registerSelf(
    @Headers('authorization') authorization: string | undefined,
    @Param('sessionId') sessionId: string,
  ) {
    return this.trainingService.registerSelf(
      this.user(authorization),
      sessionId,
    )
  }

  @Post('registrations/operator')
  registerForOperator(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: StaffRegisterSessionDto,
  ) {
    return this.trainingService.registerForAnchor(
      this.user(authorization),
      dto.anchorProfileId,
      dto.sessionId,
    )
  }

  @Post('registrations/operator/bulk')
  bulkRegisterForOperator(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: BulkOperatorRegisterDto,
  ) {
    return this.trainingService.bulkRegisterForOperator(
      this.user(authorization),
      dto.anchorProfileIds,
      dto.sessionId,
    )
  }

  @Post('registrations/staff')
  registerForStaff(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: StaffRegisterSessionDto,
  ) {
    return this.trainingService.registerForTrainingStaff(
      this.user(authorization),
      dto.anchorProfileId,
      dto.sessionId,
    )
  }

  @Delete('registrations/:registrationId')
  cancelSelf(
    @Headers('authorization') authorization: string | undefined,
    @Param('registrationId') registrationId: string,
  ) {
    return this.trainingService.cancelSelf(
      this.user(authorization),
      registrationId,
    )
  }

  @Delete('registrations/operator/:registrationId')
  cancelForOperator(
    @Headers('authorization') authorization: string | undefined,
    @Param('registrationId') registrationId: string,
  ) {
    return this.trainingService.cancelForOperator(
      this.user(authorization),
      registrationId,
    )
  }

  @Get('operator/registrations')
  operatorRegistrations(
    @Headers('authorization') authorization?: string,
  ) {
    return this.trainingService.listOperatorRegistrations(
      this.user(authorization),
    )
  }

  @Patch('registrations/:registrationId/outcome')
  recordOutcome(
    @Headers('authorization') authorization: string | undefined,
    @Param('registrationId') registrationId: string,
    @Body() dto: CompleteRegistrationDto,
  ) {
    return this.trainingService.recordOutcome(
      this.user(authorization),
      registrationId,
      dto,
    )
  }

  @Get('sessions/:sessionId/roster')
  roster(
    @Headers('authorization') authorization: string | undefined,
    @Param('sessionId') sessionId: string,
  ) {
    return this.trainingService.listSessionRoster(
      this.user(authorization),
      sessionId,
    )
  }

  @Post('sessions/:sessionId/attendance/sync')
  syncAttendance(
    @Headers('authorization') authorization: string | undefined,
    @Param('sessionId') sessionId: string,
  ) {
    return this.trainingAttendanceService.syncFromTencentMeeting(
      this.user(authorization),
      sessionId,
    )
  }

  @Get('sessions/:sessionId/attendance')
  attendance(
    @Headers('authorization') authorization: string | undefined,
    @Param('sessionId') sessionId: string,
  ) {
    return this.trainingAttendanceService.listSessionAttendance(
      this.user(authorization),
      sessionId,
    )
  }

  @Patch('attendance/:attendanceRecordId/match')
  resolveAttendanceMatch(
    @Headers('authorization') authorization: string | undefined,
    @Param('attendanceRecordId') attendanceRecordId: string,
    @Body() dto: ResolveAttendanceMatchDto,
  ) {
    return this.trainingAttendanceService.resolveMatch(
      this.user(authorization),
      attendanceRecordId,
      dto,
    )
  }

  @Patch('attendance/:attendanceRecordId/outcome')
  resolveAttendanceOutcome(
    @Headers('authorization') authorization: string | undefined,
    @Param('attendanceRecordId') attendanceRecordId: string,
    @Body() dto: ResolveAttendanceOutcomeDto,
  ) {
    return this.trainingAttendanceService.resolveOutcome(
      this.user(authorization),
      attendanceRecordId,
      dto.outcome,
      dto.reason,
    )
  }

  @Get('me')
  myTraining(@Headers('authorization') authorization?: string) {
    return this.trainingService.listMyTraining(this.user(authorization))
  }

  @Get('operator/anchors')
  operatorAnchors(@Headers('authorization') authorization?: string) {
    return this.trainingService.listOperatorTrainingAnchors(
      this.user(authorization),
    )
  }
}
