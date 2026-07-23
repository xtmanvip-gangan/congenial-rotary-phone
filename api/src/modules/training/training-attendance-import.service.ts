import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import ExcelJS from 'exceljs'
import { PrismaService } from '../../prisma/prisma.service.js'
import { AccessService } from '../access/access.service.js'
import type { AuthenticatedUser } from '../auth/auth.types.js'
import type { TencentMeetingParticipant } from '../integrations/tencent-meeting/tencent-meeting.types.js'
import {
  matchAttendanceToRoster,
  TrainingAttendanceService,
} from './training-attendance.service.js'

const HEADER_ALIASES = {
  displayName: ['成员名称', '参会成员名称', '入会名称', '用户名称', '姓名'],
  userId: ['用户ID', '用户 ID', '成员ID', '成员 ID', 'userid'],
  joinedAt: ['入会时间', '加入时间', '首次入会时间'],
  leftAt: ['离会时间', '退出时间', '最后离会时间'],
  duration: ['参会时长', '累计参会时长', '会议时长', '时长'],
} as const

type UploadFile = {
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}

export async function parseTencentAttendanceWorkbook(
  buffer: Buffer,
): Promise<TencentMeetingParticipant[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as never)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) throw new BadRequestException('Excel中没有可读取的工作表')

  const headers = new Map<string, number>()
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => {
    const value = cellText(cell.value).trim()
    if (value) headers.set(value, column)
  })
  const displayNameColumn = findHeader(headers, HEADER_ALIASES.displayName)
  if (!displayNameColumn) {
    throw new BadRequestException('参会表缺少“成员名称”列')
  }
  const userIdColumn = findHeader(headers, HEADER_ALIASES.userId)
  const joinedAtColumn = findHeader(headers, HEADER_ALIASES.joinedAt)
  const leftAtColumn = findHeader(headers, HEADER_ALIASES.leftAt)
  const durationColumn = findHeader(headers, HEADER_ALIASES.duration)
  if (!durationColumn && (!joinedAtColumn || !leftAtColumn)) {
    throw new BadRequestException(
      '参会表必须包含“参会时长”，或同时包含“入会时间”和“离会时间”',
    )
  }

  const rows: TencentMeetingParticipant[] = []
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const displayName = cellText(row.getCell(displayNameColumn).value).trim()
    if (!displayName) return
    const externalUserId = userIdColumn
      ? cellText(row.getCell(userIdColumn).value).trim() || null
      : null
    const joinedAt = joinedAtColumn
      ? parseDateCell(row.getCell(joinedAtColumn).value)
      : null
    const leftAt = leftAtColumn
      ? parseDateCell(row.getCell(leftAtColumn).value)
      : null
    const durationSeconds = durationColumn
      ? parseDurationSeconds(row.getCell(durationColumn).value)
      : joinedAt && leftAt && leftAt > joinedAt
        ? Math.round((leftAt.getTime() - joinedAt.getTime()) / 1000)
        : 0
    const externalIdentityKey = externalUserId
      ? `userid:${externalUserId}`
      : `name:${displayName}`
    const recordSource = [
      rowNumber,
      externalIdentityKey,
      joinedAt?.toISOString() ?? '',
      leftAt?.toISOString() ?? '',
      durationSeconds,
    ].join('|')
    rows.push({
      externalRecordKey: createHash('sha256')
        .update(recordSource)
        .digest('hex')
        .slice(0, 40),
      externalUserId,
      externalIdentityKey,
      rawDisplayName: displayName,
      displayName,
      joinedAtSeconds: joinedAt
        ? Math.floor(joinedAt.getTime() / 1000)
        : null,
      leftAtSeconds: leftAt ? Math.floor(leftAt.getTime() / 1000) : null,
      durationSeconds,
      raw: {
        rowNumber,
        displayName,
        externalUserId,
        joinedAt: joinedAt?.toISOString() ?? null,
        leftAt: leftAt?.toISOString() ?? null,
        durationSeconds,
      },
    })
  })
  if (rows.length === 0) {
    throw new BadRequestException('参会表中没有有效参会记录')
  }
  return rows
}

