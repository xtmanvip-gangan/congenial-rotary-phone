import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service.js'
import { WecomService } from '../auth/wecom.service.js'

type SubmissionNotificationPayload = {
  submissionId: string
  activityName: string
  anchorName: string
  operatorName: string
  operatorWecomUserId: string | null
  anchorWecomUserId: string
  liveDate: string
  liveStartTime: string
  rewardSummaryText: string
  rejectReason: string | null
  grantRemark: string | null
}

export type BusinessNotificationPayload = {
  businessType: string
  businessId: string
  templateCode: string
  dedupeKey?: string
  receiverWecomUserId: string
  receiverRole: string
  messageTitle: string
  messageContent: string
  scheduledAt?: Date
  maxAttempts?: number
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly wecomService: WecomService,
  ) {}

  async notifySubmissionCreated(payload: SubmissionNotificationPayload, options?: { resubmitted?: boolean }) {
    if (!payload.operatorWecomUserId) {
      return
    }

    const title = options?.resubmitted ? '【悦总统】重新提交提醒' : '【悦总统】提报提醒'
    const content = [
      `活动：${payload.activityName}`,
      `主播：${payload.anchorName}`,
      `直播时间：${payload.liveDate} ${payload.liveStartTime}`,
      `预计奖励：${payload.rewardSummaryText}`,
      '处理入口：后台「记录管理」',
    ].join('\n')

    await this.sendAndLog({
      submissionId: payload.submissionId,
      notificationType: options?.resubmitted ? 'submission_resubmitted' : 'submission_created',
      receiverWecomUserId: payload.operatorWecomUserId,
      receiverRole: 'operator',
      messageTitle: title,
      messageContent: content,
    })
  }

  async notifyReviewResult(
    payload: SubmissionNotificationPayload,
    status: 'approved' | 'rejected',
  ) {
    const title = status === 'approved' ? '【悦总统】审核通过' : '【悦总统】审核驳回'
    const content = [
      `活动：${payload.activityName}`,
      `主播：${payload.anchorName}`,
      `直播时间：${payload.liveDate} ${payload.liveStartTime}`,
      `命中奖励：${payload.rewardSummaryText}`,
      `运营老师：${payload.operatorName}`,
      ...(status === 'rejected' && payload.rejectReason
        ? [`驳回原因：${payload.rejectReason}`, '处理入口：我的记录 → 修改后重新提交']
        : ['后续：请留意奖励发放通知']),
    ].join('\n')

    await this.sendAndLog({
      submissionId: payload.submissionId,
      notificationType: status === 'approved' ? 'review_approved' : 'review_rejected',
      receiverWecomUserId: payload.anchorWecomUserId,
      receiverRole: 'anchor',
      messageTitle: title,
      messageContent: content,
    })
  }

  async notifyGrantCompleted(payload: SubmissionNotificationPayload) {
    const title = '【悦总统】奖励已发放'
    const content = [
      `活动：${payload.activityName}`,
      `主播：${payload.anchorName}`,
      `直播时间：${payload.liveDate} ${payload.liveStartTime}`,
      `奖励内容：${payload.rewardSummaryText}`,
      `运营老师：${payload.operatorName}`,
      payload.grantRemark ? `发放备注：${payload.grantRemark}` : '发放备注：无',
      '查看入口：我的记录 → 查看详情',
    ].join('\n')

    await this.sendAndLog({
      submissionId: payload.submissionId,
      notificationType: 'grant_completed',
      receiverWecomUserId: payload.anchorWecomUserId,
      receiverRole: 'anchor',
      messageTitle: title,
      messageContent: content,
    })
  }

  async sendBusinessNotification(payload: BusinessNotificationPayload) {
    if (payload.dedupeKey) {
      const existing = await this.prisma.notificationLog.findUnique({
        where: { dedupeKey: payload.dedupeKey },
      })
      if (existing?.status === 'success') {
        return { item: existing, duplicate: true }
      }
      if (existing) {
        await this.deliver(existing.id, payload)
        return { item: existing, duplicate: true }
      }
    }

    const log = await this.prisma.notificationLog.create({
      data: {
        submissionId: null,
        businessType: payload.businessType,
        businessId: payload.businessId,
        templateCode: payload.templateCode,
        dedupeKey: payload.dedupeKey ?? null,
        notificationType: payload.templateCode,
        receiverWecomUserId: payload.receiverWecomUserId,
        receiverRole: payload.receiverRole,
        messageTitle: payload.messageTitle,
        messageContent: payload.messageContent,
        status: 'pending',
        scheduledAt: payload.scheduledAt ?? null,
        maxAttempts: payload.maxAttempts ?? 3,
      },
    })
    await this.deliver(log.id, payload)
    return { item: log, duplicate: false }
  }

  async retryFailed(limit = 50) {
    const items = await this.prisma.notificationLog.findMany({
      where: {
        status: 'failed',
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
      },
      orderBy: { createdAt: 'asc' },
      take: Math.min(100, Math.max(1, limit)),
    })
    let retried = 0
    for (const item of items) {
      if (item.attemptCount >= item.maxAttempts) continue
      await this.deliver(item.id, {
        businessType: item.businessType ?? 'legacy',
        businessId: item.businessId ?? item.submissionId ?? item.id,
        templateCode: item.templateCode ?? item.notificationType,
        receiverWecomUserId: item.receiverWecomUserId,
        receiverRole: item.receiverRole,
        messageTitle: item.messageTitle,
        messageContent: item.messageContent,
      })
      retried += 1
    }
    return { retried }
  }

  private async sendAndLog(payload: {
    submissionId: string
    notificationType: string
    receiverWecomUserId: string
    receiverRole: string
    messageTitle: string
    messageContent: string
  }) {
    const log = await this.prisma.notificationLog.create({
      data: {
        submissionId: payload.submissionId,
        businessType: 'submission',
        businessId: payload.submissionId,
        templateCode: payload.notificationType,
        notificationType: payload.notificationType,
        receiverWecomUserId: payload.receiverWecomUserId,
        receiverRole: payload.receiverRole,
        messageTitle: payload.messageTitle,
        messageContent: payload.messageContent,
        status: 'pending',
      },
    })

    await this.deliver(log.id, {
      businessType: 'submission',
      businessId: payload.submissionId,
      templateCode: payload.notificationType,
      receiverWecomUserId: payload.receiverWecomUserId,
      receiverRole: payload.receiverRole,
      messageTitle: payload.messageTitle,
      messageContent: payload.messageContent,
    })
  }

  private async deliver(
    logId: string,
    payload: Pick<
      BusinessNotificationPayload,
      | 'receiverWecomUserId'
      | 'messageTitle'
      | 'messageContent'
      | 'templateCode'
    > &
      Partial<BusinessNotificationPayload>,
  ) {
    try {
      await this.wecomService.sendAgentTextMessage(
        payload.receiverWecomUserId,
        `${payload.messageTitle}\n${payload.messageContent}`,
      )

      await this.prisma.notificationLog.update({
        where: {
          id: logId,
        },
        data: {
          status: 'success',
          attemptCount: { increment: 1 },
          lastAttemptAt: new Date(),
          sentAt: new Date(),
          errorMessage: null,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '通知发送失败'

      this.logger.warn(
        `通知发送失败 templateCode=${payload.templateCode} receiver=${payload.receiverWecomUserId} error=${message}`,
      )

      await this.prisma.notificationLog.update({
        where: {
          id: logId,
        },
        data: {
          status: 'failed',
          attemptCount: { increment: 1 },
          lastAttemptAt: new Date(),
          errorMessage: message,
        },
      })
    }
  }
}
