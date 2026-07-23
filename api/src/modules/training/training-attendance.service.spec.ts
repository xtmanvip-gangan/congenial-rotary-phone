import { describe, expect, it, vi } from 'vitest'
import type { TencentMeetingParticipant } from '../integrations/tencent-meeting/tencent-meeting.types.js'
import {
  aggregateAttendanceIntervals,
  matchAttendanceToRoster,
  TrainingAttendanceService,
} from './training-attendance.service.js'

const roster = [
  {
    id: 'registration-1',
    anchorProfileId: 'anchor-1',
    anchorNameSnapshot: '小鹿',
    status: 'registered',
    anchorProfile: {
      wecomUser: {
        wecomUserId: 'wecom-1',
        wecomName: '企微小鹿',
      },
    },
  },
  {
    id: 'registration-2',
    anchorProfileId: 'anchor-2',
    anchorNameSnapshot: '小鱼',
    status: 'registered',
    anchorProfile: {
      wecomUser: {
        wecomUserId: 'wecom-2',
        wecomName: '同名主播',
      },
    },
  },
  {
    id: 'registration-3',
    anchorProfileId: 'anchor-3',
    anchorNameSnapshot: '小雨',
    status: 'registered',
    anchorProfile: {
      wecomUser: {
        wecomUserId: 'wecom-3',
        wecomName: '同名主播',
      },
    },
  },
]

function participant(
  overrides: Partial<TencentMeetingParticipant> = {},
): TencentMeetingParticipant {
  return {
    externalRecordKey: 'record-1',
    externalUserId: 'wecom-1',
    externalIdentityKey: 'userid:wecom-1',
    rawDisplayName: '企微小鹿',
    displayName: '企微小鹿',
    joinedAtSeconds: 100,
    leftAtSeconds: 400,
    raw: {},
    ...overrides,
  }
}

describe('training attendance matching', () => {
  it('合并重叠区间且累计多次进出时长', () => {
    const result = aggregateAttendanceIntervals([
      participant({ joinedAtSeconds: 100, leftAtSeconds: 400 }),
      participant({
        externalRecordKey: 'record-2',
        joinedAtSeconds: 350,
        leftAtSeconds: 500,
      }),
      participant({
        externalRecordKey: 'record-3',
        joinedAtSeconds: 700,
        leftAtSeconds: 800,
      }),
    ])

    expect(result).toEqual({
      intervals: [
        { joinedAtSeconds: 100, leftAtSeconds: 500 },
        { joinedAtSeconds: 700, leftAtSeconds: 800 },
      ],
      totalDurationSeconds: 500,
    })
  })

  it('优先使用稳定企微 UID 匹配本场报名名单', () => {
    expect(matchAttendanceToRoster(participant(), roster)).toMatchObject({
      matchStatus: 'matched',
      matchMethod: 'wecom_user_id',
      registrationId: 'registration-1',
      anchorProfileId: 'anchor-1',
    })
  })

  it('无 UID 时仅在本场企微名称唯一时自动匹配', () => {
    expect(
      matchAttendanceToRoster(
        participant({
          externalUserId: null,
          externalIdentityKey: 'name:企微小鹿',
        }),
        roster,
      ),
    ).toMatchObject({
      matchStatus: 'matched',
      matchMethod: 'wecom_name',
      registrationId: 'registration-1',
    })
  })

  it('同名主播进入冲突而不是猜测匹配', () => {
    expect(
      matchAttendanceToRoster(
        participant({
          externalUserId: null,
          externalIdentityKey: 'name:同名主播',
          displayName: '同名主播',
        }),
        roster,
      ),
    ).toEqual({
      matchStatus: 'conflict',
      matchMethod: null,
      registrationId: null,
      anchorProfileId: null,
    })
  })
})

describe('TrainingAttendanceService', () => {
  it('达到课程时长80%时自动形成已学习记录，低于阈值保持待确认', async () => {
    const gateway = {
      listParticipants: vi.fn().mockResolvedValue([
        participant({
          joinedAtSeconds: 1_000,
          leftAtSeconds: 3_900,
        }),
        participant({
          externalRecordKey: 'record-low',
          externalUserId: 'wecom-2',
          externalIdentityKey: 'userid:wecom-2',
          displayName: '同名主播',
          joinedAtSeconds: 1_000,
          leftAtSeconds: 2_000,
        }),
      ]),
    }
    const tx = {
      trainingAttendanceRecord: {
        upsert: vi
          .fn()
          .mockResolvedValueOnce({ id: 'attendance-1' })
          .mockResolvedValueOnce({ id: 'attendance-2' }),
      },
      trainingRegistration: {
        update: vi.fn().mockResolvedValue({}),
      },
      trainingLearningProgress: {
        upsert: vi.fn().mockResolvedValue({}),
      },
    }
    const prisma = {
      trainingMeeting: {
        findUnique: vi.fn().mockResolvedValue({
          externalMeetingId: 'meeting-1',
          session: {
            id: 'session-1',
            courseId: 'course-1',
            scheduledStartAt: new Date('2026-07-24T10:00:00.000Z'),
            scheduledEndAt: new Date('2026-07-24T11:00:00.000Z'),
            registrations: roster,
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      trainingAttendanceImport: {
        upsert: vi.fn().mockResolvedValue({ id: 'import-1' }),
        update: vi.fn().mockResolvedValue({}),
      },
      trainingAttendanceRawRecord: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      $transaction: vi.fn(async (callback) => callback(tx)),
    }
    const access = {
      requireAnyRole: vi.fn(),
    }
    const service = new TrainingAttendanceService(
      prisma as never,
      access as never,
      gateway as never,
    )
    const currentUser = {
      accountId: 'teacher-1',
      wecomUserId: 'teacher-uid',
      name: '培训老师',
      avatarUrl: null,
      role: 'training_teacher' as const,
      roles: ['training_teacher' as const],
      loginType: 'wecom_staff' as const,
    }

    const result = await service.syncFromTencentMeeting(
      currentUser,
      'session-1',
    )

    expect(result.summary).toEqual({
      matched: 2,
      conflicts: 0,
      unmatched: 0,
      learned: 1,
      pendingConfirmation: 1,
    })
    expect(tx.trainingRegistration.update).toHaveBeenCalledTimes(1)
    expect(tx.trainingLearningProgress.upsert).toHaveBeenCalledTimes(1)
  })
})
