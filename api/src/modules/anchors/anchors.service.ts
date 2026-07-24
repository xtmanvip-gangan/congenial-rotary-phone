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
  INITIAL_COMMUNICATION_FIELD_LABELS,
  MILESTONE_LABELS,
  ONBOARDING_PROGRESS_MILESTONES,
  TRAINING_CONFIRM_ITEMS,
} from '../onboarding/onboarding.constants.js'

/** 高光时刻（成长成就）预置阶梯目录；阈值与自动判定后续配置 */
const HIGHLIGHT_MOMENT_CATALOG = [
  {
    code: 'first_gift_received',
    title: '首次收到礼物',
    category: 'gift',
    description: '首次有礼物提报通过审核',
  },
  {
    code: 'first_named_gift',
    title: '首次收到指定礼物',
    category: 'gift',
    description: '首次收到某类/某个命名礼物（名单可配置）',
  },
  {
    code: 'gift_revenue_tier',
    title: '礼物营收阶梯',
    category: 'revenue',
    description: '累计/单场礼物营收达到阶梯（阈值后续可配）',
  },
  {
    code: 'first_live',
    title: '独立首播',
    category: 'live',
    description: '完成独立首播节点',
  },
  {
    code: 'continuous_live_streak',
    title: '连续开播',
    category: 'live',
    description: '连续 N 天开播（天数可配）',
  },
  {
    code: 'course_path_cleared',
    title: '课程路径通关',
    category: 'training',
    description: '完成指定课程序列',
  },
] as const

/** 首播后孵化窗口（天） */
const INCUBATION_DAYS = 30

