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
  it('creates an activation task only after membership and device preparation', async () => {
    const prisma = {
      anchorActivationTask: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'task-1',
          expectedWecomUserId: 'anchor-uid',
          wecomDisplayNameSnapshot: '主播企微名',
          status: 'pending',
          invitationSentAt: null,
          invitationCount: 0,
          membershipCompletedAt: new Date('2026-07-23T09:00:00.000Z'),
          deviceReadyAt: new Date('2026-07-23T10:00:00.000Z'),
          createdAt: new Date('2026-07-23T10:00:00.000Z'),
          updatedAt: new Date('2026-07-23T10:00:00.000Z'),
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
      membershipCompletedAt: '2026-07-23T09:00:00.000Z',
      deviceReadyAt: '2026-07-23T10:00:00.000Z',
    })

    expect(prisma.anchorActivationTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        auditTeacherId: 'audit-1',
        expectedWecomUserId: 'anchor-uid',
        status: 'pending',
      }),
    })
  })

  it('increments the invitation count without claiming an unconfigured notification succeeded', async () => {
    const prisma = {
      anchorActivationTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'task-1',
          status: 'pending',
          auditTeacherId: 'audit-1',
        }),
        update: vi.fn().mockResolvedValue({
          id: 'task-1',
          expectedWecomUserId: 'anchor-uid',
          wecomDisplayNameSnapshot: '主播企微名',
          status: 'invited',
          invitationSentAt: new Date('2026-07-23T10:00:00.000Z'),
          invitationCount: 1,
          membershipCompletedAt: new Date('2026-07-23T09:00:00.000Z'),
          deviceReadyAt: new Date('2026-07-23T10:00:00.000Z'),
          createdAt: new Date('2026-07-23T10:00:00.000Z'),
          updatedAt: new Date('2026-07-23T10:00:00.000Z'),
        }),
      },
    }
    const access = {
      requireAnyRole: vi.fn().mockResolvedValue(undefined),
      hasRole: vi.fn().mockResolvedValue(false),
    }
    const service = new ActivationService(prisma as never, access as never)

    const result = await service.sendInvitation(auditTeacher, 'task-1')

    expect(result.notificationStatus).toBe('not_configured')
    expect(prisma.anchorActivationTask.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: expect.objectContaining({
        status: 'invited',
        invitationCount: { increment: 1 },
      }),
    })
  })
})
