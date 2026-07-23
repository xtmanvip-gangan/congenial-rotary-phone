import { BadRequestException, NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { OnboardingService } from './onboarding.service.js'

const operatorUser = {
  accountId: 'operator-1',
  wecomUserId: 'operator-uid',
  name: '运营A',
  avatarUrl: null,
  role: 'operator' as const,
  roles: ['operator' as const],
  loginType: 'wecom_staff' as const,
}

describe('OnboardingService', () => {
  it('rejects an anchor outside the current operator data scope', async () => {
    const prisma = {
      anchorProfile: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const access = {
      requireAnyRole: vi.fn(),
    }
    const service = new OnboardingService(prisma as never, access as never)

    await expect(service.getProgress(operatorUser, 'anchor-2')).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('does not allow skipping an incomplete prerequisite milestone', async () => {
    const prisma = {
      anchorProfile: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'anchor-1',
          anchorDisplayName: '小鹿',
          onboardingProgress: {
            id: 'progress-1',
            milestones: [
              {
                type: 'operator_received',
                status: 'completed',
              },
              {
                type: 'homepage_ready',
                status: 'pending',
              },
            ],
          },
        }),
      },
    }
    const access = {
      requireAnyRole: vi.fn(),
    }
    const service = new OnboardingService(prisma as never, access as never)

    await expect(
      service.completeMilestone(operatorUser, 'anchor-1', 'live_software_ready', {
        note: '软件已安装',
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('lazily initializes progress for an already-confirmed legacy profile', async () => {
    const initialized = {
      id: 'anchor-legacy',
      anchorDisplayName: '旧主播',
      onboardingProgress: {
        id: 'progress-legacy',
        currentStage: 'operator_received',
        firstLiveAt: null,
        firstReviewCompletedAt: null,
        milestones: [
          {
            id: 'milestone-1',
            type: 'operator_received',
            status: 'completed',
            completedAt: new Date('2026-07-23T10:00:00.000Z'),
            note: null,
          },
        ],
      },
    }
    const prisma = {
      anchorProfile: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'anchor-legacy',
            anchorDisplayName: '旧主播',
            onboardingProgress: null,
          })
          .mockResolvedValueOnce(initialized),
      },
      anchorOnboardingProgress: {
        upsert: vi.fn().mockResolvedValue({}),
      },
    }
    const service = new OnboardingService(
      prisma as never,
      { requireAnyRole: vi.fn() } as never,
    )

    const result = await service.getProgress(operatorUser, 'anchor-legacy')

    expect(prisma.anchorOnboardingProgress.upsert).toHaveBeenCalled()
    expect(result.item.anchor.id).toBe('anchor-legacy')
  })

  it('records first-live time only after pre-live preparation is complete', async () => {
    const tx = {
      anchorOnboardingMilestone: {
        update: vi.fn().mockResolvedValue({}),
      },
      anchorOnboardingProgress: {
        update: vi.fn().mockResolvedValue({}),
      },
    }
    const prisma = {
      anchorProfile: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'anchor-1',
          onboardingProgress: {
            id: 'progress-1',
            milestones: [
              { type: 'prelive_check_completed', status: 'completed' },
              { type: 'first_live_completed', status: 'pending' },
            ],
          },
        }),
      },
      $transaction: vi.fn(async (callback) => callback(tx)),
    }
    const access = {
      requireAnyRole: vi.fn(),
    }
    const service = new OnboardingService(prisma as never, access as never)

    await service.completeFirstLive(operatorUser, 'anchor-1', {
      firstLiveAt: '2026-07-23T11:00:00.000Z',
      note: '已独立完成首播',
    })

    expect(tx.anchorOnboardingProgress.update).toHaveBeenCalledWith({
      where: { id: 'progress-1' },
      data: expect.objectContaining({
        firstLiveAt: new Date('2026-07-23T11:00:00.000Z'),
        currentStage: 'first_live_completed',
      }),
    })
  })
})
