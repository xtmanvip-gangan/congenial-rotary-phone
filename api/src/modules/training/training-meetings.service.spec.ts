import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { TencentMeetingGateway } from '../integrations/tencent-meeting/tencent-meeting.types.js'
import { TrainingMeetingsService } from './training-meetings.service.js'

function session(meeting: Record<string, unknown> | null = null) {
  return {
    id: 'session-1',
    status: 'draft',
    scheduledStartAt: new Date('2026-07-24T10:00:00.000Z'),
    scheduledEndAt: new Date('2026-07-24T11:00:00.000Z'),
    course: { title: '平台违规红线' },
    meeting,
  }
}

describe('TrainingMeetingsService', () => {
  it('发布时创建独立会议并保存有效入口', async () => {
    const prisma = {
      trainingSession: {
        findUnique: vi.fn().mockResolvedValue(session()),
        update: vi.fn().mockResolvedValue({}),
      },
      trainingMeeting: {
        upsert: vi.fn().mockResolvedValue({ id: 'local-meeting-1' }),
        update: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (operations) => Promise.all(operations)),
    }
    const gateway: TencentMeetingGateway = {
      createMeeting: vi.fn().mockResolvedValue({
        meetingId: 'meeting-1',
        meetingCode: '123456789',
        joinUrl: 'https://meeting.tencent.com/dm/example',
        raw: { meeting_number: 1 },
      }),
      updateMeeting: vi.fn(),
      cancelMeeting: vi.fn(),
      listParticipants: vi.fn(),
    }
    const service = new TrainingMeetingsService(
      prisma as never,
      gateway,
    )

    await service.publishSession('session-1')

    expect(gateway.createMeeting).toHaveBeenCalledWith({
      subject: '主播培训｜平台违规红线',
      startAt: new Date('2026-07-24T10:00:00.000Z'),
      endAt: new Date('2026-07-24T11:00:00.000Z'),
    })
    expect(prisma.trainingMeeting.update).toHaveBeenCalledWith({
      where: { sessionId: 'session-1' },
      data: expect.objectContaining({
        externalMeetingId: 'meeting-1',
        createStatus: 'created',
        joinUrl: 'https://meeting.tencent.com/dm/example',
      }),
    })
    expect(prisma.trainingSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({
        status: 'published',
        publishedAt: expect.any(Date),
      }),
    })
  })

  it('创建失败时标记 publish_failed 且不保存无效入口', async () => {
    const prisma = {
      trainingSession: {
        findUnique: vi.fn().mockResolvedValue(session()),
        update: vi.fn().mockResolvedValue({}),
      },
      trainingMeeting: {
        upsert: vi.fn().mockResolvedValue({ id: 'local-meeting-1' }),
        update: vi.fn().mockResolvedValue({}),
      },
    }
    const gateway = {
      createMeeting: vi.fn().mockRejectedValue(new Error('接口暂不可用')),
    }
    const service = new TrainingMeetingsService(
      prisma as never,
      gateway as never,
    )

    await expect(service.publishSession('session-1')).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(prisma.trainingMeeting.update).toHaveBeenCalledWith({
      where: { sessionId: 'session-1' },
      data: expect.objectContaining({
        createStatus: 'failed',
        joinUrl: null,
        lastError: '接口暂不可用',
      }),
    })
    expect(prisma.trainingSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { status: 'publish_failed' },
    })
  })

  it('已有会议重试发布时修改原会议而不创建第二个', async () => {
    const prisma = {
      trainingSession: {
        findUnique: vi.fn().mockResolvedValue(
          session({
            externalMeetingId: 'meeting-1',
            createStatus: 'created',
          }),
        ),
        update: vi.fn().mockResolvedValue({}),
      },
      trainingMeeting: {
        update: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (operations) => Promise.all(operations)),
    }
    const gateway = {
      createMeeting: vi.fn(),
      updateMeeting: vi.fn().mockResolvedValue(undefined),
    }
    const service = new TrainingMeetingsService(
      prisma as never,
      gateway as never,
    )

    await service.publishSession('session-1')

    expect(gateway.createMeeting).not.toHaveBeenCalled()
    expect(gateway.updateMeeting).toHaveBeenCalledWith(
      'meeting-1',
      expect.objectContaining({
        subject: '主播培训｜平台违规红线',
      }),
    )
  })
})
