import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service.js'
import { AccessService } from '../access/access.service.js'
import type { AuthenticatedUser } from '../auth/auth.types.js'

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

const onboardingTypes = [
  'operator_received',
  'homepage_ready',
  'live_software_ready',
  'helper_software_ready',
  'prejob_learning_completed',
  'prelive_check_completed',
  'first_live_completed',
  'first_live_review_completed',
] as const

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

  async getMyActivation(currentUser: AuthenticatedUser) {
    this.requireAnchorSession(currentUser)
    const task = await this.prisma.anchorActivationTask.findUnique({
      where: {
        expectedWecomUserId: currentUser.wecomUserId,
      },
      include: {
        operator: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    })

    if (
      !task ||
      (task.status !== 'pending' && task.status !== 'invited') ||
      !task.operator
    ) {
      return { item: null }
    }

    return {
      item: {
        anchorDisplayName: task.wecomDisplayNameSnapshot,
        membershipCompletedAt: task.membershipCompletedAt.toISOString(),
        operator: task.operator,
      },
    }
  }

  async activate(currentUser: AuthenticatedUser) {
    this.requireAnchorSession(currentUser)

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
        include: {
          operator: {
            select: {
              id: true,
              displayName: true,
              status: true,
              staffRoles: {
                select: {
                  role: true,
                },
              },
            },
          },
        },
      })

      if (
        !task ||
        (task.status !== 'pending' && task.status !== 'invited') ||
        !task.membershipCompletedAt ||
        !task.operatorId ||
        !task.operator ||
        task.operator.status !== 'active' ||
        !task.operator.staffRoles.some((item) => item.role === 'operator')
      ) {
        throw new BadRequestException('尚未具备档案激活条件，请联系审核老师')
      }

      const profile = await tx.anchorProfile.create({
        data: {
          wecomUserRecordId: wecomUser.id,
          anchorDisplayName: task.wecomDisplayNameSnapshot,
          currentOperatorId: task.operator.id,
          assignmentStatus: 'pending_confirmation',
          source: 'activation',
          status: 'active',
        },
        include: profileInclude,
      })

      await tx.anchorOperatorAssignment.create({
        data: {
          anchorProfileId: profile.id,
          operatorId: task.operator.id,
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

  /**
   * 历史「主播自选运营」接口。一键开通后已废弃，保留路由仅返回明确错误，避免旧客户端静默失败。
   */
  async selectOperator(currentUser: AuthenticatedUser, operatorId: string) {
    this.requireAnchorSession(currentUser)
    void operatorId
    throw new BadRequestException(
      '运营归属由审核老师在开通任务中分配，主播端不可自选。请联系审核老师处理。',
    )
  }

  async listPendingAssignments(currentUser: AuthenticatedUser) {
    await this.access.requireAnyRole(currentUser, ['operator'])
    const items = await this.prisma.anchorOperatorAssignment.findMany({
      where: {
        ...(isGlobalOperatorView(currentUser)
          ? {}
          : { operatorId: currentUser.accountId ?? '' }),
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
        ...(isGlobalOperatorView(currentUser)
          ? {}
          : { currentOperatorId: currentUser.accountId ?? '' }),
        assignmentStatus: 'confirmed',
      },
      include: {
        ...profileInclude,
        onboardingProgress: {
          include: {
            milestones: true,
          },
        },
      },
      orderBy: {
        activatedAt: 'desc',
      },
    })

    return {
      items: items.map((item) => ({
        ...this.toProfileItem(item),
        onboarding: item.onboardingProgress
          ? {
              completedCount: item.onboardingProgress.milestones.filter(
                (milestone) => milestone.status === 'completed',
              ).length,
              totalCount: onboardingTypes.length,
              nextMilestone:
                onboardingTypes.find(
                  (type) =>
                    !item.onboardingProgress?.milestones.some(
                      (milestone) =>
                        milestone.type === type &&
                        milestone.status === 'completed',
                    ),
                ) ?? null,
            }
          : null,
      })),
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
        ...(isGlobalOperatorView(currentUser)
          ? {}
          : { operatorId: currentUser.accountId ?? '' }),
        status: 'pending_confirmation',
      },
      include: {
        anchorProfile: {
          select: {
            anchorDisplayName: true,
          },
        },
        operator: {
          select: {
            displayName: true,
          },
        },
      },
    })

    if (!assignment) {
      throw new NotFoundException('未找到待确认的运营归属')
    }

    const now = new Date()
    await this.prisma.$transaction(async (tx) => {
      await tx.anchorOperatorAssignment.update({
        where: {
          id: assignment.id,
        },
        data: {
          status: 'confirmed',
          startedAt: now,
          confirmedBy: currentUser.wecomUserId,
        },
      })
      await tx.anchorProfile.update({
        where: {
          id: assignment.anchorProfileId,
        },
        data: {
          currentOperatorId: assignment.operatorId,
          assignmentStatus: 'confirmed',
        },
      })
      await tx.anchorOnboardingProgress.upsert({
        where: {
          anchorProfileId: assignment.anchorProfileId,
        },
        create: {
          anchorProfileId: assignment.anchorProfileId,
          currentStage: 'operator_received',
          milestones: {
            create: onboardingTypes.map((type) => ({
              type,
              status: type === 'operator_received' ? 'completed' : 'pending',
              completedAt: type === 'operator_received' ? now : null,
              completedBy:
                type === 'operator_received' ? currentUser.wecomUserId : null,
            })),
          },
        },
        update: {},
      })
      await tx.submission.updateMany({
        where: {
          anchorProfileId: assignment.anchorProfileId,
          operatorAssignmentStatus: 'pending_confirmation',
        },
        data: {
          operatorId: assignment.operatorId,
          operatorAssignmentId: assignment.id,
          operatorAssignmentStatus: 'confirmed',
          anchorDisplayNameSnapshot:
            assignment.anchorProfile.anchorDisplayName,
          operatorNameSnapshot: assignment.operator.displayName,
        },
      })
    })

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
        ...(isGlobalOperatorView(currentUser)
          ? {}
          : { operatorId: currentUser.accountId ?? '' }),
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

/** 超级管理员可查看/处理全部运营数据域 */
function isGlobalOperatorView(user: AuthenticatedUser) {
  return user.role === 'super_admin' && user.loginType === 'password_admin'
}
