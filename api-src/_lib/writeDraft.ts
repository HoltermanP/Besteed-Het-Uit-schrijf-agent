import { completeChat, resolveAiFromRequest, streamChat, type AiRuntimeConfig, type AiMessage } from './aiClient'
import type { WriteDraftDocument, WriteDraftRequest, WriteDraftResponse } from '../../src/types/writeDraft'
import type { RequestedDocument, TenderAnalysis } from '../../src/types/tenderAnalysis'
import { requestedDocumentKindLabels, scopeAnalysisToDocument } from '../../src/lib/requestedDocuments'
import { requirementsForDocument } from '../../src/lib/requirements'

const stageInstructions: Record<WriteDraftRequest['stage'], string> = {
  brons:
    'Schrijf een volledige eerste versie van het gevraagde inschrijfstuk. Werk elk verplicht onderwerp diepgaand uit. Staat er een maximum in de leidraad: gebruik dat woord- of karakterbudget bijna volledig (richting het maximum, zonder overschrijding). Geen maximum: schrijf zeer uitgebreid.',
  zilver:
    'Verbeter en breid het bestaande concept uit: verwerk reviewopmerkingen, versterk bewijsvoering en vul gaten. Met leidraad-maximum: breid uit tot dicht bij het maximum; inkort alleen boven het maximum.',
  goud:
    'Lever de definitieve versie: volledig, concreet en exportklaar. Met leidraad-maximum: eindig op 97–100% van het maximum; zonder maximum zeer uitgebreid.',
}

const stageLabels: Record<WriteDraftRequest['stage'], string> = {
  brons: 'Brons',
  zilver: 'Zilver',
  goud: 'Goud',
}

