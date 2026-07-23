import { ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service.js'
import { AccessService } from '../access/access.service.js'
import type { AuthenticatedUser } from '../auth/auth.types.js'
import { NotificationsService } from '../notifications/notifications.service.js'
import { TrainingNotificationsService } from '../training/training-notifications.service.js'
import { JobRunService } from '../operations/job-run.service.js'

@Injectable()
export class TrainingJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly trainingNotifications: TrainingNotificationsService,
    private readonly notifications: NotificationsService,
    private readonly jobRuns: JobRunService,
  ) {}

  async sendOneHourReminders(
    currentUser: AuthenticatedUser,
    now = new Date(),
  ) {
    await this.requireTrainingAdmin(currentUser)
    const targetHour = new Date(now.getTime() + 60 * 60_000)
      .toISOString()
      .slice(0, 13)
    return this.jobRuns.run(
      {
        jobCode: 'training.one_hour_reminders',
        idempotencyKey: targetHour,
        triggeredBy: currentUser.accountId ?? currentUser.wecomUserId,
      },
      async () => {
        const registrations =
          await this.prisma.trainingRegistration.findMany({
        where: {
          status: 'registered',
          session: {
            status: 'published',
            scheduledStartAt: {
              gte: new Date(now.getTime() + 55 * 60_000),
              lte: new Date(now.getTime() + 65 * 60_000),
            },
            meeting: {
              createStatus: 'created',
              joinUrl: { not: null },
            },
          },
        },
        include: {
          anchorProfile: { include: { wecomUser: true } },
          session: {
            include: { course: true, meeting: true },
          },
        },
          })
        let succeeded = 0
        let failed = 0
        for (const registration of registrations) {
          try {
            await this.trainingNotifications.notifyOneHourReminder(registration)
            succeeded += 1
          } catch {
            failed += 1
          }
        }
        return {
          scanned: registrations.length,
          succeeded,
          failed,
        }
      },
    )
  }

  async retryFailedNotifications(currentUser: AuthenticatedUser) {
    await this.requireTrainingAdmin(currentUser)
    const idempotencyKey = new Date().toISOString().slice(0, 16)
    return this.jobRuns.run(
      {
        jobCode: 'notifications.retry_failed',
        idempotencyKey,
        triggeredBy: currentUser.accountId ?? currentUser.wecomUserId,
      },
      async () => {
        const result = await this.notifications.retryFailed()
        return {
          scanned: result.retried,
          succeeded: result.retried,
          failed: 0,
        }
      },
    )
  }

  private async requireTrainingAdmin(currentUser: AuthenticatedUser) {
    if (currentUser.role === 'super_admin') {
      await this.access.requirePasswordSuperAdmin(currentUser)
      return
    }
    if (currentUser.loginType !== 'wecom_staff') {
      throw new ForbiddenException('当前账号没有任务执行权限')
    }
    await this.access.requireAnyRole(currentUser, ['training_admin'])
  }
}
