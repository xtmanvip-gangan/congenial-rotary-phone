import type { OnboardingMilestoneType } from '@prisma/client'

/** 计入岗前进度的 7 个节点（不含运营接收 / 开播前准备） */
export const ONBOARDING_PROGRESS_MILESTONES = [
  'initial_communication',
  'homepage_ready',
  'live_software_ready',
  'helper_software_ready',
  'prejob_learning_completed',
  'first_live_completed',
  'first_live_review_completed',
] as const satisfies readonly OnboardingMilestoneType[]

export type ProgressMilestoneType =
  (typeof ONBOARDING_PROGRESS_MILESTONES)[number]

/** 提交后需主播确认的节点 */
export const ANCHOR_CONFIRM_MILESTONES = new Set<ProgressMilestoneType>([
  'initial_communication',
  'prejob_learning_completed',
  'first_live_review_completed',
])

/** 仅需截图的节点 */
export const SCREENSHOT_MILESTONES = new Set<ProgressMilestoneType>([
  'homepage_ready',
  'live_software_ready',
  'helper_software_ready',
  'first_live_completed',
])

export const MILESTONE_LABELS: Record<ProgressMilestoneType, string> = {
  initial_communication: '初次沟通',
  homepage_ready: '个人主页',
  live_software_ready: '直播软件',
  helper_software_ready: '辅助软件',
  prejob_learning_completed: '岗前基础学习',
  first_live_completed: '独立首播',
  first_live_review_completed: '首播复盘',
}

/** 沟通方式 */
export const CHANNEL_OPTIONS = ['电话', '文字', '语音'] as const

/** 设备与网络（四组组合） */
export const DEVICE_NETWORK_OPTIONS = [
  '电脑 + 声卡',
  '手机 + 耳机',
  '仅手机',
  '手机 + 外接声卡',
] as const

/** 声音特点（可多选） */
export const VOICE_TRAIT_OPTIONS = [
  '低沉舒缓',
  '明亮清脆',
  '温柔细腻',
  '磁性有力',
  '偏沙哑/烟嗓',
  '吐字清晰、语速适中',
  '尚不稳定/需练声',
  '其他',
] as const

/** 直播经验（单选） */
export const LIVE_EXPERIENCE_OPTIONS = [
  '零基础，未播过',
  '试播过几次',
  '有过短期开播（不足1个月）',
  '有过稳定开播经验',
  '其他平台有经验，抖音新号',
] as const

/** 学习与投入意愿（单选） */
export const LEARNING_COMMITMENT_OPTIONS = [
  '很高：可每天学练与复盘',
  '较高：每周固定几天可投入',
  '一般：时间碎，需压缩任务',
  '偏弱：目前难保证学习节奏',
  '暂不明确',
] as const

/** 直播目标（可多选） */
export const LIVE_GOAL_OPTIONS = [
  '增加收入',
  '表达/展示自己',
  '陪伴他人、做情绪价值',
  '多一个发展方向/副业',
  '先验证适不适合',
  '其他',
] as const

/**
 * 初次沟通必填字段（提交校验）
 * 结构化选项字段在服务端单独校验取值范围
 */
export const INITIAL_COMMUNICATION_REQUIRED_FIELDS = [
  'communicatedAt',
  'channel',
  'availableScheduleStart',
  'availableScheduleEnd',
  'deviceNetwork',
  'voiceTraits',
  'interestsAndExperience',
  'liveExperience',
  'learningCommitment',
  'liveGoals',
  'concerns',
  'contentRecommendation',
  'basicConditionsJudgment',
  'stabilityRisks',
] as const

export const INITIAL_COMMUNICATION_FIELD_LABELS: Record<string, string> = {
  communicatedAt: '沟通时间',
  channel: '沟通方式',
  availableScheduleStart: '可直播开始时间',
  availableScheduleEnd: '可直播结束时间',
  deviceNetwork: '设备与网络',
  voiceTraits: '声音特点',
  interestsAndExperience: '兴趣经历',
  liveExperience: '直播经验',
  learningCommitment: '学习与投入意愿',
  liveGoals: '直播目标',
  concerns: '担心顾虑',
  contentRecommendation: '内容推荐',
  basicConditionsJudgment: '基本条件判断',
  stabilityRisks: '稳定开播风险',
}

/** 前端表单元数据（选项 + 类型） */
export const INITIAL_COMMUNICATION_FORM_META = {
  channelOptions: CHANNEL_OPTIONS,
  deviceNetworkOptions: DEVICE_NETWORK_OPTIONS,
  voiceTraitOptions: VOICE_TRAIT_OPTIONS,
  liveExperienceOptions: LIVE_EXPERIENCE_OPTIONS,
  learningCommitmentOptions: LEARNING_COMMITMENT_OPTIONS,
  liveGoalOptions: LIVE_GOAL_OPTIONS,
  fieldLabels: INITIAL_COMMUNICATION_FIELD_LABELS,
} as const

/** 岗前培训确认 10 项（主播小程序） */
export const TRAINING_CONFIRM_ITEMS = [
  {
    key: 'liveSoftwareReady',
    label: '直播软件已安装并会使用',
  },
  {
    key: 'accountPackReady',
    label: '直播账号四件套已设置（头像、昵称、简介、背景图）',
  },
  {
    key: 'redLinesUnderstood',
    label: '违规红线13条已清楚',
  },
  {
    key: 'scheduleConfirmed',
    label: '开播时间段已确定',
  },
  {
    key: 'mindsetAligned',
    label: '对直播的认知和心态已对齐',
  },
  {
    key: 'coreMetricsUnderstood',
    label: '核心数据（停留→互动→关注→付费）已理解',
  },
  {
    key: 'toolsUnderstood',
    label: '辅助工具（福袋、心愿单等）已了解',
  },
  {
    key: 'scriptReceived',
    label: '直播脚本已收到',
  },
  {
    key: 'processMemorized',
    label: '直播流程已记住',
  },
  {
    key: 'firstLiveScheduled',
    label: '首播时间已定好，准时开播',
  },
] as const

export type TrainingConfirmKey = (typeof TRAINING_CONFIRM_ITEMS)[number]['key']
