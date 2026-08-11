import { requestJson } from '@/services/request'
import type { AnchorActivationPreview, AnchorProfile } from '@/types/anchor'

export function getMyAnchorProfile() {
  return requestJson<{ item: AnchorProfile | null }>('/anchors/me')
}

export type ActivationFlow =
  | 'legacy'
  | 'awaiting_dispatch'
  | 'awaiting_operator_confirm'
  | 'ready_to_activate'
  | 'activated'
  | 'cancelled'

export function getMyActivation() {
  return requestJson<{
    item: AnchorActivationPreview | null
    flow?: ActivationFlow
    isLegacyEligible?: boolean
  }>('/anchors/me/activation')
}

/** 老主播自选运营列表 */
export function listActiveOperators() {
  return requestJson<{ items: Array<{ id: string; displayName: string }> }>(
    '/staff/operators/active',
  )
}

export type CompleteProfilePayload = {
  avatar?: string
  /** 明文手机号（手动填写） */
  mobile?: string
  operatorId?: string
}

/** 统一资料完善并提交待运营确认（新主播任务 / 老主播自选 / 驳回回原运营） */
export function completeProfile(payload: CompleteProfilePayload) {
  return requestJson<{ item: AnchorProfile }>('/anchors/me/complete-profile', {
    method: 'POST',
    data: payload,
  })
}

/** 主播侧答疑记录（只读） */
export type QaRecordItem = {
  id: string
  qaAt: string
  question: string
  reply: string
  resultFollowUp: string | null
  followUpStatus: 'done' | 'pending' | 'overdue'
  operator: { id: string; displayName: string } | null
}

export function listMyQaRecords() {
  return requestJson<{ items: QaRecordItem[] }>('/anchors/me/qa-records')
}
