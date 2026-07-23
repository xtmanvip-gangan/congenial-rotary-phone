import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
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
import { CreateTrainingRecommendationDto } from './dto/create-recommendation.dto.js'
import {
  BulkUpdateTrainingFeedbackDto,
  CreateTrainingQuestionDto,
  CreateTrainingWeeklyActionDto,
  CreateTrainingWeeklyMeetingDto,
  ResolveTrainingQuestionDto,
  UpdateTrainingFeedbackDto,
} from './dto/training-operations.dto.js'
import {
  ResolveAttendanceMatchDto,
  ResolveAttendanceOutcomeDto,
} from './dto/resolve-attendance.dto.js'
import { TrainingAttendanceService } from './training-attendance.service.js'
import { TrainingAttendanceImportService } from './training-attendance-import.service.js'
import { TrainingRecommendationsService } from './training-recommendations.service.js'
import { TrainingOperationsService } from './training-operations.service.js'
import { TrainingService } from './training.service.js'

@Controller('training')
export class TrainingController {
  constructor(
    private readonly authService: AuthService,
    private readonly trainingService: TrainingService,
    private readonly trainingAttendanceService: TrainingAttendanceService,
    private readonly trainingAttendanceImportService: TrainingAttendanceImportService,
    private readonly trainingRecommendationsService: TrainingRecommendationsService,
    private readonly trainingOperationsService: TrainingOperationsService,
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

  @Post('sessions/:sessionId/attendance/import-preview')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  previewAttendanceImport(
    @Headers('authorization') authorization: string | undefined,
    @Param('sessionId') sessionId: string,
    @UploadedFile()
    file:
      | {
          originalname: string
          mimetype: string
          size: number
          buffer: Buffer
        }
      | undefined,
  ) {
    return this.trainingAttendanceImportService.previewImport(
      this.user(authorization),
      sessionId,
      file,
    )
  }

  @Post('attendance-imports/:importId/confirm')
  confirmAttendanceImport(
    @Headers('authorization') authorization: string | undefined,
    @Param('importId') importId: string,
  ) {
    return this.trainingAttendanceImportService.confirmImport(
      this.user(authorization),
      importId,
    )
  }

  @Get('me')
  myTraining(@Headers('authorization') authorization?: string) {
    return this.trainingService.listMyTraining(this.user(authorization))
  }

  @Get('recommendations/me')
  myRecommendations(
    @Headers('authorization') authorization?: string,
  ) {
    return this.trainingRecommendationsService.listMine(
      this.user(authorization),
    )
  }

  @Post('recommendations/me/viewed')
  markMyRecommendationsViewed(
    @Headers('authorization') authorization?: string,
  ) {
    return this.trainingRecommendationsService.markMineViewed(
      this.user(authorization),
    )
  }

  @Post('recommendations')
  createRecommendation(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CreateTrainingRecommendationDto,
  ) {
    return this.trainingRecommendationsService.create(
      this.user(authorization),
      dto,
    )
  }

  @Post('operations/feedback/generate-weekly')
  generateWeeklyFeedback(
    @Headers('authorization') authorization?: string,
  ) {
    return this.trainingOperationsService.generateWeeklyFeedback(
      this.user(authorization),
    )
  }

  @Get('operator/application-feedback')
  myApplicationFeedback(
    @Headers('authorization') authorization?: string,
  ) {
    return this.trainingOperationsService.listMyFeedback(
      this.user(authorization),
    )
  }

  @Patch('operator/application-feedback/:feedbackId')
  updateApplicationFeedback(
    @Headers('authorization') authorization: string | undefined,
    @Param('feedbackId') feedbackId: string,
    @Body() dto: UpdateTrainingFeedbackDto,
  ) {
    return this.trainingOperationsService.updateFeedback(
      this.user(authorization),
      feedbackId,
      dto,
    )
  }

  @Patch('operator/application-feedback')
  bulkUpdateApplicationFeedback(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: BulkUpdateTrainingFeedbackDto,
  ) {
    return this.trainingOperationsService.bulkUpdateFeedback(
      this.user(authorization),
      dto,
    )
  }

  @Post('questions')
  createQuestion(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CreateTrainingQuestionDto,
  ) {
    return this.trainingOperationsService.createQuestion(
      this.user(authorization),
      dto,
    )
  }

  @Get('questions')
  questions(@Headers('authorization') authorization?: string) {
    return this.trainingOperationsService.listQuestions(
      this.user(authorization),
    )
  }

  @Patch('questions/:questionId/resolve')
  resolveQuestion(
    @Headers('authorization') authorization: string | undefined,
    @Param('questionId') questionId: string,
    @Body() dto: ResolveTrainingQuestionDto,
  ) {
    return this.trainingOperationsService.resolveQuestion(
      this.user(authorization),
      questionId,
      dto,
    )
  }

  @Get('weekly-meetings')
  weeklyMeetings(
    @Headers('authorization') authorization?: string,
  ) {
    return this.trainingOperationsService.listWeeklyMeetings(
      this.user(authorization),
    )
  }

  @Post('weekly-meetings')
  saveWeeklyMeeting(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CreateTrainingWeeklyMeetingDto,
  ) {
    return this.trainingOperationsService.saveWeeklyMeeting(
      this.user(authorization),
      dto,
    )
  }

  @Post('weekly-meetings/:meetingId/actions')
  addWeeklyAction(
    @Headers('authorization') authorization: string | undefined,
    @Param('meetingId') meetingId: string,
    @Body() dto: CreateTrainingWeeklyActionDto,
  ) {
    return this.trainingOperationsService.addWeeklyAction(
      this.user(authorization),
      meetingId,
      dto,
    )
  }

  @Get('operator/anchors')
  operatorAnchors(@Headers('authorization') authorization?: string) {
    return this.trainingService.listOperatorTrainingAnchors(
      this.user(authorization),
    )
  }
}