const SYSTEM_PROMPT = `Je bent een senior bidwriter voor Nederlandse aanbestedingen (Aanbestedingswet, EMVI, BPKV).

DOEL
Schrijf het concrete inschrijfstuk dat de opdrachtgever vraagt — geen generiek salesdocument. Een inschrijving bestaat vaak uit meerdere apart in te dienen stukken (plan van aanpak, uitwerking per subgunningscriterium, casus, implementatieplan …). Je schrijft er steeds PRECIES ÉÉN: het stuk dat in het taakblok onder "DIT STUK" staat. Inhoud, koppen en volgorde volgen de vraag die de leidraad voor dát stuk stelt; de opbouw volgt de vaste documentopbouw hieronder, zodat alle stukken van één inschrijving herkenbaar dezelfde vorm en stem hebben.

VASTE DOCUMENTOPBOUW (gelijk voor elk stuk van deze inschrijving — herkenbare structuur en stijl, inhoud specifiek per stuk)
1. <header class="doc-header">: <p class="kicker"> = "[Titel van dit stuk] · [Brons/Zilver/Goud] versie"; <p class="doc-subtitle"> = "Inschrijving [projecttitel] — [opdrachtgever]"; <h1> = de titel van dit stuk; <dl class="doc-meta"> met Opdrachtgever, Beoordeeld op (de criteria van dit stuk), Deadline, TenderNed; <p class="lead"> = de kern van ons antwoord op de vraag van dit stuk in 2–4 zinnen (direct het antwoord, geen herhaling van de vraag).
2. Genummerde <section class="doc-section"> per deelvraag/onderwerp/subcriterium dat de leidraad voor DIT stuk stelt — in de volgorde en met de benaming van de leidraad. Elke sectie: <h2> met nummer en informatieve titel, <p class="section-subtitle"> "Beoordeeld op: …" (het criterium/subcriterium en de deelvraag), daarna de uitwerking. Vast ritme per sectie: kernzin met ons antwoord → hoe wij dat concreet doen (wie, wat, wanneer, hoe vaak) → bewijs uit bedrijfsbronnen → wat het de opdrachtgever oplevert. Opsommingen/tabellen als verdieping, maximaal één <figure class="doc-model"> per sectie.
3. Slotsectie "Onze toezeggingen in het kort" (laatste genummerde <section class="doc-section">): één tabel (Toezegging | Meetpunt | Eigenaar) met de concrete, toetsbare toezeggingen uit dit stuk. Bij een krappe limiet (≤ 1 A4 of ≤ 600 woorden) compact houden of weglaten ten gunste van de inhoud.
Dezelfde stem, terminologie, nummeringsstijl en opmaakklassen in elk stuk; de inhoud wisselt volledig mee met de vraag van het stuk.

BRONHIËRARCHIE (streng, van hoog naar laag)
1. Leidraad / aanbestedingsstukken — gevraagde stukken, onderwerpen, woord- en paginalimieten, beoordelingscriteria
2. Schrijfkader: schrijfregels, kwaliteitsstandaarden en handmatige aanpassingen van de inschrijver — verplichte formulering, kwaliteitsnormen, verboden formuleringen (documenten met de kop [SCHRIJFKADER · …])
3. Lessons learned uit eerdere aanbestedingen — toegepaste leerpunten: pas toe wat aantoonbaar punten opleverde en vermijd wat eerder punten kostte; laat ze de uitwerking sturen, maar nooit de leidraad-eisen overrulen
4. Bedrijfsinformatie — alleen feitelijke claims over het inschrijvende bedrijf
5. Schrijfwijze & voorbeeldteksten (Schrijfkader) — toon, zinsbouw, opmaak; geen nieuwe inhoud verzinnen

INHOUDELIJKE REGELS
- SCHRIJF ALLEEN DIT STUK: beantwoord de vraag die de leidraad voor dit stuk stelt, volledig en gericht. Inhoud die bij een ander stuk van de inschrijving hoort (zie "Andere stukken" in het taakblok) werk je hier NIET uit; hooguit één zin met verwijzing als de leidraad dat toestaat
- VOLG DE LEIDRAAD LETTERLIJK: neem de hoofdstuk-/vraagindeling over die de leidraad voor dit stuk voorschrijft — dezelfde (sub)gunningscriteria of vraagnummers, dezelfde titels, dezelfde volgorde. Verzin geen eigen hoofdstukindeling; de beoordelaar moet het stuk 1-op-1 naast de leidraad kunnen leggen
- Verdeel het woordbudget naar de weging van de gunningscriteria: een subcriterium van 30% krijgt aantoonbaar meer diepgang dan een van 15%
- Maak per verplicht onderwerp uit de leidraadanalyse een eigen <section class="doc-section"> met genummerde <h2>
- Koppel elke sectie in een <p class="section-subtitle"> aan het relevante beoordelingscriterium of subcriterium
- Beantwoord wat de opdrachtgever expliciet vraagt én adresseer de onderliggende behoefte uit de analyse "vraag achter de vraag"
- Laat in elke sectie impliciet zien dat u het werkelijke doel van de opdrachtgever begrijpt (zekerheid, grip, beheersbaarheid, EMVI-prioriteiten)
- Voeg geen standaardparagrafen toe over risico, duurzaamheid, implementatie of continuiteit tenzij de leidraad dat vereist
- Respecteer de specifieke eisen aan de inschrijving (vorm, opmaak, indiening, geschiktheid) uit de analyse: schrijf bijvoorbeeld anoniem als dat vereist is, in het Nederlands, en houd je aan format-/structuureisen
- Onderbouw uitspraken met feiten uit bedrijfsbronnen; geen lege superlatieven
- FEITEN (hard): schrijf geen cijfers, namen, referenties, certificaten, resultaten, werkwijzen of toezeggingen die niet letterlijk in de bronnen of in de aanvullende informatie van het bidteam (taakblok "VERBETERRONDE") staan. Ontbreekt onderbouwing: laat de claim weg of formuleer zonder feitelijke claim — nooit invullen met aannames; de reviewer vraagt die informatie bij het bidteam op
- Verwijs niet naar het schrijfproces, AI, prompts of interne review

STIJL
- Nederlands, formeel, toetsbaar, actief waar passend
- Volg het schrijfkader (hieronder) en de gecombineerde schrijfstijl uit de analyse

SCHRIJFKADER (verplicht — schrijfregels, schrijfwijze, kwaliteit)
- In de bronnen staan documenten met de kop [SCHRIJFKADER · …]. Dit zijn de harde instructies van de inschrijver voor HOE er geschreven wordt; ze gelden voor elke zin van het stuk, van de eerste tot de laatste sectie
- Elk schrijfkader-document bevat drie lagen met oplopende prioriteit: BASISREGELS < VASTGELEGDE REGELS < HANDMATIGE AANPASSINGEN. Een apart document "ALGEMENE AANPASSINGEN" staat boven alle secties. Bij strijdigheid wint de hogere laag; alleen een expliciete eis uit de leidraad gaat boven het schrijfkader
- Handmatige en algemene aanpassingen zijn recente, bewuste bijsturingen van de gebruiker: pas ze letterlijk en overal toe, ook als ze afwijken van de basis of van je eigen voorkeur
- Pas de schrijfwijze (toon, perspectief, zinslengte, alinea-opbouw, woordkeuze) actief toe en houd dat vol tot de laatste zin — niet alleen in de eerste secties
- Controleer vóór je afrondt elke sectie expliciet op: verboden formuleringen, verplichte terminologie en perspectief, kwaliteitseisen (onderbouwing, toetsbaarheid, SMART) — en corrigeer overtredingen in de tekst zelf
- Noem het schrijfkader, de regels of de aanpassingen nooit in het stuk

VOLUME (cruciaal)
- Als de leidraad een maximum aantal woorden, karakters of pagina's noemt: blijf daar STRIKT onder, maar gebruik het budget bijna volledig — schrijf richting het maximum (97–100%), niet een korte samenvatting
- Als er GEEN maximum is: schrijf ZEER uitgebreid — minimaal 2500 woorden totaal, tenzij de leidraad expliciet korter vraagt
- Per verplicht onderwerp: minimaal 4–8 alinea's met concrete werkwijze, voorbeelden, KPI's, rollen, planning en bewijs
- Dit is een volwaardig inschrijfstuk voor een aanbesteding, geen managementsamenvatting of bullet-only tekst
- Geen opvulling of herhaling; wel volledige uitwerking van alle eisen

OPMAAK & LEESBAARHEID (maak het document visueel sterk, niet kaal)
- Gebruik opsommingen (<ul>/<ol>) om criteria, stappen, rollen, voorwaarden of bewijslast overzichtelijk te maken — als aanvulling op de alinea's, niet als vervanging van inhoudelijke uitwerking
- Gebruik tabellen voor gestructureerde gegevens (planning, RACI/rolverdeling, KPI's, risico's met maatregelen, eis-vs-invulling). Format: <div class="table-wrap"><table><caption>…</caption><thead><tr><th>…</th></tr></thead><tbody>…</tbody></table></div>
- Houd dit kwaliteitsniveau vol over het VOLLEDIGE document: sectie 8 of 12 verdient dezelfde tabellen, opsommingen en structuur als sectie 1. Val bij een lang stuk niet terug op kale alinea's zodra je verder in de tekst zit — dat is een bekende valkuil bij lange documenten en moet je actief vermijden

MANAGEMENTMODELLEN & VISUALISATIE (actief identificeren en praktisch toepassen)
- Beoordeel bij ELKE sectie actief: welk erkend managementmodel uit de theorie kan deze inhoud structureren, onderbouwen of overtuigender maken? Pas dat model PRAKTISCH toe — geen theorie-uitleg of definitie, maar het model ingevuld met de concrete situatie van déze aanbesteding en opdrachtgever
- Verspreid over het document mag je meerdere modellen gebruiken (maximaal één per sectie). Kies steeds het inhoudelijk best passende model; gebruik een model alleen waar het echt iets toevoegt, niet als opvulling, en herhaal hetzelfde model niet onnodig
- "Niet onnodig herhalen" betekent: kies per sectie een ander soort model dan de vorige. Het betekent NIET dat je verderop in het document minder modellen mag gebruiken dan aan het begin — pas dit principe toe in de eerste én de laatste sectie
- Zet de naam van het model in de <figcaption> (bijv. "SWOT-analyse", "Risicomatrix (kans × impact)", "Kraljic-matrix", "PDCA-cyclus", "Krachtenveldanalyse")
- Veelgebruikte modellen voor aanbestedingen en het bijbehorende format:
  • SWOT, PESTEL/DESTEP, Five Forces (Porter), 7S (McKinsey), MoSCoW → modelraster (table class="model-grid")
  • Risicomatrix (kans × impact), Kraljic-matrix (toeleveringsrisico × inkoopimpact), krachtenveld/stakeholders (macht × belang), BCG → 2×2-matrix (table class="matrix-2x2")
  • Plan van aanpak/fasering, waardeketen (Porter), PDCA/Deming-cyclus → processchema (table class="process-flow")
  • Planning/mijlpalen → tijdlijn (table class="timeline")
  • Projectorganisatie/rolverdeling → organogram (table class="org-chart")

Gebruik exact deze HTML-formats (wrapper altijd <figure class="doc-model"> met een <figcaption>):

1) PROCESSCHEMA — voor fasering, stappen, werkwijze, waardeketen of cyclus met een logische volgorde (3–5 stappen, <td class="process-arrow">→</td> tussen elke stap):
<figure class="doc-model">
  <figcaption>Onze aanpak in vier fasen</figcaption>
  <table class="process-flow" role="presentation"><tbody><tr>
    <td class="process-step"><span class="step-no">1</span><span class="step-title">Fasetitel</span><span class="step-detail">Concrete activiteit en resultaat</span></td>
    <td class="process-arrow">→</td>
    <td class="process-step"><span class="step-no">2</span><span class="step-title">…</span><span class="step-detail">…</span></td>
  </tr></tbody></table>
</figure>

2) TIJDLIJN — voor planning of mijlpalen met perioden/data (één <tr> per mijlpaal):
<figure class="doc-model">
  <figcaption>Planning op hoofdlijnen</figcaption>
  <table class="timeline" role="presentation"><tbody>
    <tr><td class="tl-when">Week 1–2</td><td class="tl-marker"><span class="tl-dot"></span></td><td class="tl-what"><span class="tl-title">Mijlpaal</span><span class="tl-detail">Wat er gebeurt en wordt opgeleverd</span></td></tr>
    <tr><td class="tl-when">Week 3–6</td><td class="tl-marker"><span class="tl-dot"></span></td><td class="tl-what"><span class="tl-title">…</span><span class="tl-detail">…</span></td></tr>
  </tbody></table>
</figure>

3) ORGANOGRAM — voor team-/rolstructuur (één hoofdrol boven, 2–4 rollen eronder):
<figure class="doc-model">
  <figcaption>Projectorganisatie</figcaption>
  <table class="org-chart" role="presentation"><tbody>
    <tr><td class="org-top"><span class="org-box"><span class="org-role">Eindverantwoordelijk</span><span class="org-name">Rol / functie</span></span></td></tr>
    <tr><td><table class="org-reports" role="presentation"><tbody><tr>
      <td><span class="org-box"><span class="org-role">Rol</span><span class="org-name">Functie</span></span></td>
      <td><span class="org-box"><span class="org-role">Rol</span><span class="org-name">Functie</span></span></td>
    </tr></tbody></table></td></tr>
  </tbody></table>
</figure>

4) KWADRANT / 2×2-MATRIX — voor positionering langs twee assen (bijv. risico's kans × impact). Markeer het kritieke kwadrant met class="mx-cell mx-hot":
<figure class="doc-model">
  <figcaption>Risico's naar kans en impact</figcaption>
  <table class="matrix-2x2" role="presentation"><tbody>
    <tr><td class="mx-corner"></td><td class="mx-axis-x">Lage impact</td><td class="mx-axis-x">Hoge impact</td></tr>
    <tr><td class="mx-axis-y">Hoge kans</td><td class="mx-cell"><span class="mx-label">…</span>toelichting</td><td class="mx-cell mx-hot"><span class="mx-label">…</span>toelichting</td></tr>
    <tr><td class="mx-axis-y">Lage kans</td><td class="mx-cell"><span class="mx-label">…</span>toelichting</td><td class="mx-cell"><span class="mx-label">…</span>toelichting</td></tr>
  </tbody></table>
</figure>

5) MODELRASTER — voor modellen met losse elementen (SWOT, PESTEL/DESTEP, Five Forces, 7S, MoSCoW). Elk element is een <td> met <span class="grid-label"> + <span class="grid-body"> (de body mag een <ul> bevatten); zet 2 of 3 cellen per <tr>. Voor SWOT: class "tone-positive" op Sterktes/Kansen en "tone-negative" op Zwaktes/Bedreigingen:
<figure class="doc-model">
  <figcaption>SWOT-analyse</figcaption>
  <table class="model-grid" role="presentation"><tbody>
    <tr>
      <td class="tone-positive"><span class="grid-label">Sterktes</span><span class="grid-body">Concreet voor deze opdracht…</span></td>
      <td class="tone-negative"><span class="grid-label">Zwaktes</span><span class="grid-body">…</span></td>
    </tr>
    <tr>
      <td class="tone-positive"><span class="grid-label">Kansen</span><span class="grid-body">…</span></td>
      <td class="tone-negative"><span class="grid-label">Bedreigingen</span><span class="grid-body">…</span></td>
    </tr>
  </tbody></table>
</figure>

OUTPUT (alleen HTML, geen markdown)
- Eén <article class="proposal-doc">…</article> — dit ene stuk, volgens de vaste documentopbouw
- <header class="doc-header"> met kicker ("[Titel stuk] · Brons/Zilver/Goud versie"), <p class="doc-subtitle">, <h1> (titel van het stuk), metadata (<dl class="doc-meta">), <p class="lead">
- Per deelvraag/onderwerp van dit stuk: <section class="doc-section"> met genummerde <h2>, <p class="section-subtitle">, inhoud (<p>, <ul>/<ol>, <table>, en waar het de inhoud versterkt één <figure class="doc-model">), afgesloten met de slotsectie met toezeggingen
- Geen meta-sectie over schrijfkwaliteit, stijlbibliotheek of werkwijze van het schrijven
- Geen tekst buiten het HTML-artikel`

