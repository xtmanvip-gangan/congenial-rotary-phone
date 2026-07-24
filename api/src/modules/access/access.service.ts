import { ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service.js'
import type {
  AppRole,
  AuthenticatedUser,
  StaffRole,
} from '../auth/auth.types.js'

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async requirePasswordSuperAdmin(user: AuthenticatedUser) {
    if (
      user.role !== 'super_admin' ||
      user.loginType !== 'password_admin' ||
      !user.accountId
    ) {
      throw new ForbiddenException('只有超级管理员可以执行此操作')
    }

    const account = await this.prisma.operatorAccount.findFirst({
      where: {
        id: user.accountId,
        role: 'super_admin',
        status: 'active',
      },
      select: {
        id: true,
      },
    })

    if (!account) {
      throw new ForbiddenException('只有超级管理员可以执行此操作')
    }
  }

  async requireAnyRole(user: AuthenticatedUser, roles: StaffRole[]) {
    // 超级管理员拥有全部员工角色业务权限（密码登录）
    if (user.role === 'super_admin' && user.loginType === 'password_admin') {
      await this.requirePasswordSuperAdmin(user)
      return
    }

    if (user.loginType !== 'wecom_staff' || !user.accountId) {
      throw new ForbiddenException('当前账号没有所需权限')
    }

    const account = await this.prisma.operatorAccount.findFirst({
      where: {
        id: user.accountId,
        wecomUserId: user.wecomUserId,
        status: 'active',
      },
      select: {
        id: true,
        staffRoles: {
          select: {
            role: true,
          },
        },
      },
    })
    const currentRoles = account?.staffRoles.map(({ role }) => role) ?? []

    if (!roles.some((role) => currentRoles.includes(role))) {
      throw new ForbiddenException('当前账号没有所需权限')
    }
  }

  async hasRole(user: AuthenticatedUser, role: AppRole) {
    if (role === 'super_admin') {
      try {
        await this.requirePasswordSuperAdmin(user)
        return true
      } catch {
        return false
      }
    }

    if (role === 'anchor') {
      return user.loginType === 'wecom_miniapp'
    }

    try {
      await this.requireAnyRole(user, [role])
      return true
    } catch {
      return false
    }
  }
}
