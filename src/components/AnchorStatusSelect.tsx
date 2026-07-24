import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { apiJson } from '../lib/api'

const options = [
  {
    value: 'active',
    label: '正常',
    tone: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/60',
  },
  {
    value: 'paused',
    label: '断播',
    tone: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200/60',
  },
  {
    value: 'leave',
    label: '请假',
    tone: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200/80',
  },
  {
    value: 'exited',
    label: '退会',
    tone: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200/60',
  },
] as const

type ProfileStatus = (typeof options)[number]['value']

const selectTone: Record<ProfileStatus, string> = {
  active:
    'border-emerald-200 bg-emerald-50 text-emerald-800 focus:border-emerald-400',
  paused:
    'border-amber-200 bg-amber-50 text-amber-900 focus:border-amber-400',
  leave: 'border-slate-200 bg-slate-100 text-slate-700 focus:border-slate-400',
  exited: 'border-rose-200 bg-rose-50 text-rose-800 focus:border-rose-400',
}

function normalizeStatus(status: string): ProfileStatus {
  return (['active', 'paused', 'leave', 'exited'].includes(status)
    ? status
    : 'active') as ProfileStatus
}

/** 运营修改主播直播状态（正常/断播/请假/退会） */
export function AnchorStatusSelect({
  anchorId,
  status,
  queryKeys = [['operator-anchors'], ['operator-anchor-detail']],
  onChanged,
  compact = false,
}: {
  anchorId: string
  status: string
  queryKeys?: unknown[][]
  onChanged?: (status: ProfileStatus) => void
  /** 表格内：无「直播状态」文案，仅彩色下拉 */
  compact?: boolean
}) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState<ProfileStatus>(() =>
    normalizeStatus(status),
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setValue(normalizeStatus(status))
  }, [status])

  const mutation = useMutation({
    mutationFn: (next: ProfileStatus) =>
      apiJson(`/operators/me/anchors/${encodeURIComponent(anchorId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      }),
    onSuccess: async (_data, next) => {
      setError(null)
      setValue(next)
      onChanged?.(next)
      await Promise.all(
        queryKeys.map((key) =>
          queryClient.invalidateQueries({ queryKey: key }),
        ),
      )
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : '状态更新失败')
      setValue(normalizeStatus(status))
    },
  })

  return (
    <div className="inline-flex flex-col items-start gap-0.5">
      <span className="inline-flex items-center gap-1.5">
        <select
          aria-label="直播状态"
          className={[
            'rounded-lg border px-2 py-1 text-xs font-medium outline-none transition',
            selectTone[value],
            mutation.isPending ? 'opacity-70' : '',
          ].join(' ')}
          value={value}
          disabled={mutation.isPending}
          onChange={(e) => {
            const next = e.target.value as ProfileStatus
            mutation.mutate(next)
          }}
        >
          {options.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        {mutation.isPending ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin text-slate-400" />
        ) : null}
      </span>
      {error ? <p className="text-[11px] text-rose-600">{error}</p> : null}
      {!compact && error ? null : null}
    </div>
  )
}
