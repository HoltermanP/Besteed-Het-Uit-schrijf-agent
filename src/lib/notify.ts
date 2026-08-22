import { toast } from 'sonner'

/**
 * Meldingen die de gebruiker niet kan missen.
 *
 * De statusregel in de zijbalk blijft het logboek van de laatste actie; deze meldingen
 * komen daar bovenop voor de dingen die je écht moet zien: een mislukte generatie of
 * export (blijft staan tot je hem wegklikt, met knop om het opnieuw te proberen) en een
 * verwijdering (tien seconden lang ongedaan te maken).
 */

/** Hoe lang een "ongedaan maken"-melding blijft staan. */
export const UNDO_WINDOW_MS = 10_000

export type RetryOptions = {
  /** Actie achter de knop rechts in de melding; laat weg als opnieuw proberen geen zin heeft. */
  retry?: () => void
  retryLabel?: string
}

/** Fout die aandacht vraagt: blijft staan tot de gebruiker hem wegklikt. */
export function notifyError(message: string, options: RetryOptions = {}) {
  toast.error(message, {
    duration: Infinity,
    closeButton: true,
    action: options.retry
      ? { label: options.retryLabel ?? 'Opnieuw proberen', onClick: options.retry }
      : undefined,
  })
}

/** Bevestiging van een geslaagde actie; verdwijnt vanzelf. */
export function notifySuccess(message: string) {
  toast.success(message)
}

/** Waarschuwing: het werk gaat door, maar niet zoals bedoeld. */
export function notifyWarning(message: string, options: RetryOptions = {}) {
  toast.warning(message, {
    action: options.retry
      ? { label: options.retryLabel ?? 'Opnieuw proberen', onClick: options.retry }
      : undefined,
  })
}

/** Verwijdering met een venster om terug te draaien. */
export function notifyUndo(message: string, onUndo: () => void) {
  toast(message, {
    duration: UNDO_WINDOW_MS,
    action: { label: 'Ongedaan maken', onClick: onUndo },
  })
}
