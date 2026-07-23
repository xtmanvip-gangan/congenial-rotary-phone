import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { apiJson, uploadFilesXhr } from '../lib/api'
import { formatDateTime } from '../lib/dateTime'

type Session = {
  id: string
  course: { id: string; title: string }
  scheduledStartAt: string
  status: string
  meeting: {
    meetingCode: string | null
    joinUrl: string | null
    createStatus: string
    lastError: string | null
    lastSyncAt: string | null
  } | null
}

type RosterItem = {
  id: string
  anchorProfileId: string
  anchorDisplayName: string
  wecomName: string
  operatorName: string | null
}

type AttendanceItem = {
  id: string
  displayName: string
  totalDurationSeconds: number
  sessionDurationSeconds: number
  attendanceRatio: string | number
  matchStatus: 'matched' | 'conflict' | 'unmatched'
  matchMethod: string | null
  outcome: 'pending_confirmation' | 'learned' | 'needs_makeup'
  manualReason: string | null
  anchorProfile: {
    id: string
    anchorDisplayName: string
  } | null
  registration: {
    id: string
    operatorNameSnapshot: string | null
  } | null
}

type ImportPreview = {
  importId: string
  duplicate: boolean
  summary: {
    total: number
    matched: number
    conflicts: number
    unmatched: number
    invalid: number
  }
}

