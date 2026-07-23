import { describe, expect, it, vi } from 'vitest'
import { TrainingJobsService } from './training-jobs.service.js'

describe('TrainingJobsService', () => {
  it('只为一小时内已报名且会议可用的主播发送提醒', async () => {
    const now = new Date('2026-07-23T10:00:00.000Z')
    const prisma = {
      trainingRegistration: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'registration-1',
            session: {
              scheduledStartAt: new Date('2026-07-23T11:00:00.000Z'),
            },
          },
        ]),
      },
    }
    const access = { requireAnyRole: vi.fn() }
    const trainingNotifications = {
      notifyOneHourReminder: vi.fn().mockResolvedValue({}),
    }
    const notifications = { retryFailed: vi.fn() }
    const service = new TrainingJobsService(
      prisma as never,
      access as never,
      trainingNotifications as never,
      notifications as never,
    )

    const result = await service.sendOneHourReminders(
      {
        accountId: 'admin-1',
        wecomUserId: 'admin-uid',
        name: '培训管理员',
        avatarUrl: null,
        role: 'training_admin',
        roles: ['training_admin'],
        loginType: 'wecom_staff',
      } as never,
      now,
    )

    expect(result).toEqual({ scanned: 1, sent: 1 })
    expect(prisma.trainingRegistration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'registered',
          session: expect.objectContaining({
            scheduledStartAt: {
              gte: new Date('2026-07-23T10:55:00.000Z'),
              lte: new Date('2026-07-23T11:05:00.000Z'),
            },
          }),
        }),
      }),
    )
  })
})
