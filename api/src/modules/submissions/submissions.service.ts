import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PrismaService } from '../../prisma/prisma.service.js'
import { AuthService } from '../auth/auth.service.js'
import type { AuthenticatedUser } from '../auth/auth.types.js'
import { NotificationsService } from '../notifications/notifications.service.js'
import { CreateSubmissionDto } from './dto/create-submission.dto.js'
import { PreviewSubmissionDto } from './dto/preview-submission.dto.js'
import { UpdateGrantStatusDto } from './dto/update-grant-status.dto.js'
import { UpdateReviewStatusDto } from './dto/update-review-status.dto.js'
import { UpdateSubmissionDto } from './dto/update-submission.dto.js'

const uploadsRoot = resolve(process.cwd(), 'uploads')

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async assertGrantUploadAllowed(currentUser: AuthenticatedUser) {
    await this.ensureAdmin(currentUser)
  }

  async listAvailableActivities(currentUser: AuthenticatedUser) {
    this.ensureAnchor(currentUser)

    const items = await this.prisma.activity.findMany({
      where: {
        status: 'active',
      },
      include: {
        type: true,
        items: {
          where: { enabled: true },
          orderBy: [{ sortOrder: 'asc' }, { itemName: 'asc' }],
        },
        rules: {
          where: { enabled: true },
          include: { item: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ startAt: 'asc' }, { createdAt: 'desc' }],
    })

    return {
      items: items.map((item: any) => this.formatAvailableActivity(item)),
    }
  }

  async getAvailableActivityDetail(currentUser: AuthenticatedUser, activityId: string) {
    this.ensureAnchor(currentUser)

    const activity = await this.findActiveActivity(activityId)

    const operators = await this.prisma.operatorAccount.findMany({
      where: {
        role: 'operator',
        status: 'active',
      },
      orderBy: [{ displayName: 'asc' }],
    })

    return {
      item: this.formatActivityDetail(activity),
      operators: operators.map((operator: any) => ({
        id: operator.id,
        displayName: operator.displayName,
      })),
    }
  }

  async createSubmission(currentUser: AuthenticatedUser, dto: CreateSubmissionDto) {
    this.ensureAnchor(currentUser)

    const activity = await this.findActiveActivity(dto.activityId)
    const anchorUser = await this.ensureAnchorUser(currentUser)
    const operator = await this.prisma.operatorAccount.findFirst({
      where: {
        id: dto.operatorId,
        role: 'operator',
        status: 'active',
      },
    })

    if (!operator) {
      throw new BadRequestException('请选择有效的运营老师')
    }

    const anchorName = dto.anchorName.trim()
    if (!anchorName) {
      throw new BadRequestException('主播姓名不能为空')
    }

    const liveDate = this.parseLiveDate(dto.liveDate)
    const liveStartTime = this.parseLiveStartTime(dto.liveStartTime)

    this.ensureLiveDateInRange(liveDate, activity.startAt, activity.endAt)
    await this.ensurePkSubmissionSlotAvailable(activity, anchorUser.id, liveDate)

    const attachmentUrls = this.normalizeUploadedFileUrls(dto.attachmentUrls, 'submission')
    if (attachmentUrls.length === 0) {
      throw new BadRequestException('请至少上传一张截图')
    }

    const { submissionItems, rewardSnapshot } = await this.buildSubmissionPayload(
      activity,
      anchorUser.id,
      liveDate,
      dto,
    )

    const created = await this.prisma.submission.create({
      data: {
        activityId: activity.id,
        anchorUserId: anchorUser.id,
        anchorName,
        operatorId: operator.id,
        liveDate,
        liveStartTime,
        rewardSnapshot,
        items: {
          create: submissionItems.map((item) => ({
            itemId: item.itemId,
            itemName: item.itemName,
            quantity: item.quantity.toString(),
            extraPayload: item.extraPayload ?? undefined,
          })),
        },
        attachments: {
          create: attachmentUrls.map((fileUrl) => ({
            bucket: 'local',
            objectKey: fileUrl.replace(/^\/api\/uploads\//, ''),
            fileType: 'submission_proof',
            fileUrl,
          })),
        },
      },
      include: this.getSubmissionInclude(),
    })

    await this.safeNotify(() =>
      this.notificationsService.notifySubmissionCreated(this.buildNotificationPayload(created)),
    )

    return {
      item: this.formatSubmission(created),
    }
  }

  async listMySubmissions(currentUser: AuthenticatedUser, activityId?: string) {
    this.ensureAnchor(currentUser)

    const anchorUser = await this.prisma.wecomUser.findUnique({
      where: {
        wecomUserId: currentUser.wecomUserId,
      },
    })

    if (!anchorUser) {
      return {
        items: [],
      }
    }

    const items = await this.prisma.submission.findMany({
      where: {
        anchorUserId: anchorUser.id,
        activityId: activityId?.trim() || undefined,
      },
      include: this.getSubmissionInclude(),
      orderBy: [{ createdAt: 'desc' }],
    })

    return {
      items: items.map((item: any) => this.formatSubmission(item)),
    }
  }

  async getMySubmissionDetail(currentUser: AuthenticatedUser, submissionId: string) {
    this.ensureAnchor(currentUser)

    const anchorUser = await this.prisma.wecomUser.findUnique({
      where: {
        wecomUserId: currentUser.wecomUserId,
      },
    })

    if (!anchorUser) {
      throw new NotFoundException('未找到对应记录')
    }

    const submission = await this.findSubmissionForAnchor(submissionId, anchorUser.id)
    const activity = await this.findActivityWithConfig(submission.activityId)
    const operators = await this.prisma.operatorAccount.findMany({
      where: {
        role: 'operator',
        status: 'active',
      },
      orderBy: [{ displayName: 'asc' }],
    })

    return {
      item: this.formatEditableSubmission(submission, activity),
      operators: operators.map((operator: any) => ({
        id: operator.id,
        displayName: operator.displayName,
      })),
    }
  }

  async deleteMySubmissionAttachment(
    currentUser: AuthenticatedUser,
    submissionId: string,
    attachmentId: string,
  ) {
    this.ensureAnchor(currentUser)

    const anchorUser = await this.ensureAnchorUser(currentUser)
    const submission = await this.findSubmissionForAnchor(submissionId, anchorUser.id)

    if (submission.reviewStatus === 'approved') {
      throw new BadRequestException('审核通过后的记录不能再由主播删除截图')
    }

    if (submission.grantStatus === 'granted') {
      throw new BadRequestException('已发放记录不能再由主播删除截图')
    }

    const attachment = submission.attachments.find(
      (item: any) => item.id === attachmentId && item.fileType === 'submission_proof',
    ) as { id: string; objectKey: string } | undefined

    if (!attachment) {
      throw new NotFoundException('未找到对应截图')
    }

    const submissionProofCount = submission.attachments.filter(
      (item: any) => item.fileType === 'submission_proof',
    ).length

    if (submissionProofCount <= 1) {
      throw new BadRequestException('请至少保留一张截图')
    }

    await this.prisma.attachment.delete({
      where: {
        id: attachment.id,
      },
    })

    await this.removeUploadedFileIfUnused(attachment)

    return {
      success: true,
    }
  }

  async previewSubmission(currentUser: AuthenticatedUser, dto: PreviewSubmissionDto) {
    this.ensureAnchor(currentUser)

    const anchorUser = await this.prisma.wecomUser.findUnique({
      where: {
        wecomUserId: currentUser.wecomUserId,
      },
    })

    let activity: any
    let excludeSubmissionId: string | null = null

    if (dto.submissionId) {
      if (!anchorUser) {
        throw new NotFoundException('未找到对应记录')
      }

      const submission = await this.findSubmissionForAnchor(dto.submissionId, anchorUser.id)
      if (submission.activityId !== dto.activityId) {
        throw new BadRequestException('记录与活动不匹配')
      }

      activity = await this.findActivityWithConfig(dto.activityId)
      excludeSubmissionId = submission.id
    } else {
      activity = await this.findActiveActivity(dto.activityId)
    }

    const liveDate = this.parseLiveDate(dto.liveDate)

    this.ensureLiveDateInRange(liveDate, activity.startAt, activity.endAt)

    if (activity.type.typeCode === 'gift_collection') {
      const normalizedItems = this.normalizeGiftItems(dto.items ?? [])
      if (normalizedItems.length === 0) {
        return {
          mode: 'gift_collection',
          liveDate: this.toDateKey(liveDate),
          selectedItems: [],
          dailyTotals: [],
          matchedRewards: [],
          rewardSummaryText: '请先选择礼物并填写数量',
        }
      }

      const preview = await this.buildGiftCollectionSnapshot(
        activity,
        anchorUser?.id ?? null,
        liveDate,
        normalizedItems,
        excludeSubmissionId,
      )

      return {
        mode: 'gift_collection',
        ...preview,
        rewardSummaryText:
          preview.matchedRewards.length > 0
            ? preview.matchedRewards.map((item: any) => item.rewardLabel).join('；')
            : '当前填写内容暂未命中奖励',
      }
    }

    const pkValue = Number(dto.pkValue)
    const matchedRewards = activity.rules
      .filter((rule: any) => this.matchRule(pkValue, Number(rule.threshold), rule.compareMode))
      .map((rule: any) => ({
        itemName: 'PK值',
        threshold: Number(rule.threshold),
        rewardType: rule.rewardType,
        rewardLabel: rule.rewardLabel,
        rewardValueCents: Number(rule.rewardValueCents ?? 0),
      }))

    return {
      mode: 'pk_score',
      pkValue,
      matchedRewards,
      rewardSummaryText: matchedRewards.length > 0 ? matchedRewards.map((item: any) => item.rewardLabel).join('；') : '当前填写内容暂未命中奖励',
    }
  }

  async listAdminSubmissions(currentUser: AuthenticatedUser) {
    const operatorAccount = await this.ensureAdmin(currentUser)

    const items = await this.prisma.submission.findMany({
      where: operatorAccount
        ? {
            operatorId: operatorAccount.id,
          }
        : undefined,
      include: this.getSubmissionInclude(),
      orderBy: [{ createdAt: 'desc' }],
    })

    return {
      items: items.map((item: any) => this.formatSubmission(item)),
    }
  }

  async updateMySubmission(
    currentUser: AuthenticatedUser,
    submissionId: string,
    dto: UpdateSubmissionDto,
  ) {
    this.ensureAnchor(currentUser)

    const anchorUser = await this.ensureAnchorUser(currentUser)
    const submission = await this.findSubmissionForAnchor(submissionId, anchorUser.id)

    if (submission.reviewStatus === 'approved') {
      throw new BadRequestException('审核通过后的记录不能再由主播修改')
    }

    if (submission.grantStatus === 'granted') {
      throw new BadRequestException('已发放记录不能再由主播修改')
    }

    const activity = await this.findActivityWithConfig(submission.activityId)
    const operator = await this.prisma.operatorAccount.findFirst({
      where: {
        id: dto.operatorId,
        role: 'operator',
        status: 'active',
      },
    })

    if (!operator) {
      throw new BadRequestException('请选择有效的运营老师')
    }

    const anchorName = dto.anchorName.trim()
    if (!anchorName) {
      throw new BadRequestException('主播姓名不能为空')
    }

    const liveDate = this.parseLiveDate(dto.liveDate)
    const liveStartTime = this.parseLiveStartTime(dto.liveStartTime)

    this.ensureLiveDateInRange(liveDate, activity.startAt, activity.endAt)
    await this.ensurePkSubmissionSlotAvailable(activity, anchorUser.id, liveDate, submission.id)

    const attachmentUrls = dto.attachmentUrls.map((item) => item.trim()).filter(Boolean)
    if (attachmentUrls.length === 0) {
      throw new BadRequestException('请至少上传一张截图')
    }

    const removedSubmissionProofs = submission.attachments.filter(
      (item: any) => item.fileType === 'submission_proof' && !attachmentUrls.includes(item.fileUrl),
    )

    const { submissionItems, rewardSnapshot } = await this.buildSubmissionPayload(
      activity,
      anchorUser.id,
      liveDate,
      dto,
      submission.id,
    )

    const updated = await this.prisma.$transaction(async (tx: any) => {
      const nextSubmission = await tx.submission.update({
        where: {
          id: submission.id,
        },
        data: {
          anchorName,
          operatorId: operator.id,
          liveDate,
          liveStartTime,
          reviewStatus: 'pending',
          grantStatus: 'pending',
          rejectReason: null,
          rewardSnapshot,
          items: {
            deleteMany: {},
            create: submissionItems.map((item) => ({
              itemId: item.itemId,
              itemName: item.itemName,
              quantity: item.quantity.toString(),
              extraPayload: item.extraPayload ?? undefined,
            })),
          },
          attachments: {
            deleteMany: {
              fileType: 'submission_proof',
            },
            create: attachmentUrls.map((fileUrl) => ({
              bucket: 'local',
              objectKey: fileUrl.replace(/^\/api\/uploads\//, ''),
              fileType: 'submission_proof',
              fileUrl,
            })),
          },
        },
        include: this.getSubmissionInclude(),
      })

      await tx.reviewLog.create({
        data: {
          submissionId: submission.id,
          action: 'resubmitted',
          note: '主播修改后重新提交',
        },
      })

      return nextSubmission
    })

    await this.cleanupUnusedAttachments(removedSubmissionProofs)

    await this.safeNotify(() =>
      this.notificationsService.notifySubmissionCreated(this.buildNotificationPayload(updated), {
        resubmitted: true,
      }),
    )

    return {
      item: this.formatSubmission(updated),
    }
  }

  async updateReviewStatus(
    currentUser: AuthenticatedUser,
    submissionId: string,
    dto: UpdateReviewStatusDto,
  ) {
    const operatorAccount = await this.ensureAdmin(currentUser)
    const submission = await this.findSubmissionForAdmin(submissionId, operatorAccount?.id ?? null)

    if (dto.status === 'rejected' && !dto.rejectReason?.trim()) {
      throw new BadRequestException('驳回时必须填写驳回原因')
    }

    if (submission.grantStatus === 'granted') {
      throw new BadRequestException('已发放记录不能再修改审核状态')
    }

    if (submission.reviewStatus === dto.status) {
      throw new BadRequestException(
        dto.status === 'approved' ? '当前记录已经是审核通过状态' : '当前记录已经是驳回状态',
      )
    }

    const updated = await this.prisma.$transaction(async (tx: any) => {
      const nextSubmission = await tx.submission.update({
        where: {
          id: submission.id,
        },
        data: {
          reviewStatus: dto.status,
          rejectReason: dto.status === 'rejected' ? dto.rejectReason?.trim() ?? null : null,
        },
        include: this.getSubmissionInclude(),
      })

      await tx.reviewLog.create({
        data: {
          submissionId: submission.id,
          action: dto.status,
          operatorAccountId: operatorAccount?.id ?? null,
          note: dto.status === 'rejected' ? dto.rejectReason?.trim() ?? null : '审核通过',
        },
      })

      return nextSubmission
    })

    await this.safeNotify(() =>
      this.notificationsService.notifyReviewResult(
        this.buildNotificationPayload(updated),
        dto.status,
      ),
    )

    return {
      item: this.formatSubmission(updated),
    }
  }

  async updateGrantStatus(
    currentUser: AuthenticatedUser,
    submissionId: string,
    dto: UpdateGrantStatusDto,
  ) {
    const operatorAccount = await this.ensureAdmin(currentUser)
    const submission = await this.findSubmissionForAdmin(submissionId, operatorAccount?.id ?? null)
    const proofAttachmentUrl = dto.proofAttachmentUrl
      ? this.normalizeUploadedFileUrl(dto.proofAttachmentUrl, 'grant')
      : ''

    if (submission.reviewStatus !== 'approved') {
      throw new BadRequestException('审核通过后才能标记为已发放')
    }

    if (submission.grantStatus === 'granted') {
      throw new BadRequestException('当前记录已经标记为已发放')
    }

    const updated = await this.prisma.$transaction(async (tx: any) => {
      const proofAttachment = proofAttachmentUrl
        ? await tx.attachment.create({
            data: {
              submissionId: submission.id,
              bucket: 'local',
              objectKey: proofAttachmentUrl.replace(/^\/api\/uploads\//, ''),
              fileType: 'grant_proof',
              fileUrl: proofAttachmentUrl,
            },
          })
        : null

      await tx.submission.update({
        where: {
          id: submission.id,
        },
        data: {
          grantStatus: dto.status,
        },
      })

      const existingGrant = await tx.rewardGrant.findFirst({
        where: {
          submissionId: submission.id,
        },
        orderBy: [{ grantedAt: 'desc' }, { id: 'desc' }],
      })

      if (existingGrant) {
        await tx.rewardGrant.update({
          where: {
            id: existingGrant.id,
          },
          data: {
            status: dto.status,
            grantedBy: operatorAccount?.id ?? null,
            grantedAt: new Date(),
            remark: dto.remark?.trim() || null,
            proofAttachmentId: proofAttachment?.id ?? null,
          },
        })
      } else {
        await tx.rewardGrant.create({
          data: {
            submissionId: submission.id,
            status: dto.status,
            grantedBy: operatorAccount?.id ?? null,
            grantedAt: new Date(),
            remark: dto.remark?.trim() || null,
            proofAttachmentId: proofAttachment?.id ?? null,
          },
        })
      }

      await tx.reviewLog.create({
        data: {
          submissionId: submission.id,
          action: 'granted',
          operatorAccountId: operatorAccount?.id ?? null,
          note: dto.remark?.trim() || '已发放',
        },
      })

      return tx.submission.findUniqueOrThrow({
        where: {
          id: submission.id,
        },
        include: this.getSubmissionInclude(),
      })
    })

    await this.safeNotify(() =>
      this.notificationsService.notifyGrantCompleted(this.buildNotificationPayload(updated)),
    )

    return {
      item: this.formatSubmission(updated),
    }
  }

  private async buildSubmissionPayload(
    activity: any,
    anchorUserId: string,
    liveDate: Date,
    dto: CreateSubmissionDto | UpdateSubmissionDto,
    excludeSubmissionId?: string,
  ) {
    if (activity.type.typeCode === 'gift_collection') {
      const normalizedItems = this.normalizeGiftItems(dto.items ?? [])

      if (normalizedItems.length === 0) {
        throw new BadRequestException('请至少填写一项礼物数量')
      }

      const preview = await this.buildGiftCollectionSnapshot(
        activity,
        anchorUserId,
        liveDate,
        normalizedItems,
        excludeSubmissionId ?? null,
      )

      return {
        submissionItems: normalizedItems.map((item) => ({
          itemId: activity.items.find((activityItem: any) => activityItem.itemName === item.itemName)?.id ?? null,
          itemName: item.itemName,
          quantity: item.quantity,
          extraPayload: null,
        })),
        rewardSnapshot: {
          mode: 'daily',
          liveDate: preview.liveDate,
          totals: preview.dailyTotals,
          matchedRewards: preview.matchedRewards,
        },
      }
    }

    if (activity.type.typeCode === 'pk_score') {
      const pkValue = Number(dto.pkValue)

      if (!Number.isFinite(pkValue) || pkValue < 0) {
        throw new BadRequestException('请填写有效的 PK 值')
      }

      const matchedRewards = activity.rules
        .filter((rule: any) => this.matchRule(pkValue, Number(rule.threshold), rule.compareMode))
        .map((rule: any) => ({
          itemName: 'PK值',
          threshold: Number(rule.threshold),
          rewardType: rule.rewardType,
          rewardLabel: rule.rewardLabel,
          rewardValueCents: Number(rule.rewardValueCents ?? 0),
        }))

      return {
        submissionItems: [
          {
            itemId: activity.items[0]?.id ?? null,
            itemName: 'PK值',
            quantity: pkValue,
            extraPayload: {
              metric: 'pk_value',
            },
          },
        ],
        rewardSnapshot: {
          mode: 'session',
          pkValue,
          matchedRewards,
        },
      }
    }

    throw new BadRequestException('当前活动类型无法提报，请联系管理员确认活动配置。')
  }

  private async ensurePkSubmissionSlotAvailable(
    activity: any,
    anchorUserId: string,
    liveDate: Date,
    excludeSubmissionId?: string,
  ) {
    if (activity.type.typeCode !== 'pk_score') {
      return
    }

    const existingSubmission = await this.prisma.submission.findFirst({
      where: {
        activityId: activity.id,
        anchorUserId,
        liveDate,
        ...(excludeSubmissionId
          ? {
              id: {
                not: excludeSubmissionId,
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    })

    if (existingSubmission) {
      throw new BadRequestException('当天已提交，请到记录里修改')
    }
  }

  private async ensureAnchorUser(currentUser: AuthenticatedUser) {
    return this.prisma.wecomUser.upsert({
      where: {
        wecomUserId: currentUser.wecomUserId,
      },
      update: {
        wecomName: currentUser.name,
        avatarUrl: currentUser.avatarUrl,
      },
      create: {
        wecomUserId: currentUser.wecomUserId,
        wecomName: currentUser.name,
        avatarUrl: currentUser.avatarUrl,
      },
    })
  }

  private normalizeGiftItems(items: Array<{ itemName: string; quantity: number }>) {
    const totals = new Map<string, number>()

    for (const item of items) {
      const itemName = item.itemName.trim()
      const quantity = Number(item.quantity)

      if (!itemName || !Number.isFinite(quantity) || quantity <= 0) {
        continue
      }

      totals.set(itemName, (totals.get(itemName) ?? 0) + quantity)
    }

    return Array.from(totals.entries()).map(([itemName, quantity]) => ({
      itemName,
      quantity,
    }))
  }

  private async buildGiftCollectionSnapshot(
    activity: any,
    anchorUserId: string | null,
    liveDate: Date,
    normalizedItems: Array<{ itemName: string; quantity: number }>,
    excludeSubmissionId: string | null = null,
  ) {
    const existingSubmissions = anchorUserId
      ? await this.prisma.submission.findMany({
          where: {
            activityId: activity.id,
            anchorUserId,
            liveDate,
            ...(excludeSubmissionId
              ? {
                  id: {
                    not: excludeSubmissionId,
                  },
                }
              : {}),
            reviewStatus: {
              not: 'rejected',
            },
          },
          include: {
            items: true,
          },
        })
      : []

    const dailyTotals = new Map<string, number>()
    for (const submission of existingSubmissions) {
      for (const item of submission.items) {
        dailyTotals.set(item.itemName, (dailyTotals.get(item.itemName) ?? 0) + Number(item.quantity))
      }
    }

    for (const item of normalizedItems) {
      dailyTotals.set(item.itemName, (dailyTotals.get(item.itemName) ?? 0) + item.quantity)
    }

    const matchedByItemName = new Map<string, any>()
    for (const rule of activity.rules ?? []) {
      const itemName = rule.item?.itemName ?? null
      if (!itemName) {
        continue
      }

      const actualValue = dailyTotals.get(itemName) ?? 0
      if (!this.matchRule(actualValue, Number(rule.threshold), rule.compareMode)) {
        continue
      }

      const threshold = Number(rule.threshold)
      const sortOrder = Number(rule.sortOrder ?? 0)
      const next = {
        itemName,
        threshold,
        rewardType: rule.rewardType,
        rewardLabel: rule.rewardLabel,
        rewardValueCents: Number(rule.rewardValueCents ?? 0),
        sortOrder,
      }
      const current = matchedByItemName.get(itemName) ?? null

      if (
        !current ||
        threshold > Number(current.threshold) ||
        (threshold === Number(current.threshold) && sortOrder >= Number(current.sortOrder))
      ) {
        matchedByItemName.set(itemName, next)
      }
    }

    const matchedRewards = Array.from(matchedByItemName.values())
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder
        }
        return b.threshold - a.threshold
      })
      .map(({ sortOrder, ...rest }) => rest)

    return {
      liveDate: this.toDateKey(liveDate),
      selectedItems: normalizedItems,
      dailyTotals: Array.from(dailyTotals.entries()).map(([itemName, quantity]) => ({
        itemName,
        quantity,
      })),
      matchedRewards,
    }
  }

  private async ensureAdmin(currentUser: AuthenticatedUser) {
    if (currentUser.role !== 'operator' && currentUser.role !== 'super_admin') {
      throw new ForbiddenException('只有后台账号可以管理记录')
    }

    if (currentUser.role === 'super_admin') {
      return null
    }

    const operatorAccount = await this.authService.getActiveAdminAccount(currentUser)

    if (!operatorAccount || operatorAccount.role !== 'operator') {
      throw new ForbiddenException('当前运营老师账号不可用')
    }

    return operatorAccount
  }

  private normalizeUploadedFileUrls(urls: string[], category: 'submission' | 'grant') {
    return urls
      .map((item) => this.normalizeUploadedFileUrl(item, category))
      .filter(Boolean)
  }

  private normalizeUploadedFileUrl(fileUrl: string, category: 'submission' | 'grant') {
    const normalized = fileUrl.trim()
    const prefix =
      category === 'submission' ? '/api/uploads/submission-proofs/' : '/api/uploads/grant-proofs/'

    if (!normalized) {
      return ''
    }

    if (!normalized.startsWith(prefix)) {
      throw new BadRequestException(
        category === 'submission' ? '提交截图地址无效，请重新上传截图' : '发放截图地址无效，请重新上传截图',
      )
    }

    const fileName = normalized.slice(prefix.length)
    if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
      throw new BadRequestException(
        category === 'submission' ? '提交截图地址无效，请重新上传截图' : '发放截图地址无效，请重新上传截图',
      )
    }

    return `${prefix}${fileName}`
  }

  private async findSubmissionForAdmin(submissionId: string, operatorId: string | null) {
    const submission = await this.prisma.submission.findFirst({
      where: {
        id: submissionId,
        ...(operatorId ? { operatorId } : {}),
      },
      include: this.getSubmissionInclude(),
    })

    if (!submission) {
      throw new NotFoundException('未找到对应记录')
    }

    return submission
  }

  private async findSubmissionForAnchor(submissionId: string, anchorUserId: string) {
    const submission = await this.prisma.submission.findFirst({
      where: {
        id: submissionId,
        anchorUserId,
      },
      include: this.getSubmissionInclude(),
    })

    if (!submission) {
      throw new NotFoundException('未找到对应记录')
    }

    return submission
  }

  private async findActivityWithConfig(activityId: string) {
    const activity = await this.prisma.activity.findFirst({
      where: {
        id: activityId,
      },
      include: {
        type: true,
        items: {
          where: { enabled: true },
          orderBy: [{ sortOrder: 'asc' }, { itemName: 'asc' }],
        },
        rules: {
          where: { enabled: true },
          include: { item: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    })

    if (!activity) {
      throw new NotFoundException('未找到可参与的活动')
    }

    if (activity.rules.length === 0) {
      throw new BadRequestException('该活动还没有配置规则，暂时不能提报')
    }

    return activity
  }

  private async findActiveActivity(activityId: string) {
    const activity = await this.findActivityWithConfig(activityId)

    if (activity.status !== 'active' || activity.startAt > new Date() || activity.endAt < new Date()) {
      throw new NotFoundException('未找到可参与的活动')
    }

    return activity
  }

  private ensureAnchor(currentUser: AuthenticatedUser) {
    if (currentUser.role !== 'anchor') {
      throw new ForbiddenException('只有主播可以进行提报')
    }
  }

  private ensureLiveDateInRange(liveDate: Date, startAt: Date, endAt: Date) {
    const liveDateKey = this.toDateKey(liveDate)
    if (liveDateKey < this.toDateKey(startAt) || liveDateKey > this.toDateKey(endAt)) {
      throw new BadRequestException('直播日期不在活动时间范围内')
    }
  }

  private parseLiveDate(value: string) {
    const dateKey = value.slice(0, 10)
    const parsed = new Date(`${dateKey}T00:00:00.000Z`)

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('直播日期格式不正确')
    }

    return parsed
  }

  private parseLiveStartTime(value: string) {
    if (!/^\d{2}:\d{2}$/.test(value)) {
      throw new BadRequestException('开播时间格式不正确')
    }

    const parsed = new Date(`1970-01-01T${value}:00.000Z`)
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('开播时间格式不正确')
    }

    return parsed
  }

  private toDateKey(value: Date) {
    return value.toISOString().slice(0, 10)
  }

  private matchRule(actualValue: number, threshold: number, compareMode: string) {
    if (compareMode === 'eq') {
      return actualValue === threshold
    }

    return actualValue >= threshold
  }

  private formatAvailableActivity(activity: any) {
    const uniqueGiftItems = Array.from(
      new Set(activity.items.map((item: any) => item.itemName).filter(Boolean)),
    )

    return {
      id: activity.id,
      name: activity.name,
      startAt: activity.startAt.toISOString(),
      endAt: activity.endAt.toISOString(),
      description: activity.description,
      coverUrl: activity.coverUrl,
      type: {
        typeCode: activity.type.typeCode,
        typeName: activity.type.typeName,
        aggregationMode: activity.type.aggregationMode,
        metricUnit: activity.type.metricUnit,
      },
      ruleCount: activity.rules.length,
      entryCount: activity.type.typeCode === 'gift_collection' ? uniqueGiftItems.length : 1,
      entrySummary:
        activity.type.typeCode === 'gift_collection'
          ? uniqueGiftItems.join('、')
          : '主播填写本场 PK 值',
    }
  }

  private formatActivityDetail(activity: any) {
    const uniqueGiftItems = Array.from(
      new Set(activity.items.map((item: any) => item.itemName).filter(Boolean)),
    )

    return {
      id: activity.id,
      name: activity.name,
      startAt: activity.startAt.toISOString(),
      endAt: activity.endAt.toISOString(),
      description: activity.description,
      type: {
        typeCode: activity.type.typeCode,
        typeName: activity.type.typeName,
        aggregationMode: activity.type.aggregationMode,
        metricUnit: activity.type.metricUnit,
      },
      formConfig:
        activity.type.typeCode === 'gift_collection'
          ? {
              mode: 'gift_collection',
              giftItems: uniqueGiftItems.map((itemName) => ({
                itemName,
              })),
              rewardRules: activity.rules.map((rule: any) => ({
                itemName: rule.item?.itemName ?? null,
                threshold: Number(rule.threshold),
                rewardType: rule.rewardType,
                rewardLabel: rule.rewardLabel,
                compareMode: rule.compareMode,
              })),
            }
          : {
              mode: 'pk_score',
              rewardRules: activity.rules.map((rule: any) => ({
                itemName: 'PK值',
                threshold: Number(rule.threshold),
                rewardType: rule.rewardType,
                rewardLabel: rule.rewardLabel,
                compareMode: rule.compareMode,
              })),
            },
    }
  }

  private formatSubmission(submission: any) {
    const rewardSnapshot = (submission.rewardSnapshot ?? null) as any
    const matchedRewards = Array.isArray(rewardSnapshot?.matchedRewards)
      ? rewardSnapshot.matchedRewards
      : []
    const totalRewardValueCents = matchedRewards.reduce(
      (total: number, item: any) => total + Number(item?.rewardValueCents ?? 0),
      0,
    )
    const submissionProofs = submission.attachments.filter((item: any) => item.fileType === 'submission_proof')
    const grantProofs = submission.attachments.filter((item: any) => item.fileType === 'grant_proof')
    const latestGrant = Array.isArray(submission.rewardGrants) && submission.rewardGrants.length > 0
      ? submission.rewardGrants[0]
      : null

    return {
      id: submission.id,
      activity: {
        id: submission.activity.id,
        name: submission.activity.name,
        typeCode: submission.activity.type.typeCode,
        typeName: submission.activity.type.typeName,
      },
      anchorUserId: submission.anchorUserId,
      anchorName: submission.anchorName,
      operatorName: submission.operator.displayName,
      liveDate: submission.liveDate.toISOString().slice(0, 10),
      liveStartTime: submission.liveStartTime.toISOString().slice(11, 16),
      reviewStatus: submission.reviewStatus,
      grantStatus: submission.grantStatus,
      rejectReason: submission.rejectReason,
      createdAt: submission.createdAt.toISOString(),
      updatedAt: submission.updatedAt.toISOString(),
      items: submission.items.map((item: any) => ({
        itemName: item.itemName,
        quantity: Number(item.quantity),
      })),
      attachmentUrls: submissionProofs.map((item: any) => item.fileUrl),
      grantAttachmentUrls: grantProofs.map((item: any) => item.fileUrl),
      matchedRewards,
      grantRemark: latestGrant?.remark ?? null,
      rewardSummaryText:
        matchedRewards.length > 0
          ? matchedRewards.map((item: any) => item.rewardLabel).join('；')
          : '暂未命中奖励',
      rewardSummaryValueYuan: Number((totalRewardValueCents / 100).toFixed(2)),
    }
  }

  private formatEditableSubmission(submission: any, activity: any) {
    return {
      id: submission.id,
      anchorName: submission.anchorName,
      operatorId: submission.operatorId,
      liveDate: submission.liveDate.toISOString().slice(0, 10),
      liveStartTime: submission.liveStartTime.toISOString().slice(11, 16),
      reviewStatus: submission.reviewStatus,
      grantStatus: submission.grantStatus,
      rejectReason: submission.rejectReason,
      attachments: submission.attachments
        .filter((item: any) => item.fileType === 'submission_proof')
        .map((item: any) => ({
          id: item.id,
          fileUrl: item.fileUrl,
        })),
      items: submission.items.map((item: any) => ({
        itemName: item.itemName,
        quantity: Number(item.quantity),
      })),
      pkValue:
        activity.type.typeCode === 'pk_score' && submission.items.length > 0
          ? Number(submission.items[0]?.quantity ?? 0)
          : null,
      activity: this.formatActivityDetail(activity),
    }
  }

  private async cleanupUnusedAttachments(attachments: Array<any>) {
    for (const attachment of attachments) {
      await this.removeUploadedFileIfUnused(attachment)
    }
  }

  private async removeUploadedFileIfUnused(attachment: { id?: string; objectKey: string }) {
    const count = await this.prisma.attachment.count({
      where: {
        objectKey: attachment.objectKey,
        ...(attachment.id
          ? {
              id: {
                not: attachment.id,
              },
            }
          : {}),
      },
    })

    if (count > 0) {
      return
    }

    const uploadsRootWithSlash = uploadsRoot.endsWith('/') ? uploadsRoot : `${uploadsRoot}/`
    const absoluteFilePath = resolve(uploadsRoot, attachment.objectKey)

    if (!absoluteFilePath.startsWith(uploadsRootWithSlash)) {
      return
    }

    try {
      await unlink(absoluteFilePath)
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        throw error
      }
    }
  }

  private buildNotificationPayload(submission: any) {
    return {
      submissionId: submission.id,
      activityName: submission.activity.name,
      anchorName: submission.anchorName,
      operatorName: submission.operator.displayName,
      operatorWecomUserId: submission.operator.wecomUserId ?? null,
      anchorWecomUserId: submission.anchorUser.wecomUserId,
      liveDate: submission.liveDate.toISOString().slice(0, 10),
      liveStartTime: submission.liveStartTime.toISOString().slice(11, 16),
      rewardSummaryText:
        this.formatSubmission(submission).rewardSummaryText,
      rejectReason: submission.rejectReason ?? null,
      grantRemark:
        Array.isArray(submission.rewardGrants) && submission.rewardGrants.length > 0
          ? submission.rewardGrants[0]?.remark ?? null
          : null,
    }
  }

  private async safeNotify(notifyFn: () => Promise<void>) {
    try {
      await notifyFn()
    } catch {
      // 通知服务内部已经记录失败原因，这里不再阻断主业务
    }
  }

  private getSubmissionInclude(): any {
    return {
      activity: {
        include: {
          type: true,
        },
      },
      operator: true,
      anchorUser: true,
      items: {
        orderBy: [{ itemName: 'asc' }],
      },
      rewardGrants: {
        orderBy: [{ grantedAt: 'desc' }, { id: 'desc' }],
      },
      attachments: {
        orderBy: [{ createdAt: 'asc' }],
      },
    }
  }
}
