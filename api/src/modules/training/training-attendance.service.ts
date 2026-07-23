import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service.js'
import { AccessService } from '../access/access.service.js'
import type { AuthenticatedUser } from '../auth/auth.types.js'
import {
  TENCENT_MEETING_GATEWAY,
  type TencentMeetingGateway,
  type TencentMeetingParticipant,
} from '../integrations/tencent-meeting/tencent-meeting.types.js'
import type {
  AttendanceOutcomeDto,
  ResolveAttendanceMatchDto,
} from './dto/resolve-attendance.dto.js'

type AttendanceRosterItem = {
  id: string
  anchorProfileId: string
  status: string
  anchorNameSnapshot: string
  anchorProfile: {
    wecomUser: {
      wecomUserId: string
      wecomName: string | null
    }
  }
}

type AttendanceMatch = {
  matchStatus: 'matched' | 'conflict' | 'unmatched'
  matchMethod: 'wecom_user_id' | 'wecom_name' | null
  registrationId: string | null
  anchorProfileId: string | null
}

export function aggregateAttendanceIntervals(
  rows: TencentMeetingParticipant[],
) {
  const intervals = rows
    .filter(
      (row) =>
        row.joinedAtSeconds != null &&
        row.leftAtSeconds != null &&
        row.leftAtSeconds > row.joinedAtSeconds,
    )
    .map((row) => ({
      joinedAtSeconds: row.joinedAtSeconds as number,
      leftAtSeconds: row.leftAtSeconds as number,
    }))
    .sort((left, right) => left.joinedAtSeconds - right.joinedAtSeconds)

  const merged: Array<{
    joinedAtSeconds: number
    leftAtSeconds: number
  }> = []
  for (const interval of intervals) {
    const previous = merged.at(-1)
    if (previous && interval.joinedAtSeconds <= previous.leftAtSeconds) {
      previous.leftAtSeconds = Math.max(
        previous.leftAtSeconds,
        interval.leftAtSeconds,
      )
    } else {
      merged.push({ ...interval })
    }
  }
  return {
    intervals: merged,
    totalDurationSeconds: merged.reduce(
      (total, interval) =>
        total + interval.leftAtSeconds - interval.joinedAtSeconds,
      0,
    ),
  }
}

export function matchAttendanceToRoster(
  row: TencentMeetingParticipant,
  roster: AttendanceRosterItem[],
): AttendanceMatch {
  const activeRoster = roster.filter((item) =>
    ['registered', 'needs_makeup'].includes(item.status),
  )
  if (row.externalUserId) {
    const uidMatches = activeRoster.filter(
      (item) =>
        item.anchorProfile.wecomUser.wecomUserId === row.externalUserId,
    )
    if (uidMatches.length === 1) {
      return {
        matchStatus: 'matched',
        matchMethod: 'wecom_user_id',
        registrationId: uidMatches[0].id,
        anchorProfileId: uidMatches[0].anchorProfileId,
      }
    }
    if (uidMatches.length > 1) {
      return {
        matchStatus: 'conflict',
        matchMethod: null,
        registrationId: null,
        anchorProfileId: null,
      }
    }
  }

  const normalizedName = row.displayName.trim()
  const nameMatches = activeRoster.filter(
    (item) =>
      item.anchorProfile.wecomUser.wecomName?.trim() === normalizedName,
  )
  if (nameMatches.length === 1) {
    return {
      matchStatus: 'matched',
      matchMethod: 'wecom_name',
      registrationId: nameMatches[0].id,
      anchorProfileId: nameMatches[0].anchorProfileId,
    }
  }
  return {
    matchStatus: nameMatches.length > 1 ? 'conflict' : 'unmatched',
    matchMethod: null,
    registrationId: null,
    anchorProfileId: null,
  }
}

