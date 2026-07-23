import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { AuthService } from './auth.service.js'

function createSubject() {
  const config = {
    get: vi.fn((key: string) => {
      if (key === 'JWT_SECRET') {
        return 'test-secret'
      }

      return undefined
    }),
  }
  const wecom = {
    resolveUserProfileByCode: vi.fn(),
    resolveMiniappUserProfileByCode: vi.fn(),
    buildAuthorizeUrl: vi.fn(),
  }
  const prisma = {
    operatorAccount: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    wecomUser: {
      upsert: vi.fn(),
    },
    anchorProfile: {
      findUnique: vi.fn(),
    },
    anchorActivationTask: {
      findUnique: vi.fn(),
    },
  }

  return {
    config,
    wecom,
    prisma,
    service: new AuthService(config as never, wecom as never, prisma as never),
  }
}

describe('AuthService entry isolation', () => {
  it('rejects password login for a non-super-admin account', async () => {
    const { service, prisma } = createSubject()
    const passwordHash = createHash('sha256')
      .update('test-secret:secret123')
      .digest('hex')

    prisma.operatorAccount.findFirst.mockResolvedValue({
      id: 'staff-1',
      username: 'operator',
      passwordHash,
      displayName: '运营A',
      role: 'operator',
    })

    await expect(service.loginWithPassword('operator', 'secret123')).rejects.toThrow(
      '账号或密码错误',
    )
  })

  it('rejects web wecom login when the uid is not pre-registered', async () => {
    const { service, prisma, wecom } = createSubject()
    wecom.resolveUserProfileByCode.mockResolvedValue({
      userId: 'unknown',
      name: '未知员工',
      avatarUrl: null,
    })
    prisma.operatorAccount.findUnique.mockResolvedValue(null)

    await expect(service.loginWithWecomCode('code')).rejects.toThrow(
      '当前企微账号未开通后台权限',
    )
  })

  it('returns every active role for a registered wecom staff member', async () => {
    const { service, prisma, wecom } = createSubject()
    wecom.resolveUserProfileByCode.mockResolvedValue({
      userId: 'staff-uid',
      name: '复合角色老师',
      avatarUrl: null,
    })
    prisma.operatorAccount.findUnique.mockResolvedValue({
      id: 'staff-1',
      wecomUserId: 'staff-uid',
      displayName: '复合角色老师',
      status: 'active',
      role: 'operator',
      staffRoles: [
        { role: 'operator' },
        { role: 'training_teacher' },
      ],
    })

    const result = await service.loginWithWecomCode('code')

    expect(result.user).toMatchObject({
      accountId: 'staff-1',
      role: 'training_teacher',
      roles: ['operator', 'training_teacher'],
      loginType: 'wecom_staff',
    })
  })

  it('never allows a super admin account to enter through wecom login', async () => {
    const { service, prisma, wecom } = createSubject()
    wecom.resolveUserProfileByCode.mockResolvedValue({
      userId: 'admin-uid',
      name: '管理员',
      avatarUrl: null,
    })
    prisma.operatorAccount.findUnique.mockResolvedValue({
      id: 'admin-1',
      wecomUserId: 'admin-uid',
      displayName: '管理员',
      status: 'active',
      role: 'super_admin',
      staffRoles: [],
    })

    await expect(service.loginWithWecomCode('code')).rejects.toThrow(
      '当前企微账号未开通后台权限',
    )
  })

  it('returns an anchor-only miniapp session with activation status', async () => {
    const { service, prisma, wecom } = createSubject()
    wecom.resolveMiniappUserProfileByCode.mockResolvedValue({
      userId: 'anchor-uid',
      name: '主播企微名',
      avatarUrl: null,
    })
    prisma.wecomUser.upsert.mockResolvedValue({
      id: 'wecom-record-1',
      wecomUserId: 'anchor-uid',
      wecomName: '主播企微名',
      avatarUrl: null,
    })
    prisma.anchorProfile.findUnique.mockResolvedValue(null)
    prisma.anchorActivationTask.findUnique.mockResolvedValue({
      id: 'task-1',
      status: 'invited',
    })

    const result = await service.loginWithMiniappCode('code')

    expect(result.user).toMatchObject({
      role: 'anchor',
      roles: ['anchor'],
      loginType: 'wecom_miniapp',
      anchorProfileStatus: 'not_activated',
    })
  })
})