// Ruime limieten: leidraden zijn vaak 50-150k tekens; afkappen betekent dat de
// agent eisen mist en de leidraad niet kan volgen. Claude verwerkt dit probleemloos.
const DOC_CHAR_LIMITS: Record<WriteDraftDocument['type'], number> = {
  tender: 150_000,
  company: 40_000,
  rules: 40_000,
  training: 30_000,
  lessons: 15_000,
}

/** Streefdoel en ondergrens t.o.v. leidraad-maximum */
const VOLUME_TARGET_RATIO = 0.97
const VOLUME_FLOOR_RATIO = 0.92

function summarizeDocument(content: string, max: number): string {
  const clean = content.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max).trim()}…` : clean
}

function hasVolumeLimit(analysis: TenderAnalysis): boolean {
  return Boolean(
    analysis.targetWordCount ||
      analysis.targetCharCount ||
      (analysis.wordLimits ?? []).some((limit) => limit.unit === 'paginas' && limit.max),
  )
}

function formatVolumeLimits(analysis: TenderAnalysis): string {
  const wordLimits = analysis.wordLimits ?? []
  if (!wordLimits.length) {
    return '- Geen woord-, karakter- of paginalimiet gedetecteerd in de leidraad.'
  }

  return wordLimits
    .map((limit) => {
      const scope = limit.section ? ` (${limit.section})` : ''
      const value =
        limit.min && limit.max
          ? `${limit.min}–${limit.max} ${limit.unit}`
          : limit.max
            ? `max. ${limit.max} ${limit.unit}`
            : limit.min
              ? `min. ${limit.min} ${limit.unit}`
              : limit.unit
      return `- ${limit.label}${scope}: ${value} [${limit.source}]`
    })
    .join('\n')
}

function buildVolumeInstruction(analysis: TenderAnalysis | null | undefined): string {
  if (!analysis || !hasVolumeLimit(analysis)) {
    const mandatoryCount = analysis?.contentRequirements?.filter((item) => item.mandatory).length ?? 0
    const minWords = Math.max(2500, mandatoryCount * 350)
    return `VOLUME — GEEN MAXIMUM IN LEIDRAAD (schrijf zeer uitgebreid)
