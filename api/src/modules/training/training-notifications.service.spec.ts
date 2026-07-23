import { describe, expect, it, vi } from 'vitest'
import { TrainingNotificationsService } from './training-notifications.service.js'

describe('TrainingNotificationsService', () => {
  it('报名成功后自动通知主播并带出固定运营和会议入口', async () => {
    const notifications = {
      sendBusinessNotification: vi.fn().mockResolvedValue({}),
    }
    const service = new TrainingNotificationsService(
      {} as never,
      notifications as never,
    )

    await service.notifyRegistration(
      {
        id: 'registration-1',
        status: 'registered',
        waitlistPosition: null,
        registeredAt: new Date('2026-07-23T10:00:00.000Z'),
      },
      {
        anchorDisplayName: '小鹿',
        currentOperator: { displayName: '运营A' },
        wecomUser: { wecomUserId: 'anchor-uid' },
      },
      {
        id: 'session-1',
        scheduledStartAt: new Date('2026-07-24T10:00:00.000Z'),
        course: { title: '平台违规红线' },
        meeting: {
          joinUrl: 'https://meeting.tencent.com/dm/example',
        },
      },
    )

    expect(notifications.sendBusinessNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        templateCode: 'training_registered',
        receiverWecomUserId: 'anchor-uid',
        messageContent: expect.stringContaining('运营老师：运营A'),
      }),
    )
    expect(notifications.sendBusinessNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        messageContent: expect.stringContaining(
          'https://meeting.tencent.com/dm/example',
        ),
      }),
    )
  })
})
