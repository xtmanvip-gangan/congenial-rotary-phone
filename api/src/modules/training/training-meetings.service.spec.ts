import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
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
  it('发布场次不调用腾讯会议 API，仅标记 published', async () => {
    const prisma = {
      trainingSession: {
        findUnique: vi.fn().mockResolvedValue(session()),
        update: vi.fn().mockResolvedValue({}),
      },
      trainingMeeting: {
        create: vi.fn().mockResolvedValue({ id: 'local-meeting-1' }),
        update: vi.fn(),
      },
    }
    const service = new TrainingMeetingsService(prisma as never)

    await service.publishSession('session-1')

    expect(prisma.trainingSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({
        status: 'published',
        publishedAt: expect.any(Date),
      }),
    })
    expect(prisma.trainingMeeting.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: 'session-1',
        createStatus: 'pending',
      }),
    })
  })

  it('已有会议记录时发布不重复创建会议壳', async () => {
    const prisma = {
      trainingSession: {
        findUnique: vi.fn().mockResolvedValue(
          session({
            meetingCode: '123',
            joinUrl: 'https://meeting.tencent.com/dm/example',
            createStatus: 'created',
          }),
        ),
        update: vi.fn().mockResolvedValue({}),
      },
      trainingMeeting: {
        create: vi.fn(),
        update: vi.fn(),
      },
    }
    const service = new TrainingMeetingsService(prisma as never)

    await service.publishSession('session-1')

    expect(prisma.trainingMeeting.create).not.toHaveBeenCalled()
  })

  it('支持手工回填会议号和入会链接（可后补）', async () => {
    const prisma = {
      trainingSession: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'session-1',
          status: 'published',
        }),
      },
      trainingMeeting: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'm1' }),
        update: vi.fn(),
      },
    }
    const service = new TrainingMeetingsService(prisma as never)

    await service.saveManualMeeting('session-1', {
      meetingCode: ' 900123456 ',
      joinUrl: 'https://meeting.tencent.com/dm/abc',
    })

    expect(prisma.trainingMeeting.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: 'session-1',
        meetingCode: '900123456',
        joinUrl: 'https://meeting.tencent.com/dm/abc',
        createStatus: 'created',
      }),
    })
  })

  it('入会链接格式非法时拒绝保存', async () => {
    const prisma = {
      trainingSession: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'session-1',
          status: 'published',
        }),
      },
      trainingMeeting: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    }
    const service = new TrainingMeetingsService(prisma as never)

    await expect(
      service.saveManualMeeting('session-1', {
        joinUrl: 'not-a-url',
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('取消场次只更新本地会议状态，不调用外部 API', async () => {
    const prisma = {
      trainingMeeting: {
        findUnique: vi.fn().mockResolvedValue({
          sessionId: 'session-1',
          createStatus: 'created',
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    }
    const service = new TrainingMeetingsService(prisma as never)

    await service.cancelSession('session-1', '老师请假')

    expect(prisma.trainingMeeting.update).toHaveBeenCalledWith({
      where: { sessionId: 'session-1' },
      data: {
        createStatus: 'cancelled',
        lastError: null,
      },
    })
  })
})
