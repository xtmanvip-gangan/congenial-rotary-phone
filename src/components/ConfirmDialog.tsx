type ConfirmDialogVariant = 'danger' | 'primary'

export type ConfirmDialogState = {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: ConfirmDialogVariant
}

export function ConfirmDialog({
  open,
  state,
  onConfirm,
  onCancel,
}: {
  open: boolean
  state: ConfirmDialogState
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) {
    return null
  }

  const confirmClassName = state.variant === 'danger' ? 'app-btn-danger' : 'app-btn-primary'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-8">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft">
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-sm font-semibold text-slate-900">{state.title}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{state.message}</p>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="app-btn-secondary">
            {state.cancelText ?? '取消'}
          </button>
          <button type="button" onClick={onConfirm} className={confirmClassName}>
            {state.confirmText ?? '确认'}
          </button>
        </div>
      </div>
    </div>
  )
}
