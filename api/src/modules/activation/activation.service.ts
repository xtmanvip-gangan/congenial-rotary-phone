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
import { NotificationsService } from '../notifications/notifications.service.js'
import type { CreateActivationTaskDto } from './dto/create-activation-task.dto.js'
import type { UpdateActivationTaskDto } from './dto/update-activation-task.dto.js'

const taskInclude = {
  operator: {
    select: {
      id: true,
      displayName: true,
    },
  },
  activatedAnchorProfile: {
    select: {
      id: true,
      assignmentStatus: true,
    },
  },
} as const

@Injectable()
export class ActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(currentUser: AuthenticatedUser, dto: CreateActivationTaskDto) {
    await this.requireManagePermission(currentUser)

    if (!currentUser.accountId) {
      throw new ForbiddenException('当前员工账号无效')
    }

    const expectedWecomUserId = dto.expectedWecomUserId.trim()
    const wecomDisplayName = dto.wecomDisplayName.trim()
    const membershipCompletedAt = new Date(dto.membershipCompletedAt)

    if (!expectedWecomUserId || !wecomDisplayName) {
      throw new BadRequestException('主播企微UID和企微展示名不能为空')
    }

    await this.requireActiveOperator(dto.operatorId)

    const existing = await this.prisma.anchorActivationTask.findUnique({
      where: {
        expectedWecomUserId,
      },
      select: {
        id: true,
        status: true,
      },
    })

    if (existing?.status === 'cancelled') {
      const reopened = await this.prisma.anchorActivationTask.update({
        where: {
          id: existing.id,
        },
        data: {
          wecomDisplayNameSnapshot: wecomDisplayName,
          auditTeacherId: currentUser.accountId,
          operatorId: dto.operatorId,
          membershipCompletedAt,
          status: 'pending',
          invitationSentAt: null,
          invitationCount: 0,
        },
        include: taskInclude,
      })

      return {
        item: this.toItem(reopened),
      }
    }

    if (existing) {
      throw new BadRequestException('该主播已经存在激活任务')
    }

    const task = await this.prisma.anchorActivationTask.create({
      data: {
        expectedWecomUserId,
        wecomDisplayNameSnapshot: wecomDisplayName,
        auditTeacherId: currentUser.accountId,
        operatorId: dto.operatorId,
        membershipCompletedAt,
        status: 'pending',
      },
      include: taskInclude,
    })

    return {
      item: this.toItem(task),
    }
  }

  async update(
    currentUser: AuthenticatedUser,
    taskId: string,
    dto: UpdateActivationTaskDto,
  ) {
    await this.requireManagePermission(currentUser)
    const task = await this.findOwnedTask(currentUser, taskId)

    if (task.activatedAnchorProfileId || task.status === 'activated') {
      throw new BadRequestException('主播已经开通档案，不能修改开通资料')
    }

    const expectedWecomUserId = dto.expectedWecomUserId.trim()
    const wecomDisplayName = dto.wecomDisplayName.trim()
    if (!expectedWecomUserId || !wecomDisplayName) {
      throw new BadRequestException('主播企微UID和企微展示名不能为空')
    }

    await this.requireActiveOperator(dto.operatorId)
    const updated = await this.prisma.anchorActivationTask.update({
      where: { id: task.id },
      data: {
        expectedWecomUserId,
        wecomDisplayNameSnapshot: wecomDisplayName,
        operatorId: dto.operatorId,
        membershipCompletedAt: new Date(dto.membershipCompletedAt),
      },
      include: taskInclude,
    })

    return { item: this.toItem(updated) }
  }

  async reassignOperator(
    currentUser: AuthenticatedUser,
    taskId: string,
    operatorId: string,
  ) {
    await this.requireManagePermission(currentUser)
    const task = await this.findOwnedTask(currentUser, taskId)
    const profile = task.activatedAnchorProfile

    if (
      !task.activatedAnchorProfileId ||
      !profile ||
      profile.assignmentStatus !== 'rejected'
    ) {
      throw new BadRequestException('只有运营已驳回的主播才能重新分配')
    }

    await this.requireActiveOperator(operatorId)
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.anchorOperatorAssignment.create({
        data: {
          anchorProfileId: profile.id,
          operatorId,
          status: 'pending_confirmation',
          initiatedBy: currentUser.wecomUserId,
        },
      })
      await tx.anchorProfile.update({
        where: { id: profile.id },
        data: {
          currentOperatorId: operatorId,
          assignmentStatus: 'pending_confirmation',
        },
      })
      return tx.anchorActivationTask.update({
        where: { id: task.id },
        data: { operatorId },
        include: taskInclude,
      })
    })

    return { item: this.toItem(updated) }
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
      include: taskInclude,
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

    if (!task.operator) {
      throw new BadRequestException('请先为主播分配运营老师')
    }

    const membershipTime = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(task.membershipCompletedAt)
    const notification = await this.notifications.sendBusinessNotification({
      businessType: 'anchor_activation',
      businessId: task.id,
      templateCode: 'anchor_activation_invitation',
      receiverWecomUserId: task.expectedWecomUserId,
      receiverRole: 'anchor',
      messageTitle: '【悦总统】主播档案开通提醒',
      messageContent: [
        `主播：${task.wecomDisplayNameSnapshot}`,
        `所属运营：${task.operator.displayName}`,
        `入会时间：${membershipTime}`,
        '请打开主播小程序，核对资料后完成档案开通。',
      ].join('\n'),
    })

    if (notification.item.status !== 'success') {
      return {
        notificationStatus: 'failed' as const,
        errorMessage: notification.item.errorMessage ?? '企微提醒发送失败',
      }
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
      include: taskInclude,
    })

    return {
      item: this.toItem(updated),
      notificationStatus: 'success' as const,
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
      include: taskInclude,
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
      include: taskInclude,
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

  private async requireActiveOperator(operatorId: string) {
    const operator = await this.prisma.operatorAccount.findFirst({
      where: {
        id: operatorId,
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
    })

    if (!operator) {
      throw new BadRequestException('所选运营老师当前不可用')
    }

    return operator
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
    createdAt: Date
    updatedAt: Date
    operatorId?: string | null
    operator?: {
      id: string
      displayName: string
    } | null
    activatedAnchorProfile?: {
      id: string
      assignmentStatus: string | null
    } | null
  }) {
    return {
      id: task.id,
      expectedWecomUserId: task.expectedWecomUserId,
      wecomDisplayName: task.wecomDisplayNameSnapshot,
      status: task.status,
      invitationSentAt: task.invitationSentAt?.toISOString() ?? null,
      invitationCount: task.invitationCount,
      membershipCompletedAt: task.membershipCompletedAt.toISOString(),
      operator: task.operator ?? null,
      assignmentStatus: task.activatedAnchorProfile?.assignmentStatus ?? null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    }
  }
}
