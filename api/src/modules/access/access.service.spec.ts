import { describe, expect, it, vi } from 'vitest'
import { AccessService } from './access.service.js'

describe('AccessService', () => {
  it('rejects a non-password session from super admin operations', async () => {
    const prisma = {
      operatorAccount: {
        findFirst: vi.fn(),
      },
    }
    const service = new AccessService(prisma as never)

    await expect(
      service.requirePasswordSuperAdmin({
        accountId: 'staff-1',
        wecomUserId: 'staff-uid',
        name: '员工',
        avatarUrl: null,
        role: 'operator',
        roles: ['operator'],
        loginType: 'wecom_staff',
      }),
    ).rejects.toThrow('只有超级管理员可以执行此操作')
    expect(prisma.operatorAccount.findFirst).not.toHaveBeenCalled()
  })

  it('allows password super admin to pass any staff role gate', async () => {
    const prisma = {
      operatorAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'admin-1',
        }),
      },
    }
    const service = new AccessService(prisma as never)

    await expect(
      service.requireAnyRole(
        {
          accountId: 'admin-1',
          wecomUserId: 'admin',
          name: '超管',
          avatarUrl: null,
          role: 'super_admin',
          roles: ['super_admin'],
          loginType: 'password_admin',
        },
        ['operator'],
      ),
    ).resolves.toBeUndefined()
  })

  it('rejects a stale staff token after the role is removed in database', async () => {
    const prisma = {
      operatorAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'staff-1',
          staffRoles: [],
        }),
      },
    }
    const service = new AccessService(prisma as never)

    await expect(
      service.requireAnyRole(
        {
          accountId: 'staff-1',
          wecomUserId: 'staff-uid',
          name: '员工',
          avatarUrl: null,
          role: 'operator',
          roles: ['operator'],
          loginType: 'wecom_staff',
        },
        ['operator'],
      ),
    ).rejects.toThrow('当前账号没有所需权限')
  })
})
