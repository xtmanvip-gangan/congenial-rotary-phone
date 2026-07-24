import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { OnboardingMilestoneType } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service.js'
import { AccessService } from '../access/access.service.js'
import type { AuthenticatedUser } from '../auth/auth.types.js'
import type { CompleteFirstLiveDto } from './dto/complete-first-live.dto.js'
import type { CompleteFirstLiveReviewDto } from './dto/complete-first-live-review.dto.js'
import type { UpdateMilestoneDto } from './dto/update-milestone.dto.js'

export const ONBOARDING_MILESTONES: OnboardingMilestoneType[] = [
  'operator_received',
  'homepage_ready',
  'live_software_ready',
  'helper_software_ready',
  'prejob_learning_completed',
  'prelive_check_completed',
  'first_live_completed',
  'first_live_review_completed',
]

const progressInclude = {
  onboardingProgress: {
    include: {
      milestones: true,
    },
  },
} as const

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async getProgress(currentUser: AuthenticatedUser, anchorId: string) {
    const anchor = await this.findOwnedAnchor(currentUser, anchorId)
    return { item: this.formatProgress(anchor) }
  }

  async completeMilestone(
    currentUser: AuthenticatedUser,
    anchorId: string,
    type: string,
    dto: UpdateMilestoneDto,
  ) {
    if (!ONBOARDING_MILESTONES.includes(type as OnboardingMilestoneType)) {
      throw new BadRequestException('未知的岗前节点')
    }
    if (type === 'first_live_completed' || type === 'first_live_review_completed') {
      throw new BadRequestException('请使用首播或首播复盘专用操作')
    }

    const anchor = await this.findOwnedAnchor(currentUser, anchorId)
    const progress = this.requireProgress(anchor)
    const milestoneType = type as OnboardingMilestoneType
    this.assertPreviousCompleted(progress.milestones, milestoneType)
    const target = progress.milestones.find((item: any) => item.type === milestoneType)

    if (!target) {
      throw new NotFoundException('未找到对应岗前节点')
    }
    if (target.status === 'completed') {
      return { item: this.formatProgress(anchor) }
    }

    const now = new Date()
    await this.prisma.$transaction([
      this.prisma.anchorOnboardingMilestone.update({
        where: { id: target.id },
        data: {
          status: 'completed',
          completedAt: now,
          completedBy: currentUser.wecomUserId,
          note: dto.note?.trim() || null,
        },
      }),
      this.prisma.anchorOnboardingProgress.update({
        where: { id: progress.id },
        data: { currentStage: milestoneType },
      }),
    ])

    return this.getProgress(currentUser, anchorId)
  }

  async completeFirstLive(
    currentUser: AuthenticatedUser,
    anchorId: string,
    dto: CompleteFirstLiveDto,
  ) {
    const firstLiveAt = new Date(dto.firstLiveAt)
    if (Number.isNaN(firstLiveAt.getTime())) {
      throw new BadRequestException('首播时间格式不正确')
    }
    const anchor = await this.findOwnedAnchor(currentUser, anchorId)
    const progress = this.requireProgress(anchor)
    this.assertPreviousCompleted(progress.milestones, 'first_live_completed')
    const target = this.requireMilestone(progress.milestones, 'first_live_completed')
    const now = new Date()

    await this.prisma.$transaction(async (tx) => {
      await tx.anchorOnboardingMilestone.update({
        where: { id: target.id },
        data: {
          status: 'completed',
          completedAt: now,
          completedBy: currentUser.wecomUserId,
          note: dto.note?.trim() || null,
        },
      })
      await tx.anchorOnboardingProgress.update({
        where: { id: progress.id },
        data: {
          currentStage: 'first_live_completed',
          firstLiveAt,
          firstLiveBlockedReason: null,
        },
      })
    })

    return this.getProgress(currentUser, anchorId)
  }

  async completeFirstLiveReview(
    currentUser: AuthenticatedUser,
    anchorId: string,
    dto: CompleteFirstLiveReviewDto,
  ) {
    const note = dto.note.trim()
    if (!note) {
      throw new BadRequestException('请填写首播复盘结论')
    }
    const anchor = await this.findOwnedAnchor(currentUser, anchorId)
    const progress = this.requireProgress(anchor)
    this.assertPreviousCompleted(progress.milestones, 'first_live_review_completed')
    const target = this.requireMilestone(
      progress.milestones,
      'first_live_review_completed',
    )
    const now = new Date()

    await this.prisma.$transaction([
      this.prisma.anchorOnboardingMilestone.update({
        where: { id: target.id },
        data: {
          status: 'completed',
          completedAt: now,
          completedBy: currentUser.wecomUserId,
          note,
        },
      }),
      this.prisma.anchorOnboardingProgress.update({
        where: { id: progress.id },
        data: {
          currentStage: 'first_live_review_completed',
          firstReviewCompletedAt: now,
        },
      }),
    ])

    return this.getProgress(currentUser, anchorId)
  }

  private async findOwnedAnchor(
    currentUser: AuthenticatedUser,
    anchorId: string,
  ) {
    await this.access.requireAnyRole(currentUser, ['operator'])
    const globalView =
      currentUser.role === 'super_admin' &&
      currentUser.loginType === 'password_admin'
    const ownershipWhere = {
      id: anchorId,
      assignmentStatus: 'confirmed' as const,
      ...(globalView ? {} : { currentOperatorId: currentUser.accountId ?? '' }),
    }

    let anchor = await this.prisma.anchorProfile.findFirst({
      where: ownershipWhere,
      include: progressInclude,
    })

    if (!anchor) {
      throw new NotFoundException(
        globalView ? '未找到该主播' : '未找到归属于当前运营的主播',
      )
    }

    if (!anchor.onboardingProgress) {
      const now = new Date()
      await this.prisma.anchorOnboardingProgress.upsert({
        where: {
          anchorProfileId: anchor.id,
        },
        create: {
          anchorProfileId: anchor.id,
          currentStage: 'operator_received',
          milestones: {
            create: ONBOARDING_MILESTONES.map((type) => ({
              type,
              status: type === 'operator_received' ? 'completed' : 'pending',
              completedAt: type === 'operator_received' ? now : null,
              completedBy:
                type === 'operator_received' ? currentUser.wecomUserId : null,
            })),
          },
        },
        update: {},
      })
      anchor = await this.prisma.anchorProfile.findFirst({
        where: ownershipWhere,
        include: progressInclude,
      })
      if (!anchor) {
        throw new NotFoundException(
          globalView ? '未找到该主播' : '未找到归属于当前运营的主播',
        )
      }
    }

    return anchor
  }

  private requireProgress(anchor: any) {
    if (!anchor.onboardingProgress) {
      throw new NotFoundException('主播岗前进度尚未初始化')
    }
    return anchor.onboardingProgress
  }

  private requireMilestone(milestones: any[], type: OnboardingMilestoneType) {
    const milestone = milestones.find((item) => item.type === type)
    if (!milestone) {
      throw new NotFoundException('未找到对应岗前节点')
    }
    return milestone
  }

  private assertPreviousCompleted(
    milestones: any[],
    type: OnboardingMilestoneType,
  ) {
    const index = ONBOARDING_MILESTONES.indexOf(type)
    if (index <= 0) return
    const previous = milestones.find(
      (item) => item.type === ONBOARDING_MILESTONES[index - 1],
    )
    if (!previous || previous.status !== 'completed') {
      throw new BadRequestException('请先完成上一个岗前节点')
    }
  }

  private formatProgress(anchor: any) {
    const progress = this.requireProgress(anchor)
    const milestoneMap = new Map(
      progress.milestones.map((item: any) => [item.type, item]),
    )
    return {
      anchor: {
        id: anchor.id,
        anchorDisplayName: anchor.anchorDisplayName ?? '',
      },
      currentStage: progress.currentStage,
      firstLiveAt: progress.firstLiveAt?.toISOString() ?? null,
      firstReviewCompletedAt:
        progress.firstReviewCompletedAt?.toISOString() ?? null,
      milestones: ONBOARDING_MILESTONES.map((type) => {
        const item: any = milestoneMap.get(type)
        return {
          id: item?.id ?? null,
          type,
          status: item?.status ?? 'pending',
          completedAt: item?.completedAt?.toISOString() ?? null,
          note: item?.note ?? null,
        }
      }),
    }
  }
}
