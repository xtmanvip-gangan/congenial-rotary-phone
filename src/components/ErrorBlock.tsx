export function ErrorBlock({
  message,
  tone = 'danger',
}: {
  message: string
  tone?: 'danger' | 'warning'
}) {
  const className =
    tone === 'warning'
      ? 'rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-700'
      : 'rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-600'

  return <div className="mt-6">{message ? <div className={className}>{message}</div> : null}</div>
}

