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
})
