import { useId } from 'react'

export function FileUploadField({
  label,
  accept,
  multiple = false,
  files,
  onChange,
  onRemove,
}: {
  label: string
  accept: string
  multiple?: boolean
  files: File[]
  onChange: (files: File[]) => void | Promise<void>
  onRemove: (index: number) => void
}) {
  const inputId = useId()

  return (
    <div>
      <label htmlFor={inputId} className="block">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <input
          id={inputId}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={async (event) => {
            const target = event.target
            const next = Array.from(target.files ?? [])
            if (next.length > 0) {
              await onChange(next)
            }
            target.value = ''
          }}
          className="mt-2 app-file"
        />
      </label>

      {files.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <span
              key={`${file.name}-${file.lastModified}`}
              className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs text-slate-600"
            >
              {file.name}
              <button type="button" onClick={() => onRemove(index)} className="text-rose-500 transition hover:text-rose-600">
                移除
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