- Er is geen maximum aantal woorden of karakters gevonden in de leidraad
- Streef naar minimaal ${minWords.toLocaleString('nl-NL')} woorden totaal — liever te uitgebreid dan te kort
- Per verplicht onderwerp: minimaal 4–8 alinea's, met concrete werkwijze, voorbeelden, KPI's, rollen, planning en bewijs
- Werk alle beoordelingscriteria volledig uit; geen samenvattingen of staccato bullets als enige inhoud
- Geen herhaling of opvulling; wel volledige, diepgaande uitwerking`
  }

  const lines = [
    'VOLUME — HARDE LIMIET + GEBRUIK HET BUDGET',
    'Tel alleen zichtbare tekst in het artikel (paragrafen, koppen, lijsten, tabelcellen). Geen HTML-tags, geen metadata.',
    'Schrijf richting het maximum uit de leidraad — een te kort stuk laat punten liggen; een te lang stuk is diskwalificerend.',
  ]

  if (analysis.targetWordCount) {
    const target = analysis.targetWordCount
    const aimLow = Math.round(target * VOLUME_TARGET_RATIO)
    lines.push(
      `- Maximum woorden: ${target} — streef naar ${aimLow}–${target} woorden (97–100% van het maximum)`,
      `- Te kort (< ${Math.round(target * VOLUME_FLOOR_RATIO)} woorden) is onvoldoende; te lang (> ${target}) is niet toegestaan`,
    )
  }

  if (analysis.targetCharCount) {
    const target = analysis.targetCharCount
    const aimLow = Math.round(target * VOLUME_TARGET_RATIO)
    lines.push(
      `- Maximum karakters: ${target.toLocaleString('nl-NL')} — streef naar ${aimLow.toLocaleString('nl-NL')}–${target.toLocaleString('nl-NL')} karakters`,
    )
  }

  ;(analysis.wordLimits ?? [])
    .filter((limit) => limit.unit === 'paginas' && limit.max)
    .forEach((limit) => {
      lines.push(
        `- Maximum pagina's: ${limit.max}${limit.section ? ` (${limit.section})` : ''} — gebruik het paginabudget volledig binnen de limiet`,
      )
    })

  lines.push(
    '- Bij zowel woorden als karakters: beide limieten gelden; benut het strakste maximum zo volledig mogelijk',
    '- Prioriteit: eerst alle verplichte onderwerpen volledig, daarna detail tot dicht bij het maximum',
    '- Te lang? inkorten door herhaling te schrappen, niet door verplichte eisen weg te laten',
  )

  return lines.join('\n')
}

function formatVolumeSummary(analysis: TenderAnalysis): string {
  if (!hasVolumeLimit(analysis)) {
    const mandatoryCount = analysis.contentRequirements?.filter((item) => item.mandatory).length ?? 0
    const minWords = Math.max(2500, mandatoryCount * 350)
    return `geen maximum — schrijf zeer uitgebreid (streef min. ${minWords.toLocaleString('nl-NL')} woorden)`
  }

  const parts: string[] = []
  if (analysis.targetWordCount) {
    parts.push(`max. ${analysis.targetWordCount} woorden (streef 97–100%)`)
  }
  if (analysis.targetCharCount) {
    parts.push(`max. ${analysis.targetCharCount.toLocaleString('nl-NL')} karakters`)
  }
  const pageMax = (analysis.wordLimits ?? [])
    .filter((limit) => limit.unit === 'paginas' && limit.max)
    .map((limit) => limit.max)
  if (pageMax.length) parts.push(`max. ${pageMax.join('/')} pagina's`)

  return parts.join(', ')
}

