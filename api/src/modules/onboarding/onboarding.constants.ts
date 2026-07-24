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

/** 初次沟通情况记录表必填字段 */
export const INITIAL_COMMUNICATION_REQUIRED_FIELDS = [
  'communicatedAt',
  'availableSchedule',
  'deviceNetwork',
  'voiceAndExpression',
  'interestsAndExperience',
  'liveExperience',
  'learningCommitment',
  'liveGoals',
  'concerns',
  'basicConditionsJudgment',
  'contentAdvantages',
  'stabilityRisks',
  'nextPriority',
  'nextStepPlan',
] as const

export const INITIAL_COMMUNICATION_FIELD_LABELS: Record<string, string> = {
  communicatedAt: '沟通时间',
  channel: '沟通方式',
  availableSchedule: '可直播时间',
  deviceNetwork: '设备与网络',
  voiceAndExpression: '声音与表达',
  interestsAndExperience: '兴趣与经历',
  liveExperience: '直播经验',
  learningCommitment: '学习与投入意愿',
  liveGoals: '直播目标',
  concerns: '担心与顾虑',
  basicConditionsJudgment: '基本条件判断',
  contentAdvantages: '内容优势判断',
  stabilityRisks: '稳定开播风险',
  nextPriority: '下次优先解决',
  escalateRisks: '需上报的风险/边界',
  nextStepPlan: '约定下一步',
  extraNote: '补充备注',
}

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