@Injectable()
export class TrainingAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    @Inject(TENCENT_MEETING_GATEWAY)
    private readonly gateway: TencentMeetingGateway,
  ) {}

  async syncFromTencentMeeting(
    currentUser: AuthenticatedUser,
    sessionId: string,
  ) {
    await this.requireTrainingExecutor(currentUser)
    const meeting = await this.prisma.trainingMeeting.findUnique({
      where: { sessionId },
      include: {
        session: {
          include: {
            registrations: {
              include: {
                anchorProfile: {
                  include: {
                    wecomUser: {
                      select: {
                        wecomUserId: true,
                        wecomName: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })
    if (!meeting?.externalMeetingId) {
      throw new BadRequestException('当前场次没有可同步的腾讯会议')
    }

    const rows = await this.gateway.listParticipants(
      meeting.externalMeetingId,
    )
    const attendanceImport = await this.prisma.trainingAttendanceImport.upsert(
      {
        where: {
          sessionId_source_idempotencyKey: {
            sessionId,
            source: 'api',
            idempotencyKey: meeting.externalMeetingId,
          },
        },
        create: {
          sessionId,
          source: 'api',
          status: 'preview',
          idempotencyKey: meeting.externalMeetingId,
          sourceSummary: {
            meetingId: meeting.externalMeetingId,
            recordCount: rows.length,
          },
          importedBy: currentUser.wecomUserId,
        },
        update: {
          sourceSummary: {
            meetingId: meeting.externalMeetingId,
            recordCount: rows.length,
          },
          importedBy: currentUser.wecomUserId,
          errorMessage: null,
        },
      },
    )

    await this.prisma.trainingAttendanceRawRecord.createMany({
      data: rows.map((row) => ({
        importId: attendanceImport.id,
        externalRecordKey: row.externalRecordKey,
        externalUserId: row.externalUserId,
        externalIdentityKey: row.externalIdentityKey,
        rawDisplayName: row.rawDisplayName,
        displayName: row.displayName,
        joinedAt: this.secondsToDate(row.joinedAtSeconds),
        leftAt: this.secondsToDate(row.leftAtSeconds),
        durationSeconds:
          row.joinedAtSeconds != null &&
          row.leftAtSeconds != null &&
          row.leftAtSeconds > row.joinedAtSeconds
            ? row.leftAtSeconds - row.joinedAtSeconds
            : 0,
        rawPayload: row.raw as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    })

    const grouped = new Map<string, TencentMeetingParticipant[]>()
    for (const row of rows) {
      const values = grouped.get(row.externalIdentityKey) ?? []
      values.push(row)
      grouped.set(row.externalIdentityKey, values)
    }
    const sessionDurationSeconds = Math.max(
      1,
      Math.round(
        (meeting.session.scheduledEndAt.getTime() -
          meeting.session.scheduledStartAt.getTime()) /
          1000,
      ),
    )
    const summary = {
      matched: 0,
      conflicts: 0,
      unmatched: 0,
      learned: 0,
      pendingConfirmation: 0,
    }

    for (const [identity, identityRows] of grouped) {
      const representative = identityRows[0]
      const match = matchAttendanceToRoster(
        representative,
        meeting.session.registrations as AttendanceRosterItem[],
      )
      const aggregation = aggregateAttendanceIntervals(identityRows)
      const ratio = Math.min(
        1,
        aggregation.totalDurationSeconds / sessionDurationSeconds,
      )
      const automaticallyLearned =
        match.matchStatus === 'matched' && ratio >= 0.8
      if (match.matchStatus === 'matched') summary.matched += 1
      if (match.matchStatus === 'conflict') summary.conflicts += 1
      if (match.matchStatus === 'unmatched') summary.unmatched += 1
      if (automaticallyLearned) summary.learned += 1
      else summary.pendingConfirmation += 1

      await this.prisma.$transaction(async (tx) => {
        await tx.trainingAttendanceRecord.upsert({
          where: {
            sessionId_externalIdentityKey: {
              sessionId,
              externalIdentityKey: identity,
            },
          },
          create: {
            sessionId,
            importId: attendanceImport.id,
            registrationId: match.registrationId,
            anchorProfileId: match.anchorProfileId,
            externalIdentityKey: identity,
            externalUserId: representative.externalUserId,
            displayName: representative.displayName,
            intervals: aggregation.intervals,
            totalDurationSeconds: aggregation.totalDurationSeconds,
            sessionDurationSeconds,
            attendanceRatio: ratio,
            matchStatus: match.matchStatus,
            matchMethod: match.matchMethod,
            outcome: automaticallyLearned
              ? 'learned'
              : 'pending_confirmation',
            matchedAt:
              match.matchStatus === 'matched' ? new Date() : undefined,
            outcomeAt: automaticallyLearned ? new Date() : undefined,
          },
          update: {
            importId: attendanceImport.id,
            registrationId: match.registrationId,
            anchorProfileId: match.anchorProfileId,
            externalUserId: representative.externalUserId,
            displayName: representative.displayName,
            intervals: aggregation.intervals,
            totalDurationSeconds: aggregation.totalDurationSeconds,
            sessionDurationSeconds,
            attendanceRatio: ratio,
            matchStatus: match.matchStatus,
            matchMethod: match.matchMethod,
            outcome: automaticallyLearned
              ? 'learned'
              : 'pending_confirmation',
            matchedAt:
              match.matchStatus === 'matched' ? new Date() : undefined,
            outcomeAt: automaticallyLearned ? new Date() : null,
          },
        })
        if (
          automaticallyLearned &&
          match.registrationId &&
          match.anchorProfileId
        ) {
          const now = new Date()
          await tx.trainingRegistration.update({
            where: { id: match.registrationId },
            data: {
              status: 'learned',
              outcomeReason: '参会时长达到课程时长80%',
              outcomeBy: 'system:tencent-meeting',
              outcomeAt: now,
            },
          })
          await tx.trainingLearningProgress.upsert({
            where: {
              anchorProfileId_courseId: {
                anchorProfileId: match.anchorProfileId,
                courseId: meeting.session.courseId,
              },
            },
            create: {
              anchorProfileId: match.anchorProfileId,
              courseId: meeting.session.courseId,
              status: 'learned',
              makeupStatus: 'none',
              firstLearnedAt: now,
              lastLearnedAt: now,
            },
            update: {
              status: 'learned',
              lastLearnedAt: now,
            },
          })
        }
      })
    }

    await this.prisma.trainingAttendanceImport.update({
      where: { id: attendanceImport.id },
      data: {
        status: 'confirmed',
        previewSummary: summary,
        confirmedBy: currentUser.wecomUserId,
        confirmedAt: new Date(),
      },
    })
    await this.prisma.trainingMeeting.update({
      where: { sessionId },
      data: { lastSyncAt: new Date(), lastError: null },
    })
    return { importId: attendanceImport.id, summary }
  }

  async listSessionAttendance(
    currentUser: AuthenticatedUser,
    sessionId: string,
  ) {
    await this.requireTrainingExecutor(currentUser)
    const items = await this.prisma.trainingAttendanceRecord.findMany({
      where: { sessionId },
      include: {
        anchorProfile: {
          select: { id: true, anchorDisplayName: true },
        },
        registration: {
          select: { id: true, operatorNameSnapshot: true },
        },
        auditLogs: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: [{ matchStatus: 'asc' }, { displayName: 'asc' }],
    })
    return { items }
  }

  async resolveMatch(
    currentUser: AuthenticatedUser,
    attendanceRecordId: string,
    dto: ResolveAttendanceMatchDto,
  ) {
    await this.requireTrainingExecutor(currentUser)
    const attendance =
      await this.prisma.trainingAttendanceRecord.findUnique({
        where: { id: attendanceRecordId },
      })
    if (!attendance) throw new NotFoundException('未找到参会记录')
    const registration = await this.prisma.trainingRegistration.findFirst({
      where: {
        sessionId: attendance.sessionId,
        anchorProfileId: dto.anchorProfileId,
        status: { in: ['registered', 'needs_makeup'] },
      },
      include: { session: { select: { courseId: true } } },
    })
    if (!registration) {
      throw new BadRequestException('所选主播不在本场有效报名名单中')
    }
    const learned = Number(attendance.attendanceRatio) >= 0.8
    const now = new Date()
    await this.prisma.$transaction(async (tx) => {
      await tx.trainingAttendanceRecord.update({
        where: { id: attendanceRecordId },
        data: {
          registrationId: registration.id,
          anchorProfileId: registration.anchorProfileId,
          matchStatus: 'matched',
          matchMethod: 'manual',
          matchedBy: currentUser.wecomUserId,
          matchedAt: now,
          manualReason: dto.reason.trim(),
          ...(learned
            ? {
                outcome: 'learned',
                outcomeBy: currentUser.wecomUserId,
                outcomeAt: now,
              }
            : {}),
        },
      })
      await tx.trainingAttendanceAuditLog.create({
        data: {
          attendanceRecordId,
          action: 'manual_match',
          beforeSnapshot: {
            registrationId: attendance.registrationId,
            anchorProfileId: attendance.anchorProfileId,
            matchStatus: attendance.matchStatus,
          },
          afterSnapshot: {
            registrationId: registration.id,
            anchorProfileId: registration.anchorProfileId,
            matchStatus: 'matched',
          },
          reason: dto.reason.trim(),
          operatedBy: currentUser.wecomUserId,
        },
      })
      if (learned) {
        await this.applyOutcome(
          tx,
          registration,
          'learned',
          '人工匹配后参会时长达到80%',
          currentUser.wecomUserId,
          now,
        )
      }
    })
    return { ok: true }
  }

  async resolveOutcome(
    currentUser: AuthenticatedUser,
    attendanceRecordId: string,
    outcome: AttendanceOutcomeDto,
    reasonInput: string,
  ) {
    await this.requireTrainingExecutor(currentUser)
    const reason = reasonInput.trim()
    if (!reason) throw new BadRequestException('人工结论必须填写原因')
    const attendance =
      await this.prisma.trainingAttendanceRecord.findUnique({
        where: { id: attendanceRecordId },
        include: {
          registration: {
            include: { session: { select: { courseId: true } } },
          },
        },
      })
    if (!attendance) throw new NotFoundException('未找到参会记录')
    if (
      attendance.matchStatus !== 'matched' ||
      !attendance.registration
    ) {
      throw new BadRequestException('请先确认参会记录对应的主播')
    }
    const registration = attendance.registration
    const now = new Date()
    await this.prisma.$transaction(async (tx) => {
      await tx.trainingAttendanceRecord.update({
        where: { id: attendanceRecordId },
        data: {
          outcome,
          outcomeBy: currentUser.wecomUserId,
          outcomeAt: now,
          manualReason: reason,
        },
      })
      await tx.trainingAttendanceAuditLog.create({
        data: {
          attendanceRecordId,
          action: 'manual_outcome',
          beforeSnapshot: { outcome: attendance.outcome },
          afterSnapshot: { outcome },
          reason,
          operatedBy: currentUser.wecomUserId,
        },
      })
      await this.applyOutcome(
        tx,
        registration,
        outcome,
        reason,
        currentUser.wecomUserId,
        now,
      )
    })
    return { ok: true }
  }

  private async requireTrainingExecutor(currentUser: AuthenticatedUser) {
    if (currentUser.role === 'super_admin') {
      await this.access.requirePasswordSuperAdmin(currentUser)
      return
    }
    if (currentUser.loginType !== 'wecom_staff') {
      throw new ForbiddenException('当前账号没有参会处理权限')
    }
    await this.access.requireAnyRole(currentUser, [
      'training_teacher',
      'training_admin',
    ])
  }

  private secondsToDate(value: number | null) {
    return value == null ? null : new Date(value * 1000)
  }

  private async applyOutcome(
    tx: Prisma.TransactionClient,
    registration: {
      id: string
      anchorProfileId: string
      learningType: string
      session: { courseId: string }
    },
    outcome: 'learned' | 'needs_makeup',
    reason: string,
    operatedBy: string,
    now: Date,
  ) {
    await tx.trainingRegistration.update({
      where: { id: registration.id },
      data: {
        status: outcome,
        outcomeReason: reason,
        outcomeBy: operatedBy,
        outcomeAt: now,
      },
    })
    await tx.trainingLearningProgress.upsert({
      where: {
        anchorProfileId_courseId: {
          anchorProfileId: registration.anchorProfileId,
          courseId: registration.session.courseId,
        },
      },
      create: {
        anchorProfileId: registration.anchorProfileId,
        courseId: registration.session.courseId,
        status: outcome === 'learned' ? 'learned' : 'registered',
        makeupStatus:
          outcome === 'learned'
            ? registration.learningType === 'makeup'
              ? 'made_up'
              : 'none'
            : 'needs_relearning',
        firstLearnedAt: outcome === 'learned' ? now : null,
        lastLearnedAt: outcome === 'learned' ? now : null,
      },
      update:
        outcome === 'learned'
          ? {
              status: 'learned',
              makeupStatus:
                registration.learningType === 'makeup'
                  ? 'made_up'
                  : undefined,
              lastLearnedAt: now,
            }
          : {
              makeupStatus: 'needs_relearning',
            },
    })
  }
}
