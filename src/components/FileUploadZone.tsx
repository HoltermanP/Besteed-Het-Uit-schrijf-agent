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
  /** Optioneel id voor het verborgen bestandsveld (bv. voor labels of tests). */
  inputId?: string
  /** Lage variant voor smalle panelen: één regel titel + hint, formaten als tooltip. */
  compact?: boolean
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
  inputId,
  compact = false,
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
          'flex items-center rounded-lg border border-dashed border-input bg-muted/30 text-left transition-colors',
          compact ? 'gap-2.5 px-3 py-2.5' : 'gap-3 px-4 py-6',
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
        title={compact ? formatsLabel : undefined}
      >
        {loading ? (
          <Loader2 className={cn('shrink-0 animate-spin text-muted-foreground', compact ? 'size-4' : 'size-5')} />
        ) : (
          <FileUp className={cn('shrink-0 text-muted-foreground', compact ? 'size-4' : 'size-5')} />
        )}
        <div className="min-w-0">
          <strong className={cn('block font-medium text-foreground', compact ? 'text-xs' : 'text-sm')}>
            {loading ? 'Bestanden verwerken…' : title}
          </strong>
          <span className={cn('block text-muted-foreground', compact ? 'text-[11px] leading-snug' : 'text-sm')}>{hint}</span>
        </div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="hidden"
          multiple={multiple}
          accept={accept.join(',')}
          disabled={inactive}
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>
      {formatsLabel && !compact ? <p className="text-xs text-muted-foreground">{formatsLabel}</p> : null}
    </div>
  )
}
