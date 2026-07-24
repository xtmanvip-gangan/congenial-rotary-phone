import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { EmptyState } from './EmptyState'
import { apiJson } from '../lib/api'
import { formatDateTime } from '../lib/dateTime'

export type DailyReviewItem = {
  id: string
  reviewDate: string
  liveDurationMinutes: number | null
  sessionViewers: number | null
  peakOnline: number | null
  avgOnline: number | null
  newFans: number | null
  giftRevenueYuan: number | null
  pkCount: number | null
  bestThing: string | null
  biggestProblem: string | null
  tomorrowFocus: string | null
  leaderNote: string | null
  operator?: { id: string; displayName: string } | null
  createdAt: string
  updatedAt: string
}

type FormState = {
  reviewDate: string
  liveDurationMinutes: string
  sessionViewers: string
  peakOnline: string
  avgOnline: string
  newFans: string
  giftRevenueYuan: string
  pkCount: string
  bestThing: string
  biggestProblem: string
  tomorrowFocus: string
}

function todayIsoDate() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const emptyForm = (): FormState => ({
  reviewDate: todayIsoDate(),
  liveDurationMinutes: '',
  sessionViewers: '',
  peakOnline: '',
  avgOnline: '',
  newFans: '',
  giftRevenueYuan: '',
  pkCount: '',
  bestThing: '',
  biggestProblem: '',
  tomorrowFocus: '',
})

