import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { StaffRole } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service.js'
import { AccessService } from '../access/access.service.js'
import type { AuthenticatedUser } from '../auth/auth.types.js'
import type { CreateStaffDto } from './dto/create-staff.dto.js'

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async listStaff(currentUser: AuthenticatedUser) {
    await this.access.requirePasswordSuperAdmin(currentUser)
    const items = await this.prisma.operatorAccount.findMany({
      where: {
        role: 'operator',
      },
      include: {
        staffRoles: {
          select: {
            role: true,
          },
          orderBy: {
            role: 'asc',
          },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    })

    return {
      items: items.map((item) => this.toItem(item)),
    }
  }

  async createStaff(currentUser: AuthenticatedUser, dto: CreateStaffDto) {
    await this.access.requirePasswordSuperAdmin(currentUser)
    const displayName = dto.displayName.trim()
    const wecomUserId = dto.wecomUserId.trim()
    const roles = [...new Set(dto.roles)]

    if (!displayName || !wecomUserId || roles.length === 0) {
      throw new BadRequestException('姓名、企微UID和角色不能为空')
    }

    const existing = await this.prisma.operatorAccount.findUnique({
      where: {
        wecomUserId,
      },
      select: {
        id: true,
      },
    })

    if (existing) {
      throw new BadRequestException('该企微UID已存在')
    }

    const account = await this.prisma.$transaction(async (tx) => {
      const created = await tx.operatorAccount.create({
        data: {
          displayName,
          wecomUserId,
          username: null,
          passwordHash: null,
          role: 'operator',
          status: 'active',
        },
      })

      await tx.staffRoleAssignment.createMany({
        data: roles.map((role) => ({
          accountId: created.id,
          role,
          createdBy: currentUser.accountId ?? null,
        })),
      })

      return created
    })

    return {
      item: this.toItem({
        ...account,
        staffRoles: roles.map((role) => ({ role })),
      }),
    }
  }

  async updateRoles(
    currentUser: AuthenticatedUser,
    staffId: string,
    rolesInput: StaffRole[],
  ) {
    await this.access.requirePasswordSuperAdmin(currentUser)
    const roles = [...new Set(rolesInput)]

    if (roles.length === 0) {
      throw new BadRequestException('员工至少需要一个角色')
    }

    const account = await this.prisma.operatorAccount.findFirst({
      where: {
        id: staffId,
        role: 'operator',
      },
      select: {
        id: true,
      },
    })

    if (!account) {
      throw new NotFoundException('未找到员工账号')
    }

    await this.prisma.$transaction([
      this.prisma.staffRoleAssignment.deleteMany({
        where: {
          accountId: staffId,
        },
      }),
      this.prisma.staffRoleAssignment.createMany({
        data: roles.map((role) => ({
          accountId: staffId,
          role,
          createdBy: currentUser.accountId ?? null,
        })),
      }),
    ])

    return this.getStaffItem(staffId)
  }

  async updateStatus(
    currentUser: AuthenticatedUser,
    staffId: string,
    status: 'active' | 'disabled',
  ) {
    await this.access.requirePasswordSuperAdmin(currentUser)
    const account = await this.prisma.operatorAccount.findFirst({
      where: {
        id: staffId,
        role: 'operator',
      },
      select: {
        id: true,
      },
    })

    if (!account) {
      throw new NotFoundException('未找到员工账号')
    }

    await this.prisma.operatorAccount.update({
      where: {
        id: staffId,
      },
      data: {
        status,
      },
    })

    return this.getStaffItem(staffId)
  }

  async listActiveOperators(currentUser: AuthenticatedUser) {
    if (
      currentUser.loginType !== 'wecom_miniapp' &&
      currentUser.loginType !== 'wecom_staff' &&
      currentUser.loginType !== 'password_admin'
    ) {
      throw new BadRequestException('登录状态无效')
    }

    const items = await this.prisma.operatorAccount.findMany({
      where: {
        role: 'operator',
        status: 'active',
        staffRoles: {
          some: {
            role: 'operator',
          },
        },
      },
      select: {
        id: true,
        displayName: true,
      },
      orderBy: {
        displayName: 'asc',
      },
    })

    return { items }
  }

  private async getStaffItem(staffId: string) {
    const item = await this.prisma.operatorAccount.findUnique({
      where: {
        id: staffId,
      },
      include: {
        staffRoles: {
          select: {
            role: true,
          },
          orderBy: {
            role: 'asc',
          },
        },
      },
    })

    if (!item) {
      throw new NotFoundException('未找到员工账号')
    }

    return {
      item: this.toItem(item),
    }
  }

  private toItem(item: {
    id: string
    displayName: string
    wecomUserId: string | null
    status: string
    createdAt: Date
    updatedAt: Date
    staffRoles: { role: StaffRole }[]
  }) {
    return {
      id: item.id,
      displayName: item.displayName,
      wecomUserId: item.wecomUserId ?? '',
      roles: item.staffRoles.map(({ role }) => role),
      status: item.status,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }
  }
}
