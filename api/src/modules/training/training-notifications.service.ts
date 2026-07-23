import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service.js'
import { NotificationsService } from '../notifications/notifications.service.js'

@Injectable()
export class TrainingNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async notifyRegistration(
    registration: {
      id: string
      status: string
      waitlistPosition?: number | null
      registeredAt?: Date
    },
    profile: {
      anchorDisplayName: string
      currentOperator?: { displayName: string } | null
      wecomUser: { wecomUserId: string }
    },
    session: {
      id: string
      scheduledStartAt: Date
      course: { title: string }
      meeting?: { joinUrl: string | null } | null
    },
  ) {
    const waitlisted = registration.status === 'waitlisted'
    const templateCode = waitlisted
      ? 'training_waitlisted'
      : 'training_registered'
    const title = waitlisted
      ? '【培训中心】已进入候补'
      : '【培训中心】报名成功'
    const content = [
      `主播：${profile.anchorDisplayName}`,
      `课程：${session.course.title}`,
      `开课时间：${this.formatDateTime(session.scheduledStartAt)}`,
      `运营老师：${profile.currentOperator?.displayName ?? '待确认'}`,
      ...(waitlisted
        ? [`候补顺序：${registration.waitlistPosition ?? '-'}`]
        : [
            session.meeting?.joinUrl
              ? `会议入口：${session.meeting.joinUrl}`
              : '会议入口：培训中心创建后另行通知',
          ]),
    ].join('\n')
    const result = await this.notifications.sendBusinessNotification({
      businessType: 'training_registration',
      businessId: registration.id,
      templateCode,
      dedupeKey: [
        templateCode,
        registration.id,
        registration.registeredAt?.getTime() ?? 'current',
      ].join(':'),
      receiverWecomUserId: profile.wecomUser.wecomUserId,
      receiverRole: 'anchor',
      messageTitle: title,
      messageContent: content,
    })
    const minutesUntilStart =
      (session.scheduledStartAt.getTime() - Date.now()) / 60_000
    if (!waitlisted && minutesUntilStart > 0 && minutesUntilStart <= 60) {
      await this.notifyOneHourReminder({
        id: registration.id,
        anchorProfile: { wecomUser: profile.wecomUser },
        session: {
          ...session,
          meeting: session.meeting ?? null,
        },
      })
    }
    return result
  }

  async notifyPromoted(registrationId: string) {
    const registration = await this.prisma.trainingRegistration.findUnique({
      where: { id: registrationId },
      include: {
        anchorProfile: {
          include: {
            wecomUser: true,
            currentOperator: true,
          },
        },
        session: {
          include: {
            course: true,
            meeting: true,
          },
        },
      },
    })
    if (!registration) return
    return this.notifications.sendBusinessNotification({
      businessType: 'training_registration',
      businessId: registration.id,
      templateCode: 'training_waitlist_promoted',
      dedupeKey: `training_waitlist_promoted:${registration.id}:${registration.updatedAt.getTime()}`,
      receiverWecomUserId:
        registration.anchorProfile.wecomUser.wecomUserId,
      receiverRole: 'anchor',
      messageTitle: '【培训中心】候补已补位',
      messageContent: [
        `课程：${registration.session.course.title}`,
        `开课时间：${this.formatDateTime(registration.session.scheduledStartAt)}`,
        registration.session.meeting?.joinUrl
          ? `会议入口：${registration.session.meeting.joinUrl}`
          : '会议入口：培训中心创建后另行通知',
      ].join('\n'),
    })
  }

  async notifySessionChanged(
    sessionId: string,
    type: 'cancelled' | 'rescheduled',
    reason?: string,
  ) {
    const session = await this.prisma.trainingSession.findUnique({
      where: { id: sessionId },
      include: {
        course: true,
        meeting: true,
        registrations: {
          where: { status: { in: ['registered', 'waitlisted'] } },
          include: {
            anchorProfile: { include: { wecomUser: true } },
          },
        },
      },
    })
    if (!session) return
    for (const registration of session.registrations) {
      const cancelled = type === 'cancelled'
      await this.notifications.sendBusinessNotification({
        businessType: 'training_session',
        businessId: session.id,
        templateCode: cancelled
          ? 'training_session_cancelled'
          : 'training_session_rescheduled',
        dedupeKey: `${type}:${session.id}:${registration.id}:${session.updatedAt.getTime()}`,
        receiverWecomUserId:
          registration.anchorProfile.wecomUser.wecomUserId,
        receiverRole: 'anchor',
        messageTitle: cancelled
          ? '【培训中心】课程取消'
          : '【培训中心】课程改期',
        messageContent: [
          `课程：${session.course.title}`,
          `时间：${this.formatDateTime(session.scheduledStartAt)}`,
          ...(reason ? [`说明：${reason}`] : []),
          ...(!cancelled && session.meeting?.joinUrl
            ? [`会议入口：${session.meeting.joinUrl}`]
            : []),
        ].join('\n'),
      })
    }
  }

  async notifyOneHourReminder(registration: {
    id: string
    anchorProfile: { wecomUser: { wecomUserId: string } }
    session: {
      id: string
      scheduledStartAt: Date
      course: { title: string }
      meeting: { joinUrl: string | null } | null
    }
  }) {
    return this.notifications.sendBusinessNotification({
      businessType: 'training_reminder',
      businessId: registration.id,
      templateCode: 'training_one_hour_reminder',
      dedupeKey: `training_one_hour_reminder:${registration.id}:${registration.session.scheduledStartAt.getTime()}`,
      receiverWecomUserId:
        registration.anchorProfile.wecomUser.wecomUserId,
      receiverRole: 'anchor',
      messageTitle: '【培训中心】一小时后开课',
      messageContent: [
        `课程：${registration.session.course.title}`,
        `开课时间：${this.formatDateTime(registration.session.scheduledStartAt)}`,
        registration.session.meeting?.joinUrl
          ? `会议入口：${registration.session.meeting.joinUrl}`
          : '会议入口暂不可用，请联系培训老师',
      ].join('\n'),
    })
  }

  async notifyAttendanceOutcome(
    registrationId: string,
    outcome: 'learned' | 'needs_makeup',
    reason: string,
  ) {
    const registration = await this.prisma.trainingRegistration.findUnique({
      where: { id: registrationId },
      include: {
        anchorProfile: { include: { wecomUser: true } },
        session: { include: { course: true } },
      },
    })
    if (!registration) return
    const learned = outcome === 'learned'
    return this.notifications.sendBusinessNotification({
      businessType: 'training_attendance',
      businessId: registrationId,
      templateCode: learned
        ? 'training_attendance_learned'
        : 'training_attendance_needs_makeup',
      dedupeKey: `training_attendance:${registrationId}:${outcome}`,
      receiverWecomUserId:
        registration.anchorProfile.wecomUser.wecomUserId,
      receiverRole: 'anchor',
      messageTitle: learned
        ? '【培训中心】课程已完成'
        : '【培训中心】课程待补学',
      messageContent: [
        `课程：${registration.session.course.title}`,
        `参会结论：${learned ? '已学习' : '待补学'}`,
        `说明：${reason}`,
      ].join('\n'),
    })
  }

  private formatDateTime(value: Date) {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(value)
  }
}
