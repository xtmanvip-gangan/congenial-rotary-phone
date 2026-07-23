import { requestJson } from '@/services/request'
import type { AnchorActivationPreview, AnchorProfile } from '@/types/anchor'

export function getMyAnchorProfile() {
  return requestJson<{ item: AnchorProfile | null }>('/anchors/me')
}

export function getMyActivation() {
  return requestJson<{ item: AnchorActivationPreview | null }>(
    '/anchors/me/activation',
  )
}

export function activateAnchor() {
  return requestJson<{ item: AnchorProfile }>('/anchors/activate', {
    method: 'POST',
  })
}

export function updateDisplayName(input: { anchorDisplayName: string }) {
  return requestJson<{ item: AnchorProfile }>('/anchors/me/display-name', {
    method: 'PATCH',
    data: input,
  })
}
