import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service.js'
import { AccessService } from '../access/access.service.js'
import type { AuthenticatedUser } from '../auth/auth.types.js'
import { sanitizeError } from './job-run.service.js'

type CaptureIncidentInput = {
  provider: string
  operation: string
  businessType?: string | null
  businessId?: string | null
  severity?: 'warning' | 'error' | 'critical'
  errorCode?: string | null
  error: unknown
}

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  capture(input: CaptureIncidentInput) {
    const dedupeKey = incidentKey(input)
    const now = new Date()
    const errorMessage = sanitizeError(input.error)
    return this.prisma.integrationIncident.upsert({
      where: { dedupeKey },
      create: {
        provider: input.provider,
        operation: input.operation,
        businessType: input.businessType ?? null,
        businessId: input.businessId ?? null,
        dedupeKey,
        severity: input.severity ?? 'error',
        errorCode: input.errorCode ?? null,
        errorMessage,
        firstOccurredAt: now,
        lastOccurredAt: now,
      },
      update: {
        status: 'open',
        severity: input.severity ?? 'error',
        occurrenceCount: { increment: 1 },
        errorCode: input.errorCode ?? null,
        errorMessage,
        lastOccurredAt: now,
        resolvedAt: null,
        resolvedBy: null,
        resolutionNote: null,
      },
    })
  }

  recover(input: Omit<CaptureIncidentInput, 'error' | 'severity' | 'errorCode'>) {
    return this.prisma.integrationIncident.updateMany({
      where: { dedupeKey: incidentKey(input), status: 'open' },
      data: { status: 'recovered', resolvedAt: new Date() },
    })
  }

  async list(
    user: AuthenticatedUser,
    status?: 'open' | 'recovered' | 'closed',
  ) {
    await this.requireOperationsAccess(user)
    return {
      items: await this.prisma.integrationIncident.findMany({
        where: status ? { status } : undefined,
        orderBy: { lastOccurredAt: 'desc' },
        take: 100,
      }),
    }
  }

  async close(
    user: AuthenticatedUser,
    incidentId: string,
    reason: string,
  ) {
    await this.requireOperationsAccess(user)
    const incident = await this.prisma.integrationIncident.findUnique({
      where: { id: incidentId },
    })
    if (!incident) throw new NotFoundException('未找到该接口异常')
    const closed = await this.prisma.integrationIncident.update({
      where: { id: incidentId },
      data: {
        status: 'closed',
        resolvedAt: new Date(),
        resolvedBy: user.accountId ?? user.wecomUserId,
        resolutionNote: reason,
      },
    })
    await this.prisma.systemAuditLog.create({
      data: {
        actorId: user.accountId ?? user.wecomUserId,
        actorRole: user.role,
        loginType: user.loginType,
        action: 'integration_incident.close',
        objectType: 'integration_incident',
        objectId: incidentId,
        beforeSnapshot: { status: incident.status },
        afterSnapshot: { status: 'closed' },
        reason,
      },
    })
    return closed
  }

  async requireOperationsAccess(user: AuthenticatedUser) {
    if (user.role === 'super_admin') {
      await this.access.requirePasswordSuperAdmin(user)
      return
    }
    if (user.loginType !== 'wecom_staff') {
      throw new ForbiddenException('当前账号没有运维中心权限')
    }
    await this.access.requireAnyRole(user, ['training_admin'])
  }
}

function incidentKey(
  input: Pick<
    CaptureIncidentInput,
    'provider' | 'operation' | 'businessType' | 'businessId'
  >,
) {
  return [
    input.provider,
    input.operation,
    input.businessType ?? 'system',
    input.businessId ?? 'global',
  ].join(':')
}
