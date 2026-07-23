import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service.js'
import { AccessService } from '../access/access.service.js'
import type { AuthenticatedUser } from '../auth/auth.types.js'
import type { ActivateAnchorDto } from './dto/activate-anchor.dto.js'

const profileInclude = {
  wecomUser: {
    select: {
      wecomName: true,
    },
  },
  currentOperator: {
    select: {
      id: true,
      displayName: true,
    },
  },
} as const

@Injectable()
export class AnchorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async getMyProfile(currentUser: AuthenticatedUser) {
    this.requireAnchorSession(currentUser)
    const profile = await this.findProfileForUser(currentUser.wecomUserId)

    if (!profile) {
      return {
        item: null,
      }
    }

    return {
      item: this.toProfileItem(profile),
    }
  }

  async activate(currentUser: AuthenticatedUser, dto: ActivateAnchorDto) {
    this.requireAnchorSession(currentUser)
    const anchorDisplayName = dto.anchorDisplayName.trim()

    if (!anchorDisplayName) {
      throw new BadRequestException('主播展示名不能为空')
    }

    const wecomUser = await this.prisma.wecomUser.findUnique({
      where: {
        wecomUserId: currentUser.wecomUserId,
      },
      select: {
        id: true,
      },
    })

    if (!wecomUser) {
      throw new BadRequestException('未找到企业微信成员信息，请重新登录')
    }

    const existing = await this.prisma.anchorProfile.findUnique({
      where: {
        wecomUserRecordId: wecomUser.id,
      },
      include: profileInclude,
    })

    if (existing) {
      return {
        item: this.toProfileItem(existing),
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const task = await tx.anchorActivationTask.findUnique({
        where: {
          expectedWecomUserId: currentUser.wecomUserId,
        },
      })

      if (
        !task ||
        (task.status !== 'pending' && task.status !== 'invited') ||
        !task.membershipCompletedAt ||
        !task.deviceReadyAt
      ) {
        throw new BadRequestException('尚未具备档案激活条件，请联系审核老师')
      }

      const operator = await tx.operatorAccount.findFirst({
        where: {
          id: dto.operatorId,
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
      })

      if (!operator) {
        throw new BadRequestException('所选运营老师当前不可用')
      }

      const profile = await tx.anchorProfile.create({
        data: {
          wecomUserRecordId: wecomUser.id,
          anchorDisplayName,
          currentOperatorId: operator.id,
          assignmentStatus: 'pending_confirmation',
          source: 'activation',
          status: 'active',
        },
        include: profileInclude,
      })

      await tx.anchorOperatorAssignment.create({
        data: {
          anchorProfileId: profile.id,
          operatorId: operator.id,
          status: 'pending_confirmation',
          initiatedBy: currentUser.wecomUserId,
        },
      })

      await tx.anchorActivationTask.update({
        where: {
          id: task.id,
        },
        data: {
          status: 'activated',
          activatedAnchorProfileId: profile.id,
        },
      })

      return profile
    })

    return {
      item: this.toProfileItem(created),
    }
  }

  async updateDisplayName(
    currentUser: AuthenticatedUser,
    anchorDisplayNameInput: string,
  ) {
    this.requireAnchorSession(currentUser)
    const anchorDisplayName = anchorDisplayNameInput.trim()
    const profile = await this.findProfileForUser(currentUser.wecomUserId)

    if (!profile) {
      throw new NotFoundException('主播档案尚未激活')
    }

    if (!anchorDisplayName) {
      throw new BadRequestException('主播展示名不能为空')
    }

    if (profile.anchorDisplayName === anchorDisplayName) {
      return {
        item: this.toProfileItem(profile),
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.anchorNameHistory.create({
        data: {
          anchorProfileId: profile.id,
          oldName: profile.anchorDisplayName,
          newName: anchorDisplayName,
          changedByType: 'anchor',
          changedById: currentUser.wecomUserId,
        },
      })

      return tx.anchorProfile.update({
        where: {
          id: profile.id,
        },
        data: {
          anchorDisplayName,
        },
        include: profileInclude,
      })
    })

    return {
      item: this.toProfileItem(updated),
    }
  }

  async selectOperator(currentUser: AuthenticatedUser, operatorId: string) {
    this.requireAnchorSession(currentUser)
    const profile = await this.findProfileForUser(currentUser.wecomUserId)

    if (!profile) {
      throw new NotFoundException('主播档案尚未激活')
    }

    if (
      profile.assignmentStatus === 'pending_confirmation' ||
      profile.assignmentStatus === 'confirmed'
    ) {
      throw new BadRequestException('当前已有待确认或已确认的运营归属')
    }

    const operator = await this.prisma.operatorAccount.findFirst({
      where: {
        id: operatorId,
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
      },
    })

    if (!operator) {
      throw new BadRequestException('所选运营老师当前不可用')
    }

    await this.prisma.$transaction([
      this.prisma.anchorOperatorAssignment.create({
        data: {
          anchorProfileId: profile.id,
          operatorId,
          status: 'pending_confirmation',
          initiatedBy: currentUser.wecomUserId,
        },
      }),
      this.prisma.anchorProfile.update({
        where: {
          id: profile.id,
        },
        data: {
          currentOperatorId: operatorId,
          assignmentStatus: 'pending_confirmation',
        },
      }),
    ])

    return this.getMyProfile(currentUser)
  }

  async listPendingAssignments(currentUser: AuthenticatedUser) {
    await this.access.requireAnyRole(currentUser, ['operator'])
    const items = await this.prisma.anchorOperatorAssignment.findMany({
      where: {
        operatorId: currentUser.accountId ?? '',
        status: 'pending_confirmation',
      },
      include: {
        anchorProfile: {
          include: profileInclude,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    return {
      items: items.map((assignment) => ({
        id: assignment.id,
        status: assignment.status,
        createdAt: assignment.createdAt.toISOString(),
        anchor: this.toProfileItem(assignment.anchorProfile),
      })),
    }
  }

  async listMyAnchors(currentUser: AuthenticatedUser) {
    await this.access.requireAnyRole(currentUser, ['operator'])
    const items = await this.prisma.anchorProfile.findMany({
      where: {
        currentOperatorId: currentUser.accountId ?? '',
        assignmentStatus: 'confirmed',
      },
      include: profileInclude,
      orderBy: {
        activatedAt: 'desc',
      },
    })

    return {
      items: items.map((item) => this.toProfileItem(item)),
    }
  }

  async confirmAssignment(
    currentUser: AuthenticatedUser,
    assignmentId: string,
  ) {
    await this.access.requireAnyRole(currentUser, ['operator'])
    const assignment = await this.prisma.anchorOperatorAssignment.findFirst({
      where: {
        id: assignmentId,
        operatorId: currentUser.accountId ?? '',
        status: 'pending_confirmation',
      },
    })

    if (!assignment) {
      throw new NotFoundException('未找到待确认的运营归属')
    }

    const now = new Date()
    await this.prisma.$transaction([
      this.prisma.anchorOperatorAssignment.update({
        where: {
          id: assignment.id,
        },
        data: {
          status: 'confirmed',
          startedAt: now,
          confirmedBy: currentUser.wecomUserId,
        },
      }),
      this.prisma.anchorProfile.update({
        where: {
          id: assignment.anchorProfileId,
        },
        data: {
          currentOperatorId: assignment.operatorId,
          assignmentStatus: 'confirmed',
        },
      }),
    ])

    return { ok: true }
  }

  async rejectAssignment(
    currentUser: AuthenticatedUser,
    assignmentId: string,
    reasonInput: string,
  ) {
    await this.access.requireAnyRole(currentUser, ['operator'])
    const reason = reasonInput.trim()

    if (!reason) {
      throw new BadRequestException('请填写驳回原因')
    }

    const assignment = await this.prisma.anchorOperatorAssignment.findFirst({
      where: {
        id: assignmentId,
        operatorId: currentUser.accountId ?? '',
        status: 'pending_confirmation',
      },
    })

    if (!assignment) {
      throw new NotFoundException('未找到待确认的运营归属')
    }

    await this.prisma.$transaction([
      this.prisma.anchorOperatorAssignment.update({
        where: {
          id: assignment.id,
        },
        data: {
          status: 'rejected',
          endedAt: new Date(),
          confirmedBy: currentUser.wecomUserId,
          reason,
        },
      }),
      this.prisma.anchorProfile.update({
        where: {
          id: assignment.anchorProfileId,
        },
        data: {
          currentOperatorId: null,
          assignmentStatus: 'rejected',
        },
      }),
    ])

    return { ok: true }
  }

  private requireAnchorSession(currentUser: AuthenticatedUser) {
    if (
      currentUser.role !== 'anchor' ||
      currentUser.loginType !== 'wecom_miniapp'
    ) {
      throw new ForbiddenException('只有主播小程序可以执行此操作')
    }
  }

  private async findProfileForUser(wecomUserId: string) {
    const wecomUser = await this.prisma.wecomUser.findUnique({
      where: {
        wecomUserId,
      },
      select: {
        id: true,
      },
    })

    if (!wecomUser) {
      return null
    }

    return this.prisma.anchorProfile.findUnique({
      where: {
        wecomUserRecordId: wecomUser.id,
      },
      include: profileInclude,
    })
  }

  private toProfileItem(profile: {
    id: string
    anchorDisplayName: string
    assignmentStatus:
      | 'pending_confirmation'
      | 'confirmed'
      | 'rejected'
      | 'ended'
      | null
    status: 'active' | 'paused' | 'exited'
    activatedAt: Date
    currentOperator: {
      id: string
      displayName: string
    } | null
    wecomUser: {
      wecomName: string | null
    }
  }) {
    return {
      id: profile.id,
      wecomName: profile.wecomUser.wecomName ?? '',
      anchorDisplayName: profile.anchorDisplayName,
      assignmentStatus: profile.assignmentStatus,
      operator: profile.currentOperator,
      status: profile.status,
      activatedAt: profile.activatedAt.toISOString(),
    }
  }
}