export function TrainingAttendancePage() {
  const queryClient = useQueryClient()
  const [sessionId, setSessionId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [selectedAnchors, setSelectedAnchors] = useState<
    Record<string, string>
  >({})

  const sessionsQuery = useQuery({
    queryKey: ['training-sessions'],
    queryFn: () => apiJson<{ items: Session[] }>('/training/sessions'),
  })
  const attendanceQuery = useQuery({
    queryKey: ['training-attendance', sessionId],
    queryFn: () =>
      apiJson<{ items: AttendanceItem[] }>(
        `/training/sessions/${sessionId}/attendance`,
      ),
    enabled: Boolean(sessionId),
  })
  const rosterQuery = useQuery({
    queryKey: ['training-roster', sessionId],
    queryFn: () =>
      apiJson<{ items: RosterItem[] }>(
        `/training/sessions/${sessionId}/roster`,
      ),
    enabled: Boolean(sessionId),
  })
  const selectedSession = useMemo(
    () =>
      sessionsQuery.data?.items.find((item) => item.id === sessionId) ??
      null,
    [sessionId, sessionsQuery.data],
  )
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ['training-attendance', sessionId],
    })
  const sync = useMutation({
    mutationFn: () =>
      apiJson(`/training/sessions/${sessionId}/attendance/sync`, {
        method: 'POST',
      }),
    onSuccess: refresh,
  })
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('请选择.xlsx参会表')
      const formData = new FormData()
      formData.append('file', file)
      return uploadFilesXhr<ImportPreview>(
        `/training/sessions/${sessionId}/attendance/import-preview`,
        formData,
      )
    },
    onSuccess: setPreview,
  })
  const confirmImport = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error('请先上传并预览参会表')
      return apiJson(`/training/attendance-imports/${preview.importId}/confirm`, {
        method: 'POST',
      })
    },
    onSuccess: () => {
      setPreview(null)
      return refresh()
    },
  })
  const resolveMatch = useMutation({
    mutationFn: ({
      attendanceId,
      anchorProfileId,
      reason,
    }: {
      attendanceId: string
      anchorProfileId: string
      reason: string
    }) =>
      apiJson(`/training/attendance/${attendanceId}/match`, {
        method: 'PATCH',
        body: JSON.stringify({ anchorProfileId, reason }),
      }),
    onSuccess: refresh,
  })
  const resolveOutcome = useMutation({
    mutationFn: ({
      attendanceId,
      outcome,
      reason,
    }: {
      attendanceId: string
      outcome: 'learned' | 'needs_makeup'
      reason: string
    }) =>
      apiJson(`/training/attendance/${attendanceId}/outcome`, {
        method: 'PATCH',
        body: JSON.stringify({ outcome, reason }),
      }),
    onSuccess: refresh,
  })

  const mutationError =
    sync.error ||
    upload.error ||
    confirmImport.error ||
    resolveMatch.error ||
    resolveOutcome.error

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <p className="text-sm font-medium text-brand-600">参会处理</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">
          腾讯会议同步与人工确认
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          UID优先、企微名称唯一才自动匹配；同名冲突不会自动归到任何主播。
        </p>
        <select
          className="app-select mt-5"
          value={sessionId}
          onChange={(event) => {
            setSessionId(event.target.value)
            setPreview(null)
          }}
        >
          <option value="">选择培训场次</option>
          {sessionsQuery.data?.items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.course.title} · {formatDateTime(item.scheduledStartAt)}
            </option>
          ))}
        </select>
        {selectedSession ? (
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <p>
              会议状态：
              {selectedSession.meeting?.createStatus ?? '尚未创建'} · 会议号：
              {selectedSession.meeting?.meetingCode ?? '-'}
            </p>
            <p className="mt-1">
              最近同步：
              {selectedSession.meeting?.lastSyncAt
                ? formatDateTime(selectedSession.meeting.lastSyncAt)
                : '尚未同步'}
            </p>
            {selectedSession.meeting?.joinUrl ? (
              <a
                className="mt-2 inline-block text-brand-700 underline"
                href={selectedSession.meeting.joinUrl}
                target="_blank"
                rel="noreferrer"
              >
                打开腾讯会议
              </a>
            ) : null}
          </div>
        ) : null}
      </section>

      {sessionId ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6">
            <h3 className="text-lg font-semibold text-slate-900">
              自动接口同步
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              课程结束后拉取腾讯会议参会明细，并累计多次进出时长。
            </p>
            <button
              type="button"
              className="app-btn-primary mt-4"
              disabled={sync.isPending}
              onClick={() => sync.mutate()}
            >
              {sync.isPending ? '正在同步…' : '同步腾讯会议记录'}
            </button>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6">
            <h3 className="text-lg font-semibold text-slate-900">
              Excel备用导入
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              仅支持5MB以内.xlsx；先预览，确认后才形成学习结论。
            </p>
            <input
              className="app-field mt-4"
              type="file"
              accept=".xlsx"
              onChange={(event) =>
                setFile(event.target.files?.[0] ?? null)
              }
            />
            <button
              type="button"
              className="app-btn-secondary mt-3"
              disabled={!file || upload.isPending}
              onClick={() => upload.mutate()}
            >
              上传并预览
            </button>
            {preview ? (
              <div className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
                <p>
                  共{preview.summary.total}人：可匹配
                  {preview.summary.matched}，同名冲突
                  {preview.summary.conflicts}，无法匹配
                  {preview.summary.unmatched}。
                </p>
                <button
                  type="button"
                  className="app-btn-primary mt-3"
                  disabled={confirmImport.isPending}
                  onClick={() => confirmImport.mutate()}
                >
                  确认导入
                </button>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {mutationError ? (
        <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">
          {mutationError instanceof Error
            ? mutationError.message
            : '参会处理失败'}
        </p>
      ) : null}

      {sessionId ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <h3 className="text-lg font-semibold text-slate-900">参会结果</h3>
          <div className="mt-4 space-y-3">
            {attendanceQuery.data?.items.map((item) => {
              const ratio = Math.round(Number(item.attendanceRatio) * 100)
              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">
                        {item.displayName} →{' '}
                        {item.anchorProfile?.anchorDisplayName ??
                          (item.matchStatus === 'conflict'
                            ? '同名待确认'
                            : '未匹配')}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        参会{Math.round(item.totalDurationSeconds / 60)}分钟 ·
                        占比{ratio}% · {item.outcome}
                      </p>
                    </div>
                    {item.outcome === 'learned' ? (
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-700">
                        已自动完成
                      </span>
                    ) : null}
                  </div>
                  {item.matchStatus !== 'matched' ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <select
                        className="app-select min-w-56"
                        value={selectedAnchors[item.id] ?? ''}
                        onChange={(event) =>
                          setSelectedAnchors((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">选择本场报名主播</option>
                        {rosterQuery.data?.items.map((roster) => (
                          <option
                            key={roster.anchorProfileId}
                            value={roster.anchorProfileId}
                          >
                            {roster.anchorDisplayName} ·{' '}
                            {roster.operatorName ?? '待确认运营'}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="app-btn-secondary"
                        disabled={!selectedAnchors[item.id]}
                        onClick={() =>
                          resolveMatch.mutate({
                            attendanceId: item.id,
                            anchorProfileId: selectedAnchors[item.id],
                            reason: '培训老师核对本场报名名单后确认',
                          })
                        }
                      >
                        确认匹配
                      </button>
                    </div>
                  ) : item.outcome === 'pending_confirmation' ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="app-btn-primary"
                        onClick={() => {
                          const reason = window.prompt('请输入确认已学习的原因')
                          if (reason?.trim()) {
                            resolveOutcome.mutate({
                              attendanceId: item.id,
                              outcome: 'learned',
                              reason,
                            })
                          }
                        }}
                      >
                        人工确认已学习
                      </button>
                      <button
                        type="button"
                        className="app-btn-secondary"
                        onClick={() => {
                          const reason = window.prompt('请输入待补学原因')
                          if (reason?.trim()) {
                            resolveOutcome.mutate({
                              attendanceId: item.id,
                              outcome: 'needs_makeup',
                              reason,
                            })
                          }
                        }}
                      >
                        标记待补学
                      </button>
                    </div>
                  ) : null}
                </article>
              )
            })}
            {!attendanceQuery.isLoading &&
            !attendanceQuery.data?.items.length ? (
              <p className="text-sm text-slate-500">
                当前场次尚未形成参会记录。
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  )
}
