import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  OnboardingMilestoneStatus,
  OnboardingMilestoneType,
  Prisma,
} from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service.js'
import { AccessService } from '../access/access.service.js'
import type { AuthenticatedUser } from '../auth/auth.types.js'
import {
  ANCHOR_CONFIRM_MILESTONES,
  INITIAL_COMMUNICATION_FIELD_LABELS,
  INITIAL_COMMUNICATION_REQUIRED_FIELDS,
  MILESTONE_LABELS,
  ONBOARDING_PROGRESS_MILESTONES,
  SCREENSHOT_MILESTONES,
  TRAINING_CONFIRM_ITEMS,
  type ProgressMilestoneType,
} from './onboarding.constants.js'
import type {
  ConfirmMilestoneDto,
  RejectMilestoneDto,
  SubmitMilestoneDto,
} from './dto/submit-milestone.dto.js'

const progressInclude = {
  onboardingProgress: {
    include: {
      milestones: true,
    },
  },
} as const

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async getProgressForOperator(currentUser: AuthenticatedUser, anchorId: string) {
    const anchor = await this.findOwnedAnchor(currentUser, anchorId)
    return { item: this.formatProgress(anchor) }
  }

  async getProgressForAnchor(currentUser: AuthenticatedUser) {
    const anchor = await this.findAnchorProfileForUser(currentUser)
    return { item: this.formatProgress(anchor) }
  }

  async submitMilestone(
    currentUser: AuthenticatedUser,
    anchorId: string,
    type: string,
    dto: SubmitMilestoneDto,
  ) {
    const milestoneType = this.requireProgressType(type)
    const anchor = await this.findOwnedAnchor(currentUser, anchorId)
    const progress = this.requireProgress(anchor)
    if (!progress.id) {
      throw new NotFoundException('主播岗前进度尚未初始化')
    }
    await this.ensureProgressMilestones(progress.id)
    const refreshed = await this.findOwnedAnchor(currentUser, anchorId)
    const progressFresh = this.requireProgress(refreshed)

    this.assertPreviousCompleted(progressFresh.milestones, milestoneType)
    const target = this.requireMilestone(progressFresh.milestones, milestoneType)

    if (target.status === 'completed') {
      throw new BadRequestException('该节点已完成，无需重复提交')
    }
    if (target.status === 'awaiting_anchor_confirm') {
      throw new BadRequestException('已提交，等待主播确认中')
    }

    const evidence = this.validateAndNormalizeEvidence(milestoneType, dto)
    const attachmentUrls = this.normalizeAttachmentUrls(dto.attachmentUrls)
    const note = dto.note?.trim() || null
    const needsConfirm = ANCHOR_CONFIRM_MILESTONES.has(milestoneType)
    const now = new Date()
    const nextStatus: OnboardingMilestoneStatus = needsConfirm
      ? 'awaiting_anchor_confirm'
      : 'completed'

    await this.prisma.$transaction(async (tx) => {
      await tx.anchorOnboardingMilestone.update({
        where: { id: target.id },
        data: {
          status: nextStatus,
          evidence: evidence as Prisma.InputJsonValue,
          attachmentUrls,
          note,
          submittedAt: now,
          submittedBy: currentUser.wecomUserId,
          completedAt: needsConfirm ? null : now,
          completedBy: needsConfirm ? null : currentUser.wecomUserId,
          anchorConfirmedAt: null,
          anchorRejectedAt: null,
          rejectReason: null,
        },
      })
      await tx.anchorOnboardingProgress.update({
        where: { id: progressFresh.id },
        data: {
          currentStage: milestoneType,
          ...(milestoneType === 'first_live_completed' && !needsConfirm
            ? { firstLiveAt: now, firstLiveBlockedReason: null }
            : {}),
          ...(milestoneType === 'first_live_review_completed' && !needsConfirm
            ? { firstReviewCompletedAt: now }
            : {}),
        },
      })
    })

    return this.getProgressForOperator(currentUser, anchorId)
  }

  async confirmMilestoneAsAnchor(
    currentUser: AuthenticatedUser,
    type: string,
    dto: ConfirmMilestoneDto,
  ) {
    const milestoneType = this.requireProgressType(type)
    if (!ANCHOR_CONFIRM_MILESTONES.has(milestoneType)) {
      throw new BadRequestException('该节点无需主播确认')
    }

    const anchor = await this.findAnchorProfileForUser(currentUser)
    const progress = this.requireProgress(anchor)
    if (!progress.id) {
      throw new NotFoundException('主播岗前进度尚未初始化')
    }
    await this.ensureProgressMilestones(progress.id)
    const refreshed = await this.findAnchorProfileForUser(currentUser)
    const progressFresh = this.requireProgress(refreshed)
    const target = this.requireMilestone(progressFresh.milestones, milestoneType)

    if (target.status !== 'awaiting_anchor_confirm') {
      throw new BadRequestException('当前没有待确认的该节点')
    }

    if (milestoneType === 'prejob_learning_completed') {
      this.assertTrainingChecklist(dto.checklist)
    }

    const now = new Date()
    const checklistEvidence =
      milestoneType === 'prejob_learning_completed'
        ? {
            ...((target.evidence as Record<string, unknown>) ?? {}),
            anchorChecklist: dto.checklist,
            anchorConfirmedAt: now.toISOString(),
          }
        : target.evidence

    await this.prisma.$transaction(async (tx) => {
      await tx.anchorOnboardingMilestone.update({
        where: { id: target.id },
        data: {
          status: 'completed',
          completedAt: now,
          completedBy: currentUser.wecomUserId,
          anchorConfirmedAt: now,
          evidence: checklistEvidence as Prisma.InputJsonValue,
        },
      })
      await tx.anchorOnboardingProgress.update({
        where: { id: progressFresh.id },
        data: {
          currentStage: milestoneType,
          ...(milestoneType === 'first_live_review_completed'
            ? { firstReviewCompletedAt: now }
            : {}),
        },
      })
    })

    return this.getProgressForAnchor(currentUser)
  }

  async rejectMilestoneAsAnchor(
    currentUser: AuthenticatedUser,
    type: string,
    dto: RejectMilestoneDto,
  ) {
    const milestoneType = this.requireProgressType(type)
    if (!ANCHOR_CONFIRM_MILESTONES.has(milestoneType)) {
      throw new BadRequestException('该节点无需主播确认')
    }
    const reason = dto.reason.trim()
    if (!reason) {
      throw new BadRequestException('请填写驳回原因')
    }

    const anchor = await this.findAnchorProfileForUser(currentUser)
    const progress = this.requireProgress(anchor)
    const target = this.requireMilestone(progress.milestones, milestoneType)

    if (target.status !== 'awaiting_anchor_confirm') {
      throw new BadRequestException('当前没有待确认的该节点')
    }

    const now = new Date()
    await this.prisma.anchorOnboardingMilestone.update({
      where: { id: target.id },
      data: {
        status: 'pending',
        anchorRejectedAt: now,
        rejectReason: reason,
        completedAt: null,
        completedBy: null,
        // 保留 evidence / 截图，便于运营修改后重提
      },
    })

    return this.getProgressForAnchor(currentUser)
  }

  private validateAndNormalizeEvidence(
    type: ProgressMilestoneType,
    dto: SubmitMilestoneDto,
  ): Record<string, unknown> {
    if (type === 'initial_communication') {
      const raw = dto.evidence ?? {}
      const result: Record<string, unknown> = {}
      for (const key of INITIAL_COMMUNICATION_REQUIRED_FIELDS) {
        const value = raw[key]
        if (typeof value !== 'string' || !value.trim()) {
          throw new BadRequestException(
            `请填写${INITIAL_COMMUNICATION_FIELD_LABELS[key] ?? key}`,
          )
        }
        result[key] = value.trim()
      }
      for (const optional of ['channel', 'escalateRisks', 'extraNote'] as const) {
        const value = raw[optional]
        if (typeof value === 'string' && value.trim()) {
          result[optional] = value.trim()
        }
      }
      return result
    }

    if (SCREENSHOT_MILESTONES.has(type)) {
      const urls = this.normalizeAttachmentUrls(dto.attachmentUrls)
      if (urls.length === 0) {
        throw new BadRequestException(
          `请上传${MILESTONE_LABELS[type]}截图（至少 1 张）`,
        )
      }
      return {
        ...(dto.evidence && typeof dto.evidence === 'object' ? dto.evidence : {}),
      }
    }

    if (type === 'prejob_learning_completed') {
      const raw = dto.evidence ?? {}
      const trainedAt =
        typeof raw.trainedAt === 'string' ? raw.trainedAt.trim() : ''
      const learningNote =
        typeof raw.learningNote === 'string'
          ? raw.learningNote.trim()
          : dto.note?.trim() || ''
      if (!trainedAt) {
        throw new BadRequestException('请填写培训完成时间')
      }
      if (!learningNote) {
        throw new BadRequestException('请填写学习完成说明')
      }
      const trainerName =
        typeof raw.trainerName === 'string' ? raw.trainerName.trim() : ''
      return {
        trainedAt,
        learningNote,
        ...(trainerName ? { trainerName } : {}),
        materialsDelivered: Boolean(raw.materialsDelivered),
      }
    }

    if (type === 'first_live_review_completed') {
      const conclusion =
        (typeof dto.evidence?.reviewConclusion === 'string'
          ? dto.evidence.reviewConclusion.trim()
          : '') ||
        dto.note?.trim() ||
        ''
      if (!conclusion) {
        throw new BadRequestException('请填写首播复盘结论')
      }
      return { reviewConclusion: conclusion }
    }

    return (dto.evidence as Record<string, unknown>) ?? {}
  }

  private assertTrainingChecklist(checklist?: Record<string, boolean>) {
    if (!checklist || typeof checklist !== 'object') {
      throw new BadRequestException('请完成培训确认清单')
    }
    for (const item of TRAINING_CONFIRM_ITEMS) {
      if (checklist[item.key] !== true) {
        throw new BadRequestException(`请确认：${item.label}`)
      }
    }
  }

  private normalizeAttachmentUrls(urls?: string[]) {
    if (!urls?.length) return [] as string[]
    return urls
      .map((item) => item.trim())
      .filter((item) => item.startsWith('/api/uploads/'))
  }

  private requireProgressType(type: string): ProgressMilestoneType {
    if (
      !ONBOARDING_PROGRESS_MILESTONES.includes(type as ProgressMilestoneType)
    ) {
      throw new BadRequestException('未知的岗前节点')
    }
    return type as ProgressMilestoneType
  }

  private async findOwnedAnchor(
    currentUser: AuthenticatedUser,
    anchorId: string,
  ) {
    await this.access.requireAnyRole(currentUser, ['operator'])
    const globalView =
      currentUser.role === 'super_admin' &&
      currentUser.loginType === 'password_admin'
    const ownershipWhere = {
      id: anchorId,
      assignmentStatus: 'confirmed' as const,
      ...(globalView ? {} : { currentOperatorId: currentUser.accountId ?? '' }),
    }

    let anchor = await this.prisma.anchorProfile.findFirst({
      where: ownershipWhere,
      include: progressInclude,
    })

    if (!anchor) {
      throw new NotFoundException(
        globalView ? '未找到该主播' : '未找到归属于当前运营的主播',
      )
    }

    if (!anchor.onboardingProgress) {
      await this.createProgress(anchor.id)
      anchor = await this.prisma.anchorProfile.findFirst({
        where: ownershipWhere,
        include: progressInclude,
      })
      if (!anchor) {
        throw new NotFoundException(
          globalView ? '未找到该主播' : '未找到归属于当前运营的主播',
        )
      }
    } else {
      await this.ensureProgressMilestones(anchor.onboardingProgress.id)
      anchor = await this.prisma.anchorProfile.findFirst({
        where: ownershipWhere,
        include: progressInclude,
      })
      if (!anchor) {
        throw new NotFoundException(
          globalView ? '未找到该主播' : '未找到归属于当前运营的主播',
        )
      }
    }

    return anchor
  }

  private async findAnchorProfileForUser(currentUser: AuthenticatedUser) {
    if (currentUser.role !== 'anchor') {
      throw new ForbiddenException('仅主播可操作岗前确认')
    }

    const wecomUser = await this.prisma.wecomUser.findUnique({
      where: { wecomUserId: currentUser.wecomUserId },
      select: { id: true },
    })
    if (!wecomUser) {
      throw new NotFoundException('未找到企业微信成员信息')
    }

    let anchor = await this.prisma.anchorProfile.findUnique({
      where: { wecomUserRecordId: wecomUser.id },
      include: progressInclude,
    })
    if (!anchor) {
      throw new NotFoundException('主播档案尚未开通')
    }
    if (anchor.assignmentStatus !== 'confirmed') {
      throw new BadRequestException('运营归属确认后才可进行岗前确认')
    }
    if (!anchor.onboardingProgress) {
      await this.createProgress(anchor.id)
      anchor = await this.prisma.anchorProfile.findUnique({
        where: { wecomUserRecordId: wecomUser.id },
        include: progressInclude,
      })
    } else {
      await this.ensureProgressMilestones(anchor.onboardingProgress.id)
      anchor = await this.prisma.anchorProfile.findUnique({
        where: { wecomUserRecordId: wecomUser.id },
        include: progressInclude,
      })
    }
    if (!anchor?.onboardingProgress) {
      throw new NotFoundException('岗前进度尚未初始化')
    }
    return anchor
  }

  private async createProgress(anchorProfileId: string) {
    await this.prisma.anchorOnboardingProgress.create({
      data: {
        anchorProfileId,
        currentStage: 'initial_communication',
        milestones: {
          create: ONBOARDING_PROGRESS_MILESTONES.map((type) => ({
            type,
            status: 'pending',
          })),
        },
      },
    })
  }

  private async ensureProgressMilestones(progressId: string) {
    const existing = await this.prisma.anchorOnboardingMilestone.findMany({
      where: { progressId },
      select: { type: true },
    })
    const have = new Set(existing.map((item) => item.type))
    const missing = ONBOARDING_PROGRESS_MILESTONES.filter(
      (type) => !have.has(type),
    )
    if (missing.length === 0) return
    await this.prisma.anchorOnboardingMilestone.createMany({
      data: missing.map((type) => ({
        progressId,
        type,
        status: 'pending' as const,
      })),
      skipDuplicates: true,
    })
  }

  private requireProgress(anchor: {
    onboardingProgress: {
      id?: string
      currentStage: OnboardingMilestoneType
      firstLiveAt: Date | null
      firstReviewCompletedAt: Date | null
      milestones: Array<{
        id: string
        type: OnboardingMilestoneType
        status: OnboardingMilestoneStatus
        completedAt: Date | null
        note: string | null
        evidence: Prisma.JsonValue
        attachmentUrls: string[]
        submittedAt: Date | null
        submittedBy: string | null
        anchorConfirmedAt: Date | null
        anchorRejectedAt: Date | null
        rejectReason: string | null
      }>
    } | null
  }) {
    if (!anchor.onboardingProgress) {
      throw new NotFoundException('主播岗前进度尚未初始化')
    }
    return anchor.onboardingProgress
  }

  private requireMilestone(
    milestones: Array<{ id: string; type: OnboardingMilestoneType; status: OnboardingMilestoneStatus }>,
    type: ProgressMilestoneType,
  ) {
    const milestone = milestones.find((item) => item.type === type)
    if (!milestone) {
      throw new NotFoundException('未找到对应岗前节点')
    }
    return milestone as (typeof milestones)[number] & {
      note: string | null
      evidence: Prisma.JsonValue
      attachmentUrls: string[]
      submittedAt: Date | null
      submittedBy: string | null
      anchorConfirmedAt: Date | null
      anchorRejectedAt: Date | null
      rejectReason: string | null
      completedAt: Date | null
    }
  }

  private assertPreviousCompleted(
    milestones: Array<{ type: OnboardingMilestoneType; status: OnboardingMilestoneStatus }>,
    type: ProgressMilestoneType,
  ) {
    const index = ONBOARDING_PROGRESS_MILESTONES.indexOf(type)
    if (index <= 0) return
    const previousType = ONBOARDING_PROGRESS_MILESTONES[index - 1]
    const previous = milestones.find((item) => item.type === previousType)
    if (!previous || previous.status !== 'completed') {
      throw new BadRequestException(
        `请先完成上一节点：${MILESTONE_LABELS[previousType]}`,
      )
    }
  }

  private formatProgress(anchor: {
    id: string
    anchorDisplayName: string
    onboardingProgress: {
      currentStage: OnboardingMilestoneType
      firstLiveAt: Date | null
      firstReviewCompletedAt: Date | null
      milestones: Array<{
        id: string
        type: OnboardingMilestoneType
        status: OnboardingMilestoneStatus
        completedAt: Date | null
        note: string | null
        evidence: Prisma.JsonValue
        attachmentUrls: string[]
        submittedAt: Date | null
        submittedBy: string | null
        anchorConfirmedAt: Date | null
        anchorRejectedAt: Date | null
        rejectReason: string | null
      }>
    } | null
  }) {
    const progress = this.requireProgress(anchor)
    const milestoneMap = new Map(
      progress.milestones.map((item) => [item.type, item]),
    )
    const milestones = ONBOARDING_PROGRESS_MILESTONES.map((type) => {
      const item = milestoneMap.get(type)
      return {
        id: item?.id ?? null,
        type,
        label: MILESTONE_LABELS[type],
        status: item?.status ?? 'pending',
        requiresAnchorConfirm: ANCHOR_CONFIRM_MILESTONES.has(type),
        requiresScreenshot: SCREENSHOT_MILESTONES.has(type),
        completedAt: item?.completedAt?.toISOString() ?? null,
        note: item?.note ?? null,
        evidence: item?.evidence ?? null,
        attachmentUrls: item?.attachmentUrls ?? [],
        submittedAt: item?.submittedAt?.toISOString() ?? null,
        submittedBy: item?.submittedBy ?? null,
        anchorConfirmedAt: item?.anchorConfirmedAt?.toISOString() ?? null,
        anchorRejectedAt: item?.anchorRejectedAt?.toISOString() ?? null,
        rejectReason: item?.rejectReason ?? null,
      }
    })
    const completedCount = milestones.filter(
      (item) => item.status === 'completed',
    ).length
    const nextMilestone =
      milestones.find((item) => item.status !== 'completed')?.type ?? null

    return {
      anchor: {
        id: anchor.id,
        anchorDisplayName: anchor.anchorDisplayName ?? '',
      },
      currentStage: progress.currentStage,
      firstLiveAt: progress.firstLiveAt?.toISOString() ?? null,
      firstReviewCompletedAt:
        progress.firstReviewCompletedAt?.toISOString() ?? null,
      completedCount,
      totalCount: ONBOARDING_PROGRESS_MILESTONES.length,
      nextMilestone,
      trainingConfirmItems: TRAINING_CONFIRM_ITEMS,
      initialCommunicationFields: INITIAL_COMMUNICATION_FIELD_LABELS,
      milestones,
    }
  }
}
