import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service.js'
import {
  TENCENT_MEETING_GATEWAY,
  type TencentMeetingGateway,
} from '../integrations/tencent-meeting/tencent-meeting.types.js'
import { NotificationsService } from '../notifications/notifications.service.js'
import { IncidentsService } from '../operations/incidents.service.js'

@Injectable()
export class TrainingMeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TENCENT_MEETING_GATEWAY)
    private readonly gateway: TencentMeetingGateway,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly incidents?: IncidentsService,
  ) {}

  async publishSession(sessionId: string) {
    const session = await this.prisma.trainingSession.findUnique({
      where: { id: sessionId },
      include: {
        course: { select: { title: true } },
        meeting: true,
      },
    })
    if (!session) throw new NotFoundException('未找到培训场次')

    const input = {
      subject: `主播培训｜${session.course.title}`,
      startAt: session.scheduledStartAt,
      endAt: session.scheduledEndAt,
    }

    if (
      session.meeting?.createStatus === 'created' &&
      session.meeting.externalMeetingId
    ) {
      try {
        await this.gateway.updateMeeting(
          session.meeting.externalMeetingId,
          input,
        )
        await this.prisma.$transaction([
          this.prisma.trainingMeeting.update({
            where: { sessionId },
            data: {
              createStatus: 'created',
              lastError: null,
            },
          }),
          this.prisma.trainingSession.update({
            where: { id: sessionId },
            data: { status: 'published', publishedAt: new Date() },
          }),
        ])
        return
      } catch (error) {
        await this.markFailure(sessionId, error)
      }
    }

    await this.prisma.trainingMeeting.upsert({
      where: { sessionId },
      create: {
        sessionId,
        createStatus: 'pending',
        createAttempts: 1,
      },
      update: {
        createStatus: 'pending',
        createAttempts: { increment: 1 },
        lastError: null,
      },
    })

    try {
      const meeting = await this.gateway.createMeeting(input)
      await this.prisma.$transaction([
        this.prisma.trainingMeeting.update({
          where: { sessionId },
          data: {
            externalMeetingId: meeting.meetingId,
            meetingCode: meeting.meetingCode,
            joinUrl: meeting.joinUrl,
            createStatus: 'created',
            responseSummary: meeting.raw as Prisma.InputJsonValue,
            lastError: null,
          },
        }),
        this.prisma.trainingSession.update({
          where: { id: sessionId },
          data: { status: 'published', publishedAt: new Date() },
        }),
      ])
    } catch (error) {
      await this.markFailure(sessionId, error)
    }
  }

  async cancelSession(sessionId: string, reason: string) {
    const meeting = await this.prisma.trainingMeeting.findUnique({
      where: { sessionId },
    })
    if (
      !meeting?.externalMeetingId ||
      meeting.createStatus !== 'created'
    ) {
      return
    }
    try {
      await this.gateway.cancelMeeting(meeting.externalMeetingId, reason)
      await this.prisma.trainingMeeting.update({
        where: { sessionId },
        data: {
          createStatus: 'cancelled',
          lastError: null,
        },
      })
      await this.incidents?.recover({
        provider: 'tencent_meeting',
        operation: 'cancel_meeting',
        businessType: 'training_session',
        businessId: sessionId,
      })
    } catch (error) {
      const message = this.errorMessage(error)
      await this.prisma.trainingMeeting.update({
        where: { sessionId },
        data: { lastError: message },
      })
      await this.incidents?.capture({
        provider: 'tencent_meeting',
        operation: 'cancel_meeting',
        businessType: 'training_session',
        businessId: sessionId,
        error,
      })
      throw new BadRequestException(`腾讯会议取消失败：${message}`)
    }
  }

  private async markFailure(sessionId: string, error: unknown): Promise<never> {
    const message = this.errorMessage(error)
    await this.prisma.trainingMeeting.update({
      where: { sessionId },
      data: {
        createStatus: 'failed',
        externalMeetingId: null,
        meetingCode: null,
        joinUrl: null,
        lastError: message,
      },
    })
    await this.prisma.trainingSession.update({
      where: { id: sessionId },
      data: { status: 'publish_failed' },
    })
    await this.notifyMeetingFailure(sessionId, message)
    await this.incidents?.capture({
      provider: 'tencent_meeting',
      operation: 'publish_meeting',
      businessType: 'training_session',
      businessId: sessionId,
      error,
    })
    throw new BadRequestException(`腾讯会议创建或更新失败：${message}`)
  }

  private async notifyMeetingFailure(sessionId: string, message: string) {
    if (!this.notifications) return
    const admins = await this.prisma.operatorAccount.findMany({
      where: {
        status: 'active',
        wecomUserId: { not: null },
        staffRoles: { some: { role: 'training_admin' } },
      },
      select: { id: true, wecomUserId: true },
    })
    for (const admin of admins) {
      if (!admin.wecomUserId) continue
      await this.notifications.sendBusinessNotification({
        businessType: 'training_meeting',
        businessId: sessionId,
        templateCode: 'training_meeting_publish_failed',
        dedupeKey: `training_meeting_publish_failed:${sessionId}:${admin.id}`,
        receiverWecomUserId: admin.wecomUserId,
        receiverRole: 'training_admin',
        messageTitle: '【培训中心】腾讯会议创建失败',
        messageContent: `场次：${sessionId}\n错误：${message}\n请在场次页检查配置后重试。`,
      })
    }
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : '未知错误'
  }
}
