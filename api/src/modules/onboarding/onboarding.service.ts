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
  CHANNEL_OPTIONS,
  DEVICE_NETWORK_OPTIONS,
  INITIAL_COMMUNICATION_FIELD_LABELS,
  INITIAL_COMMUNICATION_FORM_META,
  LEARNING_COMMITMENT_OPTIONS,
  LIVE_EXPERIENCE_OPTIONS,
  LIVE_GOAL_OPTIONS,
  MILESTONE_LABELS,
  ONBOARDING_PROGRESS_MILESTONES,
  SCREENSHOT_MILESTONES,
  TRAINING_CONFIRM_ITEMS,
  VOICE_TRAIT_OPTIONS,
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

  /**
   * 根据已填结构化字段生成「基本条件判断」「稳定开播风险」草稿。
   * 有 XAI_API_KEY 时走模型；否则用规则模板，运营均可再改。
   */
  async draftInitialCommunicationJudgment(
    currentUser: AuthenticatedUser,
    anchorId: string,
    evidence: Record<string, unknown>,
  ) {
    await this.findOwnedAnchor(currentUser, anchorId)
    const summary = this.buildEvidenceSummary(evidence)
    if (!summary) {
      throw new BadRequestException('请先填写可播时间、设备、经验、意愿等基础信息')
    }

    const ai = await this.tryGenerateJudgmentWithAi(summary)
    if (ai) {
      return {
        item: {
          ...ai,
          source: 'ai' as const,
        },
      }
    }

    return {
      item: {
        ...this.buildRuleBasedJudgment(evidence),
        source: 'template' as const,
      },
    }
  }

  private validateAndNormalizeEvidence(
    type: ProgressMilestoneType,
    dto: SubmitMilestoneDto,
  ): Record<string, unknown> {
    if (type === 'initial_communication') {
      return this.validateInitialCommunicationEvidence(dto.evidence ?? {})
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

  private validateInitialCommunicationEvidence(
    raw: Record<string, unknown>,
  ): Record<string, unknown> {
    const requireString = (key: string) => {
      const value = raw[key]
      if (typeof value !== 'string' || !value.trim()) {
        throw new BadRequestException(
          `请填写${INITIAL_COMMUNICATION_FIELD_LABELS[key] ?? key}`,
        )
      }
      return value.trim()
    }

    const requireOneOf = (key: string, options: readonly string[]) => {
      const value = requireString(key)
      if (!options.includes(value)) {
        throw new BadRequestException(
          `${INITIAL_COMMUNICATION_FIELD_LABELS[key] ?? key}选项无效`,
        )
      }
      return value
    }

    const requireStringArray = (
      key: string,
      options: readonly string[],
      multi: boolean,
    ) => {
      const value = raw[key]
      const list = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : typeof value === 'string' && value.trim()
          ? [value.trim()]
          : []
      const normalized = list.map((item) => item.trim()).filter(Boolean)
      if (normalized.length === 0) {
        throw new BadRequestException(
          `请选择${INITIAL_COMMUNICATION_FIELD_LABELS[key] ?? key}`,
        )
      }
      if (!multi && normalized.length > 1) {
        throw new BadRequestException(
          `${INITIAL_COMMUNICATION_FIELD_LABELS[key] ?? key}只能选一项`,
        )
      }
      for (const item of normalized) {
        if (!options.includes(item)) {
          throw new BadRequestException(
            `${INITIAL_COMMUNICATION_FIELD_LABELS[key] ?? key}选项无效`,
          )
        }
      }
      return multi ? normalized : normalized[0]
    }

    const start = requireString('availableScheduleStart')
    const end = requireString('availableScheduleEnd')
    if (start >= end && !start.includes('T')) {
      // time "HH:mm" 跨天允许 end < start；同日要求 end > start
      // 简单校验：若都是 HH:mm 且 end <= start，提示
      if (/^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end) && end <= start) {
        throw new BadRequestException('可直播结束时间应晚于开始时间（跨天请拆成两段说明）')
      }
    }

    return {
      communicatedAt: requireString('communicatedAt'),
      channel: requireOneOf('channel', CHANNEL_OPTIONS),
      availableScheduleStart: start,
      availableScheduleEnd: end,
      deviceNetwork: requireOneOf('deviceNetwork', DEVICE_NETWORK_OPTIONS),
      voiceTraits: requireStringArray('voiceTraits', VOICE_TRAIT_OPTIONS, true),
      interestsAndExperience: requireString('interestsAndExperience'),
      liveExperience: requireOneOf('liveExperience', LIVE_EXPERIENCE_OPTIONS),
      learningCommitment: requireOneOf(
        'learningCommitment',
        LEARNING_COMMITMENT_OPTIONS,
      ),
      liveGoals: requireStringArray('liveGoals', LIVE_GOAL_OPTIONS, true),
      concerns: requireString('concerns'),
      contentRecommendation: requireString('contentRecommendation'),
      basicConditionsJudgment: requireString('basicConditionsJudgment'),
      stabilityRisks: requireString('stabilityRisks'),
    }
  }

  private buildEvidenceSummary(evidence: Record<string, unknown>) {
    const lines: string[] = []
    const push = (label: string, value: unknown) => {
      if (Array.isArray(value) && value.length) {
        lines.push(`${label}：${value.join('、')}`)
      } else if (typeof value === 'string' && value.trim()) {
        lines.push(`${label}：${value.trim()}`)
      }
    }
    push('沟通方式', evidence.channel)
    push(
      '可直播时间',
      evidence.availableScheduleStart && evidence.availableScheduleEnd
        ? `${evidence.availableScheduleStart} - ${evidence.availableScheduleEnd}`
        : '',
    )
    push('设备网络', evidence.deviceNetwork)
    push('声音特点', evidence.voiceTraits)
    push('兴趣经历', evidence.interestsAndExperience)
    push('直播经验', evidence.liveExperience)
    push('学习投入', evidence.learningCommitment)
    push('直播目标', evidence.liveGoals)
    push('担心顾虑', evidence.concerns)
    push('内容推荐', evidence.contentRecommendation)
    return lines.join('\n')
  }

  private buildRuleBasedJudgment(evidence: Record<string, unknown>) {
    const device = String(evidence.deviceNetwork ?? '')
    const experience = String(evidence.liveExperience ?? '')
    const commitment = String(evidence.learningCommitment ?? '')
    const start = String(evidence.availableScheduleStart ?? '')
    const end = String(evidence.availableScheduleEnd ?? '')

    const conditionParts = [
      start && end
        ? `可播时段为 ${start}-${end}，需与后续排班再对齐。`
        : '可播时段尚未完全明确。',
      device
        ? `设备条件：${device}，可按该方案推进开播准备。`
        : '设备条件待补充。',
      experience
        ? `直播经验：${experience}，教学节奏需据此调整。`
        : '直播经验待确认。',
      commitment
        ? `投入意愿：${commitment}。`
        : '投入意愿待确认。',
    ]

    const riskParts: string[] = []
    if (commitment.includes('偏弱') || commitment.includes('暂不明确')) {
      riskParts.push('学习与开播投入可能不稳定，需压缩任务并设 intermediate 检查点。')
    }
    if (experience.includes('零基础')) {
      riskParts.push('零基础上手成本高，前两周需加强陪跑与话术练习。')
    }
    if (device.includes('仅手机')) {
      riskParts.push('仅手机开播，音质与多任务能力受限，建议尽早升级耳机/声卡。')
    }
    if (!riskParts.length) {
      riskParts.push(
        '当前未见明显硬性阻断；需持续观察时间是否稳定、顾虑是否影响开播动作。',
      )
    }
    if (typeof evidence.concerns === 'string' && evidence.concerns.trim()) {
      riskParts.push(`主播顾虑：${evidence.concerns.trim()}`)
    }

    return {
      basicConditionsJudgment: conditionParts.join(''),
      stabilityRisks: riskParts.join(''),
    }
  }

  private async tryGenerateJudgmentWithAi(summary: string): Promise<{
    basicConditionsJudgment: string
    stabilityRisks: string
  } | null> {
    const apiKey = process.env.XAI_API_KEY?.trim()
    if (!apiKey) {
      return null
    }

    const model = process.env.XAI_MODEL?.trim() || 'grok-4-1-fast-non-reasoning'
    const baseUrl = (
      process.env.XAI_BASE_URL?.trim() || 'https://api.x.ai/v1'
    ).replace(/\/$/, '')

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          messages: [
            {
              role: 'system',
              content:
                '你是直播公会运营助手。根据首次沟通纪要，写两段中文判断：basicConditionsJudgment（时间/设备/经验/投入是否具备开播基本条件，要有事实依据，禁止空泛夸奖）、stabilityRisks（可能影响稳定开播的风险）。每段 80-160 字。只输出 JSON：{"basicConditionsJudgment":"...","stabilityRisks":"..."}',
            },
            {
              role: 'user',
              content: `首次沟通纪要：\n${summary}`,
            },
          ],
        }),
      })

      if (!response.ok) {
        return null
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const content = payload.choices?.[0]?.message?.content?.trim()
      if (!content) return null

      const jsonText = content
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/, '')
      const parsed = JSON.parse(jsonText) as {
        basicConditionsJudgment?: string
        stabilityRisks?: string
      }
      if (
        !parsed.basicConditionsJudgment?.trim() ||
        !parsed.stabilityRisks?.trim()
      ) {
        return null
      }
      return {
        basicConditionsJudgment: parsed.basicConditionsJudgment.trim(),
        stabilityRisks: parsed.stabilityRisks.trim(),
      }
    } catch {
      return null
    }
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
      initialCommunicationForm: INITIAL_COMMUNICATION_FORM_META,
      milestones,
    }
  }
}
