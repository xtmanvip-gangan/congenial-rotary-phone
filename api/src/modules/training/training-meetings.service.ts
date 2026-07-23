import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service.js'
import {
  TENCENT_MEETING_GATEWAY,
  type TencentMeetingGateway,
} from '../integrations/tencent-meeting/tencent-meeting.types.js'

@Injectable()
export class TrainingMeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TENCENT_MEETING_GATEWAY)
    private readonly gateway: TencentMeetingGateway,
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
    } catch (error) {
      const message = this.errorMessage(error)
      await this.prisma.trainingMeeting.update({
        where: { sessionId },
        data: { lastError: message },
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
    throw new BadRequestException(`腾讯会议创建或更新失败：${message}`)
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : '未知错误'
  }
}
