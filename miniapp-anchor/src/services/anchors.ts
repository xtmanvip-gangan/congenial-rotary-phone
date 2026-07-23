import { requestJson } from '@/services/request'
import type { AnchorProfile, OperatorOption } from '@/types/anchor'

export function getMyAnchorProfile() {
  return requestJson<{ item: AnchorProfile | null }>('/anchors/me')
}

export function listActiveOperators() {
  return requestJson<{ items: OperatorOption[] }>('/staff/operators/active')
}

export function activateAnchor(input: {
  anchorDisplayName: string
  operatorId: string
}) {
  return requestJson<{ item: AnchorProfile }>('/anchors/activate', {
    method: 'POST',
    data: input,
  })
}

export function selectOperator(input: { operatorId: string }) {
  return requestJson<{ item: AnchorProfile }>('/anchors/me/operator-selection', {
    method: 'POST',
    data: input,
  })
}

export function updateDisplayName(input: { anchorDisplayName: string }) {
  return requestJson<{ item: AnchorProfile }>('/anchors/me/display-name', {
    method: 'PATCH',
    data: input,
  })
}
