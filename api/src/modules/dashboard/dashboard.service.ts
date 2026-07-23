import { ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service.js'
import { AccessService } from '../access/access.service.js'
import type { AuthenticatedUser } from '../auth/auth.types.js'

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async getDashboard(user: AuthenticatedUser) {
    switch (user.role) {
      case 'audit_teacher':
        await this.access.requireAnyRole(user, ['audit_teacher'])
        return this.auditDashboard()
      case 'operator':
        await this.access.requireAnyRole(user, ['operator'])
        if (!user.accountId) throw new ForbiddenException('运营账号无效')
        return this.operatorDashboard(user.accountId)
      case 'training_teacher':
      case 'training_admin':
        await this.access.requireAnyRole(user, [user.role])
        return this.trainingDashboard(user.role)
      case 'super_admin':
        await this.access.requirePasswordSuperAdmin(user)
        return this.superAdminDashboard()
      default:
        throw new ForbiddenException('当前角色没有管理看板')
    }
  }

  private async auditDashboard() {
    const [groups, activatedTasks, pendingOperatorConfirmation] =
      await Promise.all([
        this.prisma.anchorActivationTask.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.anchorActivationTask.findMany({
          where: {
            status: 'activated',
            activatedAnchorProfileId: { not: null },
          },
          select: {
            createdAt: true,
            activatedAnchorProfile: { select: { activatedAt: true } },
          },
        }),
        this.prisma.anchorProfile.count({
          where: { assignmentStatus: 'pending_confirmation' },
        }),
      ])
    const counts = Object.fromEntries(
      groups.map((group) => [group.status, group._count._all]),
    )
    const totalActivationHours = activatedTasks.reduce((sum, task) => {
      const activatedAt = task.activatedAnchorProfile?.activatedAt
      if (!activatedAt) return sum
      return sum + (activatedAt.getTime() - task.createdAt.getTime()) / 3_600_000
    }, 0)

    return response('audit_teacher', {
      pendingActivation: counts.pending ?? 0,
      invitationsSent: counts.invited ?? 0,
      activated: counts.activated ?? 0,
      cancelled: counts.cancelled ?? 0,
      pendingOperatorConfirmation,
      averageActivationHours:
        activatedTasks.length === 0
          ? 0
          : round(totalActivationHours / activatedTasks.length),
    })
  }

  private async operatorDashboard(operatorId: string) {
    const weekStart = startOfShanghaiWeek(new Date())
    const anchorScope = { currentOperatorId: operatorId }
    const [
      activeAnchors,
      pendingFirstLive,
      pendingFirstLiveReview,
      weeklyRegistrations,
      trainingFollowups,
      giftTodos,
    ] = await Promise.all([
      this.prisma.anchorProfile.count({
        where: { ...anchorScope, status: 'active' },
      }),
      this.prisma.anchorProfile.count({
        where: {
          ...anchorScope,
          onboardingProgress: { firstLiveAt: null },
        },
      }),
      this.prisma.anchorProfile.count({
        where: {
          ...anchorScope,
          onboardingProgress: {
            firstLiveAt: { not: null },
            firstReviewCompletedAt: null,
          },
        },
      }),
      this.prisma.trainingRegistration.count({
        where: {
          anchorProfile: anchorScope,
          registeredAt: { gte: weekStart },
          status: { in: ['registered', 'waitlisted', 'learned'] },
        },
      }),
      this.prisma.trainingApplicationFeedback.count({
        where: {
          operatorId,
          status: { in: ['unobserved', 'needs_support'] },
        },
      }),
      this.prisma.submission.count({
        where: {
          operatorId,
          OR: [
            { reviewStatus: 'pending' },
            { reviewStatus: 'approved', grantStatus: 'pending' },
          ],
        },
      }),
    ])

    return response('operator', {
      activeAnchors,
      pendingFirstLive,
      pendingFirstLiveReview,
      weeklyRegistrations,
      trainingFollowups,
      giftTodos,
    })
  }

  private async trainingDashboard(
    role: 'training_teacher' | 'training_admin',
  ) {
    const weekStart = startOfShanghaiWeek(new Date())
    const [
      publishedSessions,
      registrations,
      waitlisted,
      attendancePending,
      needsMakeup,
      feedbackPending,
      openQuestions,
      openIncidents,
    ] = await Promise.all([
      this.prisma.trainingSession.count({
        where: {
          status: { in: ['published', 'in_progress'] },
          scheduledStartAt: { gte: weekStart },
        },
      }),
      this.prisma.trainingRegistration.count({
        where: { registeredAt: { gte: weekStart }, status: 'registered' },
      }),
      this.prisma.trainingRegistration.count({
        where: { status: 'waitlisted' },
      }),
      this.prisma.trainingAttendanceRecord.count({
        where: {
          OR: [
            { matchStatus: { in: ['conflict', 'unmatched'] } },
            { outcome: 'pending_confirmation' },
          ],
        },
      }),
      this.prisma.trainingRegistration.count({
        where: { status: { in: ['absent', 'abnormal_exit', 'needs_makeup'] } },
      }),
      this.prisma.trainingApplicationFeedback.count({
        where: { status: { in: ['unobserved', 'needs_support'] } },
      }),
      this.prisma.trainingQuestion.count({
        where: { status: { notIn: ['resolved', 'transferred'] } },
      }),
      this.prisma.integrationIncident.count({ where: { status: 'open' } }),
    ])

    return response(role, {
      publishedSessions,
      registrations,
      waitlisted,
      attendancePending,
      needsMakeup,
      feedbackPending,
      openQuestions,
      openIncidents,
    })
  }

  private async superAdminDashboard() {
    const [
      activeAnchors,
      activeStaff,
      giftTodos,
      trainingSessions,
      failedNotifications,
      openIncidents,
      failedJobs,
    ] = await Promise.all([
      this.prisma.anchorProfile.count({ where: { status: 'active' } }),
      this.prisma.operatorAccount.count({ where: { status: 'active' } }),
      this.prisma.submission.count({
        where: {
          OR: [
            { reviewStatus: 'pending' },
            { reviewStatus: 'approved', grantStatus: 'pending' },
          ],
        },
      }),
      this.prisma.trainingSession.count({
        where: { status: { in: ['published', 'in_progress'] } },
      }),
      this.prisma.notificationLog.count({ where: { status: 'failed' } }),
      this.prisma.integrationIncident.count({ where: { status: 'open' } }),
      this.prisma.systemJobRun.count({
        where: { status: { in: ['failed', 'partial'] } },
      }),
    ])

    return response('super_admin', {
      activeAnchors,
      activeStaff,
      giftTodos,
      trainingSessions,
      failedNotifications,
      openIncidents,
      failedJobs,
    })
  }
}

function response(role: AuthenticatedUser['role'], metrics: object) {
  return {
    role,
    generatedAt: new Date().toISOString(),
    metrics,
  }
}

function startOfShanghaiWeek(now: Date) {
  const local = new Date(now.getTime() + 8 * 3_600_000)
  const day = local.getUTCDay() || 7
  local.setUTCDate(local.getUTCDate() - day + 1)
  local.setUTCHours(0, 0, 0, 0)
  return new Date(local.getTime() - 8 * 3_600_000)
}

function round(value: number) {
  return Math.round(value * 10) / 10
}
