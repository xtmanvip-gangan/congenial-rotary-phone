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
        notificationType: payload.notificationType,
        receiverWecomUserId: payload.receiverWecomUserId,
        receiverRole: payload.receiverRole,
        messageTitle: payload.messageTitle,
        messageContent: payload.messageContent,
        status: 'pending',
      },
    })

    try {
      await this.wecomService.sendAgentTextMessage(
        payload.receiverWecomUserId,
        `${payload.messageTitle}\n${payload.messageContent}`,
      )

      await this.prisma.notificationLog.update({
        where: {
          id: log.id,
        },
        data: {
          status: 'success',
          sentAt: new Date(),
          errorMessage: null,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '通知发送失败'

      this.logger.warn(
        `通知发送失败 notificationType=${payload.notificationType} receiver=${payload.receiverWecomUserId} error=${message}`,
      )

      await this.prisma.notificationLog.update({
        where: {
          id: log.id,
        },
        data: {
          status: 'failed',
          errorMessage: message,
        },
      })
    }
  }
}
