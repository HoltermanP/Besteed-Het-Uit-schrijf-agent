'use client'

import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

/**
 * Bevestiging vóór een ingrijpende actie, in plaats van de kale browserpop-up.
 * `details` toont wát er verdwijnt (bv. "3 stukken", "12 bronnen"), zodat de gebruiker
 * de gevolgen ziet voordat hij bevestigt.
 */
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  details = [],
  confirmLabel = 'Verwijderen',
  cancelLabel = 'Annuleren',
  destructive = true,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  details?: string[]
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {destructive ? <AlertTriangle size={18} className="shrink-0 text-destructive" /> : null}
            <span className="min-w-0 break-words">{title}</span>
          </AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {details.length ? (
          <ul className="grid gap-1 rounded-md border bg-muted/50 p-3 text-xs text-muted-foreground">
            {details.map((detail) => (
              <li key={detail} className="break-words">
                {detail}
              </li>
            ))}
          </ul>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel type="button">{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            data-testid="confirm-dialog-confirm"
            className={cn(destructive && 'bg-destructive text-white hover:bg-destructive/90')}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
