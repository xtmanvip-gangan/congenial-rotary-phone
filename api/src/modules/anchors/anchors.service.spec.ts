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

    const result = await service.activate(anchorUser, {
      anchorDisplayName: '小鹿',
      operatorId: 'operator-1',
    })

    expect(result.item.id).toBe('anchor-1')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('creates a profile and pending assignment from a valid activation task', async () => {
    const tx = {
      anchorActivationTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'task-1',
          status: 'invited',
          membershipCompletedAt: new Date(),
          deviceReadyAt: new Date(),
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      operatorAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'operator-1',
          displayName: '运营A',
        }),
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

    await service.activate(anchorUser, {
      anchorDisplayName: '小鹿',
      operatorId: 'operator-1',
    })

    expect(tx.anchorProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        wecomUserRecordId: 'wecom-record-1',
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
})
