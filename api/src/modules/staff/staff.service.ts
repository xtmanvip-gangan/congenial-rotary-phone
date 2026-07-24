import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { StaffRole } from '@prisma/client'
import { Prisma } from '@prisma/client'
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
        _count: {
          select: {
            currentAnchors: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    })

    return {
      items: items.map((item) =>
        this.toItem(item, { managedAnchorCount: item._count.currentAnchors }),
      ),
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

  /** 离职交接：名下主播转给目标运营，归属状态为待新运营确认 */
  async transferAnchors(
    currentUser: AuthenticatedUser,
    staffId: string,
    targetOperatorId: string,
  ) {
    await this.access.requirePasswordSuperAdmin(currentUser)

    if (staffId === targetOperatorId) {
      throw new BadRequestException('不能转交给本人')
    }

    const source = await this.requireStaffAccount(staffId)
    const target = await this.prisma.operatorAccount.findFirst({
      where: {
        id: targetOperatorId,
        role: 'operator',
        status: 'active',
        staffRoles: { some: { role: 'operator' } },
      },
      select: { id: true, displayName: true },
    })
    if (!target) {
      throw new BadRequestException('目标运营不可用，请选择启用中的运营老师')
    }

    const anchors = await this.prisma.anchorProfile.findMany({
      where: {
        OR: [
          { currentOperatorId: staffId },
          {
            assignments: {
              some: {
                operatorId: staffId,
                status: 'pending_confirmation',
              },
            },
          },
        ],
      },
      select: {
        id: true,
        anchorDisplayName: true,
        currentOperatorId: true,
      },
    })

    if (anchors.length === 0) {
      throw new BadRequestException('该员工当前没有需要转交的主播')
    }

    const initiatedBy =
      currentUser.wecomUserId || currentUser.accountId || 'super_admin'
    const now = new Date()
    const reason = `离职转交：${source.displayName} → ${target.displayName}`

    await this.prisma.$transaction(async (tx) => {
      for (const anchor of anchors) {
        await tx.anchorOperatorAssignment.updateMany({
          where: {
            anchorProfileId: anchor.id,
            operatorId: staffId,
            status: { in: ['confirmed', 'pending_confirmation'] },
          },
          data: {
            status: 'ended',
            endedAt: now,
            reason,
          },
        })

        await tx.anchorOperatorAssignment.create({
          data: {
            anchorProfileId: anchor.id,
            operatorId: target.id,
            status: 'pending_confirmation',
            initiatedBy,
            reason,
          },
        })

        await tx.anchorProfile.update({
          where: { id: anchor.id },
          data: {
            currentOperatorId: target.id,
            assignmentStatus: 'pending_confirmation',
          },
        })
      }

      // 未激活的开通任务一并改派给新运营
      await tx.anchorActivationTask.updateMany({
        where: {
          operatorId: staffId,
          status: { in: ['pending', 'invited'] },
        },
        data: { operatorId: target.id },
      })
    })

    return {
      ok: true as const,
      transferredCount: anchors.length,
      targetOperator: target,
      anchors: anchors.map((item) => ({
        id: item.id,
        anchorDisplayName: item.anchorDisplayName,
      })),
    }
  }

  /**
   * 硬删除员工。
   * 前置：无在管主播、无待确认归属；历史提报等外键仍占用时会明确报错。
   */
  async removeStaff(currentUser: AuthenticatedUser, staffId: string) {
    await this.access.requirePasswordSuperAdmin(currentUser)
    const account = await this.requireStaffAccount(staffId)

    const managedCount = await this.prisma.anchorProfile.count({
      where: { currentOperatorId: staffId },
    })
    if (managedCount > 0) {
      throw new BadRequestException(
        `仍有 ${managedCount} 位在管主播，请先转交给其他运营后再删除`,
      )
    }

    const pendingAssignments = await this.prisma.anchorOperatorAssignment.count({
      where: {
        operatorId: staffId,
        status: 'pending_confirmation',
      },
    })
    if (pendingAssignments > 0) {
      throw new BadRequestException(
        '仍有待确认的归属记录，请先完成转交或处理后再删除',
      )
    }

    // 清理会挡住硬删、且可安全处理的关联
    await this.prisma.$transaction(async (tx) => {
      await tx.anchorActivationTask.updateMany({
        where: {
          operatorId: staffId,
          status: { in: ['pending', 'invited', 'cancelled'] },
        },
        data: { operatorId: null },
      })
      // 归属历史记录会挡住删除；转交后均为 ended，删除该员工侧历史归属行
      await tx.anchorOperatorAssignment.deleteMany({
        where: { operatorId: staffId },
      })
    })

    try {
      await this.prisma.operatorAccount.delete({
        where: { id: staffId },
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new BadRequestException(
          '该员工仍有历史业务数据（如礼物提报、培训记录）关联，无法硬删除。请保持停用状态。',
        )
      }
      throw error
    }

    return {
      ok: true as const,
      id: account.id,
      displayName: account.displayName,
    }
  }

  private async requireStaffAccount(staffId: string) {
    const account = await this.prisma.operatorAccount.findFirst({
      where: {
        id: staffId,
        role: 'operator',
      },
      select: {
        id: true,
        displayName: true,
      },
    })
    if (!account) {
      throw new NotFoundException('未找到员工账号')
    }
    return account
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
        _count: {
          select: {
            currentAnchors: true,
          },
        },
      },
    })

    if (!item) {
      throw new NotFoundException('未找到员工账号')
    }

    return {
      item: this.toItem(item, {
        managedAnchorCount: item._count.currentAnchors,
      }),
    }
  }

  private toItem(
    item: {
      id: string
      displayName: string
      wecomUserId: string | null
      status: string
      createdAt: Date
      updatedAt: Date
      staffRoles: { role: StaffRole }[]
    },
    extra?: { managedAnchorCount?: number },
  ) {
    return {
      id: item.id,
      displayName: item.displayName,
      wecomUserId: item.wecomUserId ?? '',
      roles: item.staffRoles.map(({ role }) => role),
      status: item.status,
      managedAnchorCount: extra?.managedAnchorCount ?? 0,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }
  }
}