function formatContentRequirements(analysis: TenderAnalysis): string {
  const contentRequirements = analysis.contentRequirements ?? []
  if (!contentRequirements.length) {
    return '- Geen inhoudseisen gedetecteerd — leid structuur af uit aanbestedingsbronnen en beoordelingscriteria.'
  }

  const mandatory = contentRequirements.filter((item) => item.mandatory)
  const optional = contentRequirements.filter((item) => !item.mandatory)

  const lines: string[] = []
  if (mandatory.length) {
    lines.push('Verplichte onderwerpen (elk een aparte sectie):')
    mandatory.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.topic} — ${item.detail} [${item.source}]`)
    })
  }
  if (optional.length) {
    lines.push('', 'Optioneel (alleen opnemen als limiet en relevantie het toelaten):')
    optional.slice(0, 12).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.topic} — ${item.detail}`)
    })
  }
  return lines.join('\n')
}

function formatEvaluationCriteria(analysis: TenderAnalysis): string {
  const evaluationCriteria = analysis.evaluationCriteria ?? []
  if (!evaluationCriteria.length) {
    return '- Geen criteria gedetecteerd — koppel secties aan expliciete eisen uit de leidraad.'
  }

  return evaluationCriteria
    .map((criterion, index) => `${index + 1}. ${criterion}`)
    .join('\n')
}

function formatDocumentRequirements(analysis: TenderAnalysis): string {
  const documentRequirements = analysis.documentRequirements ?? []
  if (!documentRequirements.length) return '- geen'

  return documentRequirements
    .map(
      (doc) =>
        `- ${doc.name} (${doc.mandatory ? 'verplicht' : 'optioneel'}) — ${doc.source}`,
    )
    .join('\n')
}

function formatSubmissionRequirements(analysis: TenderAnalysis): string {
  const requirements = analysis.submissionRequirements ?? []
  if (!requirements.length) {
    return '- Geen specifieke vorm-/indieningseisen gedetecteerd — volg de algemene leidraadeisen.'
  }

  const mandatory = requirements.filter((req) => req.mandatory)
  const optional = requirements.filter((req) => !req.mandatory)
  const lines: string[] = []

  if (mandatory.length) {
    lines.push('Verplichte eisen (hard — schending kan diskwalificeren):')
    mandatory.forEach((req, index) => {
      lines.push(`${index + 1}. [${req.category}] ${req.requirement} [${req.source}]`)
    })
  }
  if (optional.length) {
    lines.push('', 'Overige aandachtspunten:')
    optional.slice(0, 8).forEach((req, index) => {
      lines.push(`${index + 1}. [${req.category}] ${req.requirement}`)
    })
  }
  return lines.join('\n')
}

function formatUnderlyingIntent(analysis: TenderAnalysis): string {
  const intent = analysis.underlyingIntent
  if (!intent) {
    return '- Geen vraag-achter-de-vraag analyse — leid onderliggende behoefte af uit leidraad en beoordelingscriteria.'
  }

  const lines = [
    `Expliciete vraag: ${intent.explicitQuestion}`,
    `Vraag achter de vraag: ${intent.questionBehindQuestion}`,
    `Onderliggende behoefte: ${intent.underlyingNeed}`,
  ]

  if (intent.buyerPriorities.length) {
    lines.push('', 'Prioriteiten opdrachtgever:')
    intent.buyerPriorities.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`)
    })
  }

  if (intent.implicitSuccessFactors.length) {
    lines.push('', 'Impliciete succescriteria:')
    intent.implicitSuccessFactors.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`)
    })
  }

  lines.push('', `Schrijflens: ${intent.writingGuidance}`)
  lines.push('', 'Let op: teamBrief uit de analyse is intern — niet opnemen in het inschrijfdocument.')

  return lines.join('\n')
}

/** Eisen uit het register die de reviewer straks aan de tekst van dit stuk toetst. */
function formatRequirementRegister(analysis: TenderAnalysis, targetDocument?: RequestedDocument): string {
  const requirements = requirementsForDocument(analysis, targetDocument).slice(0, 40)
  if (!requirements.length) return '- (geen aanvullende eisen in het register)'
  return requirements
    .map((req) => `- [${req.category}${req.mandatory ? ', verplicht' : ', wens'}] ${req.text} [${req.source}]`)
    .join('\n')
}

function buildStructureInstruction(analysis: TenderAnalysis | null | undefined, targetDocument?: RequestedDocument): string {
  if (!analysis) {
    return `STRUCTUUR
- Leid koppen en secties af uit de aanbestedingsbronnen
- Geen vaste EMVI-template; alleen wat de opdrachtgever vraagt

${buildVolumeInstruction(analysis)}`
  }

  return `STRUCTUUR (verplicht volgen)
- Spiegel de indeling van de leidraad: zoek in de aanbestedingsbronnen op welke vragen/(sub)criteria het ingediende stuk wordt beoordeeld en gebruik exact die koppen, nummering en volgorde
- De onderstaande gedetecteerde punten zijn een CHECKLIST (mogelijk onvolledig of ruizig) — de leidraadtekst zelf is altijd leidend

${buildVolumeInstruction(analysis)}

Gedetecteerde limieten uit leidraad:
${formatVolumeLimits(analysis)}

${formatContentRequirements(analysis)}

Beoordelingscriteria (elke sectie moet minstens één criterium adresseren):
${formatEvaluationCriteria(analysis)}

Vraag achter de vraag (schrijflens — verwerk in inhoud, niet als apart meta-stuk):
${formatUnderlyingIntent(analysis)}

Specifieke eisen aan de inschrijving (respecteer vanaf deze versie — vorm, opmaak, indiening, geschiktheid):
${formatSubmissionRequirements(analysis)}

Eisenregister voor dit stuk (toetsbaar — de reviewer controleert elk punt; voldoe er zichtbaar aan, alleen voor zover van toepassing op dít stuk):
${formatRequirementRegister(analysis, targetDocument)}

Verwachte bijlagen (inhoudelijk verwerken waar het plan van aanpak dat vraagt; niet als losse lijst dumpen):
${formatDocumentRequirements(analysis)}`
}

