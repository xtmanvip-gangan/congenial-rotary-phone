import type { StoredSession } from '@/types/auth'

export const mockSession: StoredSession = {
  token: 'mock-preview-token',
  mode: 'mock',
  user: {
    wecomUserId: 'anchor_preview_demo',
    name: '预览主播小雨',
    avatarUrl: null,
    role: 'anchor',
    roles: ['anchor'],
    loginType: 'wecom_miniapp',
    anchorProfileStatus: 'active',
  },
}
