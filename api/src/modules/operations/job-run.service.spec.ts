import { describe, expect, it, vi } from 'vitest'
import { JobRunService } from './job-run.service.js'

describe('JobRunService', () => {
  it('同一任务幂等键已成功时直接返回已有结果', async () => {
    const existing = {
      id: 'run-1',
      status: 'succeeded',
      scannedCount: 3,
      successCount: 3,
      failureCount: 0,
    }
    const prisma = {
      systemJobRun: {
        findUnique: vi.fn().mockResolvedValue(existing),
        create: vi.fn(),
        update: vi.fn(),
      },
    }
    const service = new JobRunService(prisma as never)
    const operation = vi.fn()

    const result = await service.run(
      {
        jobCode: 'training.one_hour_reminders',
        idempotencyKey: '2026-07-23T11',
        triggeredBy: 'admin-1',
      },
      operation,
    )

    expect(result).toEqual(existing)
    expect(operation).not.toHaveBeenCalled()
    expect(prisma.systemJobRun.create).not.toHaveBeenCalled()
  })

  it('成功执行后保存计数和结束时间', async () => {
    const prisma = {
      systemJobRun: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'run-1' }),
        update: vi.fn().mockImplementation(({ data }) => ({
          id: 'run-1',
          ...data,
        })),
      },
    }
    const service = new JobRunService(prisma as never)

    const result = await service.run(
      {
        jobCode: 'training.one_hour_reminders',
        idempotencyKey: '2026-07-23T11',
        triggeredBy: 'admin-1',
      },
      async () => ({ scanned: 4, succeeded: 3, failed: 1 }),
    )

    expect(result.status).toBe('partial')
    expect(prisma.systemJobRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({
        status: 'partial',
        scannedCount: 4,
        successCount: 3,
        failureCount: 1,
        finishedAt: expect.any(Date),
      }),
    })
  })

  it('失败时只保存脱敏后的错误摘要', async () => {
    const prisma = {
      systemJobRun: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'run-1' }),
        update: vi.fn().mockResolvedValue({}),
      },
    }
    const service = new JobRunService(prisma as never)

    await expect(
      service.run(
        {
          jobCode: 'training.sync_attendance',
          idempotencyKey: 'session-1',
          triggeredBy: 'admin-1',
        },
        async () => {
          throw new Error(
            'request failed SECRET_KEY=top-secret Authorization: Bearer abcdef',
          )
        },
      ),
    ).rejects.toThrow('request failed')

    expect(prisma.systemJobRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({
        status: 'failed',
        lastError: expect.not.stringContaining('top-secret'),
      }),
    })
    const update = prisma.systemJobRun.update.mock.calls[0][0]
    expect(update.data.lastError).not.toContain('abcdef')
  })
})
