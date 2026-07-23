export type TrainingCourse = {
  id: string
  code: string
  title: string
  level: 'basic_required' | 'growth' | 'advanced' | 'special'
  sequence: number | null
  summary: string | null
  objectives: string[]
  practiceTasks: string[]
  status: string
  materialLinks: Array<{
    id: string
    title: string
    url: string
  }>
}

export type TrainingRegistrationSummary = {
  id: string
  status:
    | 'registered'
    | 'waitlisted'
    | 'cancelled'
    | 'learned'
    | 'leave'
    | 'absent'
    | 'abnormal_exit'
    | 'needs_makeup'
  waitlistPosition: number | null
  learningType: 'first_learning' | 'review' | 'makeup'
}

export type TrainingSession = {
  id: string
  course: TrainingCourse
  teacher: { id: string; displayName: string } | null
  scheduledStartAt: string
  scheduledEndAt: string
  capacity: number
  status: string
  registeredCount: number
  waitlistCount: number
  remainingSeats: number
  myRegistration: TrainingRegistrationSummary | null
}

export type TrainingProgress = {
  course: TrainingCourse
  status: 'not_started' | 'registered' | 'learned'
  makeupStatus: 'none' | 'needs_relearning' | 'waiting_makeup' | 'made_up'
  firstLearnedAt: string | null
  lastLearnedAt: string | null
}

export type MyTrainingResponse = {
  registrations: Array<
    TrainingRegistrationSummary & {
      session: TrainingSession
    }
  >
  progress: TrainingProgress[]
}
