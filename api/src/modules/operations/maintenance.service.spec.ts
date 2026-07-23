import { describe, expect, it, vi } from 'vitest'
import { MaintenanceService } from './maintenance.service.js'

describe('MaintenanceService', () => {
  it('清理预览只统计测试业务数据并明确排除员工和活动配置', async () => {
    const prisma = {
      anchorProfile: { count: vi.fn().mockResolvedValue(2) },
      submission: { count: vi.fn().mockResolvedValue(5) },
      reviewLog: { count: vi.fn().mockResolvedValue(3) },
      rewardGrant: { count: vi.fn().mockResolvedValue(1) },
      notificationLog: { count: vi.fn().mockResolvedValue(4) },
    }
    const access = { requirePasswordSuperAdmin: vi.fn() }
    const service = new MaintenanceService(prisma as never, access as never)

    const result = await service.previewCleanup({
      accountId: 'admin-1',
      wecomUserId: 'admin',
      role: 'super_admin',
      roles: ['super_admin'],
      loginType: 'password_admin',
    } as never)

    expect(result.mode).toBe('preview_only')
    expect(result.counts).toEqual({
      anchorProfiles: 2,
      submissions: 5,
      reviewLogs: 3,
      rewardGrants: 1,
      notificationLogs: 4,
    })
    expect(result.excluded).toEqual(
      expect.arrayContaining([
        'operator_accounts',
        'activities',
        'activity_items',
        'reward_rules',
      ]),
    )
    expect(prisma.anchorProfile.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: expect.any(Array),
      }),
    })
  })
})
