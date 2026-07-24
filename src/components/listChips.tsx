import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

/** 列表内状态胶囊 */
export function StatusPill({
  label,
  tone,
}: {
  label: string
  tone:
    | 'slate'
    | 'sky'
    | 'brand'
    | 'emerald'
    | 'amber'
    | 'violet'
    | 'rose'
    | 'cyan'
}) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-600 ring-slate-200/80',
    sky: 'bg-sky-50 text-sky-700 ring-sky-200/70',
    brand: 'bg-brand-50 text-brand-700 ring-brand-200/70',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200/70',
    violet: 'bg-violet-50 text-violet-700 ring-violet-200/70',
    rose: 'bg-rose-50 text-rose-700 ring-rose-200/70',
    cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-200/70',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {label}
    </span>
  )
}

/** 列表操作胶囊链接（图标 + 文案） */
export function ActionChipLink({
  to,
  label,
  icon: Icon,
  tone = 'brand',
}: {
  to: string
  label: string
  icon: LucideIcon
  tone?: 'brand' | 'sky' | 'violet' | 'emerald' | 'slate'
}) {
  const tones: Record<string, string> = {
    brand:
      'bg-brand-50 text-brand-700 ring-brand-200/70 hover:bg-brand-100',
    sky: 'bg-sky-50 text-sky-700 ring-sky-200/70 hover:bg-sky-100',
    violet:
      'bg-violet-50 text-violet-700 ring-violet-200/70 hover:bg-violet-100',
    emerald:
      'bg-emerald-50 text-emerald-700 ring-emerald-200/70 hover:bg-emerald-100',
    slate: 'bg-slate-50 text-slate-700 ring-slate-200/80 hover:bg-slate-100',
  }
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition ${tones[tone]}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Link>
  )
}

export function liveStatusPillTone(
  status: string,
): 'sky' | 'violet' | 'emerald' | 'amber' | 'slate' | 'rose' {
  switch (status) {
    case 'pending_first_live':
      return 'sky'
    case 'incubating':
      return 'violet'
    case 'normal':
      return 'emerald'
    case 'offline':
      return 'amber'
    case 'leave':
      return 'slate'
    case 'exited':
      return 'rose'
    default:
      return 'slate'
  }
}

export function onboardingProgressPillTone(
  done: number,
  total: number,
): 'slate' | 'sky' | 'brand' | 'emerald' {
  if (total <= 0 || done <= 0) return 'slate'
  if (done >= total) return 'emerald'
  if (done >= Math.ceil(total / 2)) return 'brand'
  return 'sky'
}

export function milestonePillTone(type: string | null): 'slate' | 'sky' | 'brand' | 'violet' | 'emerald' | 'amber' | 'cyan' {
  if (!type) return 'slate'
  const map: Record<string, 'sky' | 'brand' | 'violet' | 'emerald' | 'amber' | 'cyan'> = {
    initial_communication: 'sky',
    homepage_ready: 'brand',
    live_software_ready: 'cyan',
    helper_software_ready: 'violet',
    prejob_learning_completed: 'amber',
    first_live_completed: 'emerald',
    first_live_review_completed: 'violet',
  }
  return map[type] ?? 'slate'
}