@Injectable()
export class TrainingAttendanceImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly attendanceService: TrainingAttendanceService,
  ) {}

  async previewImport(
    currentUser: AuthenticatedUser,
    sessionId: string,
    file: UploadFile | undefined,
  ) {
    await this.requireImportAccess(currentUser)
    this.validateFile(file)
    const safeFile = file as UploadFile
    const rows = await parseTencentAttendanceWorkbook(safeFile.buffer)
    const session = await this.prisma.trainingSession.findUnique({
      where: { id: sessionId },
      include: {
        registrations: {
          include: {
            anchorProfile: {
              include: {
                wecomUser: {
                  select: { wecomUserId: true, wecomName: true },
                },
              },
            },
          },
        },
      },
    })
    if (!session) throw new NotFoundException('未找到培训场次')

    const groups = new Map<string, TencentMeetingParticipant[]>()
    for (const row of rows) {
      const items = groups.get(row.externalIdentityKey) ?? []
      items.push(row)
      groups.set(row.externalIdentityKey, items)
    }
    const summary = {
      total: groups.size,
      matched: 0,
      conflicts: 0,
      unmatched: 0,
      invalid: 0,
    }
    for (const identityRows of groups.values()) {
      const match = matchAttendanceToRoster(
        identityRows[0],
        session.registrations as never,
      )
      if (match.matchStatus === 'matched') summary.matched += 1
      if (match.matchStatus === 'conflict') summary.conflicts += 1
      if (match.matchStatus === 'unmatched') summary.unmatched += 1
    }
    const idempotencyKey = createHash('sha256')
      .update(safeFile.buffer)
      .digest('hex')
    const attendanceImport =
      await this.prisma.trainingAttendanceImport.upsert({
        where: {
          sessionId_source_idempotencyKey: {
            sessionId,
            source: 'excel',
            idempotencyKey,
          },
        },
        create: {
          sessionId,
          source: 'excel',
          status: 'preview',
          idempotencyKey,
          fileName: safeFile.originalname,
          sourceSummary: { rowCount: rows.length },
          previewSummary: summary,
          importedBy: currentUser.wecomUserId,
        },
        update: {
          fileName: safeFile.originalname,
          sourceSummary: { rowCount: rows.length },
          previewSummary: summary,
          importedBy: currentUser.wecomUserId,
          errorMessage: null,
        },
      })
    await this.prisma.trainingAttendanceRawRecord.createMany({
      data: rows.map((row) => ({
        importId: attendanceImport.id,
        externalRecordKey: row.externalRecordKey,
        externalUserId: row.externalUserId,
        externalIdentityKey: row.externalIdentityKey,
        rawDisplayName: row.rawDisplayName,
        displayName: row.displayName,
        joinedAt: row.joinedAtSeconds
          ? new Date(row.joinedAtSeconds * 1000)
          : null,
        leftAt: row.leftAtSeconds
          ? new Date(row.leftAtSeconds * 1000)
          : null,
        durationSeconds: row.durationSeconds ?? 0,
        rawPayload: row.raw as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    })
    return {
      importId: attendanceImport.id,
      status: attendanceImport.status,
      duplicate: attendanceImport.status === 'confirmed',
      summary,
    }
  }

  async confirmImport(
    currentUser: AuthenticatedUser,
    importId: string,
  ) {
    await this.requireImportAccess(currentUser)
    return this.attendanceService.confirmExcelImport(currentUser, importId)
  }

  private validateFile(file: UploadFile | undefined): asserts file is UploadFile {
    if (!file) throw new BadRequestException('请选择要导入的Excel文件')
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('参会表不能超过5MB')
    }
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('仅支持.xlsx格式的参会表')
    }
    const allowedMimeTypes = new Set([
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
    ])
    const hasZipSignature =
      file.buffer.length >= 4 &&
      file.buffer[0] === 0x50 &&
      file.buffer[1] === 0x4b &&
      (file.buffer[2] === 0x03 || file.buffer[2] === 0x05) &&
      (file.buffer[3] === 0x04 || file.buffer[3] === 0x06)
    if (!allowedMimeTypes.has(file.mimetype) || !hasZipSignature) {
      throw new BadRequestException('文件类型与.xlsx格式不一致')
    }
  }

  private async requireImportAccess(currentUser: AuthenticatedUser) {
    if (currentUser.role === 'super_admin') {
      await this.access.requirePasswordSuperAdmin(currentUser)
      return
    }
    if (currentUser.loginType !== 'wecom_staff') {
      throw new ForbiddenException('当前账号没有参会表导入权限')
    }
    await this.access.requireAnyRole(currentUser, [
      'training_teacher',
      'training_admin',
    ])
  }
}

function findHeader(
  headers: Map<string, number>,
  aliases: readonly string[],
) {
  for (const alias of aliases) {
    const column = headers.get(alias)
    if (column) return column
  }
  return null
}

function cellText(value: ExcelJS.CellValue | null | undefined): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    if ('text' in value) return String(value.text)
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue)
    if ('richText' in value) {
      return value.richText.map((part) => part.text).join('')
    }
  }
  return String(value)
}

function parseDateCell(value: ExcelJS.CellValue | null | undefined) {
  if (value instanceof Date) return value
  const text = cellText(value).trim()
  if (!text) return null
  const normalized = text.replace(
    /^(\d{4})-(\d{1,2})-(\d{1,2})\s+/u,
    (_match, year, month, day) =>
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T`,
  )
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function parseDurationSeconds(value: ExcelJS.CellValue | null | undefined) {
  if (typeof value === 'number') {
    return value > 0 && value < 1
      ? Math.round(value * 86_400)
      : Math.round(value)
  }
  const text = cellText(value).trim()
  if (!text) return 0
  const colon = text.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/u)
  if (colon) {
    if (colon[3] == null) {
      return Number(colon[1]) * 60 + Number(colon[2])
    }
    return (
      Number(colon[1]) * 3600 +
      Number(colon[2]) * 60 +
      Number(colon[3])
    )
  }
  const hours = Number(text.match(/(\d+(?:\.\d+)?)\s*小时/u)?.[1] ?? 0)
  const minutes = Number(text.match(/(\d+(?:\.\d+)?)\s*分钟/u)?.[1] ?? 0)
  const seconds = Number(text.match(/(\d+(?:\.\d+)?)\s*秒/u)?.[1] ?? 0)
  if (hours || minutes || seconds) {
    return Math.round(hours * 3600 + minutes * 60 + seconds)
  }
  const numeric = Number(text)
  return Number.isFinite(numeric) ? Math.round(numeric) : 0
}
