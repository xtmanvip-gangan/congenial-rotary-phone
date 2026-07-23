import { describe, expect, it, vi } from 'vitest'
import { StaffService } from './staff.service.js'

const superAdmin = {
  accountId: 'admin-1',
  wecomUserId: 'admin',
  name: '管理员',
  avatarUrl: null,
  role: 'super_admin' as const,
  roles: ['super_admin' as const],
  loginType: 'password_admin' as const,
}

describe('StaffService', () => {
  it('creates an enterprise-wecom-only staff account with selected roles', async () => {
    const accountCreate = vi.fn().mockResolvedValue({
      id: 'staff-1',
      displayName: '审核运营老师',
      wecomUserId: 'staff-uid',
      status: 'active',
      createdAt: new Date('2026-07-23T00:00:00.000Z'),
      updatedAt: new Date('2026-07-23T00:00:00.000Z'),
    })
    const roleCreateMany = vi.fn().mockResolvedValue({ count: 2 })
    const prisma = {
      operatorAccount: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(async (callback) =>
        callback({
          operatorAccount: { create: accountCreate },
          staffRoleAssignment: { createMany: roleCreateMany },
        }),
      ),
    }
    const access = {
      requirePasswordSuperAdmin: vi.fn().mockResolvedValue(undefined),
    }
    const service = new StaffService(prisma as never, access as never)

    await service.createStaff(superAdmin, {
      displayName: '审核运营老师',
      wecomUserId: 'staff-uid',
      roles: ['audit_teacher', 'operator'],
    })

    expect(accountCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        username: null,
        passwordHash: null,
        wecomUserId: 'staff-uid',
      }),
    })
    expect(roleCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ role: 'audit_teacher' }),
        expect.objectContaining({ role: 'operator' }),
      ],
    })
  })
})
