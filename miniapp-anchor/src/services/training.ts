import { requestJson } from '@/services/request'
import { useSessionStore } from '@/store/session'
import type {
  MyTrainingResponse,
  TrainingCourse,
  TrainingSession,
} from '@/types/training'

const mockCourses: TrainingCourse[] = [
  {
    id: 'course-1',
    code: 'course_1',
    title: '台宣、Q新、互动与话题延展',
    level: 'basic_required',
    sequence: 1,
    summary: '掌握最基础的开场、欢迎、互动和话题延展。',
    objectives: [],
    practiceTasks: ['完成一次标准开场', '练习欢迎和话题延展'],
    status: 'active',
    materialLinks: [],
  },
  {
    id: 'course-2',
    code: 'course_2',
    title: '礼物、心愿单与基础感谢',
    level: 'basic_required',
    sequence: 2,
    summary: '掌握礼物识别、心愿单设置和基础感谢。',
    objectives: [],
    practiceTasks: ['设置一份心愿单'],
    status: 'active',
    materialLinks: [],
  },
  {
    id: 'course-3',
    code: 'course_3',
    title: '语音电台内容方向',
    level: 'basic_required',
    sequence: 3,
    summary: '建立适合自身的语音电台内容方向。',
    objectives: [],
    practiceTasks: ['准备三个可持续话题'],
    status: 'active',
    materialLinks: [],
  },
]

let mockRegistration: TrainingSession['myRegistration'] = null

function mockSessions(): TrainingSession[] {
  const startAt = new Date(Date.now() + 24 * 60 * 60_000)
  startAt.setHours(18, 30, 0, 0)
  return [
    {
      id: 'session-mock-1',
      course: mockCourses[0],
      teacher: { id: 'teacher-1', displayName: '培训老师小安' },
      scheduledStartAt: startAt.toISOString(),
      scheduledEndAt: new Date(startAt.getTime() + 60 * 60_000).toISOString(),
      capacity: 50,
      status: 'published',
      registeredCount: mockRegistration?.status === 'registered' ? 21 : 20,
      waitlistCount: 0,
      remainingSeats: mockRegistration?.status === 'registered' ? 29 : 30,
      myRegistration: mockRegistration,
    },
  ]
}

export async function getTrainingSessions() {
  const session = useSessionStore.getState().session
  if (!session || session.mode === 'mock') {
    return { items: mockSessions() }
  }
  return requestJson<{ items: TrainingSession[] }>('/training/sessions')
}

export async function getMyTraining() {
  const session = useSessionStore.getState().session
  if (!session || session.mode === 'mock') {
    return {
      registrations: mockRegistration
        ? [{ ...mockRegistration, session: mockSessions()[0] }]
        : [],
      progress: mockCourses.map((course) => ({
        course,
        status:
          mockRegistration && course.id === 'course-1'
            ? ('registered' as const)
            : ('not_started' as const),
        makeupStatus: 'none' as const,
        firstLearnedAt: null,
        lastLearnedAt: null,
      })),
    } satisfies MyTrainingResponse
  }
  return requestJson<MyTrainingResponse>('/training/me')
}

export async function registerTrainingSession(sessionId: string) {
  const session = useSessionStore.getState().session
  if (!session || session.mode === 'mock') {
    mockRegistration = {
      id: 'registration-mock-1',
      status: 'registered',
      waitlistPosition: null,
      learningType: 'first_learning',
    }
    return { item: mockRegistration }
  }
  return requestJson<{ item: TrainingSession['myRegistration'] }>(
    `/training/sessions/${sessionId}/register`,
    { method: 'POST' },
  )
}

export async function cancelTrainingRegistration(registrationId: string) {
  const session = useSessionStore.getState().session
  if (!session || session.mode === 'mock') {
    mockRegistration = null
    return { ok: true }
  }
  return requestJson<{ ok: true }>(
    `/training/registrations/${registrationId}`,
    { method: 'DELETE' },
  )
}
