import type { AppRole } from './auth'

export type DashboardResponse = {
  role: AppRole
  generatedAt: string
  metrics: Record<string, number>
}

export type SystemJobRun = {
  id: string
  jobCode: string
  status: 'running' | 'succeeded' | 'partial' | 'failed'
  scannedCount: number
  successCount: number
  failureCount: number
  lastError: string | null
  startedAt: string
  finishedAt: string | null
}

export type IntegrationIncident = {
  id: string
  provider: string
  operation: string
  status: 'open' | 'recovered' | 'closed'
  severity: 'warning' | 'error' | 'critical'
  occurrenceCount: number
  errorMessage: string
  lastOccurredAt: string
  resolutionNote: string | null
}
