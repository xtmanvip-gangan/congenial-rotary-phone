import { useMemo, useRef, useState } from 'react'
import { ConfirmDialog, type ConfirmDialogState } from './ConfirmDialog'

type Resolver = (value: boolean) => void

export function useConfirmDialog() {
  const resolverRef = useRef<Resolver | null>(null)
  const [state, setState] = useState<ConfirmDialogState | null>(null)

  const dialog = useMemo(() => {
    if (!state) {
      return null
    }

    return (
      <ConfirmDialog
        open
        state={state}
        onCancel={() => {
          resolverRef.current?.(false)
          resolverRef.current = null
          setState(null)
        }}
        onConfirm={() => {
          resolverRef.current?.(true)
          resolverRef.current = null
          setState(null)
        }}
      />
    )
  }, [state])

  function confirm(next: ConfirmDialogState) {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
      setState(next)
    })
  }

  return {
    confirm,
    dialog,
  }
}

