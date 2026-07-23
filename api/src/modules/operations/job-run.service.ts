import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service.js'

type JobCounts = {
  scanned: number
  succeeded: number
  failed: number
  summary?: Prisma.InputJsonValue
}

type JobRunInput = {
  jobCode: string
  idempotencyKey: string
  triggeredBy?: string | null
}

@Injectable()
export class JobRunService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T extends JobCounts>(
    input: JobRunInput,
    operation: () => Promise<T>,
  ) {
    const existing = await this.prisma.systemJobRun.findUnique({
      where: {
        jobCode_idempotencyKey: {
          jobCode: input.jobCode,
          idempotencyKey: input.idempotencyKey,
        },
      },
    })
    if (existing?.status === 'succeeded' || existing?.status === 'partial') {
      return existing
    }

    const run = existing
      ? await this.prisma.systemJobRun.update({
          where: { id: existing.id },
          data: {
            status: 'running',
            attemptCount: { increment: 1 },
            lastError: null,
            finishedAt: null,
            startedAt: new Date(),
          },
        })
      : await this.prisma.systemJobRun.create({
          data: {
            jobCode: input.jobCode,
            idempotencyKey: input.idempotencyKey,
            triggeredBy: input.triggeredBy ?? null,
          },
        })

    try {
      const result = await operation()
      return this.prisma.systemJobRun.update({
        where: { id: run.id },
        data: {
          status: result.failed > 0 ? 'partial' : 'succeeded',
          scannedCount: result.scanned,
          successCount: result.succeeded,
          failureCount: result.failed,
          resultSummary: result.summary,
          lastError: null,
          finishedAt: new Date(),
        },
      })
    } catch (error) {
      const safeError = sanitizeError(error)
      await this.prisma.systemJobRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          lastError: safeError,
          finishedAt: new Date(),
        },
      })
      throw new Error(safeError)
    }
  }

  async list() {
    return {
      items: await this.prisma.systemJobRun.findMany({
        orderBy: { startedAt: 'desc' },
        take: 100,
      }),
    }
  }
}

export function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(
      /(secret(?:_?key|_?id)?|authorization|access[_-]?token|password)\s*[=:]\s*(?:bearer\s+)?[^\s,;]+/gi,
      '$1=[REDACTED]',
    )
    .slice(0, 1000)
}
