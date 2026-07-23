import { ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service.js'
import { AccessService } from '../access/access.service.js'
import type { AuthenticatedUser } from '../auth/auth.types.js'
import { NotificationsService } from '../notifications/notifications.service.js'
import { TrainingNotificationsService } from '../training/training-notifications.service.js'

@Injectable()
export class TrainingJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly trainingNotifications: TrainingNotificationsService,
    private readonly notifications: NotificationsService,
  ) {}

  async sendOneHourReminders(
    currentUser: AuthenticatedUser,
    now = new Date(),
  ) {
    await this.requireTrainingAdmin(currentUser)
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
    let sent = 0
    for (const registration of registrations) {
      await this.trainingNotifications.notifyOneHourReminder(registration)
      sent += 1
    }
    return { scanned: registrations.length, sent }
  }

  async retryFailedNotifications(currentUser: AuthenticatedUser) {
    await this.requireTrainingAdmin(currentUser)
    return this.notifications.retryFailed()
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
