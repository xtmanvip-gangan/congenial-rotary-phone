import { describe, expect, it, vi } from 'vitest'
import { IncidentsService } from './incidents.service.js'

describe('IncidentsService', () => {
  it('重复外部故障按稳定键归并并增加发生次数', async () => {
    const prisma = {
      integrationIncident: {
        upsert: vi.fn().mockResolvedValue({ id: 'incident-1' }),
      },
    }
    const service = new IncidentsService(prisma as never, {} as never)

    await service.capture({
      provider: 'wecom',
      operation: 'send_message',
      businessType: 'training_registration',
      businessId: 'registration-1',
      error: new Error('SECRET_KEY=hidden request timeout'),
    })

    expect(prisma.integrationIncident.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          dedupeKey:
            'wecom:send_message:training_registration:registration-1',
        },
        update: expect.objectContaining({
          occurrenceCount: { increment: 1 },
          errorMessage: expect.not.stringContaining('hidden'),
          status: 'open',
        }),
      }),
    )
  })

  it('人工关闭异常时写入统一审计日志', async () => {
    const prisma = {
      integrationIncident: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'incident-1',
          status: 'open',
        }),
        update: vi.fn().mockResolvedValue({
          id: 'incident-1',
          status: 'closed',
        }),
      },
      systemAuditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    const access = { requireAnyRole: vi.fn() }
    const service = new IncidentsService(prisma as never, access as never)
    const user = {
      accountId: 'admin-1',
      wecomUserId: 'admin-uid',
      role: 'training_admin',
      roles: ['training_admin'],
      loginType: 'wecom_staff',
      name: '培训管理员',
      avatarUrl: null,
    }

    await service.close(user as never, 'incident-1', '已人工核对并恢复')

    expect(prisma.systemAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'admin-1',
        action: 'integration_incident.close',
        objectId: 'incident-1',
        reason: '已人工核对并恢复',
      }),
    })
  })
})
