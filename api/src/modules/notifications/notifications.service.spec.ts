import { describe, expect, it, vi } from 'vitest'
import { NotificationsService } from './notifications.service.js'

describe('NotificationsService generic business notifications', () => {
  it('发送不依赖礼物提报的培训通知并记录通用业务关联', async () => {
    const prisma = {
      notificationLog: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'notification-1',
          attemptCount: 0,
          maxAttempts: 3,
          status: 'pending',
        }),
        update: vi.fn().mockResolvedValue({
          id: 'notification-1',
          status: 'success',
        }),
      },
    }
    const wecom = {
      sendAgentTextMessage: vi.fn().mockResolvedValue(undefined),
    }
    const service = new NotificationsService(prisma as never, wecom as never)

    const result = await service.sendBusinessNotification({
      businessType: 'training_registration',
      businessId: 'registration-1',
      templateCode: 'training_registered',
      dedupeKey: 'training_registered:registration-1',
      receiverWecomUserId: 'anchor-uid',
      receiverRole: 'anchor',
      messageTitle: '【培训中心】报名成功',
      messageContent: '课程：平台违规红线',
    })

    expect(prisma.notificationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        submissionId: null,
        businessType: 'training_registration',
        businessId: 'registration-1',
        templateCode: 'training_registered',
        dedupeKey: 'training_registered:registration-1',
      }),
    })
    expect(wecom.sendAgentTextMessage).toHaveBeenCalledWith(
      'anchor-uid',
      '【培训中心】报名成功\n课程：平台违规红线',
    )
    expect(result.item.status).toBe('success')
  })

  it('相同幂等键已发送成功时不重复发送', async () => {
    const prisma = {
      notificationLog: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'notification-1',
          status: 'success',
        }),
      },
    }
    const wecom = {
      sendAgentTextMessage: vi.fn(),
    }
    const service = new NotificationsService(prisma as never, wecom as never)

    const result = await service.sendBusinessNotification({
      businessType: 'training_reminder',
      businessId: 'registration-1',
      templateCode: 'training_one_hour_reminder',
      dedupeKey: 'training_one_hour_reminder:registration-1',
      receiverWecomUserId: 'anchor-uid',
      receiverRole: 'anchor',
      messageTitle: '开课提醒',
      messageContent: '课程将在一小时后开始',
    })

    expect(result).toMatchObject({ duplicate: true })
    expect(wecom.sendAgentTextMessage).not.toHaveBeenCalled()
  })

  it('发送失败时增加尝试次数并保留重试信息', async () => {
    const prisma = {
      notificationLog: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'notification-1',
          attemptCount: 0,
          maxAttempts: 3,
          status: 'pending',
          receiverWecomUserId: 'anchor-uid',
          messageTitle: '开课提醒',
          messageContent: '课程将在一小时后开始',
        }),
        update: vi.fn().mockResolvedValue({
          id: 'notification-1',
          status: 'failed',
          errorMessage: '企微接口暂不可用',
        }),
      },
    }
    const wecom = {
      sendAgentTextMessage: vi
        .fn()
        .mockRejectedValue(new Error('企微接口暂不可用')),
    }
    const service = new NotificationsService(prisma as never, wecom as never)

    const result = await service.sendBusinessNotification({
      businessType: 'training_reminder',
      businessId: 'registration-1',
      templateCode: 'training_one_hour_reminder',
      dedupeKey: 'training_one_hour_reminder:registration-1',
      receiverWecomUserId: 'anchor-uid',
      receiverRole: 'anchor',
      messageTitle: '开课提醒',
      messageContent: '课程将在一小时后开始',
    })

    expect(prisma.notificationLog.update).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: expect.objectContaining({
        status: 'failed',
        attemptCount: { increment: 1 },
        lastAttemptAt: expect.any(Date),
        errorMessage: '企微接口暂不可用',
      }),
    })
    expect(result.item).toMatchObject({
      status: 'failed',
      errorMessage: '企微接口暂不可用',
    })
  })
})
