import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service.js'
import { AccessService } from '../access/access.service.js'
import type { AuthenticatedUser } from '../auth/auth.types.js'

const testAnchorWhere = {
  OR: [
    { anchorDisplayName: { contains: '测试', mode: 'insensitive' as const } },
    { anchorDisplayName: { startsWith: 'test', mode: 'insensitive' as const } },
    { anchorDisplayName: { startsWith: 'demo', mode: 'insensitive' as const } },
    { source: { in: ['test', 'demo', 'seed'] } },
  ],
}

const testSubmissionWhere = {
  OR: [
    { anchorName: { contains: '测试', mode: 'insensitive' as const } },
    {
      anchorDisplayNameSnapshot: {
        startsWith: 'test',
        mode: 'insensitive' as const,
      },
    },
    { anchorProfile: testAnchorWhere },
  ],
}

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async previewCleanup(user: AuthenticatedUser) {
    await this.access.requirePasswordSuperAdmin(user)
    const [
      anchorProfiles,
      submissions,
      reviewLogs,
      rewardGrants,
      notificationLogs,
    ] = await Promise.all([
      this.prisma.anchorProfile.count({ where: testAnchorWhere }),
      this.prisma.submission.count({ where: testSubmissionWhere }),
      this.prisma.reviewLog.count({
        where: { submission: testSubmissionWhere },
      }),
      this.prisma.rewardGrant.count({
        where: { submission: testSubmissionWhere },
      }),
      this.prisma.notificationLog.count({
        where: {
          OR: [
            { submission: testSubmissionWhere },
            {
              receiverWecomUserId: {
                startsWith: 'test',
                mode: 'insensitive',
              },
            },
          ],
        },
      }),
    ])

    return {
      mode: 'preview_only',
      generatedAt: new Date().toISOString(),
      matchRules: [
        '主播展示名包含“测试”',
        '主播展示名以 test 或 demo 开头',
        '主播档案来源为 test、demo 或 seed',
      ],
      counts: {
        anchorProfiles,
        submissions,
        reviewLogs,
        rewardGrants,
        notificationLogs,
      },
      excluded: [
        'operator_accounts',
        'staff_role_assignments',
        'activity_types',
        'activities',
        'activity_items',
        'reward_rules',
      ],
      warning: '该接口只生成清理预览，不会删除任何数据。',
    }
  }
}
