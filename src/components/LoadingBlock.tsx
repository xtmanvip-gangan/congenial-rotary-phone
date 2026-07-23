import { LoaderCircle } from 'lucide-react'

export function LoadingBlock({ text, minHeightClassName = 'min-h-48' }: { text: string; minHeightClassName?: string }) {
  return (
    <div className={`flex ${minHeightClassName} items-center justify-center text-sm text-slate-500`}>
      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
      {text}
    </div>
  )
}

