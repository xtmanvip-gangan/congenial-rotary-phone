import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { apiJson } from '../lib/api'

const options = [
  { value: 'active', label: '正常' },
  { value: 'paused', label: '断播' },
  { value: 'leave', label: '请假' },
  { value: 'exited', label: '退会' },
] as const

type ProfileStatus = (typeof options)[number]['value']

/** 运营修改在管主播经营状态 */
export function AnchorStatusSelect({
  anchorId,
  status,
  queryKeys = [['operator-anchors'], ['operator-anchor-detail']],
  onChanged,
}: {
  anchorId: string
  status: string
  queryKeys?: unknown[][]
  onChanged?: (status: ProfileStatus) => void
}) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState<ProfileStatus>(
    (['active', 'paused', 'leave', 'exited'].includes(status)
      ? status
      : 'active') as ProfileStatus,
  )
  const [error, setError] = useState<string | null>(null)

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
    },
  })

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
        经营状态
        <select
          className="app-field py-1 text-xs"
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
      </label>
      {error ? <p className="text-[11px] text-rose-600">{error}</p> : null}
    </div>
  )
}
