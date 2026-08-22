'use client'

import { useSyncExternalStore } from 'react'
import { AlertTriangle, Check, Circle, Loader2 } from 'lucide-react'
import { flushStorage, getSaveStatus, subscribeSaveStatus, type SaveStatus } from '@/lib/storage'
import { cn } from '@/lib/utils'

const IDLE_STATUS: SaveStatus = { state: 'idle', savedAt: null, error: null }

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Laat zien of het werk écht in de database staat: "Niet opgeslagen", "Opslaan…",
 * "Opgeslagen 14:32" of "Opslaan mislukt" (met knop om het direct opnieuw te proberen).
 * Leest de status rechtstreeks uit de opslaglaag, dus geldt voor alle wijzigingen in de app.
 */
export default function SaveStatusIndicator({ className }: { className?: string }) {
  const status = useSyncExternalStore(subscribeSaveStatus, getSaveStatus, () => IDLE_STATUS)

  if (status.state === 'idle') return null

  const savedAt = status.savedAt ? formatTime(status.savedAt) : null
  const content = (() => {
    switch (status.state) {
      case 'dirty':
        return (
          <>
            <Circle size={12} className="fill-amber-500 text-amber-500" /> Niet opgeslagen
          </>
        )
      case 'saving':
        return (
          <>
            <Loader2 size={12} className="animate-spin" /> Opslaan…
          </>
        )
      case 'saved':
        return (
          <>
            <Check size={12} className="text-emerald-600" /> Opgeslagen {savedAt}
          </>
        )
      case 'error':
        return (
          <>
            <AlertTriangle size={12} className="text-destructive" /> Opslaan mislukt
            {savedAt ? ` (laatst opgeslagen ${savedAt})` : ''}
            <button
              type="button"
              onClick={() => void flushStorage()}
              className="ml-1 font-semibold text-primary underline-offset-2 hover:underline"
            >
              Opnieuw proberen
            </button>
          </>
        )
    }
  })()

  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="save-status"
      data-state={status.state}
      title={status.state === 'error' && status.error ? status.error : undefined}
      className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}
    >
      {content}
    </span>
  )
}