/** 主播全景展示状态（运营确认后起算） */
export type AnchorLiveStatus =
  | 'pending_first_live'
  | 'incubating'
  | 'normal'
  | 'offline'
  | 'leave'
  | 'exited'

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

    const mapped = items.map((item) => {
      const firstLiveAt = item.onboardingProgress?.firstLiveAt ?? null
      const liveStatus = resolveAnchorLiveStatus({
        profileStatus: item.status,
        firstLiveAt,
      })
      return {
        ...this.toProfileItem(item),
        liveStatus,
        firstLiveAt: firstLiveAt?.toISOString() ?? null,
        incubationDays: INCUBATION_DAYS,
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
      }
    })

    const summary = {
      total: mapped.length,
      pendingFirstLive: mapped.filter(
        (item) => item.liveStatus === 'pending_first_live',
      ).length,
      incubating: mapped.filter((item) => item.liveStatus === 'incubating')
        .length,
      normal: mapped.filter((item) => item.liveStatus === 'normal').length,
      offline: mapped.filter((item) => item.liveStatus === 'offline').length,
      leave: mapped.filter((item) => item.liveStatus === 'leave').length,
      exited: mapped.filter((item) => item.liveStatus === 'exited').length,
    }

    return {
      items: mapped,
      summary,
      incubationDays: INCUBATION_DAYS,
    }
  }

  /**
   * 超管：主播全景列表
   * 仅运营已确认归属的主播（未确认在激活监管）；状态为经营态而非归属态
   */
  async listAdminAnchors(
    currentUser: AuthenticatedUser,
    query: {
      operatorId?: string
      liveStatus?: string
      keyword?: string
    },
  ) {
    await this.access.requirePasswordSuperAdmin(currentUser)

    const keyword = query.keyword?.trim()
    const liveStatusFilter = query.liveStatus?.trim() as
      | AnchorLiveStatus
      | undefined
    const operatorId = query.operatorId?.trim()

    const items = await this.prisma.anchorProfile.findMany({
      where: {
        // 未确认归属不进全景，在激活监管处理
        assignmentStatus: 'confirmed',
        ...(operatorId ? { currentOperatorId: operatorId } : {}),
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
      orderBy: [{ activatedAt: 'desc' }],
    })

    const mapped = items.map((item) => {
      const firstLiveAt = item.onboardingProgress?.firstLiveAt ?? null
      const liveStatus = resolveAnchorLiveStatus({
        profileStatus: item.status,
        firstLiveAt,
      })
      return {
        ...this.toProfileItem(item),
        liveStatus,
        firstLiveAt: firstLiveAt?.toISOString() ?? null,
        incubationDays: INCUBATION_DAYS,
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
      }
    })

    const filtered = liveStatusFilter
      ? mapped.filter((item) => item.liveStatus === liveStatusFilter)
      : mapped

    const summary = {
      total: mapped.length,
      pendingFirstLive: mapped.filter(
        (item) => item.liveStatus === 'pending_first_live',
      ).length,
      incubating: mapped.filter((item) => item.liveStatus === 'incubating')
        .length,
      normal: mapped.filter((item) => item.liveStatus === 'normal').length,
      offline: mapped.filter((item) => item.liveStatus === 'offline').length,
      leave: mapped.filter((item) => item.liveStatus === 'leave').length,
      exited: mapped.filter((item) => item.liveStatus === 'exited').length,
    }

    return {
      items: filtered,
      summary,
      incubationDays: INCUBATION_DAYS,
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
    return this.loadAnchorDetailBundle(anchorId, { scope: 'admin' })
  }

  /**
   * 运营：在管主播档案（仅已确认归属；超管密码登录可看全部已确认）
   */
  async getOperatorAnchorDetail(
    currentUser: AuthenticatedUser,
    anchorId: string,
  ) {
    await this.access.requireAnyRole(currentUser, ['operator'])
    return this.loadAnchorDetailBundle(anchorId, {
      scope: 'operator',
      operatorId: isGlobalOperatorView(currentUser)
        ? undefined
        : (currentUser.accountId ?? ''),
    })
  }

  private async loadAnchorDetailBundle(
    anchorId: string,
    options: { scope: 'admin' | 'operator'; operatorId?: string },
  ) {
    const id = anchorId?.trim()
    if (!id) {
      throw new BadRequestException('主播 ID 无效')
    }

    const profile = await this.prisma.anchorProfile.findFirst({
      where: {
        id,
        ...(options.scope === 'operator'
          ? {
              assignmentStatus: 'confirmed' as const,
              ...(options.operatorId
                ? { currentOperatorId: options.operatorId }
                : {}),
            }
          : {}),
      },
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
        activationTask: {
          select: {
            membershipCompletedAt: true,
            status: true,
          },
        },
      },
    })

    if (!profile) {
      throw new NotFoundException(
        options.scope === 'operator'
          ? '未找到归属于你的已确认主播档案'
          : '主播不存在',
      )
    }

    const [submissions, registrations, learningProgress, dailyReviews] =
      await Promise.all([
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
        this.prisma.anchorDailyReview.findMany({
          where: { anchorProfileId: profile.id },
          include: {
            operator: { select: { id: true, displayName: true } },
          },
          orderBy: { reviewDate: 'desc' },
          take: 60,
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

    const evidenceFieldLabels: Record<string, string> = {
      ...INITIAL_COMMUNICATION_FIELD_LABELS,
      ...Object.fromEntries(
        TRAINING_CONFIRM_ITEMS.map((item) => [item.key, item.label]),
      ),
      anchorChecklist: '主播确认清单',
      trainedAt: '培训完成时间',
      materialsConfirmed: '资料已确认',
    }

    const firstLiveAt = profile.onboardingProgress?.firstLiveAt ?? null
    const liveStatus = resolveAnchorLiveStatus({
      profileStatus: profile.status,
      firstLiveAt,
    })

    return {
      profile: {
        ...this.toProfileItem(profile),
        wecomUserId: profile.wecomUser.wecomUserId,
        source: profile.source,
        liveStatus,
        firstLiveAt: firstLiveAt?.toISOString() ?? null,
        incubationDays: INCUBATION_DAYS,
        membershipCompletedAt:
          profile.activationTask?.membershipCompletedAt?.toISOString() ?? null,
        createdAt: profile.createdAt.toISOString(),
        updatedAt: profile.updatedAt.toISOString(),
      },
      evidenceFieldLabels,
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
      highlights: this.buildHighlightMoments({
        firstLiveAt,
        submissions,
        learningProgress,
      }),
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
      reviews: {
        available: true as const,
        message: '日复盘依据《主播日复盘表》填写；会长批注由超管补充',
        firstLiveReviewCompletedAt:
          profile.onboardingProgress?.firstReviewCompletedAt?.toISOString() ??
          null,
        items: dailyReviews.map((item) => this.formatDailyReview(item)),
      },
    }
  }

  /**
   * 运营/超管：更新在管主播经营状态（正常/断播/请假/退会）
   */
  async updateAnchorStatus(
    currentUser: AuthenticatedUser,
    anchorId: string,
    status: 'active' | 'paused' | 'leave' | 'exited',
  ) {
    await this.access.requireAnyRole(currentUser, ['operator'])
    const profile = await this.requireOwnedConfirmedAnchor(
      currentUser,
      anchorId,
    )

    const updated = await this.prisma.anchorProfile.update({
      where: { id: profile.id },
      data: { status },
      include: profileInclude,
    })

    const firstLiveAt =
      (
        await this.prisma.anchorOnboardingProgress.findUnique({
          where: { anchorProfileId: profile.id },
          select: { firstLiveAt: true },
        })
      )?.firstLiveAt ?? null

    return {
      item: {
        ...this.toProfileItem(updated),
        liveStatus: resolveAnchorLiveStatus({
          profileStatus: updated.status,
          firstLiveAt,
        }),
      },
    }
  }

  async listDailyReviews(currentUser: AuthenticatedUser, anchorId: string) {
    await this.requireOwnedConfirmedAnchor(currentUser, anchorId)
    const items = await this.prisma.anchorDailyReview.findMany({
      where: { anchorProfileId: anchorId },
      include: {
        operator: { select: { id: true, displayName: true } },
      },
      orderBy: { reviewDate: 'desc' },
      take: 90,
    })
    return { items: items.map((item) => this.formatDailyReview(item)) }
  }

  async upsertDailyReview(
    currentUser: AuthenticatedUser,
    anchorId: string,
    dto: {
      reviewDate: string
      liveDurationMinutes?: number | null
      sessionViewers?: number | null
      peakOnline?: number | null
      avgOnline?: number | null
      newFans?: number | null
      giftRevenueYuan?: number | null
      pkCount?: number | null
      bestThing?: string | null
      biggestProblem?: string | null
      tomorrowFocus?: string | null
    },
  ) {
    await this.access.requireAnyRole(currentUser, ['operator'])
    const profile = await this.requireOwnedConfirmedAnchor(
      currentUser,
      anchorId,
    )

    const reviewDate = parseReviewDate(dto.reviewDate)
    const createdBy =
      currentUser.wecomUserId || currentUser.accountId || 'operator'
    const operatorId =
      currentUser.role === 'super_admin' &&
      currentUser.loginType === 'password_admin'
        ? profile.currentOperatorId
        : (currentUser.accountId ?? profile.currentOperatorId)

    const data = {
      operatorId,
      liveDurationMinutes: dto.liveDurationMinutes ?? null,
      sessionViewers: dto.sessionViewers ?? null,
      peakOnline: dto.peakOnline ?? null,
      avgOnline: dto.avgOnline ?? null,
      newFans: dto.newFans ?? null,
      giftRevenueYuan:
        dto.giftRevenueYuan == null ? null : String(dto.giftRevenueYuan),
      pkCount: dto.pkCount ?? null,
      bestThing: dto.bestThing?.trim() || null,
      biggestProblem: dto.biggestProblem?.trim() || null,
      tomorrowFocus: dto.tomorrowFocus?.trim() || null,
      createdBy,
    }

    const item = await this.prisma.anchorDailyReview.upsert({
      where: {
        anchorProfileId_reviewDate: {
          anchorProfileId: profile.id,
          reviewDate,
        },
      },
      create: {
        anchorProfileId: profile.id,
        reviewDate,
        ...data,
      },
      update: data,
      include: {
        operator: { select: { id: true, displayName: true } },
      },
    })

    return { item: this.formatDailyReview(item) }
  }

  async updateDailyReviewLeaderNote(
    currentUser: AuthenticatedUser,
    reviewId: string,
    leaderNote: string,
  ) {
    await this.access.requirePasswordSuperAdmin(currentUser)
    const existing = await this.prisma.anchorDailyReview.findUnique({
      where: { id: reviewId },
    })
    if (!existing) {
      throw new NotFoundException('复盘记录不存在')
    }
    const item = await this.prisma.anchorDailyReview.update({
      where: { id: reviewId },
      data: { leaderNote: leaderNote.trim() || null },
      include: {
        operator: { select: { id: true, displayName: true } },
      },
    })
    return { item: this.formatDailyReview(item) }
  }

  private async requireOwnedConfirmedAnchor(
    currentUser: AuthenticatedUser,
    anchorId: string,
  ) {
    const id = anchorId?.trim()
    if (!id) {
      throw new BadRequestException('主播 ID 无效')
    }
    const globalView = isGlobalOperatorView(currentUser)
    const profile = await this.prisma.anchorProfile.findFirst({
      where: {
        id,
        assignmentStatus: 'confirmed',
        ...(globalView
          ? {}
          : { currentOperatorId: currentUser.accountId ?? '' }),
      },
      select: {
        id: true,
        currentOperatorId: true,
        status: true,
        anchorDisplayName: true,
      },
    })
    if (!profile) {
      throw new NotFoundException('未找到归属于你的已确认主播')
    }
    return profile
  }

  private formatDailyReview(item: {
    id: string
    anchorProfileId: string
    operatorId: string | null
    reviewDate: Date
    liveDurationMinutes: number | null
    sessionViewers: number | null
    peakOnline: number | null
    avgOnline: number | null
    newFans: number | null
    giftRevenueYuan: { toString(): string } | null
    pkCount: number | null
    bestThing: string | null
    biggestProblem: string | null
    tomorrowFocus: string | null
    leaderNote: string | null
    createdBy: string
    createdAt: Date
    updatedAt: Date
    operator?: { id: string; displayName: string } | null
  }) {
    return {
      id: item.id,
      anchorProfileId: item.anchorProfileId,
      operator: item.operator ?? null,
      reviewDate: item.reviewDate.toISOString().slice(0, 10),
      liveDurationMinutes: item.liveDurationMinutes,
      sessionViewers: item.sessionViewers,
      peakOnline: item.peakOnline,
      avgOnline: item.avgOnline,
      newFans: item.newFans,
      giftRevenueYuan:
        item.giftRevenueYuan == null
          ? null
          : Number(item.giftRevenueYuan.toString()),
      pkCount: item.pkCount,
      bestThing: item.bestThing,
      biggestProblem: item.biggestProblem,
      tomorrowFocus: item.tomorrowFocus,
      leaderNote: item.leaderNote,
      createdBy: item.createdBy,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }
  }

  private buildHighlightMoments(input: {
    firstLiveAt: Date | null
    submissions: Array<{
      reviewStatus: string
      createdAt: Date
      items: Array<{ itemName: string }>
    }>
    learningProgress: Array<{ status: string; courseId: string }>
  }) {
    const approved = input.submissions.filter(
      (item) => item.reviewStatus === 'approved',
    )
    const firstGift = approved[approved.length - 1] // oldest if desc order - actually submissions are desc so last is oldest
    const firstGiftOldest =
      approved.length > 0
        ? [...approved].sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
          )[0]
        : null
    const learnedCount = input.learningProgress.filter(
      (item) => item.status === 'learned',
    ).length

    const unlocked: Array<{
      code: string
      title: string
      category: string
      description: string
      status: 'unlocked' | 'planned'
      unlockedAt: string | null
      detail: string | null
    }> = []

    const catalog = HIGHLIGHT_MOMENT_CATALOG.map((item) => {
      let status: 'unlocked' | 'planned' = 'planned'
      let unlockedAt: string | null = null
      let detail: string | null = null

      if (item.code === 'first_live' && input.firstLiveAt) {
        status = 'unlocked'
        unlockedAt = input.firstLiveAt.toISOString()
        detail = '完成独立首播'
      } else if (item.code === 'first_gift_received' && firstGiftOldest) {
        status = 'unlocked'
        unlockedAt = firstGiftOldest.createdAt.toISOString()
        detail =
          firstGiftOldest.items.map((row) => row.itemName).join('、') ||
          '首次礼物提报通过'
      } else if (item.code === 'course_path_cleared' && learnedCount > 0) {
        status = 'unlocked'
        unlockedAt = new Date().toISOString()
        detail = `已学完 ${learnedCount} 门课程`
      }

      if (status === 'unlocked') {
        unlocked.push({
          ...item,
          status,
          unlockedAt,
          detail,
        })
      }

      return {
        ...item,
        status,
        unlockedAt,
        detail,
      }
    })

    return {
      available: true as const,
      message:
        unlocked.length > 0
          ? `已解锁 ${unlocked.length} 项高光；营收阶梯等阈值后续可配置`
          : '高光将随首播、收礼、课程等自动解锁；营收阶梯阈值后续可配置',
      catalog,
      items: unlocked,
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
    status: 'active' | 'paused' | 'leave' | 'exited'
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

/**
 * 运营确认后的直播状态：
 * - 人工标记优先：退会 / 断播 / 请假（运营改状态后列表立即体现）
 * - 否则：未首播 → 待首播；首播后 ≤30 天 → 孵化中；之后 → 正常
 */
function resolveAnchorLiveStatus(input: {
  profileStatus: 'active' | 'paused' | 'leave' | 'exited' | string
  firstLiveAt: Date | null
  now?: Date
}): AnchorLiveStatus {
  if (input.profileStatus === 'exited') {
    return 'exited'
  }
  // 运营手工标记的断播/请假优先于自动阶段，否则改状态后筛选数字不更新
  if (input.profileStatus === 'paused') {
    return 'offline'
  }
  if (input.profileStatus === 'leave') {
    return 'leave'
  }

  if (!input.firstLiveAt) {
    return 'pending_first_live'
  }

  const now = input.now ?? new Date()
  const elapsedMs = now.getTime() - input.firstLiveAt.getTime()
  const incubationMs = INCUBATION_DAYS * 24 * 60 * 60 * 1000
  if (elapsedMs <= incubationMs) {
    return 'incubating'
  }

  return 'normal'
}

/** 超级管理员可查看/处理全部运营数据域 */
function isGlobalOperatorView(user: AuthenticatedUser) {
  return user.role === 'super_admin' && user.loginType === 'password_admin'
}

function parseReviewDate(value: string) {
  const text = value.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new BadRequestException('复盘日期格式应为 YYYY-MM-DD')
  }
  const date = new Date(`${text}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('复盘日期无效')
  }
  return date
}
