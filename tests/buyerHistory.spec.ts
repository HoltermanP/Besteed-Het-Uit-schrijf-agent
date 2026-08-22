import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { parseAwardNotice } from '../api-src/_lib/awardNotice'
import { buyerKey, matchesBuyer, summarizeCompetition, summarizeWinners } from '../api-src/_lib/buyerHistory'
import { buyerLessons, describeCompetition, lotSummaries } from '../src/lib/buyerHistory'
import type { BuyerAward, BuyerHistory } from '../src/types/buyerHistory'
import type { LessonLearned } from '../src/types/lessonLearned'

/**
 * Opdrachtgeversbeeld: wie won er eerder bij deze opdrachtgever, met hoeveel
 * inschrijvers, en welke leerpunten hebben wij daar zelf.
 *
 * De fixtures zijn de echte, uitgelezen tekst van gunningsaankondigingen op TenderNed.
 * Ze dekken de formaten die de parser in het wild tegenkomt: eForms met een volledige
 * winnaarssectie, eForms waarin de winnaar alleen uit de organisatierollen blijkt,
 * eForms van een ingetrokken procedure, een aankondiging waarin het aantal inschrijvers
 * door een paginakop wordt onderbroken, en het oude TED-formulier.
 */

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/gunningen/${name}.txt`, import.meta.url), 'utf8')
}

test.describe('gunningsaankondiging uitlezen', () => {
  test('eForms: winnaar, afvallers en aantal inschrijvers', () => {
    const parsed = parseAwardNotice(fixture('431021'))

    expect(parsed.format).toBe('eforms')
    expect(parsed.lots).toHaveLength(1)

    const [lot] = parsed.lots
    expect(lot.awarded).toBe(true)
    expect(lot.winners).toEqual(['Intact Insurance (Europe) SA'])
    expect(lot.losers).toEqual(['Allianz Benelux N.V.', 'RISKPOINT A/S'])
    expect(lot.tenderCount).toBe(3)
    expect(lot.contractDate).toBe('2026-06-29')
  })

  test('eForms: aantal inschrijvers dat door een paginakop wordt onderbroken', () => {
    // Het label "Aantal ontvangen / inschrijvingen of / verzoeken tot deelname" loopt
    // hier over een paginaovergang heen; zonder het wegfilteren van die paginakop
    // valt het label in tweeën en blijft het aantal onzichtbaar.
    const [lot] = parseAwardNotice(fixture('434357')).lots

    expect(lot.winners).toEqual(["Doen'r Zuid B.V."])
    expect(lot.tenderCount).toBe(5)
  })

  test('eForms: winnaar alleen af te leiden uit de organisatierollen', () => {
    // Deze aankondiging heeft geen sectie 6.1.2; alleen de rol "Winnaar van deze
    // percelen" bij de organisatie verraadt wie er won.
    const [lot] = parseAwardNotice(fixture('435222')).lots

    expect(lot.awarded).toBe(true)
    expect(lot.winners).toEqual(['Alewijnse Netherlands B.V.'])
    expect(lot.losers).toEqual(['Gebhard B.V.'])
  })

  test('eForms: ingetrokken procedure levert geen winnaar op', () => {
    const parsed = parseAwardNotice(fixture('429948'))

    expect(parsed.lots).toHaveLength(1)
    expect(parsed.lots[0].awarded).toBe(false)
    expect(parsed.lots[0].winners).toEqual([])
  })

  test('oud TED-formulier: contractant staat op de regel ná het label', () => {
    const parsed = parseAwardNotice(fixture('169275'))

    expect(parsed.format).toBe('ted')
    const [lot] = parsed.lots
    expect(lot.awarded).toBe(true)
    expect(lot.winners).toEqual(['ComPromise Domino B.V.'])
    expect(lot.tenderCount).toBe(2)
    expect(lot.contractDate).toBe('2019-06-20')
  })
})

test.describe('opdrachtgever herkennen', () => {
  test('naamvarianten van dezelfde dienst tellen als één opdrachtgever', () => {
    expect(matchesBuyer('Gemeente Amsterdam', 'Gemeente Amsterdam', true)).toBe(true)
    expect(matchesBuyer('Gemeente Amsterdam, Ingenieursbureau', 'Gemeente Amsterdam', true)).toBe(true)
    expect(matchesBuyer('Stichting Amsterdam UMC', 'Amsterdam UMC', true)).toBe(true)
  })

  test('een andere dienst met een gelijkende naam telt niet mee', () => {
    // "Gemeente Bestwijk" begint met dezelfde letters als "Gemeente Best"; alleen
    // matchen op woordgrens voorkomt dat die twee op één hoop belanden.
    expect(matchesBuyer('Gemeente Bestwijk', 'Gemeente Best', true)).toBe(false)
    expect(matchesBuyer('Gemeente Rotterdam', 'Gemeente Amsterdam', true)).toBe(false)
  })

  test('zonder varianten telt alleen de exacte opdrachtgever', () => {
    expect(matchesBuyer('Gemeente Amsterdam, Ingenieursbureau', 'Gemeente Amsterdam', false)).toBe(false)
  })

  test('rechtsvorm maakt geen verschil', () => {
    expect(buyerKey('Conclusion B.V.')).toBe(buyerKey('Conclusion'))
  })
})

function award(overrides: Partial<BuyerAward> & { publicatieId: string }): BuyerAward {
  return {
    kenmerk: null,
    buyer: 'Gemeente Testdam',
    title: 'Opdracht',
    publishedOn: '2025-01-01',
    cpvCodes: [],
    tendernedUrl: `https://www.tenderned.nl/aankondigingen/overzicht/${overrides.publicatieId}`,
    status: 'ok',
    format: 'eforms',
    lots: [],
    note: null,
    ...overrides,
  }
}

