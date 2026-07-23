export type CreateTencentMeetingInput = {
  subject: string
  startAt: Date
  endAt: Date
}

export type TencentMeetingDetails = {
  meetingId: string
  meetingCode: string
  joinUrl: string
  raw: Record<string, unknown>
}

export type TencentMeetingParticipant = {
  externalRecordKey: string
  externalUserId: string | null
  externalIdentityKey: string
  rawDisplayName: string
  displayName: string
  joinedAtSeconds: number | null
  leftAtSeconds: number | null
  raw: Record<string, unknown>
}

export interface TencentMeetingGateway {
  createMeeting(
    input: CreateTencentMeetingInput,
  ): Promise<TencentMeetingDetails>
  updateMeeting(
    meetingId: string,
    input: CreateTencentMeetingInput,
  ): Promise<void>
  cancelMeeting(meetingId: string, reason: string): Promise<void>
  listParticipants(meetingId: string): Promise<TencentMeetingParticipant[]>
}

export const TENCENT_MEETING_GATEWAY = Symbol('TENCENT_MEETING_GATEWAY')
