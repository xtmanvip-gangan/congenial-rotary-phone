import { getMockActivityDetail, getMockAvailableActivities } from '@/data/mock-activities'
import { requestJson } from '@/services/request'
import { useSessionStore } from '@/store/session'
import type { ActivityDetailResponse, AvailableActivitiesResponse } from '@/types/activity'

export async function getAvailableActivities() {
  const session = useSessionStore.getState().session
  if (!session || session.mode === 'mock') {
    return getMockAvailableActivities()
  }

  return requestJson<AvailableActivitiesResponse>('/submissions/available-activities')
}

export async function getActivityDetail(activityId: string) {
  const session = useSessionStore.getState().session
  if (!session || session.mode === 'mock') {
    return getMockActivityDetail(activityId)
  }

  return requestJson<ActivityDetailResponse>(`/submissions/available-activities/${activityId}`)
}