/** Het stuk dat nu geschreven wordt, plus de afbakening t.o.v. de overige stukken van de inschrijving. */
function buildDocumentBrief(request: WriteDraftRequest): string {
  const doc = request.targetDocument
  if (!doc) {
    return `DIT STUK
- Het inschrijfstuk dat de aanbestedingsstukken vragen (geen losse stukken herkend): werk alle verplichte onderwerpen uit de leidraadanalyse uit.`
  }

  const lines = [
    'DIT STUK (schrijf uitsluitend dit document)',
    `- Titel: ${doc.title}`,
    `- Soort: ${requestedDocumentKindLabels[doc.kind]}${doc.mandatory ? ' — verplicht in te dienen' : ''}`,
    `- Vraag/opdracht uit de leidraad: ${doc.question || '(niet letterlijk gevonden — leid de vraag af uit de leidraadtekst voor dit stuk)'}`,
    `- Beoordeeld op: ${doc.criteria.length ? doc.criteria.join('; ') : '(zie beoordelingscriteria hieronder)'}`,
  ]
  if (doc.topics.length) {
    lines.push('- Deelvragen/onderwerpen voor dit stuk (in deze volgorde; elk een eigen sectie):')
    doc.topics.forEach((topic, index) => lines.push(`  ${index + 1}. ${topic}`))
  }
  if (doc.format) lines.push(`- Vorm/format: ${doc.format}`)
  lines.push(`- Bron: ${doc.source}`)

  const siblings = (request.siblingDocuments ?? []).filter((item) => item.title !== doc.title)
  if (siblings.length) {
    lines.push('', 'Andere stukken van deze inschrijving (elders uitgewerkt — hier NIET herhalen; zelfde stem en opbouw):')
    siblings.forEach((item) => {
      lines.push(`- ${item.title} [${requestedDocumentKindLabels[item.kind]}]${item.question ? ` — ${item.question.slice(0, 160)}` : ''}`)
    })
  }
  return lines.join('\n')
}

function buildAnalysisBlock(analysis: TenderAnalysis | null | undefined): string {
  if (!analysis) return 'Geen leidraadanalyse beschikbaar — leid structuur af uit aanbestedingsbronnen.'

  const gaps =
    analysis.gaps.length > 0
      ? `\nAandachtspunten / gaten:\n${analysis.gaps.map((gap) => `- ${gap}`).join('\n')}`
      : ''

  return `Leidraadanalyse:
- Samenvatting: ${analysis.summary}
- Leidraad gevonden: ${analysis.leidraadFound ? `ja (${analysis.leidraadSource ?? 'bron'})` : 'nee'}
- Volume: ${formatVolumeSummary(analysis)}
- Schrijfstijl: ${analysis.styleProfile.blendedGuidance}
- Inschrijver (${analysis.styleProfile.companyName}): ${analysis.styleProfile.companySignals.join('; ') || 'geen signalen'}
- Opdrachtgever (${analysis.styleProfile.buyerName}): ${analysis.styleProfile.buyerSignals.join('; ') || 'geen signalen'}
${analysis.underlyingIntent ? `- Vraag achter de vraag: ${analysis.underlyingIntent.questionBehindQuestion}` : ''}${gaps}`
}

function docsByType(request: WriteDraftRequest, type: WriteDraftDocument['type']): string {
  return request.documents
    .filter((doc) => doc.type === type)
    .map((doc) => `- ${doc.name}:\n${summarizeDocument(doc.content, DOC_CHAR_LIMITS[type])}`)
    .join('\n\n')
}

/**
 * Stabiel bronnenblok als eerste user-bericht: dit is byte-identiek over de
 * stadia brons/zilver/goud en over vervolg-passes heen, zodat de cache-marker
 * aan het einde ervan (zie aiClient) maximaal wordt herlezen. Alles wat per
 * stadium of per generatie verandert (fase, analyse, opmerkingen, huidig
 * concept) staat bewust in het aparte taakblok erna.
 */
function buildSourcesPrompt(request: WriteDraftRequest): string {
  return `=== BRONNEN ===

Aanbestedingsstukken (leidraad — leidend voor structuur en eisen):
${docsByType(request, 'tender') || '- geen'}

Bedrijfsinformatie (feiten voor onderbouwing):
${docsByType(request, 'company') || '- geen'}

Schrijfregels & kwaliteitsstandaarden — SCHRIJFKADER (verplicht na te leven in elke zin; handmatige aanpassingen gaan vóór vastgelegde regels, die gaan vóór basisregels):
${docsByType(request, 'rules') || '- geen'}

Schrijfwijze & voorbeeldteksten — SCHRIJFKADER (toon/structuur, consequent tot de laatste zin; geen nieuwe inhoud):
${docsByType(request, 'training') || '- geen'}

Lessons learned uit eerdere aanbestedingen (toepassen wat werkte, vermijden wat punten kostte; nooit de leidraad-eisen overrulen):
${docsByType(request, 'lessons') || '- geen'}`
}

