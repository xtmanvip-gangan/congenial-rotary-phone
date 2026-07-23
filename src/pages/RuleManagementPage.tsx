import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, LoaderCircle, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { useConfirmDialog } from '../components/useConfirmDialog'
import { apiJson } from '../lib/api'
import { formatDateTime } from '../lib/dateTime'
import { activityStatusClassMap, activityStatusTextMap } from '../lib/statusBadges'

type ActivityTypeItem = {
  id: string
  typeCode: string
  typeName: string
  aggregationMode: string
  metricUnit: string | null
}

type ActivityConfigItem = {
  id: string
  itemCode: string
  itemName: string
  itemType: string
  sortOrder: number
  enabled: boolean
}

type RewardRuleItem = {
  id: string
  itemCode: string | null
  itemName: string | null
  compareMode: 'gte' | 'eq'
  threshold: number
  rewardType: string
  rewardLabel: string
  rewardValueYuan: number
  sortOrder: number
  enabled: boolean
}

type ActivityItem = {
  id: string
  name: string
  startAt: string
  endAt: string
  status: 'draft' | 'active' | 'ended' | 'disabled'
  description: string | null
  createdAt: string
  updatedAt: string
  itemCount: number
  ruleCount: number
  type: ActivityTypeItem
  items?: ActivityConfigItem[]
  rules?: RewardRuleItem[]
}

type GiftTierDraft = {
  threshold: string
  rewardType: string
  rewardLabel: string
  rewardValueYuan: string
  enabled: boolean
}

type GiftGroupDraft = {
  itemName: string
  enabled: boolean
  tiers: GiftTierDraft[]
}

type PkRuleDraft = {
  threshold: string
  rewardType: string
  rewardLabel: string
  rewardValueYuan: string
  enabled: boolean
}

type ActivitiesResponse = {
  items: ActivityItem[]
}

type ActivityConfigResponse = {
  item: ActivityItem
}

const activitiesQueryKey = ['activities']

