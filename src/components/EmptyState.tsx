import type { ReactNode } from 'react'

export function EmptyState({
  title,
  description,
  action,
  tone = 'soft',
}: {
  title: string
  description?: string
  action?: ReactNode
  tone?: 'soft' | 'plain'
}) {
  const backgroundClassName = tone === 'plain' ? 'bg-white' : 'bg-slate-50'

  return (
    <div className={`mt-6 rounded-3xl border border-dashed border-slate-200 ${backgroundClassName} px-6 py-12 text-center`}>
      <p className="text-base font-medium text-slate-700">{title}</p>
      {description ? <p className="mt-2 text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  )
}

