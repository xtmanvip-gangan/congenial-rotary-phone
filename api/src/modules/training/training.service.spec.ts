import { ForbiddenException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { TrainingOutcomeDto } from './dto/complete-registration.dto.js'
import { TrainingService } from './training.service.js'

const anchorUser = {
  accountId: null,
  wecomUserId: 'anchor-uid',
  name: '主播企微名',
  avatarUrl: null,
  role: 'anchor' as const,
  roles: ['anchor' as const],
  loginType: 'wecom_miniapp' as const,
  anchorProfileStatus: 'pending_confirmation' as const,
}

const operatorUser = {
  accountId: 'operator-1',
  wecomUserId: 'operator-uid',
  name: '运营A',
  avatarUrl: null,
  role: 'operator' as const,
  roles: ['operator' as const],
  loginType: 'wecom_staff' as const,
}

const trainingTeacher = {
  accountId: 'teacher-1',
  wecomUserId: 'teacher-uid',
  name: '培训老师',
  avatarUrl: null,
  role: 'training_teacher' as const,
  roles: ['training_teacher' as const],
  loginType: 'wecom_staff' as const,
}

function futureSession(capacity = 3) {
  return {
    id: 'session-1',
    courseId: 'course-1',
    capacity,
    status: 'published',
    scheduledStartAt: new Date('2099-07-24T10:00:00.000Z'),
    course: { id: 'course-1', title: '课程1' },
  }
}

describe('TrainingService', () => {
  it('allows an activated anchor with pending operator confirmation to register', async () => {
    const tx = {
      trainingRegistration: {
        findUnique: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(1),
        upsert: vi.fn().mockResolvedValue({
          id: 'registration-1',
          status: 'registered',
        }),
      },
      trainingLearningProgress: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
      },
    }
    const prisma = {
      anchorProfile: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'anchor-1',
          anchorDisplayName: '小鹿',
          currentOperatorId: 'operator-1',
          assignmentStatus: 'pending_confirmation',
          currentOperator: { id: 'operator-1', displayName: '运营A' },
        }),
      },
      trainingSession: {
        findFirst: vi.fn().mockResolvedValue(futureSession()),
      },
      $transaction: vi.fn(async (callback) => callback(tx)),
    }
    const service = new TrainingService(prisma as never, {} as never)

    const result = await service.registerSelf(anchorUser, 'session-1')

    expect(result.item.status).toBe('registered')
    expect(tx.trainingRegistration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          anchorProfileId: 'anchor-1',
          source: 'anchor',
          status: 'registered',
        }),
      }),
    )
  })

  it('puts the anchor on the waitlist when the session is full', async () => {
    const tx = {
      trainingRegistration: {
        findUnique: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(2),
        aggregate: vi.fn().mockResolvedValue({
          _max: { waitlistPosition: 4 },
        }),
        upsert: vi.fn().mockResolvedValue({
          id: 'registration-2',
          status: 'waitlisted',
          waitlistPosition: 5,
        }),
      },
      trainingLearningProgress: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
      },
    }
    const prisma = {
      anchorProfile: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'anchor-1',
          anchorDisplayName: '小鹿',
          currentOperatorId: 'operator-1',
          assignmentStatus: 'confirmed',
          currentOperator: { id: 'operator-1', displayName: '运营A' },
        }),
      },
      trainingSession: {
        findFirst: vi.fn().mockResolvedValue(futureSession(2)),
      },
      $transaction: vi.fn(async (callback) => callback(tx)),
    }
    const service = new TrainingService(prisma as never, {} as never)

    const result = await service.registerSelf(
      { ...anchorUser, anchorProfileStatus: 'active' },
      'session-1',
    )

    expect(result.item.status).toBe('waitlisted')
    expect(result.item.waitlistPosition).toBe(5)
  })

  it('prevents an operator from registering another operator’s anchor', async () => {
    const prisma = {
      anchorProfile: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const access = {
      requireAnyRole: vi.fn(),
    }
    const service = new TrainingService(prisma as never, access as never)

    await expect(
      service.registerForAnchor(operatorUser, 'anchor-2', 'session-1'),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('promotes the earliest waitlisted anchor when a registered anchor cancels', async () => {
    const tx = {
      trainingRegistration: {
        update: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue({
          id: 'waitlist-1',
          status: 'waitlisted',
        }),
      },
      trainingLearningProgress: {
        updateMany: vi.fn().mockResolvedValue({}),
      },
    }
    const prisma = {
      anchorProfile: {
        findFirst: vi.fn().mockResolvedValue({ id: 'anchor-1' }),
      },
      trainingRegistration: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'registration-1',
          anchorProfileId: 'anchor-1',
          status: 'registered',
          session: futureSession(),
        }),
      },
      $transaction: vi.fn(async (callback) => callback(tx)),
    }
    const service = new TrainingService(prisma as never, {} as never)

    await service.cancelSelf(anchorUser, 'registration-1')

    expect(tx.trainingRegistration.update).toHaveBeenCalledWith({
      where: { id: 'waitlist-1' },
      data: expect.objectContaining({
        status: 'registered',
        waitlistPosition: null,
      }),
    })
  })

  it('records learned outcome without overwriting the first completion time later', async () => {
    const tx = {
      trainingRegistration: {
        update: vi.fn().mockResolvedValue({}),
      },
      trainingLearningProgress: {
        upsert: vi.fn().mockResolvedValue({}),
      },
    }
    const prisma = {
      trainingRegistration: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'registration-1',
          anchorProfileId: 'anchor-1',
          learningType: 'first_learning',
          session: {
            courseId: 'course-1',
            status: 'ended',
          },
        }),
      },
      $transaction: vi.fn(async (callback) => callback(tx)),
    }
    const access = {
      requireAnyRole: vi.fn(),
    }
    const service = new TrainingService(prisma as never, access as never)

    await service.recordOutcome(trainingTeacher, 'registration-1', {
      status: TrainingOutcomeDto.learned,
      reason: '完成课程和答疑',
    })

    expect(tx.trainingLearningProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          firstLearnedAt: expect.any(Date),
          status: 'learned',
        }),
        update: expect.not.objectContaining({
          firstLearnedAt: expect.anything(),
        }),
      }),
    )
  })
})
