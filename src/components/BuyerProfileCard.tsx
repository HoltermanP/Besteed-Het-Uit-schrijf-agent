'use client'

import { useState } from 'react'
import { Building2, ExternalLink, GraduationCap, Loader2, RefreshCw, Trophy, Users } from 'lucide-react'
import type { BuyerAward, BuyerHistory } from '../types/buyerHistory'
import type { LessonLearned } from '../types/lessonLearned'
import { lessonOutcomeLabels } from '../types/lessonLearned'
import { fetchBuyerHistory } from '../lib/buyerHistoryApi'
import { buyerLessons, describeCompetition, lotSummaries, type LotSummary } from '../lib/buyerHistory'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

/**
 * Opdrachtgeversbeeld bij een tender: welke partijen eerdere opdrachten van déze
 * opdrachtgever wonnen, met hoeveel inschrijvers dat gebeurde, en welke leerpunten
 * wij zelf bij deze opdrachtgever hebben opgedaan. De gunningsgegevens komen uit de
 * gunningsaankondigingen op TenderNed; de leerpunten uit onze eigen lessons-learned.
 */

type Props = {
  buyer: string
  /** CPV-codes van de lopende tender; bakenen de scan af tot hetzelfde vakgebied. */
  cpvCodes: string[]
  lessons: LessonLearned[]
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}-${month}-${year}` : value
}

function AwardRow({ award, lot }: { award: BuyerAward; lot: LotSummary }) {
  return (
    <li className="rounded-md border bg-card px-2.5 py-2">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-xs font-semibold leading-snug">{lot.title}</p>
        <a
          href={award.tendernedUrl}
          target="_blank"
          rel="noreferrer"
          title="Op TenderNed bekijken"
          className="mt-0.5 flex-none text-muted-foreground transition-colors hover:text-primary"
        >
          <ExternalLink size={13} />
        </a>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{lot.winnerLabel}</span>
        <span>·</span>
        <span>{lot.tenderCountLabel}</span>
        <span>·</span>
        <span>{formatDate(award.publishedOn)}</span>
      </p>
      {lot.losers.length ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground">Ook ingeschreven: {lot.losers.join(', ')}</p>
      ) : null}
    </li>
  )
}

export default function BuyerProfileCard({ buyer, cpvCodes, lessons }: Props) {
  const [history, setHistory] = useState<BuyerHistory | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const ownLessons = buyerLessons(lessons, buyer)

  const load = async (refresh = false) => {
    setLoading(true)
    setError(null)
    try {
      setHistory(await fetchBuyerHistory({ buyer, cpvCodes, refresh }))
      setShowAll(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Opdrachtgeversbeeld ophalen mislukt.')
    } finally {
      setLoading(false)
    }
  }

  const rows = history ? lotSummaries(history.awards) : []
  const visible = showAll ? rows : rows.slice(0, 6)

  return (
    <Card className="mb-[14px]" data-testid="buyer-profile">
      <CardContent className="space-y-[10px]">
        <div className="flex items-center justify-between gap-2 text-primary">
          <div className="flex min-w-0 items-center gap-2">
            <Building2 size={17} className="flex-none" />
            <h2 className="min-w-0 truncate text-sm font-semibold">Eerdere gunningen</h2>
          </div>
          {history ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 flex-none px-2"
              onClick={() => load()}
              disabled={loading}
              title="Verder lezen bij TenderNed"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} />
            </Button>
          ) : null}
        </div>

        {buyer.trim() ? (
          <p className="-mt-1 truncate text-xs text-muted-foreground" title={buyer}>
            {buyer}
          </p>
        ) : null}

        {!buyer.trim() ? (
          <p className="text-xs text-muted-foreground">
            Vul eerst de opdrachtgever in bij het dossier; daarna haal ik hun eerdere gunningen op.
          </p>
        ) : (
          <>
            {!history && !loading ? (
              <p className="text-xs text-muted-foreground">
                Haal op wie hier eerder won en met hoeveel inschrijvers dat gebeurde.
              </p>
            ) : null}

            {!history ? (
              <Button type="button" size="sm" className="w-full" onClick={() => load()} disabled={loading}>
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Trophy size={14} />}
                {loading ? 'TenderNed doorzoeken…' : 'Gunningen ophalen'}
              </Button>
            ) : null}

            {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}

            {history ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-2.5 dark:border-blue-900/50 dark:bg-blue-950/40">
                    <p className="text-lg font-extrabold leading-none text-blue-700 dark:text-blue-300">
                      {history.competition.averageTenderCount ?? '—'}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Users size={11} /> Gem. inschrijvers
                    </p>
                    {history.competition.medianTenderCount != null ? (
                      <p className="text-[10px] text-muted-foreground">
                        mediaan {history.competition.medianTenderCount}
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-md border p-2.5">
                    <p className="text-lg font-extrabold leading-none">{history.winners.length}</p>
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Trophy size={11} /> Winnende partijen
                    </p>
                  </div>
                </div>

                <p className="text-[11px] leading-snug text-muted-foreground">
                  {describeCompetition(history)}
                </p>

                {history.winners.length ? (
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Wie er wint
                    </p>
                    <ul className="grid gap-1">
                      {history.winners.slice(0, 6).map((winner) => (
                        <li key={winner.name} className="flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate" title={winner.titles.join(' · ')}>
                            {winner.name}
                          </span>
                          <Badge variant="secondary" className="flex-none px-1.5 py-0 text-[10px]">
                            {winner.wins}×
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {rows.length ? (
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Gegunde opdrachten ({rows.length})
                    </p>
                    <ul className="grid gap-1.5">
                      {visible.map((lot) => (
                        <AwardRow key={lot.key} award={lot.award} lot={lot} />
                      ))}
                    </ul>
                    {rows.length > visible.length ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-1 h-7 w-full text-xs"
                        onClick={() => setShowAll(true)}
                      >
                        Alle {rows.length} tonen
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Geen gegunde opdrachten van {buyer} gevonden binnen dit vakgebied sinds{' '}
                    {formatDate(history.since)}.
                  </p>
                )}

                {history.unreadCount ? (
                  <p className="text-[11px] text-muted-foreground">
                    Nog {history.unreadCount} gunning(en) niet gelezen — klik op verversen om verder te lezen.
                  </p>
                ) : null}
              </>
            ) : null}

            {ownLessons.length ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-900/50 dark:bg-amber-950/30">
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  <GraduationCap size={12} /> Onze leerpunten hier ({ownLessons.length})
                </p>
                <ul className="grid gap-1.5 text-xs text-amber-900 dark:text-amber-100">
                  {ownLessons.map((lesson) => (
                    <li key={lesson.id}>
                      <span className="font-semibold">
                        {lesson.projectTitle} · {lessonOutcomeLabels[lesson.outcome]}
                      </span>
                      <br />
                      {lesson.lesson}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Nog geen eigen leerpunten bij deze opdrachtgever vastgelegd.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
