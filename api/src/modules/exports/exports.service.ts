import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import * as XLSX from 'xlsx'
import { PrismaService } from '../../prisma/prisma.service.js'
import { AuthService } from '../auth/auth.service.js'
import type { AuthenticatedUser } from '../auth/auth.types.js'
import { ExportSubmissionsQueryDto } from './dto/export-submissions-query.dto.js'

@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async exportSubmissionsXlsx(
    currentUser: AuthenticatedUser,
    query: ExportSubmissionsQueryDto,
    _publicBaseUrl: string,
  ) {
    const operatorAccount = await this.ensureAdmin(currentUser)
    const items = await this.prisma.submission.findMany({
      where: {
        operatorAssignmentStatus: 'confirmed',
        ...(operatorAccount ? { operatorId: operatorAccount.id } : {}),
        ...(query.reviewStatus ? { reviewStatus: query.reviewStatus } : {}),
        ...(query.grantStatus ? { grantStatus: query.grantStatus } : {}),
        ...(query.activityId
          ? {
              activityId: query.activityId,
            }
          : {}),
        ...(query.activityName
          ? {
              activity: {
                name: {
                  contains: query.activityName.trim(),
                  mode: 'insensitive',
                },
              },
            }
          : {}),
        ...(query.anchorName
          ? {
              anchorName: {
                contains: query.anchorName.trim(),
                mode: 'insensitive',
              },
            }
          : {}),
        ...(query.operatorName
          ? {
              operator: {
                displayName: {
                  contains: query.operatorName.trim(),
                  mode: 'insensitive',
                },
              },
            }
          : {}),
        ...(query.liveDateStart || query.liveDateEnd
          ? {
              liveDate: {
                ...(query.liveDateStart ? { gte: this.parseDateStart(query.liveDateStart) } : {}),
                ...(query.liveDateEnd ? { lte: this.parseDateEnd(query.liveDateEnd) } : {}),
              },
            }
          : {}),
      },
      include: {
        activity: {
          include: {
            type: true,
          },
        },
        operator: true,
        items: {
          orderBy: [{ itemName: 'asc' }],
        },
        attachments: {
          orderBy: [{ createdAt: 'asc' }],
        },
        rewardGrants: {
          orderBy: [{ grantedAt: 'desc' }, { id: 'desc' }],
        },
        reviewLogs: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    })

    if (query.activityId && items.length === 0) {
      throw new BadRequestException('当前活动还没有可导出的记录')
    }

    const headers = [
      '活动名称',
      '活动类型',
      '主播姓名',
      '运营老师',
      '直播日期',
      '开播时间',
      '填写明细',
      '当天累计/场次结果',
      '命中奖励',
      '命中奖励价值(元)',
      '审核状态',
      '发放状态',
      '驳回原因',
      '发放备注',
      '提交时间',
      '最近审核时间',
      '最近发放时间',
    ]

    const rows = items.map((item: any) => {
      const rewardSnapshot = (item.rewardSnapshot ?? null) as any
      const latestGrant = item.rewardGrants[0] ?? null
      const latestReviewLog = item.reviewLogs.find(
        (log: any) => log.action === 'approved' || log.action === 'rejected',
      )
      const latestGrantedLog = item.reviewLogs.find((log: any) => log.action === 'granted')

      return [
        item.activity.name,
        item.activity.type.typeName,
        item.anchorName,
        item.operator.displayName,
        item.liveDate.toISOString().slice(0, 10),
        item.liveStartTime.toISOString().slice(11, 16),
        this.formatSubmissionItems(item.items),
        this.formatDailyTotals(rewardSnapshot, item.items),
        this.formatRewardSummary(rewardSnapshot),
        this.formatRewardValueYuan(rewardSnapshot),
        this.formatReviewStatus(item.reviewStatus),
        this.formatGrantStatus(item.reviewStatus, item.grantStatus),
        item.rejectReason ?? '',
        latestGrant?.remark ?? '',
        this.formatDateTimeForExport(item.createdAt),
        this.formatDateTimeForExport(latestReviewLog?.createdAt),
        this.formatDateTimeForExport(latestGrantedLog?.createdAt ?? latestGrant?.grantedAt),
      ]
    })

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
    worksheet['!cols'] = [
      { wch: 18 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 12 },
      { wch: 10 },
      { wch: 28 },
      { wch: 24 },
      { wch: 24 },
      { wch: 14 },
      { wch: 12 },
      { wch: 14 },
      { wch: 22 },
      { wch: 22 },
      { wch: 21 },
      { wch: 21 },
      { wch: 21 },
    ]
    if (worksheet['!ref']) {
      worksheet['!autofilter'] = { ref: worksheet['!ref'] }
    }
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '活动记录')
    const content = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer

    return {
      fileName: this.buildFileName(items[0]?.activity?.name ?? null),
      content,
    }
  }

  private async ensureAdmin(currentUser: AuthenticatedUser) {
    if (currentUser.role !== 'operator' && currentUser.role !== 'super_admin') {
      throw new ForbiddenException('只有后台账号可以导出报表')
    }

    if (currentUser.role === 'super_admin') {
      return null
    }

    const operatorAccount = await this.authService.getActiveAdminAccount(currentUser)

    if (!operatorAccount || operatorAccount.role !== 'operator') {
      throw new ForbiddenException('当前运营老师账号不可用')
    }

    return operatorAccount
  }

  private parseDateStart(value: string) {
    const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`)
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('日期格式不正确')
    }
    return date
  }

  private parseDateEnd(value: string) {
    const date = new Date(`${value.slice(0, 10)}T23:59:59.999Z`)
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('日期格式不正确')
    }
    return date
  }

  private formatSubmissionItems(items: Array<{ itemName: string; quantity: unknown }>) {
    return items.map((item) => `${item.itemName}：${Number(item.quantity)}`).join('；')
  }

  private formatDailyTotals(rewardSnapshot: any, items: Array<{ itemName: string; quantity: unknown }>) {
    if (rewardSnapshot?.mode === 'daily' && Array.isArray(rewardSnapshot.totals)) {
      return rewardSnapshot.totals
        .map((item: any) => `${item.itemName}：${Number(item.quantity)}`)
        .join('；')
    }

    if (rewardSnapshot?.mode === 'session' && items.length > 0) {
      return `${items[0]?.itemName ?? 'PK值'}：${Number(items[0]?.quantity ?? 0)}`
    }

    return ''
  }

  private formatRewardSummary(rewardSnapshot: any) {
    const matchedRewards = Array.isArray(rewardSnapshot?.matchedRewards) ? rewardSnapshot.matchedRewards : []
    return matchedRewards.length > 0
      ? matchedRewards.map((item: any) => item.rewardLabel).join('；')
      : '暂未命中奖励'
  }

  private formatRewardValueYuan(rewardSnapshot: any) {
    const matchedRewards = Array.isArray(rewardSnapshot?.matchedRewards) ? rewardSnapshot.matchedRewards : []
    const totalCents = matchedRewards.reduce((total: number, item: any) => total + Number(item?.rewardValueCents ?? 0), 0)
    return Number((totalCents / 100).toFixed(2))
  }

  private formatReviewStatus(status: 'pending' | 'approved' | 'rejected') {
    if (status === 'approved') {
      return '已通过'
    }

    if (status === 'rejected') {
      return '已驳回'
    }

    return '待审核'
  }

  private formatGrantStatus(
    reviewStatus: 'pending' | 'approved' | 'rejected',
    grantStatus: 'pending' | 'granted',
  ) {
    if (reviewStatus !== 'approved') {
      return '未进入发放'
    }

    return grantStatus === 'granted' ? '已发放' : '待发放'
  }

  private formatDateTimeForExport(value: Date | null | undefined) {
    if (!value) {
      return ''
    }

    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .format(value)
      .replace(/\//g, '-')
  }

  private buildFileName(activityName: string | null) {
    const dateText = new Date().toISOString().slice(0, 10)
    if (!activityName) {
      return `submissions-report-${dateText}.xlsx`
    }

    const safeActivityName = activityName.replace(/[\\/:*?"<>|]/g, '-').trim()
    return `${safeActivityName || 'submissions-report'}-${dateText}.xlsx`
  }

}
