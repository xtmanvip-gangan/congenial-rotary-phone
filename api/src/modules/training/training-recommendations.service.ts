import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service.js'
import { AccessService } from '../access/access.service.js'
import type { AuthenticatedUser } from '../auth/auth.types.js'
import type { CreateTrainingRecommendationDto } from './dto/create-recommendation.dto.js'

export function systemRecommendationSequences(
  learnedSequences: number[],
) {
  const learned = new Set(learnedSequences)
  if (![1, 2, 3].every((sequence) => learned.has(sequence))) {
    return [1, 2, 3]
  }
  return [4, 5, 6, 7].filter((sequence) => !learned.has(sequence))
}

@Injectable()
export class TrainingRecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async listMine(currentUser: AuthenticatedUser) {
    const profile = await this.requireAnchorProfile(currentUser)
    await this.ensureSystemRecommendations(profile.id)
    const items = await this.prisma.trainingCourseRecommendation.findMany({
      where: { anchorProfileId: profile.id },
      include: {
        course: true,
        recommendedByAccount: {
          select: { id: true, displayName: true },
        },
      },
      orderBy: [{ completedAt: 'asc' }, { createdAt: 'desc' }],
    })
    return { items }
  }

  async markMineViewed(currentUser: AuthenticatedUser) {
    const profile = await this.requireAnchorProfile(currentUser)
    await this.prisma.trainingCourseRecommendation.updateMany({
      where: { anchorProfileId: profile.id, viewedAt: null },
      data: { viewedAt: new Date() },
    })
    return { ok: true }
  }

  async create(
    currentUser: AuthenticatedUser,
    dto: CreateTrainingRecommendationDto,
  ) {
    const source = await this.resolveStaffSource(currentUser)
    const profile = await this.prisma.anchorProfile.findFirst({
      where: {
        id: dto.anchorProfileId,
        status: 'active',
        ...(source === 'operator'
          ? {
              currentOperatorId: currentUser.accountId ?? '',
              assignmentStatus: 'confirmed',
            }
          : {}),
      },
    })
    if (!profile) {
      throw new ForbiddenException('只能为有权限查看的有效主播推荐课程')
    }
    const course = await this.prisma.trainingCourse.findFirst({
      where: { id: dto.courseId, status: 'active' },
    })
    if (!course) throw new NotFoundException('未找到有效课程')
    const item = await this.prisma.trainingCourseRecommendation.upsert({
      where: {
        anchorProfileId_courseId_source: {
          anchorProfileId: profile.id,
          courseId: course.id,
          source,
        },
      },
      create: {
        anchorProfileId: profile.id,
        courseId: course.id,
        source,
        recommendedByAccountId: currentUser.accountId,
        reason: dto.reason?.trim() || null,
      },
      update: {
        recommendedByAccountId: currentUser.accountId,
        reason: dto.reason?.trim() || null,
        viewedAt: null,
        completedAt: null,
      },
      include: { course: true },
    })
    return { item }
  }

  async markRegistered(anchorProfileId: string, courseId: string) {
    await this.prisma.trainingCourseRecommendation.updateMany({
      where: { anchorProfileId, courseId, registeredAt: null },
      data: { registeredAt: new Date() },
    })
  }

  async markCompleted(anchorProfileId: string, courseId: string) {
    const now = new Date()
    await this.prisma.trainingCourseRecommendation.updateMany({
      where: { anchorProfileId, courseId },
      data: { completedAt: now },
    })
  }

  private async ensureSystemRecommendations(anchorProfileId: string) {
    const progress = await this.prisma.trainingLearningProgress.findMany({
      where: {
        anchorProfileId,
        status: 'learned',
        course: { sequence: { in: [1, 2, 3, 4, 5, 6, 7] } },
      },
      include: { course: { select: { sequence: true } } },
    })
    const sequences = systemRecommendationSequences(
      progress
        .map((item) => item.course.sequence)
        .filter((value): value is number => value != null),
    )
    const courses = await this.prisma.trainingCourse.findMany({
      where: { status: 'active', sequence: { in: sequences } },
      select: { id: true },
    })
    await this.prisma.trainingCourseRecommendation.createMany({
      data: courses.map((course) => ({
        anchorProfileId,
        courseId: course.id,
        source: 'system',
        reason:
          sequences.some((sequence) => sequence <= 3)
            ? '新主播基础必修课程'
            : '根据当前学习进度推荐的下一阶段课程',
      })),
      skipDuplicates: true,
    })
  }

  private async requireAnchorProfile(currentUser: AuthenticatedUser) {
    if (
      currentUser.role !== 'anchor' ||
      currentUser.loginType !== 'wecom_miniapp'
    ) {
      throw new ForbiddenException('只有主播可以查看个人课程推荐')
    }
    const profile = await this.prisma.anchorProfile.findFirst({
      where: {
        status: 'active',
        wecomUser: { wecomUserId: currentUser.wecomUserId },
      },
    })
    if (!profile) throw new ForbiddenException('主播档案尚未激活')
    return profile
  }

  private async resolveStaffSource(currentUser: AuthenticatedUser) {
    if (currentUser.role === 'super_admin') {
      await this.access.requirePasswordSuperAdmin(currentUser)
      return 'training_staff' as const
    }
    if (currentUser.loginType !== 'wecom_staff') {
      throw new ForbiddenException('当前账号不能推荐课程')
    }
    if (currentUser.roles.includes('operator')) {
      await this.access.requireAnyRole(currentUser, ['operator'])
      return 'operator' as const
    }
    await this.access.requireAnyRole(currentUser, [
      'training_teacher',
      'training_admin',
    ])
    return 'training_staff' as const
  }
}
