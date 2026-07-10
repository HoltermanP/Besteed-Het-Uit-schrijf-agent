'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { hydrateStorage } from '@/lib/storage'

// Laadt de werkruimte-opslag uit de database vóór de app rendert, zodat alle
// bestaande synchrone reads (projecten, dossiers, concepten) direct data zien.
export default function StorageGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    hydrateStorage()
      .then(() => {
        if (active) setStatus('ready')
      })
      .catch(() => {
        if (active) setStatus('error')
      })
    return () => {
      active = false
    }
  }, [attempt])

  if (status === 'ready') return children

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      {status === 'loading' ? (
        <p className="text-sm text-muted-foreground">Werkruimte laden…</p>
      ) : (
        <div className="max-w-sm space-y-3 text-center">
          <p className="text-sm font-semibold">Werkruimte kon niet worden geladen</p>
          <p className="text-sm text-muted-foreground">
            De database-opslag is niet bereikbaar. Controleer je verbinding en probeer het opnieuw.
          </p>
          <button
            type="button"
            onClick={() => {
              setStatus('loading')
              setAttempt((value) => value + 1)
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Opnieuw proberen
          </button>
        </div>
      )}
    </main>
  )
}
