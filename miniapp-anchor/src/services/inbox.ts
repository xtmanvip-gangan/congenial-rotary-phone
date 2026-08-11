import { requestJson } from '@/services/request'
import { useSessionStore } from '@/store/session'

export type InboxMessage = {
  id: string
  category: string
  notificationType: string
  title: string
  content: string
  linkPath: string | null
  businessType: string | null
  businessId: string | null
  read: boolean
  readAt: string | null
  createdAt: string
}

export function listInboxMessages(options?: { unreadOnly?: boolean }) {
  const session = useSessionStore.getState().session
  if (session?.mode === 'mock') {
    return Promise.resolve({
      unreadCount: 0,
      totalCount: 0,
      items: [] as InboxMessage[],
    })
  }
  const qs = options?.unreadOnly ? '?unreadOnly=1' : ''
  return requestJson<{
    unreadCount: number
    totalCount: number
    items: InboxMessage[]
  }>(`/miniapp/inbox${qs}`)
}

export function getInboxUnreadCount() {
  const session = useSessionStore.getState().session
  if (session?.mode === 'mock') {
    return Promise.resolve({ unreadCount: 0 })
  }
  return requestJson<{ unreadCount: number }>('/miniapp/inbox/unread-count')
}

export function markInboxRead(id: string) {
  return requestJson<{ item: InboxMessage }>(`/miniapp/inbox/${id}/read`, {
    method: 'POST',
  })
}

export function markAllInboxRead() {
  return requestJson<{ updated: number }>('/miniapp/inbox/read-all', {
    method: 'POST',
  })
}

/** 清空消息：read=仅已读（默认），all=全部含未读 */
export function clearInboxMessages(scope: 'read' | 'all' = 'read') {
  return requestJson<{ deleted: number; unreadCount: number }>(
    `/miniapp/inbox/clear?scope=${scope}`,
    { method: 'POST' },
  )
}

export function deleteInboxMessage(id: string) {
  return requestJson<{ deleted: boolean; wasUnread: boolean }>(
    `/miniapp/inbox/${id}`,
    { method: 'DELETE' },
  )
}