function numOrNull(value: string) {
  const t = value.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * 附件六《主播日复盘表》面板
 * @param apiBase 运营：/operators/me/anchors/:id  超管读详情已有 items，写会长批注用 admin 接口
 */
export function DailyReviewPanel({
  anchorId,
  items,
  canWrite,
  canLeaderNote,
  queryKeyToInvalidate,
}: {
  anchorId: string
  items: DailyReviewItem[]
  canWrite: boolean
  canLeaderNote: boolean
  queryKeyToInvalidate: unknown[]
}) {
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [leaderNotes, setLeaderNotes] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  const saveMutation = useMutation({
    mutationFn: () =>
      apiJson<{ item: DailyReviewItem }>(
        `/operators/me/anchors/${encodeURIComponent(anchorId)}/daily-reviews`,
        {
          method: 'POST',
          body: JSON.stringify({
            reviewDate: form.reviewDate,
            liveDurationMinutes: numOrNull(form.liveDurationMinutes),
            sessionViewers: numOrNull(form.sessionViewers),
            peakOnline: numOrNull(form.peakOnline),
            avgOnline: numOrNull(form.avgOnline),
            newFans: numOrNull(form.newFans),
            giftRevenueYuan: numOrNull(form.giftRevenueYuan),
            pkCount: numOrNull(form.pkCount),
            bestThing: form.bestThing.trim() || null,
            biggestProblem: form.biggestProblem.trim() || null,
            tomorrowFocus: form.tomorrowFocus.trim() || null,
          }),
        },
      ),
    onSuccess: async () => {
      setFeedback({ type: 'success', text: '日复盘已保存' })
      setFormOpen(false)
      setForm(emptyForm())
      await queryClient.invalidateQueries({ queryKey: queryKeyToInvalidate })
    },
    onError: (error) =>
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : '保存失败',
      }),
  })

  const noteMutation = useMutation({
    mutationFn: (payload: { reviewId: string; leaderNote: string }) =>
      apiJson(`/admin/anchors/daily-reviews/${payload.reviewId}/leader-note`, {
        method: 'PATCH',
        body: JSON.stringify({ leaderNote: payload.leaderNote }),
      }),
    onSuccess: async () => {
      setFeedback({ type: 'success', text: '会长批注已保存' })
      await queryClient.invalidateQueries({ queryKey: queryKeyToInvalidate })
    },
    onError: (error) =>
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : '批注保存失败',
      }),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!form.reviewDate) {
      setFeedback({ type: 'error', text: '请选择复盘日期' })
      return
    }
    saveMutation.mutate()
  }

  function startEdit(item: DailyReviewItem) {
    setForm({
      reviewDate: item.reviewDate,
      liveDurationMinutes:
        item.liveDurationMinutes != null ? String(item.liveDurationMinutes) : '',
      sessionViewers:
        item.sessionViewers != null ? String(item.sessionViewers) : '',
      peakOnline: item.peakOnline != null ? String(item.peakOnline) : '',
      avgOnline: item.avgOnline != null ? String(item.avgOnline) : '',
      newFans: item.newFans != null ? String(item.newFans) : '',
      giftRevenueYuan:
        item.giftRevenueYuan != null ? String(item.giftRevenueYuan) : '',
      pkCount: item.pkCount != null ? String(item.pkCount) : '',
      bestThing: item.bestThing ?? '',
      biggestProblem: item.biggestProblem ?? '',
      tomorrowFocus: item.tomorrowFocus ?? '',
    })
    setFormOpen(true)
    setFeedback(null)
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">日复盘记录</h3>
          <p className="mt-1 text-sm text-slate-500">
            依据《主播日复盘表》：数据 + 做得最好 / 最大问题 / 明日优化
            {!canWrite ? '（只读）' : ''}
          </p>
        </div>
        {canWrite ? (
          <button
            type="button"
            className="app-btn-primary"
            onClick={() => {
              setForm(emptyForm())
              setFormOpen(true)
              setFeedback(null)
            }}
          >
            <Plus className="h-4 w-4" />
            填写日复盘
          </button>
        ) : null}
      </div>

      {feedback ? (
        <p
          className={[
            'mt-3 rounded-2xl px-3 py-2 text-sm',
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-700',
          ].join(' ')}
        >
          {feedback.text}
        </p>
      ) : null}

      {formOpen && canWrite ? (
        <form
          className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
          onSubmit={submit}
        >
          <p className="text-sm font-medium text-slate-800">主播日复盘表</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="日期"
              type="date"
              value={form.reviewDate}
              onChange={(v) => setForm((c) => ({ ...c, reviewDate: v }))}
              required
            />
            <Field
              label="直播时长（分钟）"
              type="number"
              value={form.liveDurationMinutes}
              onChange={(v) =>
                setForm((c) => ({ ...c, liveDurationMinutes: v }))
              }
            />
            <Field
              label="场观"
              type="number"
              value={form.sessionViewers}
              onChange={(v) => setForm((c) => ({ ...c, sessionViewers: v }))}
            />
            <Field
              label="最高在线"
              type="number"
              value={form.peakOnline}
              onChange={(v) => setForm((c) => ({ ...c, peakOnline: v }))}
            />
            <Field
              label="平均在线"
              type="number"
              value={form.avgOnline}
              onChange={(v) => setForm((c) => ({ ...c, avgOnline: v }))}
            />
            <Field
              label="新增粉丝"
              type="number"
              value={form.newFans}
              onChange={(v) => setForm((c) => ({ ...c, newFans: v }))}
            />
            <Field
              label="礼物收入（元）"
              type="number"
              value={form.giftRevenueYuan}
              onChange={(v) => setForm((c) => ({ ...c, giftRevenueYuan: v }))}
            />
            <Field
              label="PK次数"
              type="number"
              value={form.pkCount}
              onChange={(v) => setForm((c) => ({ ...c, pkCount: v }))}
            />
          </div>
          <TextArea
            label="今天做得最好的事"
            value={form.bestThing}
            onChange={(v) => setForm((c) => ({ ...c, bestThing: v }))}
          />
          <TextArea
            label="今天最大的问题"
            value={form.biggestProblem}
            onChange={(v) => setForm((c) => ({ ...c, biggestProblem: v }))}
          />
          <TextArea
            label="明天重点优化"
            value={form.tomorrowFocus}
            onChange={(v) => setForm((c) => ({ ...c, tomorrowFocus: v }))}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="app-btn-primary"
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : null}
              保存
            </button>
            <button
              type="button"
              className="app-btn-secondary"
              onClick={() => setFormOpen(false)}
            >
              取消
            </button>
          </div>
        </form>
      ) : null}

      <div className="mt-5 space-y-3">
        {items.length === 0 ? (
          <EmptyState
            title="暂无日复盘"
            description={
              canWrite
                ? '开播日结束后点击「填写日复盘」记录数据与反思。'
                : '运营填写日复盘后会出现在这里。'
            }
            tone="plain"
          />
        ) : (
          items.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-slate-200 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">
                    {item.reviewDate}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {item.operator?.displayName
                      ? `运营 ${item.operator.displayName} · `
                      : ''}
                    更新 {formatDateTime(item.updatedAt)}
                  </p>
                </div>
                {canWrite ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-brand-600 hover:text-brand-700"
                    onClick={() => startEdit(item)}
                  >
                    编辑
                  </button>
                ) : null}
                {/* 档案只读时不展示编辑 */}
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <Metric label="直播时长" value={fmtMin(item.liveDurationMinutes)} />
                <Metric label="场观" value={fmtNum(item.sessionViewers)} />
                <Metric label="最高在线" value={fmtNum(item.peakOnline)} />
                <Metric label="平均在线" value={fmtNum(item.avgOnline)} />
                <Metric label="新增粉丝" value={fmtNum(item.newFans)} />
                <Metric
                  label="礼物收入"
                  value={
                    item.giftRevenueYuan != null
                      ? `${item.giftRevenueYuan} 元`
                      : '—'
                  }
                />
                <Metric label="PK次数" value={fmtNum(item.pkCount)} />
              </dl>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <p>
                  <span className="text-slate-400">做得最好：</span>
                  {item.bestThing || '—'}
                </p>
                <p>
                  <span className="text-slate-400">最大问题：</span>
                  {item.biggestProblem || '—'}
                </p>
                <p>
                  <span className="text-slate-400">明日优化：</span>
                  {item.tomorrowFocus || '—'}
                </p>
              </div>

              {canLeaderNote ? (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <label className="block text-xs font-medium text-slate-500">
                    会长批注
                    <textarea
                      className="mt-1.5 app-field min-h-[64px] resize-y text-sm"
                      value={leaderNotes[item.id] ?? item.leaderNote ?? ''}
                      onChange={(e) =>
                        setLeaderNotes((c) => ({
                          ...c,
                          [item.id]: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700"
                    disabled={noteMutation.isPending}
                    onClick={() =>
                      noteMutation.mutate({
                        reviewId: item.id,
                        leaderNote:
                          leaderNotes[item.id] ?? item.leaderNote ?? '',
                      })
                    }
                  >
                    保存批注
                  </button>
                </div>
              ) : item.leaderNote ? (
                <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  会长批注：{item.leaderNote}
                </p>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  )
}

function Field({
  label,
  type,
  value,
  onChange,
  required,
}: {
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  required?: boolean
}) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <input
        type={type}
        className="mt-1.5 app-field text-sm"
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <textarea
        className="mt-1.5 app-field min-h-[72px] resize-y text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="font-medium tabular-nums text-slate-800">{value}</dd>
    </div>
  )
}

function fmtNum(n: number | null) {
  return n == null ? '—' : String(n)
}

function fmtMin(n: number | null) {
  return n == null ? '—' : `${n} 分`
}
