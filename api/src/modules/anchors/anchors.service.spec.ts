import { describe, expect, it, vi } from 'vitest'
import { AnchorsService } from './anchors.service.js'

const anchorUser = {
  accountId: null,
  wecomUserId: 'anchor-uid',
  name: '主播企微名',
  avatarUrl: null,
  role: 'anchor' as const,
  roles: ['anchor' as const],
  loginType: 'wecom_miniapp' as const,
  anchorProfileStatus: 'not_activated' as const,
}

describe('AnchorsService', () => {
  it('returns the existing profile when the same anchor retries activation', async () => {
    const existingProfile = {
      id: 'anchor-1',
      anchorDisplayName: '小鹿',
      assignmentStatus: 'pending_confirmation',
      status: 'active',
      activatedAt: new Date('2026-07-23T10:00:00.000Z'),
      currentOperator: {
        id: 'operator-1',
        displayName: '运营A',
      },
      wecomUser: {
        wecomName: '主播企微名',
      },
    }
    const prisma = {
      wecomUser: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'wecom-record-1',
        }),
      },
      anchorProfile: {
        findUnique: vi.fn().mockResolvedValue(existingProfile),
      },
      $transaction: vi.fn(),
    }
    const access = {}
    const service = new AnchorsService(prisma as never, access as never)

    const result = await service.activate(anchorUser)

    expect(result.item.id).toBe('anchor-1')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('previews only the current anchor task snapshot', async () => {
    const prisma = {
      anchorActivationTask: {
        findUnique: vi.fn().mockResolvedValue({
          status: 'invited',
          wecomDisplayNameSnapshot: '主播小鹿',
          membershipCompletedAt: new Date('2026-07-23T09:00:00.000Z'),
          operator: {
            id: 'operator-1',
            displayName: '运营A',
          },
        }),
      },
    }
    const service = new AnchorsService(prisma as never, {} as never)

    const result = await service.getMyActivation(anchorUser)

    expect(result.item).toEqual({
      anchorDisplayName: '主播小鹿',
      membershipCompletedAt: '2026-07-23T09:00:00.000Z',
      operator: {
        id: 'operator-1',
        displayName: '运营A',
      },
    })
  })

  it('creates a profile and pending assignment from a valid activation task', async () => {
    const tx = {
      anchorActivationTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'task-1',
          status: 'invited',
          wecomDisplayNameSnapshot: '主播小鹿',
          operatorId: 'operator-1',
          membershipCompletedAt: new Date(),
          operator: {
            id: 'operator-1',
            displayName: '运营A',
            status: 'active',
            staffRoles: [{ role: 'operator' }],
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      anchorProfile: {
        create: vi.fn().mockResolvedValue({
          id: 'anchor-1',
          anchorDisplayName: '小鹿',
          assignmentStatus: 'pending_confirmation',
          status: 'active',
          activatedAt: new Date('2026-07-23T10:00:00.000Z'),
          currentOperator: {
            id: 'operator-1',
            displayName: '运营A',
          },
          wecomUser: {
            wecomName: '主播企微名',
          },
        }),
      },
      anchorOperatorAssignment: {
        create: vi.fn().mockResolvedValue({ id: 'assignment-1' }),
      },
    }
    const prisma = {
      wecomUser: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'wecom-record-1',
        }),
      },
      anchorProfile: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(async (callback) => callback(tx)),
    }
    const service = new AnchorsService(prisma as never, {} as never)

    await service.activate(anchorUser)

    expect(tx.anchorProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        wecomUserRecordId: 'wecom-record-1',
        anchorDisplayName: '主播小鹿',
        currentOperatorId: 'operator-1',
        assignmentStatus: 'pending_confirmation',
      }),
      include: expect.any(Object),
    })
    expect(tx.anchorOperatorAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'pending_confirmation',
        initiatedBy: 'anchor-uid',
      }),
    })
  })

  it('initializes onboarding and releases pending gift submissions when assignment is confirmed', async () => {
    const tx = {
      anchorOperatorAssignment: {
        update: vi.fn().mockResolvedValue({}),
      },
      anchorProfile: {
        update: vi.fn().mockResolvedValue({}),
      },
      anchorOnboardingProgress: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      submission: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    }
    const prisma = {
      anchorOperatorAssignment: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'assignment-1',
          anchorProfileId: 'anchor-1',
          operatorId: 'operator-1',
          anchorProfile: {
            anchorDisplayName: '小鹿',
          },
          operator: {
            displayName: '运营A',
          },
        }),
      },
      $transaction: vi.fn(async (callback) => callback(tx)),
    }
    const access = {
      requireAnyRole: vi.fn(),
    }
    const service = new AnchorsService(prisma as never, access as never)
    const operator = {
      accountId: 'operator-1',
      wecomUserId: 'operator-uid',
      name: '运营A',
      avatarUrl: null,
      role: 'operator' as const,
      roles: ['operator' as const],
      loginType: 'wecom_staff' as const,
    }

    await service.confirmAssignment(operator, 'assignment-1')

    expect(tx.anchorOnboardingProgress.upsert).toHaveBeenCalled()
    expect(tx.submission.updateMany).toHaveBeenCalledWith({
      where: {
        anchorProfileId: 'anchor-1',
        operatorAssignmentStatus: 'pending_confirmation',
      },
      data: expect.objectContaining({
        operatorId: 'operator-1',
        operatorAssignmentId: 'assignment-1',
        operatorAssignmentStatus: 'confirmed',
      }),
    })
  })
})
