import { useRef, useState, type DragEvent } from 'react'
import { FileUp, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type FileUploadZoneProps = {
  accept: string[]
  multiple?: boolean
  disabled?: boolean
  loading?: boolean
  title: string
  hint: string
  formatsLabel?: string
  onFiles: (files: FileList) => void | Promise<void>
}

export default function FileUploadZone({
  accept,
  multiple = true,
  disabled = false,
  loading = false,
  title,
  hint,
  formatsLabel,
  onFiles,
}: FileUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const inactive = disabled || loading

  const handleFiles = (files: FileList | null) => {
    if (!files?.length || inactive) return
    void onFiles(files)
    if (inputRef.current) inputRef.current.value = ''
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragOver(false)
    handleFiles(event.dataTransfer.files)
  }

  return (
    <div className="space-y-2">
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border border-dashed border-input bg-muted/30 px-4 py-6 text-left transition-colors',
          !inactive && 'cursor-pointer hover:border-ring hover:bg-muted/60',
          dragOver && 'border-ring bg-accent',
          inactive && 'cursor-not-allowed opacity-60',
        )}
        onDragOver={(event) => {
          event.preventDefault()
          if (!inactive) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => {
          if (!inactive) inputRef.current?.click()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            if (!inactive) inputRef.current?.click()
          }
        }}
        role="button"
        tabIndex={inactive ? -1 : 0}
        aria-disabled={inactive}
      >
        {loading ? (
          <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <FileUp className="size-5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <strong className="block text-sm font-medium text-foreground">
            {loading ? 'Bestanden verwerken…' : title}
          </strong>
          <span className="block text-sm text-muted-foreground">{hint}</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple={multiple}
          accept={accept.join(',')}
          disabled={inactive}
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>
      {formatsLabel ? <p className="text-xs text-muted-foreground">{formatsLabel}</p> : null}
    </div>
  )
}
