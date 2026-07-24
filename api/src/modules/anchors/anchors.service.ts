import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service.js'
import { AccessService } from '../access/access.service.js'
import type { AuthenticatedUser } from '../auth/auth.types.js'
import {
  MILESTONE_LABELS,
  ONBOARDING_PROGRESS_MILESTONES,
} from '../onboarding/onboarding.constants.js'

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
                (milestone) =>
                  milestone.status === 'completed' &&
                  (ONBOARDING_PROGRESS_MILESTONES as readonly string[]).includes(
                    milestone.type,
                  ),
              ).length,
              totalCount: ONBOARDING_PROGRESS_MILESTONES.length,
              nextMilestone:
                ONBOARDING_PROGRESS_MILESTONES.find(
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

  /**
   * 超管：主播全景列表（全量，可按运营/归属/关键词筛）
   */
  async listAdminAnchors(
    currentUser: AuthenticatedUser,
    query: {
      operatorId?: string
      assignmentStatus?: string
      keyword?: string
    },
  ) {
    await this.access.requirePasswordSuperAdmin(currentUser)

    const keyword = query.keyword?.trim()
    const assignmentStatus = query.assignmentStatus?.trim()
    const operatorId = query.operatorId?.trim()

    const items = await this.prisma.anchorProfile.findMany({
      where: {
        ...(operatorId ? { currentOperatorId: operatorId } : {}),
        ...(assignmentStatus
          ? {
              assignmentStatus: assignmentStatus as
                | 'pending_confirmation'
                | 'confirmed'
                | 'rejected'
                | 'ended',
            }
          : {}),
        ...(keyword
          ? {
              OR: [
                {
                  anchorDisplayName: {
                    contains: keyword,
                    mode: 'insensitive',
                  },
                },
                {
                  wecomUser: {
                    wecomName: { contains: keyword, mode: 'insensitive' },
                  },
                },
                {
                  wecomUser: {
                    wecomUserId: { contains: keyword, mode: 'insensitive' },
                  },
                },
                {
                  currentOperator: {
                    displayName: {
                      contains: keyword,
                      mode: 'insensitive',
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        ...profileInclude,
        onboardingProgress: {
          include: {
            milestones: true,
          },
        },
      },
      orderBy: [{ assignmentStatus: 'asc' }, { activatedAt: 'desc' }],
    })

    return {
      items: items.map((item) => ({
        ...this.toProfileItem(item),
        onboarding: item.onboardingProgress
          ? {
              completedCount: item.onboardingProgress.milestones.filter(
                (milestone) =>
                  milestone.status === 'completed' &&
                  (ONBOARDING_PROGRESS_MILESTONES as readonly string[]).includes(
                    milestone.type,
                  ),
              ).length,
              totalCount: ONBOARDING_PROGRESS_MILESTONES.length,
              nextMilestone:
                ONBOARDING_PROGRESS_MILESTONES.find(
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

  /**
   * 超管：主播全景详情（档案 + 岗前 + 礼物 + 培训；复盘暂占位）
   */
  async getAdminAnchorDetail(
    currentUser: AuthenticatedUser,
    anchorId: string,
  ) {
    await this.access.requirePasswordSuperAdmin(currentUser)

    const id = anchorId?.trim()
    if (!id) {
      throw new BadRequestException('主播 ID 无效')
    }

    const profile = await this.prisma.anchorProfile.findUnique({
      where: { id },
      include: {
        wecomUser: {
          select: {
            wecomName: true,
            wecomUserId: true,
          },
        },
        currentOperator: {
          select: {
            id: true,
            displayName: true,
          },
        },
        onboardingProgress: {
          include: {
            milestones: true,
          },
        },
        assignments: {
          include: {
            operator: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 30,
        },
        nameHistory: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    })

    if (!profile) {
      throw new NotFoundException('主播不存在')
    }

    const [submissions, registrations, learningProgress] = await Promise.all([
      this.prisma.submission.findMany({
        where: { anchorProfileId: profile.id },
        include: {
          activity: {
            include: {
              type: {
                select: {
                  typeCode: true,
                  typeName: true,
                },
              },
            },
          },
          operator: {
            select: {
              id: true,
              displayName: true,
            },
          },
          items: {
            select: {
              itemName: true,
              quantity: true,
            },
          },
          attachments: {
            select: {
              fileType: true,
              fileUrl: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.trainingRegistration.findMany({
        where: { anchorProfileId: profile.id },
        include: {
          session: {
            include: {
              course: {
                select: {
                  id: true,
                  code: true,
                  title: true,
                  level: true,
                },
              },
              teacher: {
                select: {
                  id: true,
                  displayName: true,
                },
              },
            },
          },
        },
        orderBy: { registeredAt: 'desc' },
        take: 50,
      }),
      this.prisma.trainingLearningProgress.findMany({
        where: { anchorProfileId: profile.id },
        include: {
          course: {
            select: {
              id: true,
              code: true,
              title: true,
              level: true,
              sequence: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ])

    const milestoneMap = new Map(
      (profile.onboardingProgress?.milestones ?? []).map((item) => [
        item.type,
        item,
      ]),
    )
    const milestones = ONBOARDING_PROGRESS_MILESTONES.map((type) => {
      const item = milestoneMap.get(type)
      return {
        type,
        label: MILESTONE_LABELS[type],
        status: item?.status ?? 'pending',
        completedAt: item?.completedAt?.toISOString() ?? null,
        submittedAt: item?.submittedAt?.toISOString() ?? null,
        note: item?.note ?? null,
        evidence:
          item?.evidence &&
          typeof item.evidence === 'object' &&
          !Array.isArray(item.evidence)
            ? (item.evidence as Record<string, unknown>)
            : null,
        attachmentUrls: item?.attachmentUrls ?? [],
        rejectReason: item?.rejectReason ?? null,
      }
    })
    const completedCount = milestones.filter(
      (item) => item.status === 'completed',
    ).length
    const nextMilestone =
      milestones.find((item) => item.status !== 'completed')?.type ?? null

    const giftSummary = {
      total: submissions.length,
      pendingReview: submissions.filter((s) => s.reviewStatus === 'pending')
        .length,
      approved: submissions.filter((s) => s.reviewStatus === 'approved').length,
      rejected: submissions.filter((s) => s.reviewStatus === 'rejected').length,
      granted: submissions.filter((s) => s.grantStatus === 'granted').length,
    }

    const trainingSummary = {
      registrationCount: registrations.length,
      learnedCourseCount: learningProgress.filter(
        (item) => item.status === 'learned',
      ).length,
      progressCount: learningProgress.length,
    }

    return {
      profile: {
        ...this.toProfileItem(profile),
        wecomUserId: profile.wecomUser.wecomUserId,
        source: profile.source,
        createdAt: profile.createdAt.toISOString(),
        updatedAt: profile.updatedAt.toISOString(),
      },
      assignmentHistory: profile.assignments.map((item) => ({
        id: item.id,
        status: item.status,
        operator: item.operator,
        startedAt: item.startedAt?.toISOString() ?? null,
        endedAt: item.endedAt?.toISOString() ?? null,
        reason: item.reason,
        initiatedBy: item.initiatedBy,
        confirmedBy: item.confirmedBy,
        createdAt: item.createdAt.toISOString(),
      })),
      nameHistory: profile.nameHistory.map((item) => ({
        id: item.id,
        oldName: item.oldName,
        newName: item.newName,
        changedByType: item.changedByType,
        createdAt: item.createdAt.toISOString(),
      })),
      onboarding: profile.onboardingProgress
        ? {
            currentStage: profile.onboardingProgress.currentStage,
            firstLiveAt:
              profile.onboardingProgress.firstLiveAt?.toISOString() ?? null,
            firstReviewCompletedAt:
              profile.onboardingProgress.firstReviewCompletedAt?.toISOString() ??
              null,
            completedCount,
            totalCount: ONBOARDING_PROGRESS_MILESTONES.length,
            nextMilestone,
            milestones,
          }
        : null,
      gifts: {
        summary: giftSummary,
        items: submissions.map((item) => ({
          id: item.id,
          activity: {
            id: item.activity.id,
            name: item.activity.name,
            typeCode: item.activity.type.typeCode,
            typeName: item.activity.type.typeName,
          },
          operatorName: item.operator.displayName,
          liveDate: item.liveDate.toISOString().slice(0, 10),
          liveStartTime: item.liveStartTime.toISOString().slice(11, 16),
          reviewStatus: item.reviewStatus,
          grantStatus: item.grantStatus,
          rejectReason: item.rejectReason,
          items: item.items.map((row) => ({
            itemName: row.itemName,
            quantity: Number(row.quantity),
          })),
          attachmentUrls: item.attachments
            .filter((row) => row.fileType === 'submission_proof')
            .map((row) => row.fileUrl),
          createdAt: item.createdAt.toISOString(),
        })),
      },
      training: {
        summary: trainingSummary,
        progress: learningProgress.map((item) => ({
          courseId: item.course.id,
          courseCode: item.course.code,
          courseTitle: item.course.title,
          courseLevel: item.course.level,
          status: item.status,
          makeupStatus: item.makeupStatus,
          firstLearnedAt: item.firstLearnedAt?.toISOString() ?? null,
          lastLearnedAt: item.lastLearnedAt?.toISOString() ?? null,
        })),
        registrations: registrations.map((item) => ({
          id: item.id,
          status: item.status,
          learningType: item.learningType,
          source: item.source,
          registeredAt: item.registeredAt.toISOString(),
          cancelledAt: item.cancelledAt?.toISOString() ?? null,
          course: item.session.course,
          teacher: item.session.teacher,
          scheduledStartAt: item.session.scheduledStartAt.toISOString(),
          scheduledEndAt: item.session.scheduledEndAt.toISOString(),
          sessionStatus: item.session.status,
        })),
      },
      /** 复盘记录：暂定项目，先占位 */
      reviews: {
        available: false as const,
        message: '复盘记录功能建设中，后续将汇总首播复盘与日常复盘',
        items: [] as const,
      },
    }
  }

  /**
   * 超管：勾选主播转交给目标运营（分散转交），新运营待确认
   */
  async transferSelectedAnchors(
    currentUser: AuthenticatedUser,
    anchorIds: string[],
    targetOperatorId: string,
  ) {
    await this.access.requirePasswordSuperAdmin(currentUser)

    const ids = [...new Set(anchorIds.map((id) => id.trim()).filter(Boolean))]
    if (ids.length === 0) {
      throw new BadRequestException('请至少选择一位主播')
    }

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
      where: { id: { in: ids } },
      select: {
        id: true,
        anchorDisplayName: true,
        currentOperatorId: true,
        currentOperator: { select: { displayName: true } },
      },
    })

    if (anchors.length !== ids.length) {
      throw new BadRequestException('部分主播不存在或已失效，请刷新后重试')
    }

    const alreadyOnTarget = anchors.filter(
      (item) => item.currentOperatorId === target.id,
    )
    if (alreadyOnTarget.length === anchors.length) {
      throw new BadRequestException('所选主播已全部在该运营名下')
    }

    const initiatedBy =
      currentUser.wecomUserId || currentUser.accountId || 'super_admin'
    const now = new Date()

    await this.prisma.$transaction(async (tx) => {
      for (const anchor of anchors) {
        if (anchor.currentOperatorId === target.id) {
          continue
        }

        const fromName = anchor.currentOperator?.displayName ?? '未分配'
        const reason = `超管调度转交：${fromName} → ${target.displayName}`

        // 结束该主播当前进行中的归属（任意运营）
        await tx.anchorOperatorAssignment.updateMany({
          where: {
            anchorProfileId: anchor.id,
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

        // 未激活开通任务若仍挂旧运营，改派到新运营
        if (anchor.currentOperatorId) {
          await tx.anchorActivationTask.updateMany({
            where: {
              activatedAnchorProfileId: anchor.id,
              operatorId: anchor.currentOperatorId,
              status: { in: ['pending', 'invited'] },
            },
            data: { operatorId: target.id },
          })
        }
      }
    })

    const transferredCount = anchors.length - alreadyOnTarget.length

    return {
      ok: true as const,
      transferredCount,
      skippedCount: alreadyOnTarget.length,
      targetOperator: target,
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
          currentStage: 'initial_communication',
          milestones: {
            create: ONBOARDING_PROGRESS_MILESTONES.map((type) => ({
              type,
              status: 'pending' as const,
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
