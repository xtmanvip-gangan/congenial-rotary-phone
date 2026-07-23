import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service.js'
import { AuthService } from '../auth/auth.service.js'
import type { AuthenticatedUser } from '../auth/auth.types.js'
import { CreateActivityDto } from './dto/create-activity.dto.js'
import { SaveActivityConfigDto } from './dto/save-activity-config.dto.js'
import { UpdateActivityDto } from './dto/update-activity.dto.js'

type ActivityStatusValue = 'draft' | 'active' | 'ended' | 'disabled'
type CompareModeValue = 'gte' | 'eq'

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async listActivityTypes(currentUser: AuthenticatedUser) {
    await this.ensureAdmin(currentUser)

    const items = await this.prisma.activityType.findMany({
      orderBy: [{ createdAt: 'asc' }],
    })

    return {
      items: items.map((item: (typeof items)[number]) => ({
        id: item.id,
        typeCode: item.typeCode,
        typeName: item.typeName,
        aggregationMode: item.aggregationMode,
        metricUnit: item.metricUnit,
      })),
    }
  }

  async listActivities(currentUser: AuthenticatedUser) {
    await this.ensureAdmin(currentUser)

    const items = await this.prisma.activity.findMany({
      include: {
        type: true,
        items: {
          where: {
            enabled: true,
          },
        },
        rules: {
          where: {
            enabled: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    })

    return {
      items: items.map((item: (typeof items)[number]) => this.formatActivity(item)),
    }
  }

  async createActivity(currentUser: AuthenticatedUser, dto: CreateActivityDto) {
    await this.ensureSuperAdmin(currentUser)

    const normalizedName = dto.name.trim()
    const normalizedTypeCode = dto.typeCode.trim()
    const normalizedDescription = dto.description?.trim() || null
    const normalizedCoverUrl = dto.coverUrl?.trim() || null
    const startAt = new Date(dto.startAt)
    const endAt = new Date(dto.endAt)

    if (!normalizedName || !normalizedTypeCode) {
      throw new BadRequestException('活动名称和活动类型不能为空')
    }

    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      throw new BadRequestException('活动时间格式不正确')
    }

    if (endAt <= startAt) {
      throw new BadRequestException('活动结束时间必须晚于开始时间')
    }

    const activityType = await this.prisma.activityType.findUnique({
      where: {
        typeCode: normalizedTypeCode,
      },
    })

    if (!activityType) {
      throw new BadRequestException('未找到对应的活动类型')
    }

    if (dto.status === 'active') {
      throw new BadRequestException('新建活动请先保存为草稿，完成活动项和奖励规则配置后再启用')
    }

    const created = await this.prisma.activity.create({
      data: {
        name: normalizedName,
        typeId: activityType.id,
        startAt,
        endAt,
        description: normalizedDescription,
        coverUrl: normalizedCoverUrl,
        status: dto.status ?? 'draft',
      },
      include: {
        type: true,
      },
    })

    return {
      item: this.formatActivity(created),
    }
  }

  async updateActivity(currentUser: AuthenticatedUser, activityId: string, dto: UpdateActivityDto) {
    await this.ensureSuperAdmin(currentUser)

    const activity = await this.prisma.activity.findUnique({
      where: {
        id: activityId,
      },
      include: {
        type: true,
      },
    })

    if (!activity) {
      throw new NotFoundException('未找到对应活动')
    }

    const normalizedName = dto.name.trim()
    const normalizedDescription = dto.description?.trim() || null
    const normalizedCoverUrl = dto.coverUrl?.trim() || null
    const startAt = new Date(dto.startAt)
    const endAt = new Date(dto.endAt)

    if (!normalizedName) {
      throw new BadRequestException('活动名称不能为空')
    }

    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      throw new BadRequestException('活动时间格式不正确')
    }

    if (endAt <= startAt) {
      throw new BadRequestException('活动结束时间必须晚于开始时间')
    }

    if ((dto.status ?? activity.status) === 'active') {
      await this.ensureActivityCanBeActivated(activity.id)
    }

    const updated = await this.prisma.activity.update({
      where: {
        id: activityId,
      },
      data: {
        name: normalizedName,
        startAt,
        endAt,
        description: normalizedDescription,
        coverUrl: normalizedCoverUrl,
        status: dto.status ?? activity.status,
      },
      include: {
        type: true,
      },
    })

    return {
      item: this.formatActivity(updated),
    }
  }

  async updateActivityStatus(
    currentUser: AuthenticatedUser,
    activityId: string,
    status: ActivityStatusValue,
  ) {
    await this.ensureSuperAdmin(currentUser)

    const activity = await this.prisma.activity.findUnique({
      where: {
        id: activityId,
      },
      include: {
        type: true,
      },
    })

    if (!activity) {
      throw new NotFoundException('未找到对应活动')
    }

    if (status === 'active') {
      await this.ensureActivityCanBeActivated(activity.id)
    }

    const updated = await this.prisma.activity.update({
      where: {
        id: activityId,
      },
      data: {
        status,
      },
      include: {
        type: true,
      },
    })

    return {
      item: this.formatActivity(updated),
    }
  }

  async getActivityConfig(currentUser: AuthenticatedUser, activityId: string) {
    await this.ensureAdmin(currentUser)

    const activity = await this.prisma.activity.findUnique({
      where: {
        id: activityId,
      },
      include: {
        type: true,
        items: {
          orderBy: [{ sortOrder: 'asc' }, { itemCode: 'asc' }],
        },
        rules: {
          include: {
            item: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    })

    if (!activity) {
      throw new NotFoundException('未找到对应活动')
    }

    return {
      item: this.formatActivity(activity),
    }
  }

  async saveActivityConfig(
    currentUser: AuthenticatedUser,
    activityId: string,
    dto: SaveActivityConfigDto,
  ) {
    await this.ensureAdmin(currentUser)

    const activity = await this.prisma.activity.findUnique({
      where: {
        id: activityId,
      },
      include: {
        type: true,
      },
    })

    if (!activity) {
      throw new NotFoundException('未找到对应活动')
    }

    const normalizedItems = dto.items.map((item, index) => {
      const itemCode = item.itemCode.trim()
      const itemName = item.itemName.trim()
      const itemType = item.itemType.trim()

      if (!itemCode || !itemName || !itemType) {
        throw new BadRequestException('活动项编码、名称和类型不能为空')
      }

      return {
        itemCode,
        itemName,
        itemType,
        sortOrder: item.sortOrder ?? index,
        enabled: item.enabled ?? true,
      }
    })

    const duplicatedItemCode = this.findDuplicateValue(normalizedItems.map((item) => item.itemCode))
    if (duplicatedItemCode) {
      throw new BadRequestException(`活动项编码重复：${duplicatedItemCode}`)
    }

    const duplicatedItemName = this.findDuplicateValue(normalizedItems.map((item) => item.itemName))
    if (duplicatedItemName) {
      throw new BadRequestException(`活动项名称重复：${duplicatedItemName}`)
    }

    const normalizedRules = dto.rules.map((rule, index) => {
      const itemCode = rule.itemCode?.trim() || null
      const rewardType = rule.rewardType.trim()
      const rewardLabel = rule.rewardLabel.trim()
      const rewardValueYuan = Number(rule.rewardValueYuan)

      if (!rewardType || !rewardLabel) {
        throw new BadRequestException('奖励类型和奖励内容不能为空')
      }

      if (!Number.isFinite(rule.threshold) || rule.threshold < 0) {
        throw new BadRequestException('奖励阈值必须大于等于 0')
      }

      if (!Number.isFinite(rewardValueYuan) || rewardValueYuan < 0) {
        throw new BadRequestException('奖励价值必须大于等于 0')
      }

      return {
        itemCode,
        compareMode: rule.compareMode ?? 'gte',
        threshold: rule.threshold,
        rewardType,
        rewardLabel,
        rewardValueCents: this.yuanToCents(rewardValueYuan),
        sortOrder: rule.sortOrder ?? index,
        enabled: rule.enabled ?? true,
      }
    })

    for (const rule of normalizedRules) {
      if (rule.itemCode && !normalizedItems.some((item) => item.itemCode === rule.itemCode)) {
        throw new BadRequestException(`奖励规则引用了不存在的活动项：${rule.itemCode}`)
      }
    }

    if (activity.status === 'active' && (normalizedItems.length === 0 || normalizedRules.length === 0)) {
      throw new BadRequestException('启用中的活动必须至少保留 1 个活动项和 1 条奖励规则')
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.rewardRule.deleteMany({
        where: {
          activityId,
        },
      })

      await tx.activityItem.deleteMany({
        where: {
          activityId,
        },
      })

      const createdItems = await Promise.all(
        normalizedItems.map((item) =>
          tx.activityItem.create({
            data: {
              activityId,
              itemCode: item.itemCode,
              itemName: item.itemName,
              itemType: item.itemType,
              sortOrder: item.sortOrder,
              enabled: item.enabled,
            },
          }),
        ),
      )

      const itemIdByCode = new Map(createdItems.map((item) => [item.itemCode, item.id]))

      if (normalizedRules.length > 0) {
        await tx.rewardRule.createMany({
          data: normalizedRules.map((rule) => ({
            activityId,
            itemId: rule.itemCode ? itemIdByCode.get(rule.itemCode) ?? null : null,
            compareMode: rule.compareMode,
            threshold: rule.threshold.toString(),
            rewardType: rule.rewardType,
            rewardLabel: rule.rewardLabel,
            rewardValueCents: rule.rewardValueCents,
            sortOrder: rule.sortOrder,
            enabled: rule.enabled,
          })),
        })
      }
    })

    return this.getActivityConfig(currentUser, activityId)
  }

  private async ensureAdmin(currentUser: AuthenticatedUser) {
    if (currentUser.role !== 'operator' && currentUser.role !== 'super_admin') {
      throw new ForbiddenException('只有后台账号可以管理活动')
    }

    const operatorAccount = await this.authService.getActiveAdminAccount(currentUser)

    if (!operatorAccount) {
      throw new ForbiddenException('当前运营老师账号不可用')
    }

    if (currentUser.role === 'operator' && operatorAccount.role !== 'operator') {
      throw new ForbiddenException('当前运营老师账号不可用')
    }

    return operatorAccount
  }

  private async ensureSuperAdmin(currentUser: AuthenticatedUser) {
    const operatorAccount = await this.ensureAdmin(currentUser)
    if (currentUser.role !== 'super_admin' || operatorAccount.role !== 'super_admin') {
      throw new ForbiddenException('只有超级管理员可以创建或修改活动')
    }

    return operatorAccount
  }

  private async ensureActivityCanBeActivated(activityId: string) {
    const activity = await this.prisma.activity.findUnique({
      where: {
        id: activityId,
      },
      include: {
        items: {
          where: {
            enabled: true,
          },
          select: {
            id: true,
          },
        },
        rules: {
          where: {
            enabled: true,
          },
          select: {
            id: true,
          },
        },
      },
    })

    if (!activity) {
      throw new NotFoundException('未找到对应活动')
    }

    if (activity.items.length === 0 || activity.rules.length === 0) {
      throw new BadRequestException('活动启用前请先配置至少 1 个活动项和 1 条奖励规则')
    }
  }

  private findDuplicateValue(values: string[]) {
    const existing = new Set<string>()

    for (const value of values) {
      if (existing.has(value)) {
        return value
      }
      existing.add(value)
    }

    return null
  }

  private formatActivity(activity: {
    id: string
    name: string
    startAt: Date
    endAt: Date
    status: ActivityStatusValue
    description: string | null
    coverUrl: string | null
    createdAt: Date
    updatedAt: Date
    items?: Array<{
      id: string
    }>
    rules?: Array<{
      id: string
    }>
    type: {
      id: string
      typeCode: string
      typeName: string
      aggregationMode: string
      metricUnit: string | null
    }
  }) {
    return {
      id: activity.id,
      name: activity.name,
      startAt: activity.startAt.toISOString(),
      endAt: activity.endAt.toISOString(),
      status: activity.status,
      description: activity.description,
      coverUrl: activity.coverUrl,
      createdAt: activity.createdAt.toISOString(),
      updatedAt: activity.updatedAt.toISOString(),
      itemCount: activity.items?.length ?? 0,
      ruleCount: activity.rules?.length ?? 0,
      type: {
        id: activity.type.id,
        typeCode: activity.type.typeCode,
        typeName: activity.type.typeName,
        aggregationMode: activity.type.aggregationMode,
        metricUnit: activity.type.metricUnit,
      },
      items:
        'items' in activity && Array.isArray(activity.items)
          ? activity.items.map((item: any) => ({
              id: item.id,
              itemCode: item.itemCode,
              itemName: item.itemName,
              itemType: item.itemType,
              sortOrder: item.sortOrder,
              enabled: item.enabled,
            }))
          : undefined,
      rules:
        'rules' in activity && Array.isArray(activity.rules)
          ? activity.rules.map((rule: any) => ({
              id: rule.id,
              itemCode: rule.item?.itemCode ?? null,
              itemName: rule.item?.itemName ?? null,
              compareMode: rule.compareMode as CompareModeValue,
              threshold: Number(rule.threshold),
              rewardType: rule.rewardType,
              rewardLabel: rule.rewardLabel,
              rewardValueYuan: this.centsToYuan(Number(rule.rewardValueCents ?? 0)),
              sortOrder: rule.sortOrder,
              enabled: rule.enabled,
            }))
          : undefined,
    }
  }

  private yuanToCents(value: number) {
    return Math.round(value * 100)
  }

  private centsToYuan(value: number) {
    return Number((value / 100).toFixed(2))
  }
}