/** Uitkomst van de verbeterronde: alleen goedgekeurde voorstellen en gegeven antwoorden zijn feitelijke basis. */
function buildImprovementsBlock(request: WriteDraftRequest): string {
  const improvements = request.improvements
  if (!improvements) return ''
  const lines: string[] = ['VERBETERRONDE (door het bidteam goedgekeurd — verwerk dit in deze versie)']

  if (improvements.answers.length) {
    lines.push('Aanvullende informatie van het bidteam (feitelijke basis; gebruik deze antwoorden letterlijk als bron):')
    improvements.answers.forEach((item, index) =>
      lines.push(`${index + 1}. Vraag: ${item.question}${item.section ? ` [sectie: ${item.section}]` : ''}\n   Antwoord: ${item.answer}`),
    )
  }

  if (improvements.approvedProposals.length) {
    lines.push('', 'Goedgekeurde voorstellen (elk verwerken; "overtreffen" = de uitvraag overstijgen op dit punt, binnen de limieten):')
    improvements.approvedProposals.forEach((item, index) =>
      lines.push(
        `${index + 1}. [${item.kind}] ${item.title}${item.section ? ` [sectie: ${item.section}]` : ''}\n   Wat: ${item.detail}\n   Waarom: ${item.rationale}${item.input ? `\n   Feitelijke input bidteam: ${item.input}` : '\n   (geen aanvullende input — gebruik uitsluitend de bronnen; verzin geen feiten)'}`,
      ),
    )
  }

  if (improvements.unanswered.length) {
    lines.push('', 'NIET INVULLEN — onbeantwoorde informatievragen (hiervoor ontbreekt feitelijke onderbouwing; laat de claim weg of formuleer zonder feit, schrijf géén aanname):')
    improvements.unanswered.forEach((item, index) =>
      lines.push(`${index + 1}. ${item.question}${item.section ? ` [sectie: ${item.section}]` : ''} — ${item.reason}`),
    )
  }

  return `${lines.join('\n')}\n\n`
}

function buildTaskPrompt(request: WriteDraftRequest): string {
  const openComments = request.comments
    .filter((comment) => !comment.resolved)
    .map((comment) => `- Fragment: ${comment.fragment}\n  Opmerking: ${comment.note}`)
    .join('\n')

  const currentDraftBlock = request.currentDraft?.trim()
    ? `HUIDIG CONCEPT (uitgangspunt — structuur behouden tenzij leidraad anders vereist):
${request.currentDraft.slice(0, 120_000)}`
    : ''

  const volumeLimited = request.analysis ? hasVolumeLimit(request.analysis) : false

  const docName = request.targetDocument ? `het stuk "${request.targetDocument.title}"` : 'het inschrijfstuk'
  const stageTask =
    request.stage === 'brons'
      ? volumeLimited
        ? `Schrijf ${docName} volledig en gebruik het volumemaximum voor dit stuk bijna volledig (97–100%, zonder overschrijding).`
        : `Schrijf ${docName} volledig en zeer uitgebreid — minimaal 2500 woorden, met alle verplichte onderwerpen van dit stuk diepgaand uitgewerkt.`
      : request.stage === 'zilver'
        ? volumeLimited
          ? 'Verbeter het huidige concept; verwerk alle open reviewopmerkingen en breid uit tot dicht bij het leidraad-maximum.'
          : 'Verbeter het huidige concept; verwerk alle open reviewopmerkingen en breid uit waar nodig.'
        : volumeLimited
          ? 'Finaliseer het concept op 97–100% van het leidraad-maximum, exportklaar.'
          : 'Finaliseer het concept: volledig en uitgebreid, zonder inhoud weg te laten.'

  return `Fase: ${stageLabels[request.stage]} — ${stageInstructions[request.stage]}

Project:
- Titel: ${request.project.title}
- Opdrachtgever: ${request.project.buyer}
- Deadline: ${request.project.deadline}
- TenderNed: ${request.project.tendernedId}

${buildDocumentBrief(request)}

${buildAnalysisBlock(request.analysis)}

${buildStructureInstruction(request.analysis, request.targetDocument)}

De bronnen staan in het vorige bericht.

Open reviewopmerkingen:
${openComments || '- geen'}

${buildImprovementsBlock(request)}${currentDraftBlock}

${stageTask}
Lever uitsluitend het HTML-artikel.`
}

function extractHtml(content: string): string {
  const fenced = content.match(/```html?\s*([\s\S]*?)```/i)
  if (fenced?.[1]?.trim() && isArticleComplete(fenced[1])) return fenced[1].trim()

  const article = content.match(/<article[\s\S]*<\/article>/i)
  if (article?.[0]) return article[0]

  const trimmed = content.trim()
  if (trimmed.startsWith('<article') && isArticleComplete(trimmed)) return trimmed

  throw new Error('Concept is onvolledig — het HTML-artikel is niet afgesloten.')
}

function isArticleComplete(content: string): boolean {
  return /<\/article>\s*$/i.test(content.trim())
}

function countVisibleWords(html: string): number {
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return plain ? plain.split(' ').length : 0
}

function countVisibleCharacters(html: string): number {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().length
}

function minimumWordTarget(request: WriteDraftRequest): number {
  const analysis = request.analysis
  if (analysis?.targetWordCount) {
    return Math.round(analysis.targetWordCount * VOLUME_TARGET_RATIO)
  }
  const mandatory = analysis?.contentRequirements?.filter((item) => item.mandatory).length ?? 0
  return Math.max(2500, mandatory * 350)
}

function needsContinuation(accumulated: string, request: WriteDraftRequest): boolean {
  if (!isArticleComplete(accumulated)) return true

  const analysis = request.analysis
  const words = countVisibleWords(accumulated)

  if (analysis?.targetWordCount) {
    return words < Math.round(analysis.targetWordCount * VOLUME_FLOOR_RATIO)
  }

  if (analysis?.targetCharCount) {
    return countVisibleCharacters(accumulated) < Math.round(analysis.targetCharCount * VOLUME_FLOOR_RATIO)
  }

  return words < minimumWordTarget(request)
}

