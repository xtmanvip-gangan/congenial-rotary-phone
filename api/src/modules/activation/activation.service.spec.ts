import { describe, expect, it, vi } from 'vitest'
import { ActivationService } from './activation.service.js'

const auditTeacher = {
  accountId: 'audit-1',
  wecomUserId: 'audit-uid',
  name: '审核老师',
  avatarUrl: null,
  role: 'audit_teacher' as const,
  roles: ['audit_teacher' as const],
  loginType: 'wecom_staff' as const,
}

describe('ActivationService', () => {
  it('creates a task with the audit-assigned operator and no device time', async () => {
    const prisma = {
      operatorAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'operator-1',
          displayName: '运营A',
        }),
      },
      anchorActivationTask: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'task-1',
          expectedWecomUserId: 'anchor-uid',
          wecomDisplayNameSnapshot: '主播企微名',
          operatorId: 'operator-1',
          status: 'pending',
          invitationSentAt: null,
          invitationCount: 0,
          membershipCompletedAt: new Date('2026-07-23T09:00:00.000Z'),
          createdAt: new Date('2026-07-23T10:00:00.000Z'),
          updatedAt: new Date('2026-07-23T10:00:00.000Z'),
          operator: {
            id: 'operator-1',
            displayName: '运营A',
          },
          activatedAnchorProfile: null,
        }),
      },
    }
    const access = {
      requireAnyRole: vi.fn().mockResolvedValue(undefined),
    }
    const service = new ActivationService(prisma as never, access as never)

    await service.create(auditTeacher, {
      expectedWecomUserId: 'anchor-uid',
      wecomDisplayName: '主播企微名',
      operatorId: 'operator-1',
      membershipCompletedAt: '2026-07-23T09:00:00.000Z',
    })

    expect(prisma.anchorActivationTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        auditTeacherId: 'audit-1',
        expectedWecomUserId: 'anchor-uid',
        operatorId: 'operator-1',
        membershipCompletedAt: new Date('2026-07-23T09:00:00.000Z'),
        status: 'pending',
      }),
      include: expect.any(Object),
    })
  })

  it('updates all task snapshots before activation', async () => {
    const prisma = {
      operatorAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'operator-2',
          displayName: '运营B',
        }),
      },
      anchorActivationTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'task-1',
          status: 'pending',
          auditTeacherId: 'audit-1',
          activatedAnchorProfileId: null,
        }),
        update: vi.fn().mockResolvedValue({
          id: 'task-1',
          expectedWecomUserId: 'anchor-new',
          wecomDisplayNameSnapshot: '主播新昵称',
          operatorId: 'operator-2',
          status: 'pending',
          invitationSentAt: null,
          invitationCount: 0,
          membershipCompletedAt: new Date('2026-07-23T10:00:00.000Z'),
          createdAt: new Date('2026-07-23T10:00:00.000Z'),
          updatedAt: new Date('2026-07-23T10:00:00.000Z'),
          operator: {
            id: 'operator-2',
            displayName: '运营B',
          },
          activatedAnchorProfile: null,
        }),
      },
    }
    const access = {
      requireAnyRole: vi.fn().mockResolvedValue(undefined),
      hasRole: vi.fn().mockResolvedValue(false),
    }
    const service = new ActivationService(prisma as never, access as never)

    await service.update(auditTeacher, 'task-1', {
      expectedWecomUserId: 'anchor-new',
      wecomDisplayName: '主播新昵称',
      operatorId: 'operator-2',
      membershipCompletedAt: '2026-07-23T10:00:00.000Z',
    })

    expect(prisma.anchorActivationTask.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: expect.objectContaining({
        expectedWecomUserId: 'anchor-new',
        wecomDisplayNameSnapshot: '主播新昵称',
        operatorId: 'operator-2',
      }),
      include: expect.any(Object),
    })
  })

  it('reassigns an activated profile after an operator rejection', async () => {
    const tx = {
      anchorOperatorAssignment: {
        create: vi.fn().mockResolvedValue({ id: 'assignment-2' }),
      },
      anchorProfile: {
        update: vi.fn().mockResolvedValue({}),
      },
      anchorActivationTask: {
        update: vi.fn().mockResolvedValue({
          id: 'task-1',
          expectedWecomUserId: 'anchor-uid',
          wecomDisplayNameSnapshot: '主播企微名',
          operatorId: 'operator-2',
          status: 'activated',
          invitationSentAt: new Date('2026-07-23T10:00:00.000Z'),
          invitationCount: 1,
          membershipCompletedAt: new Date('2026-07-23T09:00:00.000Z'),
          createdAt: new Date('2026-07-23T10:00:00.000Z'),
          updatedAt: new Date('2026-07-23T10:00:00.000Z'),
          operator: {
            id: 'operator-2',
            displayName: '运营B',
          },
          activatedAnchorProfile: {
            id: 'profile-1',
            assignmentStatus: 'pending_confirmation',
          },
        }),
      },
    }
    const prisma = {
      operatorAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'operator-2',
          displayName: '运营B',
        }),
      },
      anchorActivationTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'task-1',
          status: 'activated',
          auditTeacherId: 'audit-1',
          activatedAnchorProfileId: 'profile-1',
          activatedAnchorProfile: {
            id: 'profile-1',
            assignmentStatus: 'rejected',
          },
        }),
      },
      $transaction: vi.fn(async (callback) => callback(tx)),
    }
    const access = {
      requireAnyRole: vi.fn().mockResolvedValue(undefined),
      hasRole: vi.fn().mockResolvedValue(false),
    }
    const service = new ActivationService(prisma as never, access as never)

    await service.reassignOperator(auditTeacher, 'task-1', 'operator-2')

    expect(tx.anchorOperatorAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        anchorProfileId: 'profile-1',
        operatorId: 'operator-2',
        status: 'pending_confirmation',
      }),
    })
    expect(tx.anchorProfile.update).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      data: {
        currentOperatorId: 'operator-2',
        assignmentStatus: 'pending_confirmation',
      },
    })
  })

  it('increments reminder data only after WeCom delivery succeeds', async () => {
    const task = {
      id: 'task-1',
      expectedWecomUserId: 'anchor-uid',
      wecomDisplayNameSnapshot: '主播企微名',
      operatorId: 'operator-1',
      status: 'pending',
      auditTeacherId: 'audit-1',
      invitationSentAt: null,
      invitationCount: 0,
      membershipCompletedAt: new Date('2026-07-23T09:00:00.000Z'),
      createdAt: new Date('2026-07-23T10:00:00.000Z'),
      updatedAt: new Date('2026-07-23T10:00:00.000Z'),
      operator: { id: 'operator-1', displayName: '运营A' },
      activatedAnchorProfile: null,
    }
    const prisma = {
      anchorActivationTask: {
        findUnique: vi.fn().mockResolvedValue(task),
        update: vi.fn().mockResolvedValue({
          ...task,
          status: 'invited',
          invitationSentAt: new Date('2026-07-23T11:00:00.000Z'),
          invitationCount: 1,
        }),
      },
    }
    const access = {
      requireAnyRole: vi.fn().mockResolvedValue(undefined),
      hasRole: vi.fn().mockResolvedValue(false),
    }
    const notifications = {
      sendBusinessNotification: vi.fn().mockResolvedValue({
        item: { id: 'notice-1', status: 'success' },
        duplicate: false,
      }),
    }
    const service = new ActivationService(
      prisma as never,
      access as never,
      notifications as never,
    )

    const result = await service.sendInvitation(auditTeacher, 'task-1')

    expect(notifications.sendBusinessNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        businessType: 'anchor_activation',
        businessId: 'task-1',
        receiverWecomUserId: 'anchor-uid',
        receiverRole: 'anchor',
        templateCode: 'anchor_activation_invitation',
      }),
    )
    expect(result.notificationStatus).toBe('success')
    expect(prisma.anchorActivationTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'invited',
          invitationCount: { increment: 1 },
        }),
      }),
    )
  })

  it('keeps reminder counters unchanged when WeCom delivery fails', async () => {
    const prisma = {
      anchorActivationTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'task-1',
          expectedWecomUserId: 'anchor-uid',
          wecomDisplayNameSnapshot: '主播企微名',
          operatorId: 'operator-1',
          status: 'pending',
          auditTeacherId: 'audit-1',
          membershipCompletedAt: new Date('2026-07-23T09:00:00.000Z'),
          operator: { id: 'operator-1', displayName: '运营A' },
          activatedAnchorProfile: null,
        }),
        update: vi.fn(),
      },
    }
    const access = {
      requireAnyRole: vi.fn().mockResolvedValue(undefined),
      hasRole: vi.fn().mockResolvedValue(false),
    }
    const notifications = {
      sendBusinessNotification: vi.fn().mockResolvedValue({
        item: {
          id: 'notice-1',
          status: 'failed',
          errorMessage: '企微接口失败',
        },
        duplicate: false,
      }),
    }
    const service = new ActivationService(
      prisma as never,
      access as never,
      notifications as never,
    )

    const result = await service.sendInvitation(auditTeacher, 'task-1')

    expect(result).toEqual({
      notificationStatus: 'failed',
      errorMessage: '企微接口失败',
    })
    expect(prisma.anchorActivationTask.update).not.toHaveBeenCalled()
  })
})
