import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service.js'
import { AccessService } from '../access/access.service.js'
import type { AuthenticatedUser } from '../auth/auth.types.js'
import { NotificationsService } from '../notifications/notifications.service.js'
import type {
  BulkUpdateTrainingFeedbackDto,
  CreateTrainingQuestionDto,
  CreateTrainingWeeklyActionDto,
  CreateTrainingWeeklyMeetingDto,
  ResolveTrainingQuestionDto,
  UpdateTrainingFeedbackDto,
} from './dto/training-operations.dto.js'

export function trainingWeekStart(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const part = (type: string) =>
    Number(parts.find((item) => item.type === type)?.value)
  const date = new Date(
    Date.UTC(part('year'), part('month') - 1, part('day')),
  )
  const weekday = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() - weekday + 1)
  return date
}

@Injectable()
export class TrainingOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly notifications: NotificationsService,
  ) {}

  async generateWeeklyFeedback(
    currentUser: AuthenticatedUser,
    now = new Date(),
  ) {
    await this.requireTrainingAdmin(currentUser)
    const weekStart = trainingWeekStart(now)
    const nextWeek = new Date(weekStart)
    nextWeek.setUTCDate(nextWeek.getUTCDate() + 7)
    const learned = await this.prisma.trainingLearningProgress.findMany({
      where: {
        status: 'learned',
        lastLearnedAt: { gte: weekStart, lt: nextWeek },
        anchorProfile: {
          status: 'active',
          assignmentStatus: 'confirmed',
          currentOperatorId: { not: null },
        },
      },
      include: {
        anchorProfile: {
          select: { currentOperatorId: true },
        },
      },
    })
    const data = learned
      .filter(
        (item) => item.anchorProfile.currentOperatorId != null,
      )
      .map((item) => ({
        anchorProfileId: item.anchorProfileId,
        courseId: item.courseId,
        operatorId: item.anchorProfile.currentOperatorId as string,
        weekStart,
        status: 'unobserved' as const,
      }))
    const result =
      await this.prisma.trainingApplicationFeedback.createMany({
        data,
        skipDuplicates: true,
      })
    const operatorIds = [
      ...new Set(data.map((item) => item.operatorId)),
    ]
    const operators = await this.prisma.operatorAccount.findMany({
      where: {
        id: { in: operatorIds },
        wecomUserId: { not: null },
        status: 'active',
      },
      select: { id: true, wecomUserId: true },
    })
    for (const operator of operators) {
      if (!operator.wecomUserId) continue
      await this.notifications.sendBusinessNotification({
        businessType: 'training_application_feedback',
        businessId: `${operator.id}:${weekStart.toISOString().slice(0, 10)}`,
        templateCode: 'training_weekly_feedback_todo',
        dedupeKey: `training_weekly_feedback_todo:${operator.id}:${weekStart.toISOString().slice(0, 10)}`,
        receiverWecomUserId: operator.wecomUserId,
        receiverRole: 'operator',
        messageTitle: '【培训中心】本周应用反馈待办',
        messageContent:
          '请在培训运营工作台更新本周已学课程的实际应用情况。',
      })
    }
    return {
      weekStart: weekStart.toISOString().slice(0, 10),
      candidates: data.length,
      created: result.count,
    }
  }

  async listMyFeedback(currentUser: AuthenticatedUser) {
    await this.access.requireAnyRole(currentUser, ['operator'])
    const items =
      await this.prisma.trainingApplicationFeedback.findMany({
        where: { operatorId: currentUser.accountId ?? '' },
        include: {
          anchorProfile: {
            select: { id: true, anchorDisplayName: true },
          },
          course: { select: { id: true, title: true, sequence: true } },
          nextCourse: {
            select: { id: true, title: true, sequence: true },
          },
        },
        orderBy: [{ weekStart: 'desc' }, { createdAt: 'asc' }],
      })
    return { items }
  }

  async updateFeedback(
    currentUser: AuthenticatedUser,
    feedbackId: string,
    dto: UpdateTrainingFeedbackDto,
  ) {
    await this.access.requireAnyRole(currentUser, ['operator'])
    const existing =
      await this.prisma.trainingApplicationFeedback.findFirst({
        where: {
          id: feedbackId,
          operatorId: currentUser.accountId ?? '',
        },
      })
    if (!existing) {
      throw new ForbiddenException('只能更新自己的应用反馈')
    }
    const item = await this.prisma.trainingApplicationFeedback.update({
      where: { id: feedbackId },
      data: {
        status: dto.status,
        observationNote: dto.observationNote?.trim() || null,
        replayIssue: dto.replayIssue?.trim() || null,
        nextCourseId: dto.nextCourseId || null,
        interventionNeeded: dto.interventionNeeded ?? false,
      },
    })
    return { item }
  }

  async bulkUpdateFeedback(
    currentUser: AuthenticatedUser,
    dto: BulkUpdateTrainingFeedbackDto,
  ) {
    const items = []
    for (const input of dto.items) {
      items.push(
        await this.updateFeedback(currentUser, input.id, input),
      )
    }
    return { items: items.map((result) => result.item) }
  }

  async createQuestion(
    currentUser: AuthenticatedUser,
    dto: CreateTrainingQuestionDto,
  ) {
    const canViewAll = await this.requireQuestionSubmitter(currentUser)
    if (!currentUser.accountId) {
      throw new ForbiddenException('当前员工账号无效')
    }
    if (dto.anchorProfileId && !canViewAll) {
      const profile = await this.prisma.anchorProfile.findFirst({
        where: {
          id: dto.anchorProfileId,
          currentOperatorId: currentUser.accountId,
          assignmentStatus: 'confirmed',
          status: 'active',
        },
      })
      if (!profile) {
        throw new ForbiddenException('只能提交自己所属主播的问题')
      }
    }
    const item = await this.prisma.trainingQuestion.create({
      data: {
        anchorProfileId: dto.anchorProfileId || null,
        courseId: dto.courseId || null,
        submittedByAccountId: currentUser.accountId,
        category: dto.category?.trim() || null,
        urgency: dto.urgency,
        description: dto.description.trim(),
        caseNote: dto.caseNote?.trim() || null,
      },
    })
    return { item }
  }

  async listQuestions(currentUser: AuthenticatedUser) {
    const canViewAll = await this.requireQuestionSubmitter(currentUser)
    const items = await this.prisma.trainingQuestion.findMany({
      where: canViewAll
        ? undefined
        : { submittedByAccountId: currentUser.accountId ?? '' },
      include: {
        anchorProfile: {
          select: { id: true, anchorDisplayName: true },
        },
        course: { select: { id: true, title: true } },
        submittedByAccount: {
          select: { id: true, displayName: true },
        },
        actions: {
          include: {
            operatedBy: { select: { id: true, displayName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ urgency: 'desc' }, { createdAt: 'desc' }],
    })
    return { items }
  }

  async resolveQuestion(
    currentUser: AuthenticatedUser,
    questionId: string,
    dto: ResolveTrainingQuestionDto,
  ) {
    await this.requireTrainingExecutor(currentUser)
    if (!currentUser.accountId) {
      throw new ForbiddenException('当前员工账号无效')
    }
    const existing = await this.prisma.trainingQuestion.findUnique({
      where: { id: questionId },
      include: {
        submittedByAccount: {
          select: { wecomUserId: true },
        },
      },
    })
    if (!existing) throw new NotFoundException('未找到问题')
    await this.prisma.$transaction([
      this.prisma.trainingQuestion.update({
        where: { id: questionId },
        data: {
          status:
            dto.resolutionType === 'operator_followup'
              ? 'transferred'
              : 'resolved',
          resolutionType: dto.resolutionType,
          resolvedAt: new Date(),
        },
      }),
      this.prisma.trainingQuestionAction.create({
        data: {
          questionId,
          action: 'resolved',
          note: dto.note.trim(),
          operatedById: currentUser.accountId,
        },
      }),
    ])
    if (existing.submittedByAccount.wecomUserId) {
      await this.notifications.sendBusinessNotification({
        businessType: 'training_question',
        businessId: questionId,
        templateCode: 'training_question_resolved',
        dedupeKey: `training_question_resolved:${questionId}:${dto.resolutionType}`,
        receiverWecomUserId:
          existing.submittedByAccount.wecomUserId,
        receiverRole: 'operator',
        messageTitle: '【培训中心】问题已处理',
        messageContent: [
          `处理方式：${dto.resolutionType}`,
          `处理说明：${dto.note.trim()}`,
        ].join('\n'),
      })
    }
    return { ok: true }
  }

  async listWeeklyMeetings(currentUser: AuthenticatedUser) {
    await this.requireTrainingExecutor(currentUser)
    const items = await this.prisma.trainingWeeklyMeeting.findMany({
      include: {
        actions: {
          include: {
            ownerAccount: {
              select: { id: true, displayName: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { weekStart: 'desc' },
    })
    return { items }
  }

  async saveWeeklyMeeting(
    currentUser: AuthenticatedUser,
    dto: CreateTrainingWeeklyMeetingDto,
  ) {
    await this.requireTrainingExecutor(currentUser)
    if (!currentUser.accountId) {
      throw new ForbiddenException('当前员工账号无效')
    }
    const weekStart = trainingWeekStart(new Date(dto.weekStart))
    const item = await this.prisma.trainingWeeklyMeeting.upsert({
      where: { weekStart },
      create: {
        weekStart,
        heldAt: dto.heldAt ? new Date(dto.heldAt) : null,
        attendeeIds: dto.attendeeIds,
        summary: dto.summary?.trim() || null,
        createdById: currentUser.accountId,
      },
      update: {
        heldAt: dto.heldAt ? new Date(dto.heldAt) : null,
        attendeeIds: dto.attendeeIds,
        summary: dto.summary?.trim() || null,
      },
      include: { actions: true },
    })
    return { item }
  }

  async addWeeklyAction(
    currentUser: AuthenticatedUser,
    meetingId: string,
    dto: CreateTrainingWeeklyActionDto,
  ) {
    await this.requireTrainingExecutor(currentUser)
    const meeting = await this.prisma.trainingWeeklyMeeting.findUnique({
      where: { id: meetingId },
    })
    if (!meeting) throw new NotFoundException('未找到周沟通会')
    const item = await this.prisma.trainingWeeklyAction.create({
      data: {
        meetingId,
        title: dto.title.trim(),
        ownerAccountId: dto.ownerAccountId || null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      },
    })
    return { item }
  }

  private async requireQuestionSubmitter(currentUser: AuthenticatedUser) {
    if (currentUser.role === 'super_admin') {
      await this.access.requirePasswordSuperAdmin(currentUser)
      return true
    }
    if (currentUser.loginType !== 'wecom_staff') {
      throw new ForbiddenException('当前账号不能使用问题池')
    }
    if (
      currentUser.roles.some((role) =>
        ['training_teacher', 'training_admin'].includes(role),
      )
    ) {
      await this.access.requireAnyRole(currentUser, [
        'training_teacher',
        'training_admin',
      ])
      return true
    }
    await this.access.requireAnyRole(currentUser, ['operator'])
    return false
  }

  private async requireTrainingExecutor(currentUser: AuthenticatedUser) {
    if (currentUser.role === 'super_admin') {
      await this.access.requirePasswordSuperAdmin(currentUser)
      return
    }
    if (currentUser.loginType !== 'wecom_staff') {
      throw new ForbiddenException('当前账号没有培训中心权限')
    }
    await this.access.requireAnyRole(currentUser, [
      'training_teacher',
      'training_admin',
    ])
  }

  private async requireTrainingAdmin(currentUser: AuthenticatedUser) {
    if (currentUser.role === 'super_admin') {
      await this.access.requirePasswordSuperAdmin(currentUser)
      return
    }
    if (currentUser.loginType !== 'wecom_staff') {
      throw new ForbiddenException('当前账号没有培训管理权限')
    }
    await this.access.requireAnyRole(currentUser, ['training_admin'])
  }
}