function buildContinuationPrompt(request: WriteDraftRequest, accumulated: string): string {
  const analysis = request.analysis
  const words = countVisibleWords(accumulated)
  let volumeHint = ''

  if (analysis?.targetWordCount) {
    const target = analysis.targetWordCount
    const aimLow = Math.round(target * VOLUME_TARGET_RATIO)
    volumeHint = ` Het concept telt nu circa ${words} woorden. Breid uit richting het maximum van ${target} woorden (streef ${aimLow}–${target}) zonder het maximum te overschrijden.`
  } else if (analysis?.targetCharCount) {
    const target = analysis.targetCharCount
    const chars = countVisibleCharacters(accumulated)
    const aimLow = Math.round(target * VOLUME_TARGET_RATIO)
    volumeHint = ` Het concept telt nu circa ${chars.toLocaleString('nl-NL')} karakters. Breid uit richting het maximum van ${target.toLocaleString('nl-NL')} karakters (streef ${aimLow.toLocaleString('nl-NL')}–${target.toLocaleString('nl-NL')}).`
  } else {
    volumeHint = ` Het concept telt nu circa ${words} woorden. Werk alle resterende verplichte onderwerpen volledig uit tot minimaal ${minimumWordTarget(request)} woorden.`
  }

  return `Het vorige antwoord stopte voortijdig. Ga EXACT verder waar de tekst stopte — herhaal geen bestaande alinea's of secties. Sluit alle open HTML-tags af en eindig met </article>. Blijf de opmaakregels uit de systeeminstructie volgen (tabellen, opsommingen, managementmodellen) — het resterende deel verdient dezelfde opmaakkwaliteit als het al geschreven deel.${volumeHint}`
}

async function streamDraftToCompletion(
  ai: AiRuntimeConfig,
  request: WriteDraftRequest,
  send: (payload: Record<string, unknown>) => void,
): Promise<string> {
  const options = chatOptions(request)
  const baseMessages = buildChatMessages(request)
  let accumulated = ''
  let messages: AiMessage[] = baseMessages
  // Elke extra pass verstuurt de volledige prompt plus het opgebouwde concept
  // opnieuw; 3 passes à 64k output-tokens is ruim voldoende voor elk stuk.
  const maxPasses = 3

  for (let pass = 0; pass < maxPasses; pass++) {
    if (pass > 0) {
      send({ type: 'status', message: `Concept voortzetten (deel ${pass + 1})…` })
    }

    for await (const chunk of streamChat(ai, messages, options)) {
      accumulated += chunk
      send({ type: 'delta', text: chunk, accumulated })
    }

    if (!needsContinuation(accumulated, request)) {
      return extractHtml(accumulated)
    }

    messages = [
      ...baseMessages,
      { role: 'assistant', content: accumulated },
      { role: 'user', content: buildContinuationPrompt(request, accumulated) },
    ]
  }

  if (accumulated.trim().startsWith('<article')) {
    const closed = `${accumulated.trim()}\n</article>`
    if (isArticleComplete(closed)) return closed
  }

  throw new Error('Concept kon niet volledig worden afgerond. Probeer opnieuw te genereren.')
}

function buildChatMessages(request: WriteDraftRequest) {
  // Twee user-berichten: het stabiele bronnenblok eerst (met cache-marker via
  // aiClient), daarna het per-stadium wisselende taakblok.
  return [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: buildSourcesPrompt(request) },
    { role: 'user' as const, content: buildTaskPrompt(request) },
  ]
}

function chatOptions(request: WriteDraftRequest) {
  return {
    maxTokens: 64_000,
    timeoutMs: 300_000,
    useThinking: false,
    effort: request.stage === 'goud' ? ('xhigh' as const) : ('high' as const),
    // De system prompt en het bronnenblok worden bij vervolg-passes en bij de
    // stadia zilver/goud herlezen — prompt caching scheelt daar ~90% input.
    // 1h-TTL omdat er tussen stadia doorgaans een menselijke reviewronde zit.
    cachePrompt: true,
    cacheTtl: '1h' as const,
    label: 'schrijfagent',
  }
}

export function handleWriteDraftStreamRequest(request: WriteDraftRequest, ai: AiRuntimeConfig): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      try {
        const html = await streamDraftToCompletion(ai, request, send)
        send({
          type: 'done',
          html,
          model: ai.model,
          provider: ai.provider,
        })
        controller.close()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Onbekende fout bij genereren.'
        send({ type: 'error', error: message })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}

export async function generateDraftWithAi(
  request: WriteDraftRequest,
  ai: AiRuntimeConfig,
): Promise<WriteDraftResponse> {
  let accumulated = ''
  const options = chatOptions(request)
  const baseMessages = buildChatMessages(request)
  let messages: AiMessage[] = baseMessages

  for (let pass = 0; pass < 3; pass++) {
    const chunk = await completeChat(ai, messages, options)
    accumulated += chunk
    if (!needsContinuation(accumulated, request)) break
    messages = [
      ...baseMessages,
      { role: 'assistant', content: accumulated },
      { role: 'user', content: buildContinuationPrompt(request, accumulated) },
    ]
  }

  return {
    html: extractHtml(accumulated),
    model: ai.model,
    provider: ai.provider,
  }
}

/** Spits de analyse toe op het te schrijven stuk (idempotent als de client dat al deed). */
function scopeRequest(request: WriteDraftRequest): WriteDraftRequest {
  const doc: RequestedDocument | undefined = request.targetDocument
  if (!doc || !request.analysis) return request
  const sole = !(request.siblingDocuments ?? []).some((item) => item.kind === 'schrijfstuk' && item.title !== doc.title)
  return { ...request, analysis: scopeAnalysisToDocument(request.analysis, doc, { soleDocument: sole }) }
}

export async function handleWriteDraftRequest(body: unknown): Promise<Response> {
  try {
    const request = scopeRequest((body ?? {}) as WriteDraftRequest)
    if (!request.project?.title?.trim()) {
      throw new Error('Projectgegevens ontbreken.')
    }
    if (!['brons', 'zilver', 'goud'].includes(request.stage)) {
      throw new Error('Ongeldige fase.')
    }

    const ai = resolveAiFromRequest(request.ai as AiRuntimeConfig | undefined, 'WRITER_MODEL')

    if (request.stream) {
      return handleWriteDraftStreamRequest(request, ai)
    }

    const result = await generateDraftWithAi(request, ai)
    return Response.json(result satisfies WriteDraftResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout bij genereren.'
    return Response.json({ error: message }, { status: 400 })
  }
}
