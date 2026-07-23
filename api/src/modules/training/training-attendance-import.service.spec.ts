import ExcelJS from 'exceljs'
import { describe, expect, it, vi } from 'vitest'
import {
  parseTencentAttendanceWorkbook,
  TrainingAttendanceImportService,
} from './training-attendance-import.service.js'

async function workbookBuffer(rows: unknown[][]) {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('参会成员')
  worksheet.addRows(rows)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

describe('parseTencentAttendanceWorkbook', () => {
  it('解析腾讯会议中文表头、时间和多种参会时长格式', async () => {
    const buffer = await workbookBuffer([
      ['成员名称', '用户ID', '入会时间', '离会时间', '参会时长'],
      [
        '企微小鹿',
        'wecom-1',
        '2026-07-24 18:00:00',
        '2026-07-24 18:48:00',
        '00:48:00',
      ],
      [
        '企微小鱼',
        '',
        new Date('2026-07-24T10:00:00.000Z'),
        new Date('2026-07-24T10:30:00.000Z'),
        '30分钟',
      ],
    ])

    const rows = await parseTencentAttendanceWorkbook(buffer)

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      externalUserId: 'wecom-1',
      externalIdentityKey: 'userid:wecom-1',
      displayName: '企微小鹿',
      durationSeconds: 2_880,
    })
    expect(rows[1]).toMatchObject({
      externalUserId: null,
      externalIdentityKey: 'name:企微小鱼',
      durationSeconds: 1_800,
    })
  })

  it('缺少成员名称列时拒绝导入', async () => {
    const buffer = await workbookBuffer([
      ['用户ID', '参会时长'],
      ['wecom-1', '00:40:00'],
    ])

    await expect(parseTencentAttendanceWorkbook(buffer)).rejects.toThrow(
      '缺少“成员名称”列',
    )
  })
})

describe('TrainingAttendanceImportService', () => {
  it('拒绝扩展名、MIME或ZIP签名不一致的伪造Excel', async () => {
    const service = new TrainingAttendanceImportService(
      {} as never,
      { requireAnyRole: vi.fn() } as never,
      {} as never,
    )

    await expect(
      service.previewImport(
        {
          accountId: 'training-admin-1',
          wecomUserId: 'training-admin-uid',
          role: 'training_admin',
          roles: ['training_admin'],
          loginType: 'wecom_staff',
        } as never,
        'session-1',
        {
          originalname: 'attendance.xlsx',
          mimetype: 'text/plain',
          size: 12,
          buffer: Buffer.from('not-an-xlsx'),
        },
      ),
    ).rejects.toThrow('文件类型与.xlsx格式不一致')
  })
})