export function RuleManagementPage() {
  const queryClient = useQueryClient()
  const { confirm, dialog } = useConfirmDialog()
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null)
  const [giftGroups, setGiftGroups] = useState<GiftGroupDraft[]>([])
  const [pkRules, setPkRules] = useState<PkRuleDraft[]>([])
  const [configError, setConfigError] = useState<string | null>(null)
  const [configSuccess, setConfigSuccess] = useState<string | null>(null)

  const activitiesQuery = useQuery({
    queryKey: activitiesQueryKey,
    queryFn: () => apiJson<ActivitiesResponse>('/activities'),
  })

  const expandedActivity = useMemo(
    () => activitiesQuery.data?.items.find((item) => item.id === expandedActivityId) ?? null,
    [activitiesQuery.data?.items, expandedActivityId],
  )

  const configQuery = useQuery({
    enabled: Boolean(expandedActivityId),
    queryKey: ['activity-config', expandedActivityId],
    queryFn: () => apiJson<ActivityConfigResponse>(`/activities/${expandedActivityId}/config`),
  })

  useEffect(() => {
    if (!configQuery.data || !expandedActivity) {
      return
    }

    if (expandedActivity.type.typeCode === 'gift_collection') {
      setGiftGroups(buildGiftGroupDrafts(configQuery.data.item.items ?? [], configQuery.data.item.rules ?? []))
      setPkRules([])
    } else if (expandedActivity.type.typeCode === 'pk_score') {
      setPkRules(buildPkRuleDrafts(configQuery.data.item.rules ?? []))
      setGiftGroups([])
    } else {
      setGiftGroups([])
      setPkRules([])
    }

    setConfigError(null)
    setConfigSuccess(null)
  }, [configQuery.data, expandedActivity])

  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      if (!expandedActivity) {
        throw new Error('请先选择要配置的活动')
      }

      if (expandedActivity.type.typeCode === 'gift_collection') {
        const normalizedGiftGroups = giftGroups.map((group) => ({
          itemName: group.itemName.trim(),
          enabled: group.enabled,
          tiers: group.tiers.map((tier) => ({
            threshold: Number(tier.threshold),
            rewardType: tier.rewardType.trim(),
            rewardLabel: tier.rewardLabel.trim(),
            rewardValueYuan: Number(tier.rewardValueYuan),
            enabled: tier.enabled,
          })),
        }))

        if (normalizedGiftGroups.length === 0) {
          throw new Error('礼物收集类活动至少需要配置一组礼物')
        }

        if (normalizedGiftGroups.some((group) => !group.itemName)) {
          throw new Error('礼物名称不能为空')
        }

        if (normalizedGiftGroups.some((group) => group.tiers.length === 0)) {
          throw new Error('每组礼物至少需要添加一个数量门槛（档位）')
        }

        for (const group of normalizedGiftGroups) {
          for (const tier of group.tiers) {
            if (
              !tier.rewardType ||
              !tier.rewardLabel ||
              Number.isNaN(tier.threshold) ||
              Number.isNaN(tier.rewardValueYuan)
            ) {
              throw new Error('请把每个档位的数量门槛、奖励类型、奖励内容与奖励价值填写完整')
            }

            if (tier.rewardValueYuan < 0) {
              throw new Error('奖励价值必须大于等于 0')
            }
          }
        }

        let sortOrder = 0
        const normalizedGiftItems = normalizedGiftGroups.map((group, index) => ({
          itemCode: `gift_item_${index + 1}`,
          itemName: group.itemName,
          itemType: 'gift',
          enabled: group.enabled,
          sortOrder: index,
        }))

        const normalizedGiftRules = normalizedGiftGroups.flatMap((group, groupIndex) => {
          const itemCode = normalizedGiftItems[groupIndex]?.itemCode
          if (!itemCode) {
            return []
          }

          return group.tiers.map((tier) => {
            const currentOrder = sortOrder
            sortOrder += 1
            return {
              itemCode,
              compareMode: 'gte' as const,
              threshold: tier.threshold,
              rewardType: tier.rewardType,
              rewardLabel: tier.rewardLabel,
              rewardValueYuan: tier.rewardValueYuan,
              enabled: tier.enabled,
              sortOrder: currentOrder,
            }
          })
        })

        return apiJson<ActivityConfigResponse>(`/activities/${expandedActivity.id}/config`, {
          method: 'PUT',
          body: JSON.stringify({
            items: normalizedGiftItems,
            rules: normalizedGiftRules,
          }),
        })
      }

      if (expandedActivity.type.typeCode === 'pk_score') {
        const normalizedPkRules = pkRules.map((rule) => {
          const rewardType = rule.rewardType.trim()
          const rewardLabel = rule.rewardLabel.trim()
          const rewardValueYuan = Number(rule.rewardValueYuan)
          const threshold = Number(rule.threshold)

          if (!rewardType || !rewardLabel || Number.isNaN(threshold) || Number.isNaN(rewardValueYuan)) {
            throw new Error('PK 规则的阈值、奖励类型、奖励内容与奖励价值都要填写完整')
          }

          if (rewardValueYuan < 0) {
            throw new Error('奖励价值必须大于等于 0')
          }

          return {
            threshold,
            rewardType,
            rewardLabel,
            rewardValueYuan,
            enabled: rule.enabled,
          }
        })

        return apiJson<ActivityConfigResponse>(`/activities/${expandedActivity.id}/config`, {
          method: 'PUT',
          body: JSON.stringify({
            items: [
              {
                itemCode: 'pk_score',
                itemName: 'PK值',
                itemType: 'pk_score',
                enabled: true,
                sortOrder: 0,
              },
            ],
            rules: normalizedPkRules.map((rule, index) => ({
              itemCode: 'pk_score',
              compareMode: 'gte',
              threshold: rule.threshold,
              rewardType: rule.rewardType,
              rewardLabel: rule.rewardLabel,
              rewardValueYuan: rule.rewardValueYuan,
              enabled: rule.enabled,
              sortOrder: index,
            })),
          }),
        })
      }

      throw new Error('当前活动类型无法在此页面配置规则，请先确认活动类型设置是否正确。')
    },
    onSuccess: async () => {
      setConfigError(null)
      setConfigSuccess('规则配置已保存')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: activitiesQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['activity-config', expandedActivityId] }),
      ])
    },
    onError: (error) => {
      setConfigSuccess(null)
      setConfigError(error instanceof Error ? error.message : '保存配置失败')
    },
  })

  function toggleActivityConfig(activityId: string) {
    setConfigError(null)
    setConfigSuccess(null)
    setExpandedActivityId((current) => (current === activityId ? null : activityId))
  }

  function handleAddGiftRule() {
    setConfigSuccess(null)
    setGiftGroups((current) => [
      ...current,
      {
        itemName: '',
        enabled: true,
        tiers: [
          {
            threshold: '',
            rewardType: 'cash',
            rewardLabel: '',
            rewardValueYuan: '',
            enabled: true,
          },
        ],
      },
    ])
  }

  function handleGiftGroupChange(
    index: number,
    key: keyof Omit<GiftGroupDraft, 'tiers'>,
    value: GiftGroupDraft[keyof Omit<GiftGroupDraft, 'tiers'>],
  ) {
    setConfigSuccess(null)
    setGiftGroups((current) =>
      current.map((group, groupIndex) => (groupIndex === index ? { ...group, [key]: value } : group)),
    )
  }

  function handleGiftTierChange(
    groupIndex: number,
    tierIndex: number,
    key: keyof GiftTierDraft,
    value: GiftTierDraft[keyof GiftTierDraft],
  ) {
    setConfigSuccess(null)
    setGiftGroups((current) =>
      current.map((group, currentGroupIndex) => {
        if (currentGroupIndex !== groupIndex) {
          return group
        }

        return {
          ...group,
          tiers: group.tiers.map((tier, currentTierIndex) =>
            currentTierIndex === tierIndex ? { ...tier, [key]: value } : tier,
          ),
        }
      }),
    )
  }

  function handleAddGiftTier(groupIndex: number) {
    setConfigSuccess(null)
    setGiftGroups((current) =>
      current.map((group, currentGroupIndex) => {
        if (currentGroupIndex !== groupIndex) {
          return group
        }

        return {
          ...group,
          tiers: [
            ...group.tiers,
            {
              threshold: '',
              rewardType: 'cash',
              rewardLabel: '',
              rewardValueYuan: '',
              enabled: true,
            },
          ],
        }
      }),
    )
  }

  async function handleDeleteGiftTier(groupIndex: number, tierIndex: number) {
    const approved = await confirm({
      title: '确认删除这个档位吗？',
      message: '删除后会影响后续算奖规则，但不会修改已提交的历史记录。',
      confirmText: '确认删除',
      variant: 'danger',
    })
    if (!approved) {
      return
    }

    setConfigSuccess(null)
    setGiftGroups((current) =>
      current.map((group, currentGroupIndex) => {
        if (currentGroupIndex !== groupIndex) {
          return group
        }

        if (group.tiers.length <= 1) {
          return {
            ...group,
            tiers: [
              {
                threshold: '',
                rewardType: 'cash',
                rewardLabel: '',
                rewardValueYuan: '',
                enabled: true,
              },
            ],
          }
        }

        return {
          ...group,
          tiers: group.tiers.filter((_, currentTierIndex) => currentTierIndex !== tierIndex),
        }
      }),
    )
  }

  async function handleDeleteGiftRule(index: number) {
    const approved = await confirm({
      title: '确认删除这个礼物吗？',
      message: '删除后该礼物的所有档位都会被移除，保存后会影响后续算奖规则。',
      confirmText: '确认删除',
      variant: 'danger',
    })
    if (!approved) {
      return
    }

    setConfigSuccess(null)
    setGiftGroups((current) => current.filter((_, groupIndex) => groupIndex !== index))
  }

  function handleAddPkRule() {
    setConfigSuccess(null)
    setPkRules((current) => [
      ...current,
      {
        threshold: '',
        rewardType: 'cash',
        rewardLabel: '',
        rewardValueYuan: '',
        enabled: true,
      },
    ])
  }

  function handlePkRuleChange(
    index: number,
    key: keyof PkRuleDraft,
    value: PkRuleDraft[keyof PkRuleDraft],
  ) {
    setConfigSuccess(null)
    setPkRules((current) =>
      current.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, [key]: value } : rule)),
    )
  }

  async function handleDeletePkRule(index: number) {
    const approved = await confirm({
      title: '确认删除这条 PK 规则吗？',
      message: '删除后会影响后续算奖规则，但不会修改已提交的历史记录。',
      confirmText: '确认删除',
      variant: 'danger',
    })
    if (!approved) {
      return
    }

    setConfigSuccess(null)
    setPkRules((current) => current.filter((_, ruleIndex) => ruleIndex !== index))
  }

  function handleSaveConfig() {
    setConfigError(null)
    setConfigSuccess(null)

    if (!expandedActivity) {
      setConfigError('请先点击要配置的活动')
      return
    }

    if (expandedActivity.type.typeCode === 'gift_collection' && giftGroups.length === 0) {
      setConfigError('礼物收集类活动至少需要配置一组礼物')
      return
    }

    if (expandedActivity.type.typeCode === 'pk_score' && pkRules.length === 0) {
      setConfigError('PK 类活动至少需要配置一组规则')
      return
    }

    saveConfigMutation.mutate()
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-brand-600">规则管理</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">按活动配置提报规则</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              这里按活动类型配置主播提报规则。开播时间和截图上传为固定项，无需在此设置。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void activitiesQuery.refetch()}
            className="app-btn-secondary"
          >
            <RefreshCw className="h-4 w-4" />
            刷新活动
          </button>
        </div>

        {activitiesQuery.isLoading ? (
          <LoadingBlock text="正在加载活动，请稍候..." minHeightClassName="min-h-40" />
        ) : activitiesQuery.isError ? (
          <ErrorBlock message={activitiesQuery.error instanceof Error ? activitiesQuery.error.message : '活动列表加载失败'} />
        ) : activitiesQuery.data && activitiesQuery.data.items.length > 0 ? (
          <div className="mt-6 space-y-4">
            {activitiesQuery.data.items.map((item) => {
              const isExpanded = item.id === expandedActivityId

              return (
                <article key={item.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-lg font-semibold text-slate-900">{item.name}</h3>
                        <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
                          {item.type.typeName}
                        </span>
                        <span className={activityStatusClassMap[item.status]}>{activityStatusTextMap[item.status]}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">
                        时间范围：{formatDateTime(item.startAt)} - {formatDateTime(item.endAt)}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        统计方式：{formatAggregation(item.type.aggregationMode)}
                        {item.type.metricUnit ? ` | 单位：${item.type.metricUnit}` : ''}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        已配置收集项 {item.itemCount} 个 | 奖励规则 {item.ruleCount} 条
                      </p>
                      {item.description ? (
                        <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-slate-600">
                          {item.description}
                        </p>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleActivityConfig(item.id)}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition ${
                        isExpanded
                          ? 'bg-brand-600 text-white shadow-soft'
                          : 'bg-transparent text-brand-600 hover:bg-brand-50 hover:text-brand-700'
                      }`}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      {isExpanded ? '收起配置' : item.ruleCount > 0 ? '重新编辑规则' : '规则配置'}
                    </button>
                  </div>

                  {isExpanded ? (
                    <div className="mt-6 border-t border-slate-200 pt-6">
                      {configQuery.isLoading ? (
                        <LoadingBlock text="正在加载当前活动规则..." minHeightClassName="min-h-40" />
                      ) : configQuery.isError ? (
                        <ErrorBlock message={configQuery.error instanceof Error ? configQuery.error.message : '活动规则加载失败'} />
                      ) : item.type.typeCode === 'gift_collection' ? (
                        <div className="space-y-6">
                          <div className="rounded-2xl border border-brand-100 bg-brand-50/60 px-4 py-4 text-sm leading-6 text-brand-800">
                            主播提交页将固定显示“开播时间”和“截图上传”。这里仅配置主播需要填写的礼物规则，每新增一个礼物就代表一个礼物填写项，每个礼物可配置多个数量门槛（档位）。
                          </div>

                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <h4 className="text-base font-semibold text-slate-900">礼物收集规则</h4>
                              <p className="mt-1 text-sm text-slate-500">
                                同一礼物可添加多个数量门槛（档位），系统只按命中的最高档位发放奖励。
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={handleAddGiftRule}
                              className="app-btn-secondary"
                            >
                              <Plus className="h-4 w-4" />
                              新增礼物
                            </button>
                          </div>

                          {giftGroups.length > 0 ? (
                            <div className="space-y-3">
                              {giftGroups.map((group, groupIndex) => (
                                <div
                                  key={`gift-group-${groupIndex}`}
                                  className="rounded-3xl border border-slate-200 bg-white p-4"
                                >
                                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div className="grid gap-3 lg:flex-1 lg:grid-cols-[1.3fr_0.8fr]">
                                      <label className="block">
                                        <span className="text-xs font-medium text-slate-500">礼物名称</span>
                                        <input
                                          value={group.itemName}
                                          onChange={(event) =>
                                            handleGiftGroupChange(groupIndex, 'itemName', event.target.value)
                                          }
                                          placeholder="例如：嘉年华"
                                          className="mt-2 app-field"
                                        />
                                      </label>

                                      <div className="block">
                                        <span className="text-xs font-medium text-slate-500">填写项状态</span>
                                        <label className="mt-2 app-btn-secondary justify-start whitespace-nowrap">
                                          <input
                                            type="checkbox"
                                            checked={group.enabled}
                                            onChange={(event) =>
                                              handleGiftGroupChange(groupIndex, 'enabled', event.target.checked)
                                            }
                                            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                          />
                                          启用礼物填写项
                                        </label>
                                      </div>
                                    </div>

                                    <button
                                      type="button"
                                    onClick={() => void handleDeleteGiftRule(groupIndex)}
                                      className="app-btn-danger whitespace-nowrap"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      删除礼物
                                    </button>
                                  </div>

                                  <div className="mt-4 space-y-3">
                                    {group.tiers.length > 0 ? (
                                      group.tiers.map((tier, tierIndex) => (
                                        <div
                                          key={`gift-tier-${groupIndex}-${tierIndex}`}
                                          className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 lg:grid-cols-[0.85fr_0.85fr_1.3fr_0.85fr_auto]"
                                        >
                                          <label className="block">
                                            <span className="text-xs font-medium text-slate-500">数量门槛</span>
                                            <input
                                              type="number"
                                              step="0.01"
                                              value={tier.threshold}
                                              onChange={(event) =>
                                                handleGiftTierChange(
                                                  groupIndex,
                                                  tierIndex,
                                                  'threshold',
                                                  event.target.value,
                                                )
                                              }
                                              placeholder="例如：10"
                                              className="mt-2 app-field"
                                            />
                                          </label>

                                          <label className="block">
                                            <span className="text-xs font-medium text-slate-500">奖励类型</span>
                                            <select
                                              value={tier.rewardType}
                                              onChange={(event) =>
                                                handleGiftTierChange(
                                                  groupIndex,
                                                  tierIndex,
                                                  'rewardType',
                                                  event.target.value,
                                                )
                                              }
                                              className="mt-2 app-select"
                                            >
                                              <option value="cash">现金</option>
                                              <option value="gift">礼物</option>
                                              <option value="other">其他</option>
                                            </select>
                                          </label>

                                          <label className="block">
                                            <span className="text-xs font-medium text-slate-500">奖励内容</span>
                                            <input
                                              value={tier.rewardLabel}
                                              onChange={(event) =>
                                                handleGiftTierChange(
                                                  groupIndex,
                                                  tierIndex,
                                                  'rewardLabel',
                                                  event.target.value,
                                                )
                                              }
                                              placeholder="例如：奖励 100 元"
                                              className="mt-2 app-field"
                                            />
                                          </label>

                                          <label className="block">
                                            <span className="text-xs font-medium text-slate-500">奖励价值(元)</span>
                                            <input
                                              type="number"
                                              step="0.01"
                                              value={tier.rewardValueYuan}
                                              onChange={(event) =>
                                                handleGiftTierChange(
                                                  groupIndex,
                                                  tierIndex,
                                                  'rewardValueYuan',
                                                  event.target.value,
                                                )
                                              }
                                              placeholder="例如：100"
                                              className="mt-2 app-field"
                                            />
                                          </label>

                                          <div className="pt-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-end">
                                            <label className="app-btn-secondary justify-start whitespace-nowrap">
                                              <input
                                                type="checkbox"
                                                checked={tier.enabled}
                                                onChange={(event) =>
                                                  handleGiftTierChange(
                                                    groupIndex,
                                                    tierIndex,
                                                    'enabled',
                                                    event.target.checked,
                                                  )
                                                }
                                                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                              />
                                              启用档位
                                            </label>

                                            <button
                                              type="button"
                                              onClick={() => void handleDeleteGiftTier(groupIndex, tierIndex)}
                                              className="app-btn-danger whitespace-nowrap"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                              删除档位
                                            </button>
                                          </div>
                                        </div>
                                      ))
                                    ) : (
                                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                                        暂无档位配置，点击下方“新增档位”开始设置。
                                      </div>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => handleAddGiftTier(groupIndex)}
                                      className="app-btn-secondary"
                                    >
                                      <Plus className="h-4 w-4" />
                                      新增档位
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <EmptyState tone="plain" title="暂无规则配置" description="点击“新增礼物”开始配置。" />
                          )}
                        </div>
                      ) : item.type.typeCode === 'pk_score' ? (
                        <div className="space-y-6">
                          <div className="rounded-2xl border border-brand-100 bg-brand-50/60 px-4 py-4 text-sm leading-6 text-brand-800">
                            主播提交页将固定显示“开播时间”和“截图上传”，并填写本场 PK 值。这里仅配置不同 PK 值门槛对应的奖励内容。
                          </div>

                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <h4 className="text-base font-semibold text-slate-900">PK 奖励规则</h4>
                              <p className="mt-1 text-sm text-slate-500">每组配置一条 PK 值门槛和对应奖励。</p>
                            </div>
                            <button
                              type="button"
                              onClick={handleAddPkRule}
                              className="app-btn-secondary"
                            >
                              <Plus className="h-4 w-4" />
                              新增一组
                            </button>
                          </div>

                          {pkRules.length > 0 ? (
                            <div className="space-y-3">
                              {pkRules.map((rule, index) => (
                                <div
                                  key={`pk-rule-${index}`}
                                  className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 lg:grid-cols-[1fr_0.9fr_1.4fr_0.9fr_auto]"
                                >
                                  <label className="block">
                                    <span className="text-xs font-medium text-slate-500">PK 值门槛</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={rule.threshold}
                                      onChange={(event) =>
                                        handlePkRuleChange(index, 'threshold', event.target.value)
                                      }
                                      placeholder="例如：5000"
                                      className="mt-2 app-field"
                                    />
                                  </label>

                                  <label className="block">
                                    <span className="text-xs font-medium text-slate-500">奖励类型</span>
                                    <select
                                      value={rule.rewardType}
                                      onChange={(event) =>
                                        handlePkRuleChange(index, 'rewardType', event.target.value)
                                      }
                                      className="mt-2 app-select"
                                    >
                                      <option value="cash">现金</option>
                                      <option value="gift">礼物</option>
                                      <option value="other">其他</option>
                                    </select>
                                  </label>

                                  <label className="block">
                                    <span className="text-xs font-medium text-slate-500">奖励内容</span>
                                    <input
                                      value={rule.rewardLabel}
                                      onChange={(event) =>
                                        handlePkRuleChange(index, 'rewardLabel', event.target.value)
                                      }
                                      placeholder="例如：奖励 200 元"
                                      className="mt-2 app-field"
                                    />
                                  </label>

                                  <label className="block">
                                    <span className="text-xs font-medium text-slate-500">奖励价值(元)</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={rule.rewardValueYuan}
                                      onChange={(event) =>
                                        handlePkRuleChange(index, 'rewardValueYuan', event.target.value)
                                      }
                                      placeholder="例如：200"
                                      className="mt-2 app-field"
                                    />
                                  </label>

                                  <div className="pt-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-end">
                                    <label className="app-btn-secondary justify-start whitespace-nowrap">
                                      <input
                                        type="checkbox"
                                        checked={rule.enabled}
                                        onChange={(event) =>
                                          handlePkRuleChange(index, 'enabled', event.target.checked)
                                        }
                                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                      />
                                      启用
                                    </label>

                                    <button
                                      type="button"
                                      onClick={() => void handleDeletePkRule(index)}
                                      className="app-btn-danger whitespace-nowrap"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      删除
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <EmptyState
                              tone="plain"
                              title="暂无规则配置"
                              description="点击“新增一组”开始配置 PK 奖励规则。"
                            />
                          )}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-700">
                          当前活动类型无法在此页面配置规则，请先确认活动类型设置是否正确。
                        </div>
                      )}

                      {configError ? (
                        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                          {configError}
                        </div>
                      ) : null}

                      {configSuccess ? (
                        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                          {configSuccess}
                        </div>
                      ) : null}

                      <div className="mt-6 flex justify-end">
                        <button
                          type="button"
                          disabled={saveConfigMutation.isPending || configQuery.isLoading}
                          onClick={handleSaveConfig}
                          className="app-btn-primary"
                        >
                          {saveConfigMutation.isPending ? (
                            <>
                              <LoaderCircle className="h-4 w-4 animate-spin" />
                              正在保存配置
                            </>
                          ) : (
                            <>
                              <Save className="h-4 w-4" />
                              保存配置
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        ) : (
          <EmptyState title="当前暂无活动" description="先创建活动，再来配置提报规则。" />
        )}
      </section>

      {dialog}
    </div>
  )
}

function buildGiftGroupDrafts(items: ActivityConfigItem[], rules: RewardRuleItem[]): GiftGroupDraft[] {
  const itemNameByCode = new Map(items.map((item) => [item.itemCode, item.itemName]))
  const groups: GiftGroupDraft[] = items.map((item) => ({
    itemName: item.itemName,
    enabled: item.enabled,
    tiers:
      rules.length > 0
        ? []
        : [
            {
              threshold: '',
              rewardType: 'cash',
              rewardLabel: '',
              rewardValueYuan: '',
              enabled: true,
            },
          ],
  }))

  if (rules.length === 0) {
    return groups
  }

  const groupsByItemName = new Map<string, GiftGroupDraft>()
  for (const group of groups) {
    const key = group.itemName.trim()
    if (!key) {
      continue
    }
    groupsByItemName.set(key, group)
  }

  const sortedRules = [...rules].sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))
  for (const rule of sortedRules) {
    const itemName = rule.itemCode ? itemNameByCode.get(rule.itemCode) ?? '' : ''
    if (!itemName) {
      continue
    }

    const key = itemName.trim()
    let group = groupsByItemName.get(key) ?? null
    if (!group) {
      group = {
        itemName,
        enabled: true,
        tiers: [],
      }
      groupsByItemName.set(key, group)
      groups.push(group)
    }

    group.tiers.push({
      threshold: String(rule.threshold),
      rewardType: rule.rewardType,
      rewardLabel: rule.rewardLabel,
      rewardValueYuan: String(rule.rewardValueYuan ?? 0),
      enabled: rule.enabled,
    })
  }

  for (const group of groups) {
    if (group.tiers.length === 0) {
      group.tiers = [
        {
          threshold: '',
          rewardType: 'cash',
          rewardLabel: '',
          rewardValueYuan: '',
          enabled: true,
        },
      ]
    }
  }

  return groups
}

function buildPkRuleDrafts(rules: RewardRuleItem[]) {
  return rules.map((rule) => ({
    threshold: String(rule.threshold),
    rewardType: rule.rewardType,
    rewardLabel: rule.rewardLabel,
    rewardValueYuan: String(rule.rewardValueYuan ?? 0),
    enabled: rule.enabled,
  }))
}

function formatAggregation(value: string) {
  if (value === 'daily') {
    return '按天累计'
  }

  if (value === 'session') {
    return '按场次统计'
  }

  return value
}
