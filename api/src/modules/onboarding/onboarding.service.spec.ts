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
