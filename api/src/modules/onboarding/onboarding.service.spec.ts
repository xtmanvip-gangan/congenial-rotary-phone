import { describe, expect, it, vi } from 'vitest'
import { OnboardingService } from './onboarding.service.js'

const operator = {
  accountId: 'operator-1',
  wecomUserId: 'op-uid',
  name: '运营A',
  avatarUrl: null,
  role: 'operator' as const,
  roles: ['operator' as const],
  loginType: 'wecom_staff' as const,
}

function baseMilestone(type: string, status = 'pending') {
  return {
    id: `m-${type}`,
    type,
    status,
    completedAt: status === 'completed' ? new Date() : null,
    note: null,
    evidence: null,
    attachmentUrls: [],
    submittedAt: null,
    submittedBy: null,
    anchorConfirmedAt: null,
    anchorRejectedAt: null,
    rejectReason: null,
  }
}

function progressWith(milestones: ReturnType<typeof baseMilestone>[]) {
  return {
    id: 'progress-1',
    currentStage: 'initial_communication',
    firstLiveAt: null,
    firstReviewCompletedAt: null,
    milestones,
  }
}

describe('OnboardingService', () => {
  it('rejects screenshot milestone without attachments', async () => {
    const milestones = [
      baseMilestone('initial_communication', 'completed'),
      baseMilestone('homepage_ready'),
      baseMilestone('live_software_ready'),
      baseMilestone('helper_software_ready'),
      baseMilestone('prejob_learning_completed'),
      baseMilestone('first_live_completed'),
      baseMilestone('first_live_review_completed'),
    ]
    const prisma = {
      anchorProfile: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'anchor-1',
          anchorDisplayName: '主播A',
          onboardingProgress: progressWith(milestones),
        }),
      },
      anchorOnboardingMilestone: {
        findMany: vi.fn().mockResolvedValue(milestones.map((m) => ({ type: m.type }))),
      },
    }
    const access = {
      requireAnyRole: vi.fn().mockResolvedValue(undefined),
    }
    const service = new OnboardingService(prisma as never, access as never)

    await expect(
      service.submitMilestone(operator, 'anchor-1', 'homepage_ready', {
        attachmentUrls: [],
      }),
    ).rejects.toThrow(/截图/)
  })

  it('requires full initial communication form', async () => {
    const milestones = [
      baseMilestone('initial_communication'),
      baseMilestone('homepage_ready'),
      baseMilestone('live_software_ready'),
      baseMilestone('helper_software_ready'),
      baseMilestone('prejob_learning_completed'),
      baseMilestone('first_live_completed'),
      baseMilestone('first_live_review_completed'),
    ]
    const prisma = {
      anchorProfile: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'anchor-1',
          anchorDisplayName: '主播A',
          onboardingProgress: progressWith(milestones),
        }),
      },
      anchorOnboardingMilestone: {
        findMany: vi.fn().mockResolvedValue(milestones.map((m) => ({ type: m.type }))),
      },
    }
    const access = {
      requireAnyRole: vi.fn().mockResolvedValue(undefined),
    }
    const service = new OnboardingService(prisma as never, access as never)

    await expect(
      service.submitMilestone(operator, 'anchor-1', 'initial_communication', {
        evidence: { communicatedAt: '2026-07-24T10:00' },
      }),
    ).rejects.toThrow(/请填写/)
  })
})
