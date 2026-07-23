import { describe, expect, it, vi } from 'vitest'
import { DashboardService } from './dashboard.service.js'

const operatorUser = {
  accountId: 'operator-1',
  wecomUserId: 'operator-uid',
  name: '运营A',
  avatarUrl: null,
  role: 'operator',
  roles: ['operator'],
  loginType: 'wecom_staff',
} as const

describe('DashboardService', () => {
  it('运营看板所有主播指标都限定为当前固定运营', async () => {
    const prisma = createPrismaMock()
    const access = { requireAnyRole: vi.fn() }
    const service = new DashboardService(prisma as never, access as never)

    const result = await service.getDashboard(operatorUser as never)

    expect(result.role).toBe('operator')
    expect(result.metrics).toEqual(
      expect.objectContaining({
        activeAnchors: 5,
        pendingFirstLive: 2,
        pendingFirstLiveReview: 1,
        weeklyRegistrations: 3,
        trainingFollowups: 4,
        giftTodos: 6,
      }),
    )
    for (const call of prisma.anchorProfile.count.mock.calls) {
      expect(call[0].where).toEqual(
        expect.objectContaining({ currentOperatorId: 'operator-1' }),
      )
    }
    expect(prisma.trainingRegistration.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          anchorProfile: { currentOperatorId: 'operator-1' },
        }),
      }),
    )
  })

  it('审核看板返回激活漏斗和平均激活小时数', async () => {
    const prisma = createPrismaMock()
    prisma.anchorActivationTask.groupBy.mockResolvedValue([
      { status: 'pending', _count: { _all: 2 } },
      { status: 'invited', _count: { _all: 3 } },
      { status: 'activated', _count: { _all: 4 } },
    ])
    prisma.anchorActivationTask.findMany.mockResolvedValue([
      {
        createdAt: new Date('2026-07-23T08:00:00.000Z'),
        activatedAnchorProfile: {
          activatedAt: new Date('2026-07-23T10:00:00.000Z'),
        },
      },
    ])
    const service = new DashboardService(
      prisma as never,
      { requireAnyRole: vi.fn() } as never,
    )

    const result = await service.getDashboard({
      ...operatorUser,
      role: 'audit_teacher',
      roles: ['audit_teacher'],
    } as never)

    expect(result.metrics).toEqual(
      expect.objectContaining({
        pendingActivation: 2,
        invitationsSent: 3,
        activated: 4,
        averageActivationHours: 2,
      }),
    )
  })
})

function createPrismaMock() {
  return {
    anchorProfile: {
      count: vi
        .fn()
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1),
    },
    trainingRegistration: { count: vi.fn().mockResolvedValue(3) },
    trainingApplicationFeedback: { count: vi.fn().mockResolvedValue(4) },
    submission: { count: vi.fn().mockResolvedValue(6) },
    anchorActivationTask: {
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
    },
  }
}
