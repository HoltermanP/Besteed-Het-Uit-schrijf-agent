import { useRef, useState, type DragEvent } from 'react'
import { FileUp, Loader2 } from 'lucide-react'
import '../FileUploadZone.css'

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

  const handleFiles = (files: FileList | null) => {
    if (!files?.length || disabled || loading) return
    void onFiles(files)
    if (inputRef.current) inputRef.current.value = ''
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragOver(false)
    handleFiles(event.dataTransfer.files)
  }

  return (
    <div className="file-upload-zone-wrap">
      <div
        className={`file-upload-zone${dragOver ? ' drag-over' : ''}${disabled || loading ? ' disabled' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled && !loading) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => {
          if (!disabled && !loading) inputRef.current?.click()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            if (!disabled && !loading) inputRef.current?.click()
          }
        }}
        role="button"
        tabIndex={disabled || loading ? -1 : 0}
        aria-disabled={disabled || loading}
      >
        {loading ? <Loader2 size={22} className="spin" /> : <FileUp size={22} />}
        <div>
          <strong>{loading ? 'Bestanden verwerken…' : title}</strong>
          <span>{hint}</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept={accept.join(',')}
          disabled={disabled || loading}
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>
      {formatsLabel ? <p className="file-upload-formats">{formatsLabel}</p> : null}
    </div>
  )
}
