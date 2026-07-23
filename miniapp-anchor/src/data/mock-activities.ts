import type {
  ActivityDetailItem,
  ActivityDetailResponse,
  ActivityOperator,
  AvailableActivitiesResponse,
  AvailableActivityItem,
} from '@/types/activity'

const operators: ActivityOperator[] = [
  { id: 'operator-1', displayName: '运营老师-安安' },
  { id: 'operator-2', displayName: '运营老师-阿泽' },
]

const availableActivities: AvailableActivityItem[] = [
  {
    id: 'activity-gift-1',
    name: '七月礼物收集冲刺',
    startAt: '2026-07-16T08:00:00.000Z',
    endAt: '2026-07-25T15:59:00.000Z',
    description: '主播按当天礼物累计数量参与结算，系统自动命中同礼物最高奖励档位。',
    ruleCount: 5,
    entryCount: 3,
    entrySummary: '鲜花、掌声、气球',
    type: {
      typeCode: 'gift_collection',
      typeName: '礼物收集',
      aggregationMode: 'daily',
      metricUnit: '个',
    },
  },
  {
    id: 'activity-pk-1',
    name: '周末 PK 值挑战赛',
    startAt: '2026-07-18T02:00:00.000Z',
    endAt: '2026-07-30T15:00:00.000Z',
    description: '按单场 PK 值结算奖励，适合做高爆发场次冲刺。',
    ruleCount: 3,
    entryCount: 1,
    entrySummary: 'PK 值',
    type: {
      typeCode: 'pk_score',
      typeName: 'PK 挑战',
      aggregationMode: 'session',
      metricUnit: '分',
    },
  },
]

const activityDetailMap: Record<string, ActivityDetailItem> = {
  'activity-gift-1': {
    id: 'activity-gift-1',
    name: '七月礼物收集冲刺',
    startAt: '2026-07-16T08:00:00.000Z',
    endAt: '2026-07-25T15:59:00.000Z',
    description: '鲜花、掌声、气球可以分别累计，系统自动计算本次预计奖励。',
    type: {
      typeCode: 'gift_collection',
      typeName: '礼物收集',
      aggregationMode: 'daily',
      metricUnit: '个',
    },
    formConfig: {
      mode: 'gift_collection',
      giftItems: [{ itemName: '鲜花' }, { itemName: '掌声' }, { itemName: '气球' }],
      rewardRules: [
        {
          itemName: '鲜花',
          threshold: 10,
          rewardType: 'cash',
          rewardLabel: '鲜花达 10 个，奖励 20 元',
          compareMode: 'gte',
          rewardValueCents: 2000,
        },
        {
          itemName: '鲜花',
          threshold: 30,
          rewardType: 'cash',
          rewardLabel: '鲜花达 30 个，奖励 80 元',
          compareMode: 'gte',
          rewardValueCents: 8000,
        },
        {
          itemName: '掌声',
          threshold: 15,
          rewardType: 'gift',
          rewardLabel: '掌声达 15 个，奖励精选礼包',
          compareMode: 'gte',
          rewardValueCents: 5000,
        },
        {
          itemName: '气球',
          threshold: 8,
          rewardType: 'gift',
          rewardLabel: '气球达 8 个，奖励加油礼',
          compareMode: 'gte',
          rewardValueCents: 1500,
        },
      ],
    },
  },
  'activity-pk-1': {
    id: 'activity-pk-1',
    name: '周末 PK 值挑战赛',
    startAt: '2026-07-18T02:00:00.000Z',
    endAt: '2026-07-30T15:00:00.000Z',
    description: '填写本场 PK 值即可预估奖励，适用于一场一提报。',
    type: {
      typeCode: 'pk_score',
      typeName: 'PK 挑战',
      aggregationMode: 'session',
      metricUnit: '分',
    },
    formConfig: {
      mode: 'pk_score',
      rewardRules: [
        {
          itemName: null,
          threshold: 3000,
          rewardType: 'cash',
          rewardLabel: 'PK 值达 3000，奖励 30 元',
          compareMode: 'gte',
          rewardValueCents: 3000,
        },
        {
          itemName: null,
          threshold: 6000,
          rewardType: 'cash',
          rewardLabel: 'PK 值达 6000，奖励 88 元',
          compareMode: 'gte',
          rewardValueCents: 8800,
        },
        {
          itemName: null,
          threshold: 10000,
          rewardType: 'gift',
          rewardLabel: 'PK 值达 10000，奖励定制礼盒',
          compareMode: 'gte',
          rewardValueCents: 12800,
        },
      ],
    },
  },
}

export function getMockAvailableActivities(): AvailableActivitiesResponse {
  return {
    items: availableActivities.map((item) => ({ ...item, type: { ...item.type } })),
  }
}

export function getMockActivityDetail(activityId: string): ActivityDetailResponse {
  const item = activityDetailMap[activityId] ?? activityDetailMap['activity-gift-1']

  return {
    item: JSON.parse(JSON.stringify(item)) as ActivityDetailItem,
    anchorProfile: {
      id: 'profile-mock-1',
      anchorDisplayName: '主播小鹿',
      assignmentStatus: 'confirmed',
      operator: { ...operators[0] },
    },
  }
}
