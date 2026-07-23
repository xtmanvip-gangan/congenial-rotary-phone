import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service.js'

/**
 * 腾讯会议无开放 API 权限时的会议管理：
 * - 场次在系统内自建并发布
 * - 会议号 + 入会链接由培训老师在腾讯侧建会后手工回填（可后补）
 * - 参会认定走腾讯导出 Excel 导入，不依赖会议 API
 */
@Injectable()
export class TrainingMeetingsService {
  constructor(private readonly prisma: PrismaService) {}

  async publishSession(sessionId: string) {
    const session = await this.prisma.trainingSession.findUnique({
      where: { id: sessionId },
      include: { meeting: true },
    })
    if (!session) throw new NotFoundException('未找到培训场次')

    await this.prisma.trainingSession.update({
      where: { id: sessionId },
      data: {
        status: 'published',
        publishedAt: new Date(),
      },
    })

    // 发布不强制建会；若尚无会议记录则预建空壳，便于后续回填会议号/链接
    if (!session.meeting) {
      await this.prisma.trainingMeeting.create({
        data: {
          sessionId,
          createStatus: 'pending',
          createAttempts: 0,
          lastError: null,
        },
      })
    } else if (session.meeting.createStatus === 'failed') {
      await this.prisma.trainingMeeting.update({
        where: { sessionId },
        data: {
          createStatus:
            session.meeting.meetingCode || session.meeting.joinUrl
              ? 'created'
              : 'pending',
          lastError: null,
        },
      })
    }
  }

  async saveManualMeeting(
    sessionId: string,
    input: { meetingCode?: string | null; joinUrl?: string | null },
  ) {
    const session = await this.prisma.trainingSession.findUnique({
      where: { id: sessionId },
    })
    if (!session) throw new NotFoundException('未找到培训场次')
    if (session.status === 'cancelled') {
      throw new BadRequestException('已取消场次不能维护会议信息')
    }

    const meetingCode =
      input.meetingCode === undefined
        ? undefined
        : normalizeOptionalText(input.meetingCode, 64)
    const joinUrl =
      input.joinUrl === undefined
        ? undefined
        : normalizeOptionalText(input.joinUrl, 1000)

    if (joinUrl !== undefined && joinUrl) {
      if (!isLikelyHttpUrl(joinUrl)) {
        throw new BadRequestException('入会链接需为 http(s) 地址')
      }
    }

    const existing = await this.prisma.trainingMeeting.findUnique({
      where: { sessionId },
    })

    const nextCode =
      meetingCode !== undefined ? meetingCode : existing?.meetingCode ?? null
    const nextUrl =
      joinUrl !== undefined ? joinUrl : existing?.joinUrl ?? null
    const hasInfo = Boolean(nextCode || nextUrl)

    const data = {
      ...(meetingCode !== undefined ? { meetingCode } : {}),
      ...(joinUrl !== undefined ? { joinUrl } : {}),
      createStatus: hasInfo ? ('created' as const) : ('pending' as const),
      // 手工回填不再依赖外部 meeting id
      externalMeetingId: existing?.externalMeetingId ?? null,
      lastError: null,
      responseSummary: {
        source: 'manual',
        updatedAt: new Date().toISOString(),
      },
    }

    if (existing) {
      return this.prisma.trainingMeeting.update({
        where: { sessionId },
        data,
      })
    }

    return this.prisma.trainingMeeting.create({
      data: {
        sessionId,
        meetingCode: nextCode,
        joinUrl: nextUrl,
        createStatus: hasInfo ? 'created' : 'pending',
        createAttempts: 0,
        lastError: null,
        responseSummary: data.responseSummary,
      },
    })
  }

  async cancelSession(sessionId: string, _reason: string) {
    const meeting = await this.prisma.trainingMeeting.findUnique({
      where: { sessionId },
    })
    if (!meeting) return

    await this.prisma.trainingMeeting.update({
      where: { sessionId },
      data: {
        createStatus: 'cancelled',
        lastError: null,
      },
    })
  }
}

function normalizeOptionalText(value: string | null, maxLength: number) {
  if (value == null) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > maxLength) {
    throw new BadRequestException(`内容过长，最多 ${maxLength} 个字符`)
  }
  return trimmed
}

function isLikelyHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
