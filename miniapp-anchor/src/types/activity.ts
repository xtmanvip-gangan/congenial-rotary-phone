export type CompareMode = 'gte' | 'eq'

export type RewardRuleReference = {
  itemName: string | null
  threshold: number
  rewardType: string
  rewardLabel: string
  compareMode: CompareMode
  rewardValueCents?: number
}

export type ActivityTypeInfo = {
  typeCode: string
  typeName: string
  aggregationMode: string
  metricUnit: string | null
}

export type GiftCollectionFormConfig = {
  mode: 'gift_collection'
  giftItems: Array<{ itemName: string }>
  rewardRules: RewardRuleReference[]
}

export type PkScoreFormConfig = {
  mode: 'pk_score'
  rewardRules: RewardRuleReference[]
}

export type ActivityFormConfig = GiftCollectionFormConfig | PkScoreFormConfig

export type AvailableActivityItem = {
  id: string
  name: string
  startAt: string
  endAt: string
  description: string | null
  coverUrl: string | null
  ruleCount: number
  entryCount: number
  entrySummary: string
  type: ActivityTypeInfo
}

export type ActivityDetailItem = {
  id: string
  name: string
  startAt: string
  endAt: string
  description: string | null
  coverUrl: string | null
  type: ActivityTypeInfo
  formConfig: ActivityFormConfig
}

export type ActivityOperator = {
  id: string
  displayName: string
}

export type AvailableActivitiesResponse = {
  items: AvailableActivityItem[]
}

export type ActivityDetailResponse = {
  item: ActivityDetailItem
  operators: ActivityOperator[]
}
