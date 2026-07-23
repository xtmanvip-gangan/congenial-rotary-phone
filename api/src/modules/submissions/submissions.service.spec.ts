import { describe, expect, it, vi } from 'vitest'
import { SubmissionsService } from './submissions.service.js'

const anchorUser = {
  accountId: null,
  wecomUserId: 'anchor-uid',
  name: '主播企微名',
  avatarUrl: null,
  role: 'anchor' as const,
  roles: ['anchor' as const],
  loginType: 'wecom_miniapp' as const,
  anchorProfileStatus: 'active' as const,
}

const dto = {
  activityId: 'activity-1',
  anchorName: '伪造主播名',
  operatorId: 'fake-operator',
  liveDate: '2026-07-23',
  liveStartTime: '18:00',
  items: [{ itemName: '礼物A', quantity: 1 }],
  attachmentUrls: ['/api/uploads/submission-proofs/a.png'],
}

function makeService(assignmentStatus: 'confirmed' | 'pending_confirmation') {
  const prisma = {
    anchorProfile: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'profile-1',
        anchorDisplayName: '小鹿',
        assignmentStatus,
        currentOperatorId: 'operator-1',
        currentOperator: {
          id: 'operator-1',
          displayName: '运营A',
          status: 'active',
        },
        assignments: [
          {
            id: 'assignment-1',
            operatorId: 'operator-1',
            status: assignmentStatus,
          },
        ],
      }),
    },
    submission: {
      create: vi.fn().mockResolvedValue({ id: 'submission-1' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  }
  const notifications = {
    notifySubmissionCreated: vi.fn(),
  }
  const service = new SubmissionsService(
    prisma as never,
    {} as never,
    notifications as never,
  )

  vi.spyOn(service as any, 'findActiveActivity').mockResolvedValue({
    id: 'activity-1',
    startAt: new Date('2026-07-01T00:00:00.000Z'),
    endAt: new Date('2026-07-31T23:59:59.000Z'),
  })
  vi.spyOn(service as any, 'ensureAnchorUser').mockResolvedValue({
    id: 'wecom-record-1',
  })
  vi.spyOn(service as any, 'ensurePkSubmissionSlotAvailable').mockResolvedValue(
    undefined,
  )
  vi.spyOn(service as any, 'buildSubmissionPayload').mockResolvedValue({
    submissionItems: [{ itemId: null, itemName: '礼物A', quantity: 1 }],
    rewardSnapshot: null,
  })
  vi.spyOn(service as any, 'formatSubmission').mockReturnValue({
    id: 'submission-1',
  })
  vi.spyOn(service as any, 'buildNotificationPayload').mockReturnValue({
    submissionId: 'submission-1',
  })

  return { service, prisma, notifications }
}

describe('SubmissionsService fixed operator assignment', () => {
  it('ignores spoofed client identity and binds a confirmed profile assignment', async () => {
    const { service, prisma, notifications } = makeService('confirmed')

    await service.createSubmission(anchorUser, dto)

    expect(prisma.submission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          anchorName: '小鹿',
          operatorId: 'operator-1',
          anchorProfileId: 'profile-1',
          operatorAssignmentId: 'assignment-1',
          anchorDisplayNameSnapshot: '小鹿',
          operatorNameSnapshot: '运营A',
          operatorAssignmentStatus: 'confirmed',
        }),
      }),
    )
    expect(notifications.notifySubmissionCreated).toHaveBeenCalled()
  })

  it('saves a pending-assignment record without notifying the operator', async () => {
    const { service, prisma, notifications } = makeService(
      'pending_confirmation',
    )

    await service.createSubmission(anchorUser, dto)

    expect(prisma.submission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operatorId: 'operator-1',
          operatorAssignmentStatus: 'pending_confirmation',
        }),
      }),
    )
    expect(notifications.notifySubmissionCreated).not.toHaveBeenCalled()
  })

  it('excludes pending-assignment records from staff processing lists', async () => {
    const { service, prisma } = makeService('confirmed')
    vi.spyOn(service as any, 'ensureAdmin').mockResolvedValue({
      id: 'operator-1',
    })

    await service.listAdminSubmissions({
      ...anchorUser,
      accountId: 'operator-1',
      role: 'operator',
      roles: ['operator'],
      loginType: 'wecom_staff',
    })

    expect(prisma.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          operatorId: 'operator-1',
          operatorAssignmentStatus: 'confirmed',
        },
      }),
    )
  })
})
