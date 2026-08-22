import type { BuyerAward, BuyerHistory } from '../types/buyerHistory'
import type { LessonLearned } from '../types/lessonLearned'

/**
 * Presentatie van het opdrachtgeversbeeld. De server levert gunningen per perceel;
 * het bidteam kijkt per opdracht. Deze functies vertalen het ene naar het andere en
 * zetten de cijfers om in een zin die zegt wat ze betekenen voor de winkans.
 */

/**
 * Vergelijkbare vorm van een organisatienaam, zodat "Gemeente Best" en
 * "gemeente Best B.V." als dezelfde partij tellen. Spiegelt `buyerKey` op de server.
 */
export function organisationKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(b\.?v\.?|n\.?v\.?|v\.?o\.?f\.?|c\.?v\.?|stichting|gemeenschappelijke regeling)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Eén gegund perceel, klaar om te tonen. */
export type LotSummary = {
  key: string
  award: BuyerAward
  title: string
  winnerLabel: string
  tenderCountLabel: string
  losers: string[]
}

/**
 * Zet de gunningen om in één regel per gegund perceel, nieuwste eerst. Percelen van
 * dezelfde aanbesteding blijven apart: ze hebben elk een eigen winnaar en een eigen
 * aantal inschrijvers, en juist dat is wat het bidteam wil zien.
 */
export function lotSummaries(awards: BuyerAward[]): LotSummary[] {
  const rows: LotSummary[] = []

  for (const award of awards) {
    const awarded = award.lots.filter((lot) => lot.awarded)
    awarded.forEach((lot, index) => {
      const title = lot.title?.trim() || award.title
      rows.push({
        key: `${award.publicatieId}-${lot.lot ?? index}`,
        award,
        // Bij meerdere percelen is de perceeltitel alleen betekenisvol mét de aanbesteding erbij.
        title: awarded.length > 1 && lot.title?.trim() ? `${award.title} — ${lot.title.trim()}` : title,
        winnerLabel: lot.winners.length ? lot.winners.join(', ') : 'Winnaar niet vermeld',
        tenderCountLabel:
          typeof lot.tenderCount === 'number'
            ? `${lot.tenderCount} ${lot.tenderCount === 1 ? 'inschrijver' : 'inschrijvers'}`
            : 'aantal inschrijvers onbekend',
        losers: lot.losers,
      })
    })
  }

  return rows.sort((a, b) => (b.award.publishedOn ?? '').localeCompare(a.award.publishedOn ?? ''))
}

/** Wat de cijfers betekenen voor de winkans, in één zin. */
export function describeCompetition(history: BuyerHistory): string {
  const { competition, winners, found } = history
  if (!found) return 'Geen eerdere gunningen van deze opdrachtgever gevonden in dit vakgebied.'

  const parts: string[] = []

  if (competition.averageTenderCount != null) {
    const range =
      competition.minTenderCount === competition.maxTenderCount
        ? `${competition.minTenderCount}`
        : `${competition.minTenderCount}–${competition.maxTenderCount}`
    parts.push(
      `Gemiddeld ${competition.averageTenderCount} inschrijvers per perceel (mediaan ${competition.medianTenderCount}, spreiding ${range}), gemeten over ${competition.measuredLots} percelen.`,
    )
    // Eén inschrijver is geen competitie maar een afroep of een gunning zonder
    // mededinging; wie dat niet weet leest het gemiddelde te optimistisch.
    if (competition.singleBidderLots >= Math.max(2, competition.measuredLots / 4)) {
      parts.push(
        `Let op: ${competition.singleBidderLots} van de ${competition.measuredLots} hadden één inschrijver — vaak afroepen van een raamovereenkomst, geen open competitie.`,
      )
    }
  } else {
    parts.push('Het aantal inschrijvers staat in geen van de gevonden gunningen vermeld.')
  }

  const repeat = winners.filter((winner) => winner.wins > 1)
  if (repeat.length) {
    const leader = repeat[0]
    parts.push(`${leader.name} won hier ${leader.wins} keer — deze opdrachtgever gunt vaker aan bekenden.`)
  } else if (winners.length > 1) {
    parts.push('Elke opdracht ging naar een andere partij; er is geen vaste favoriet.')
  }

  return parts.join(' ')
}

/** Onze eigen leerpunten bij deze opdrachtgever, nieuwste eerst. */
export function buyerLessons(lessons: LessonLearned[], buyer: string): LessonLearned[] {
  const target = organisationKey(buyer)
  if (!target) return []
  return lessons
    .filter((lesson) => {
      const key = organisationKey(lesson.buyer ?? '')
      return key === target || key.startsWith(`${target} `) || target.startsWith(`${key} `)
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
