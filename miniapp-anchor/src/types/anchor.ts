export type OperatorOption = {
  id: string
  displayName: string
}

export type AnchorProfile = {
  id: string
  wecomName: string
  anchorDisplayName: string
  assignmentStatus:
    | 'pending_confirmation'
    | 'confirmed'
    | 'rejected'
    | 'ended'
    | null
  operator: OperatorOption | null
  status: 'active' | 'paused' | 'exited'
  activatedAt: string
}
