import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { ActivationTaskStatus } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service.js'
import { AccessService } from '../access/access.service.js'
import type { AuthenticatedUser } from '../auth/auth.types.js'
import type { CreateActivationTaskDto } from './dto/create-activation-task.dto.js'

@Injectable()
export class ActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async create(currentUser: AuthenticatedUser, dto: CreateActivationTaskDto) {
    await this.requireManagePermission(currentUser)

    if (!currentUser.accountId) {
      throw new ForbiddenException('当前员工账号无效')
    }

    const expectedWecomUserId = dto.expectedWecomUserId.trim()
    const wecomDisplayName = dto.wecomDisplayName.trim()
    const membershipCompletedAt = new Date(dto.membershipCompletedAt)
    const deviceReadyAt = new Date(dto.deviceReadyAt)

    if (!expectedWecomUserId || !wecomDisplayName) {
      throw new BadRequestException('主播企微UID和企微展示名不能为空')
    }

    const existing = await this.prisma.anchorActivationTask.findUnique({
      where: {
        expectedWecomUserId,
      },
      select: {
        id: true,
        status: true,
      },
    })

    if (existing) {
      throw new BadRequestException('该主播已经存在激活任务')
    }

    const task = await this.prisma.anchorActivationTask.create({
      data: {
        expectedWecomUserId,
        wecomDisplayNameSnapshot: wecomDisplayName,
        auditTeacherId: currentUser.accountId,
        membershipCompletedAt,
        deviceReadyAt,
        status: 'pending',
      },
    })

    return {
      item: this.toItem(task),
    }
  }

  async list(
    currentUser: AuthenticatedUser,
    status?: ActivationTaskStatus,
  ) {
    await this.requireManagePermission(currentUser)
    const canViewAll =
      currentUser.role === 'super_admin' ||
      (await this.access.hasRole(currentUser, 'training_admin'))
    const items = await this.prisma.anchorActivationTask.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(canViewAll ? {} : { auditTeacherId: currentUser.accountId ?? '' }),
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return {
      items: items.map((item) => this.toItem(item)),
    }
  }

  async sendInvitation(currentUser: AuthenticatedUser, taskId: string) {
    await this.requireManagePermission(currentUser)
    const task = await this.findOwnedTask(currentUser, taskId)

    if (task.status === 'activated' || task.status === 'cancelled') {
      throw new BadRequestException('当前激活任务不能再次发送提醒')
    }

    const updated = await this.prisma.anchorActivationTask.update({
      where: {
        id: task.id,
      },
      data: {
        status: 'invited',
        invitationSentAt: new Date(),
        invitationCount: {
          increment: 1,
        },
      },
    })

    return {
      item: this.toItem(updated),
      notificationStatus: 'not_configured' as const,
    }
  }

  async cancel(currentUser: AuthenticatedUser, taskId: string) {
    await this.requireManagePermission(currentUser)
    const task = await this.findOwnedTask(currentUser, taskId)

    if (task.status === 'activated') {
      throw new BadRequestException('主播已经激活，不能取消任务')
    }

    const updated = await this.prisma.anchorActivationTask.update({
      where: {
        id: task.id,
      },
      data: {
        status: 'cancelled',
      },
    })

    return {
      item: this.toItem(updated),
    }
  }

  private async findOwnedTask(
    currentUser: AuthenticatedUser,
    taskId: string,
  ) {
    const task = await this.prisma.anchorActivationTask.findUnique({
      where: {
        id: taskId,
      },
    })

    if (!task) {
      throw new NotFoundException('未找到激活任务')
    }

    const canManageAll =
      currentUser.role === 'super_admin' ||
      (await this.access.hasRole(currentUser, 'training_admin'))

    if (!canManageAll && task.auditTeacherId !== currentUser.accountId) {
      throw new ForbiddenException('只能处理自己创建的激活任务')
    }

    return task
  }

  private async requireManagePermission(currentUser: AuthenticatedUser) {
    if (currentUser.role === 'super_admin') {
      await this.access.requirePasswordSuperAdmin(currentUser)
      return
    }

    await this.access.requireAnyRole(currentUser, [
      'audit_teacher',
      'training_admin',
    ])
  }

  private toItem(task: {
    id: string
    expectedWecomUserId: string
    wecomDisplayNameSnapshot: string
    status: ActivationTaskStatus
    invitationSentAt: Date | null
    invitationCount: number
    membershipCompletedAt: Date
    deviceReadyAt: Date
    createdAt: Date
    updatedAt: Date
  }) {
    return {
      id: task.id,
      expectedWecomUserId: task.expectedWecomUserId,
      wecomDisplayName: task.wecomDisplayNameSnapshot,
      status: task.status,
      invitationSentAt: task.invitationSentAt?.toISOString() ?? null,
      invitationCount: task.invitationCount,
      membershipCompletedAt: task.membershipCompletedAt.toISOString(),
      deviceReadyAt: task.deviceReadyAt.toISOString(),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    }
  }
}