function lot(winners: string[], tenderCount: number | null, extra: Record<string, unknown> = {}) {
  return {
    lot: null,
    title: null,
    awarded: true,
    winners,
    losers: [],
    tenderCount,
    lowValue: null,
    highValue: null,
    contractDate: null,
    ...extra,
  }
}

test.describe('marktbeeld samenvatten', () => {
  const awards: BuyerAward[] = [
    award({ publicatieId: '1', title: 'Onderhoud wegen', publishedOn: '2025-06-01', lots: [lot(['Bouwbedrijf A'], 4)] }),
    award({ publicatieId: '2', title: 'Onderhoud groen', publishedOn: '2024-03-01', lots: [lot(['Bouwbedrijf A'], 2)] }),
    award({ publicatieId: '3', title: 'Advies', publishedOn: '2023-05-01', lots: [lot(['Adviesbureau B'], 6)] }),
  ]

  test('telt per partij hoe vaak die won, met de laatste winst erbij', () => {
    const winners = summarizeWinners(awards)

    expect(winners.map((winner) => winner.name)).toEqual(['Bouwbedrijf A', 'Adviesbureau B'])
    expect(winners[0].wins).toBe(2)
    expect(winners[0].lastWonOn).toBe('2025-06-01')
    expect(winners[0].titles).toContain('Onderhoud wegen')
  })

  test('rekent de concurrentiedruk uit over de percelen waar het aantal bekend is', () => {
    const competition = summarizeCompetition([
      ...awards,
      award({ publicatieId: '4', lots: [lot(['Partij C'], null)] }),
    ])

    expect(competition.measuredLots).toBe(3)
    expect(competition.averageTenderCount).toBe(4)
    expect(competition.medianTenderCount).toBe(4)
    expect(competition.minTenderCount).toBe(2)
    expect(competition.maxTenderCount).toBe(6)
    expect(competition.singleBidderLots).toBe(0)
  })

  test('de mediaan verzacht wat het gemiddelde vertekent', () => {
    // Afroepen met één inschrijver trekken het gemiddelde omlaag; de mediaan laat
    // zien hoe druk het bij een echte competitie is.
    const competition = summarizeCompetition([
      award({ publicatieId: 'a', lots: [lot(['A'], 1)] }),
      award({ publicatieId: 'b', lots: [lot(['B'], 1)] }),
      award({ publicatieId: 'c', lots: [lot(['C'], 6)] }),
      award({ publicatieId: 'd', lots: [lot(['D'], 8)] }),
      award({ publicatieId: 'e', lots: [lot(['E'], 9)] }),
    ])

    expect(competition.averageTenderCount).toBe(5)
    expect(competition.medianTenderCount).toBe(6)
    expect(competition.singleBidderLots).toBe(2)
  })

  test('waarschuwt wanneer veel gunningen maar één inschrijver hadden', () => {
    const singles = [
      award({ publicatieId: 'a', lots: [lot(['A'], 1)] }),
      award({ publicatieId: 'b', lots: [lot(['B'], 1)] }),
      award({ publicatieId: 'c', lots: [lot(['C'], 4)] }),
    ]
    const text = describeCompetition({
      buyer: 'Gemeente Testdam',
      matchedNames: [],
      scannedAt: '',
      since: '2020-01-01',
      cpvCodes: [],
      found: 3,
      awards: singles,
      winners: summarizeWinners(singles),
      competition: summarizeCompetition(singles),
      unreadCount: 0,
    })

    expect(text).toContain('2 van de 3 hadden één inschrijver')
  })

  test('niet-gegunde percelen tellen niet mee', () => {
    const withdrawn = award({ publicatieId: '9', lots: [lot(['Partij X'], 3, { awarded: false })] })

    expect(summarizeWinners([withdrawn])).toEqual([])
    expect(summarizeCompetition([withdrawn]).measuredLots).toBe(0)
  })

  test('elk gegund perceel wordt een eigen regel, nieuwste eerst', () => {
    const rows = lotSummaries([
      award({
        publicatieId: '7',
        title: 'Raamovereenkomst ICT',
        publishedOn: '2025-09-01',
        lots: [
          lot(['Partij A'], 3, { lot: 'LOT-0001', title: 'Perceel 1 hardware' }),
          lot(['Partij B'], 5, { lot: 'LOT-0002', title: 'Perceel 2 software' }),
        ],
      }),
      ...awards,
    ])

    expect(rows).toHaveLength(5)
    expect(rows[0].title).toBe('Raamovereenkomst ICT — Perceel 1 hardware')
    expect(rows[0].tenderCountLabel).toBe('3 inschrijvers')
    expect(rows[1].winnerLabel).toBe('Partij B')
  })

  test('één inschrijver wordt enkelvoud, onbekend blijft onbekend', () => {
    const rows = lotSummaries([
      award({ publicatieId: '8', lots: [lot(['Partij A'], 1)] }),
      award({ publicatieId: '9', publishedOn: '2020-01-01', lots: [lot([], null)] }),
    ])

    expect(rows[0].tenderCountLabel).toBe('1 inschrijver')
    expect(rows[1].tenderCountLabel).toBe('aantal inschrijvers onbekend')
    expect(rows[1].winnerLabel).toBe('Winnaar niet vermeld')
  })

  test('vertelt wat de cijfers betekenen voor de winkans', () => {
    const history = {
      buyer: 'Gemeente Testdam',
      matchedNames: [],
      scannedAt: '',
      since: '2020-01-01',
      cpvCodes: [],
      found: 3,
      awards,
      winners: summarizeWinners(awards),
      competition: summarizeCompetition(awards),
      unreadCount: 0,
    } satisfies BuyerHistory

    const text = describeCompetition(history)
    expect(text).toContain('Gemiddeld 4 inschrijvers')
    expect(text).toContain('mediaan 4')
    expect(text).toContain('Bouwbedrijf A won hier 2 keer')
  })
})

test.describe('eigen leerpunten bij deze opdrachtgever', () => {
  const lessons = [
    { id: '1', buyer: 'Gemeente Testdam', createdAt: '2025-01-01' },
    { id: '2', buyer: 'Gemeente Testdam, Ingenieursbureau', createdAt: '2025-06-01' },
    { id: '3', buyer: 'Gemeente Elders', createdAt: '2025-03-01' },
    { id: '4', buyer: null, createdAt: '2025-04-01' },
  ].map((item) => ({ ...item, projectTitle: 'P', outcome: 'verloren', lesson: 'L' }) as LessonLearned)

  test('kiest alleen de leerpunten van deze opdrachtgever, nieuwste eerst', () => {
    const found = buyerLessons(lessons, 'Gemeente Testdam')

    expect(found.map((lesson) => lesson.id)).toEqual(['2', '1'])
  })

  test('zonder opdrachtgever blijft de lijst leeg', () => {
    expect(buyerLessons(lessons, '  ')).toEqual([])
  })
})
