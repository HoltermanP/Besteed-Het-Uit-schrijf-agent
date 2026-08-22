import {
  completeChat,
  resolveAiFromRequest,
  streamChat,
  type AiCompletionOptions,
  type AiRuntimeConfig,
  type AiMessage,
} from './aiClient'
import type { WriteDraftDocument, WriteDraftRequest, WriteDraftResponse } from '../../src/types/writeDraft'
import type { RequestedDocument, TenderAnalysis } from '../../src/types/tenderAnalysis'
import { requestedDocumentKindLabels, scopeAnalysisToDocument } from '../../src/lib/requestedDocuments'
import { requirementsForDocument } from '../../src/lib/requirements'
import {
  CHARS_PER_WORD,
  clampWordsPerPage,
  formatLimits,
  limitsForAnalysis,
  maxWordsFor,
  wordsForPages,
  type VolumeLimits,
} from '../../src/lib/volumeLimits'

/*
 * Het stuk wordt in DELEN geschreven — niet in één lange generatie.
 *
 * Bij één generatie van 2.500+ woorden liet het model de opmaak (tabellen,
 * opsommingen, managementmodellen) verderop in het document los; sterkere
 * prompt-instructies (zie git-historie) hielpen niet structureel. Daarom:
 *   1. OPZET    — één aanroep levert de secties, het woordbudget per sectie en
 *                 het toegewezen managementmodel (JSON) plus de lead.
 *   2. SECTIES  — elke sectie is een eigen, korte generatie (parallel, met
 *                 limiet) met harde opmaakeisen voor precies die sectie.
 *   3. SLOT     — de toezeggingentabel wordt ná de secties geschreven, op basis
 *                 van de geschreven tekst.
 *   4. CONTROLE — deterministische opmaakcontrole per sectie; een kale sectie
 *                 wordt gericht hersteld, een te lange sectie ingekort.
 * De header wordt uit de opzet opgebouwd, zodat alle stukken van één
 * inschrijving dezelfde vorm hebben. System prompt, bronnenblok en taakcontext
 * zijn byte-identiek over alle aanroepen en worden gecachet (aiClient).
 */

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
Schrijf het concrete inschrijfstuk dat de opdrachtgever vraagt — geen generiek salesdocument. Een inschrijving bestaat vaak uit meerdere apart in te dienen stukken (plan van aanpak, uitwerking per subgunningscriterium, casus, implementatieplan …). Je schrijft er steeds PRECIES ÉÉN: het stuk dat in de taakcontext onder "DIT STUK" staat. Inhoud, koppen en volgorde volgen de vraag die de leidraad voor dát stuk stelt; de opbouw volgt de vaste documentopbouw hieronder, zodat alle stukken van één inschrijving herkenbaar dezelfde vorm en stem hebben.

WERKWIJZE IN DELEN
Het stuk wordt in delen opgebouwd. Elke aanroep bevat in het LAATSTE bericht één deelopdracht:
- OPZET: je bepaalt de secties, het woordbudget per sectie en het managementmodel per sectie (uitsluitend JSON)
- SECTIE: je schrijft precies één sectie volledig uit (uitsluitend HTML van die sectie)
- SLOTSECTIE / OPMAAKHERSTEL / INKORTEN: een afgebakende bewerking op één sectie
De header (kicker, titel, metadata, lead) wordt buiten jou om uit de opzet opgebouwd. Andere secties worden in aparte aanroepen geschreven: werk ze hier niet uit en verwijs er hooguit in één zin naar.

VASTE DOCUMENTOPBOUW (gelijk voor elk stuk van deze inschrijving — herkenbare structuur en stijl, inhoud specifiek per stuk)
1. <header class="doc-header"> met kicker, ondertitel, <h1>, metadata en <p class="lead"> (de kern van ons antwoord op de vraag van dit stuk in 2–4 zinnen — direct het antwoord, geen herhaling van de vraag). Wordt opgebouwd uit de opzet.
2. Genummerde <section class="doc-section"> per deelvraag/onderwerp/subcriterium dat de leidraad voor DIT stuk stelt — in de volgorde en met de benaming van de leidraad. Elke sectie: <h2> met nummer en informatieve titel, <p class="section-subtitle"> "Beoordeeld op: …" (het criterium/subcriterium en de deelvraag), daarna de uitwerking. Vast ritme per sectie: kernzin met ons antwoord → hoe wij dat concreet doen (wie, wat, wanneer, hoe vaak) → bewijs uit bedrijfsbronnen → wat het de opdrachtgever oplevert. Opsommingen/tabellen als verdieping, maximaal één <figure class="doc-model"> per sectie.
3. Slotsectie "Onze toezeggingen in het kort" (laatste genummerde <section class="doc-section">): één tabel (Toezegging | Meetpunt | Eigenaar) met de concrete, toetsbare toezeggingen uit dit stuk. Bij een krappe limiet wordt deze weggelaten ten gunste van de inhoud.
Dezelfde stem, terminologie, nummeringsstijl en opmaakklassen in elke sectie; de inhoud wisselt volledig mee met de vraag van het stuk.

BRONHIËRARCHIE (streng, van hoog naar laag)
1. Leidraad / aanbestedingsstukken — gevraagde stukken, onderwerpen, woord- en paginalimieten, beoordelingscriteria
2. Schrijfkader: schrijfregels, kwaliteitsstandaarden en handmatige aanpassingen van de inschrijver — verplichte formulering, kwaliteitsnormen, verboden formuleringen (documenten met de kop [SCHRIJFKADER · …])
3. Bewijsbibliotheek — vastgelegde referenties, cases en cijfers met bron: dit is de harde feitenbasis voor elke onderbouwing
4. Lessons learned uit eerdere aanbestedingen — toegepaste leerpunten: pas toe wat aantoonbaar punten opleverde en vermijd wat eerder punten kostte; laat ze de uitwerking sturen, maar nooit de leidraad-eisen overrulen
5. Bedrijfsinformatie — alleen feitelijke claims over het inschrijvende bedrijf
6. Schrijfwijze & voorbeeldteksten (Schrijfkader) — toon, zinsbouw, opmaak; geen nieuwe inhoud verzinnen

INHOUDELIJKE REGELS
- SCHRIJF ALLEEN DIT STUK: beantwoord de vraag die de leidraad voor dit stuk stelt, volledig en gericht. Inhoud die bij een ander stuk van de inschrijving hoort (zie "Andere stukken" in de taakcontext) werk je hier NIET uit; hooguit één zin met verwijzing als de leidraad dat toestaat
- VOLG DE LEIDRAAD LETTERLIJK: neem de hoofdstuk-/vraagindeling over die de leidraad voor dit stuk voorschrijft — dezelfde (sub)gunningscriteria of vraagnummers, dezelfde titels, dezelfde volgorde. Verzin geen eigen hoofdstukindeling; de beoordelaar moet het stuk 1-op-1 naast de leidraad kunnen leggen
- Verdeel het woordbudget naar de weging van de gunningscriteria: een subcriterium van 30% krijgt aantoonbaar meer diepgang dan een van 15%
- Koppel elke sectie in een <p class="section-subtitle"> aan het relevante beoordelingscriterium of subcriterium
- Beantwoord wat de opdrachtgever expliciet vraagt én adresseer de onderliggende behoefte uit de analyse "vraag achter de vraag"
- Laat in elke sectie impliciet zien dat u het werkelijke doel van de opdrachtgever begrijpt (zekerheid, grip, beheersbaarheid, EMVI-prioriteiten)
- Voeg geen standaardparagrafen toe over risico, duurzaamheid, implementatie of continuiteit tenzij de leidraad dat vereist
- Respecteer de specifieke eisen aan de inschrijving (vorm, opmaak, indiening, geschiktheid) uit de analyse: schrijf bijvoorbeeld anoniem als dat vereist is, in het Nederlands, en houd je aan format-/structuureisen
- Onderbouw uitspraken met feiten uit bedrijfsbronnen; geen lege superlatieven
- FEITEN (hard): schrijf geen cijfers, namen, referenties, certificaten, resultaten, werkwijzen of toezeggingen die niet letterlijk in de bronnen of in de aanvullende informatie van het bidteam (taakcontext "VERBETERRONDE") staan. Ontbreekt onderbouwing: laat de claim weg of formuleer zonder feitelijke claim — nooit invullen met aannames; de reviewer vraagt die informatie bij het bidteam op

BEWIJSBIBLIOTHEEK CITEREN (verplicht bij elk hard feit)
- In de bronnen staat een blok BEWIJSBIBLIOTHEEK met vastgelegde bouwstenen: referenties, cases en cijfers, elk met een korte verwijzing tussen blokhaken, bijvoorbeeld [B4F19C]. Dit zijn de enige feiten van de inschrijver die als bewezen gelden
- Gebruik voor elke onderbouwing bij voorkeur een bouwsteen — dat is beter bewijs dan een algemene passage uit de bedrijfsinformatie — en neem het feit over zoals het er staat: verander geen getallen, jaartallen, namen of resultaten
- Markeer elk geciteerd feit met een onzichtbare verwijzing in de tekst: <span data-bewijs="B4F19C">de zin of zinsnede met het feit</span>. Dat is de bewijsvoetnoot van dit stuk: hij is niet zichtbaar voor de lezer en verdwijnt bij export, maar de reviewer controleert er de claims mee. Zet de span om de zinsnede zelf, nooit om een hele sectie of alinea
- Combineer meerdere bouwstenen in één zin als data-bewijs="B4F19C B77A20"
- Staat er geen bouwsteen voor een feit dat je wilt beweren, dan bewéér je het niet: geen cijfer, geen referentie, geen resultaat zonder bouwsteen of bron. Schrijf de zin zonder feitelijke claim of laat hem weg
- Verwijs niet naar het schrijfproces, AI, prompts of interne review

STIJL
- Nederlands, formeel, toetsbaar, actief waar passend
- Volg het schrijfkader (hieronder) en de gecombineerde schrijfstijl uit de analyse

SCHRIJFKADER (verplicht — schrijfregels, schrijfwijze, kwaliteit)
- In de bronnen staan documenten met de kop [SCHRIJFKADER · …]. Dit zijn de harde instructies van de inschrijver voor HOE er geschreven wordt; ze gelden voor elke zin van elke sectie
- Elk schrijfkader-document bevat drie lagen met oplopende prioriteit: BASISREGELS < VASTGELEGDE REGELS < HANDMATIGE AANPASSINGEN. Een apart document "ALGEMENE AANPASSINGEN" staat boven alle secties. Bij strijdigheid wint de hogere laag; alleen een expliciete eis uit de leidraad gaat boven het schrijfkader
- Handmatige en algemene aanpassingen zijn recente, bewuste bijsturingen van de gebruiker: pas ze letterlijk en overal toe, ook als ze afwijken van de basis of van je eigen voorkeur
- Pas de schrijfwijze (toon, perspectief, zinslengte, alinea-opbouw, woordkeuze) actief toe, in elke sectie even consequent
- Controleer vóór je afrondt de sectie expliciet op: verboden formuleringen, verplichte terminologie en perspectief, kwaliteitseisen (onderbouwing, toetsbaarheid, SMART) — en corrigeer overtredingen in de tekst zelf
- Noem het schrijfkader, de regels of de aanpassingen nooit in het stuk

VOLUME (cruciaal)
- De deelopdracht geeft per sectie een woordbudget (zichtbare tekst: alinea's, koppen, lijsten, tabelcellen — geen HTML-tags). Schrijf tot dicht bij dat budget; bij een leidraadlimiet is het sectiemaximum HARD: een te lang stuk is diskwalificerend
- Per sectie: meerdere alinea's met concrete werkwijze, voorbeelden, KPI's, rollen, planning en bewijs — dit is een volwaardig inschrijfstuk voor een aanbesteding, geen managementsamenvatting of bullet-only tekst
- Geen opvulling of herhaling; wel volledige uitwerking van alle eisen van de sectie

OPMAAK & LEESBAARHEID (maak elke sectie visueel sterk, niet kaal)
- Gebruik opsommingen (<ul>/<ol>) om criteria, stappen, rollen, voorwaarden of bewijslast overzichtelijk te maken — als aanvulling op de alinea's, niet als vervanging van inhoudelijke uitwerking
- Gebruik tabellen voor gestructureerde gegevens (planning, RACI/rolverdeling, KPI's, risico's met maatregelen, eis-vs-invulling). Format: <div class="table-wrap"><table><caption>…</caption><thead><tr><th>…</th></tr></thead><tbody>…</tbody></table></div>
- De deelopdracht noemt per sectie de verplichte opmaak (opsomming, tabel, model); die is niet optioneel. Elke sectie — de eerste én de laatste — krijgt dezelfde opmaakkwaliteit

MANAGEMENTMODELLEN & VISUALISATIE (praktisch toepassen)
- De opzet wijst per sectie hooguit één erkend managementmodel toe; in de sectie-opdracht staat welk model en welk format. Pas dat model PRAKTISCH toe — geen theorie-uitleg of definitie, maar het model ingevuld met de concrete situatie van déze aanbesteding en opdrachtgever
- Staat er "geen model" in de opdracht: gebruik dan geen <figure class="doc-model"> in die sectie (wel tabellen en opsommingen)
- Zet de naam van het model in de <figcaption> (bijv. "SWOT-analyse", "Risicomatrix (kans × impact)", "Kraljic-matrix", "PDCA-cyclus", "Krachtenveldanalyse")
- Veelgebruikte modellen voor aanbestedingen en het bijbehorende format:
  • SWOT, PESTEL/DESTEP, Five Forces (Porter), 7S (McKinsey), MoSCoW → modelraster (table class="model-grid")
  • Risicomatrix (kans × impact), Kraljic-matrix (toeleveringsrisico × inkoopimpact), krachtenveld/stakeholders (macht × belang), BCG → 2×2-matrix (table class="matrix-2x2")
  • Plan van aanpak/fasering, waardeketen (Porter), PDCA/Deming-cyclus → processchema (table class="process-flow")
  • Planning/mijlpalen → tijdlijn (table class="timeline")
  • Projectorganisatie/rolverdeling → organogram (table class="org-chart")

Gebruik exact deze HTML-formats (wrapper altijd <figure class="doc-model"> met een <figcaption>):

1) PROCESSCHEMA (process-flow) — voor fasering, stappen, werkwijze, waardeketen of cyclus met een logische volgorde (3–5 stappen, <td class="process-arrow">→</td> tussen elke stap):
<figure class="doc-model">
  <figcaption>Onze aanpak in vier fasen</figcaption>
  <table class="process-flow" role="presentation"><tbody><tr>
    <td class="process-step"><span class="step-no">1</span><span class="step-title">Fasetitel</span><span class="step-detail">Concrete activiteit en resultaat</span></td>
    <td class="process-arrow">→</td>
    <td class="process-step"><span class="step-no">2</span><span class="step-title">…</span><span class="step-detail">…</span></td>
  </tr></tbody></table>
</figure>

2) TIJDLIJN (timeline) — voor planning of mijlpalen met perioden/data (één <tr> per mijlpaal):
<figure class="doc-model">
  <figcaption>Planning op hoofdlijnen</figcaption>
  <table class="timeline" role="presentation"><tbody>
    <tr><td class="tl-when">Week 1–2</td><td class="tl-marker"><span class="tl-dot"></span></td><td class="tl-what"><span class="tl-title">Mijlpaal</span><span class="tl-detail">Wat er gebeurt en wordt opgeleverd</span></td></tr>
    <tr><td class="tl-when">Week 3–6</td><td class="tl-marker"><span class="tl-dot"></span></td><td class="tl-what"><span class="tl-title">…</span><span class="tl-detail">…</span></td></tr>
  </tbody></table>
</figure>

3) ORGANOGRAM (org-chart) — voor team-/rolstructuur (één hoofdrol boven, 2–4 rollen eronder):
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

4) KWADRANT / 2×2-MATRIX (matrix-2x2) — voor positionering langs twee assen (bijv. risico's kans × impact). Markeer het kritieke kwadrant met class="mx-cell mx-hot":
<figure class="doc-model">
  <figcaption>Risico's naar kans en impact</figcaption>
  <table class="matrix-2x2" role="presentation"><tbody>
    <tr><td class="mx-corner"></td><td class="mx-axis-x">Lage impact</td><td class="mx-axis-x">Hoge impact</td></tr>
    <tr><td class="mx-axis-y">Hoge kans</td><td class="mx-cell"><span class="mx-label">…</span>toelichting</td><td class="mx-cell mx-hot"><span class="mx-label">…</span>toelichting</td></tr>
    <tr><td class="mx-axis-y">Lage kans</td><td class="mx-cell"><span class="mx-label">…</span>toelichting</td><td class="mx-cell"><span class="mx-label">…</span>toelichting</td></tr>
  </tbody></table>
</figure>

5) MODELRASTER (model-grid) — voor modellen met losse elementen (SWOT, PESTEL/DESTEP, Five Forces, 7S, MoSCoW). Elk element is een <td> met <span class="grid-label"> + <span class="grid-body"> (de body mag een <ul> bevatten); zet 2 of 3 cellen per <tr>. Voor SWOT: class "tone-positive" op Sterktes/Kansen en "tone-negative" op Zwaktes/Bedreigingen:
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

OUTPUT
- Lever precies wat de deelopdracht in het laatste bericht vraagt — niets meer
- OPZET: uitsluitend één JSON-object, geen tekst eromheen
- SECTIE (ook slotsectie, opmaakherstel, inkorten): uitsluitend één <section class="doc-section">…</section>, beginnend met <h2> en <p class="section-subtitle">; geen <article>, geen <header>, geen andere secties, geen markdown, geen codeblok, geen uitleg
- Geen meta-sectie over schrijfkwaliteit, stijlbibliotheek of werkwijze van het schrijven`

// Ruime limieten: leidraden zijn vaak 50-150k tekens; afkappen betekent dat de
// agent eisen mist en de leidraad niet kan volgen. Claude verwerkt dit probleemloos.
const DOC_CHAR_LIMITS: Record<WriteDraftDocument['type'], number> = {
  tender: 150_000,
  company: 40_000,
  rules: 40_000,
  training: 30_000,
  lessons: 15_000,
  evidence: 30_000,
}

/** Streefdoel t.o.v. leidraad-maximum (secties schieten elk iets uit; 95% laat daar ruimte voor). */
const VOLUME_TARGET_RATIO = 0.95
const LEAD_WORDS = 60
const CLOSING_WORDS = 130
const MIN_SECTION_WORDS = 100
/** Absolute ondergrens per sectie wanneer een krappe paginalimiet geen 100 woorden toelaat. */
const ABSOLUTE_MIN_SECTION_WORDS = 60
/** Inkortrondes na het schrijven; elke ronde haalt de grootste secties omlaag. */
const TRIM_ROUNDS = 2
/** Zoveel secties tegelijk inkorten per ronde. */
const TRIM_BATCH = 5
/** Een sectie mag in één ronde hoogstens dit deel van zijn omvang verliezen. */
const MAX_TRIM_PER_ROUND = 0.4
/** Gelijktijdige sectie-aanroepen; hoger = sneller, maar zwaarder voor rate limits. */
const SECTION_CONCURRENCY = 5
/** Minimale tijd tussen twee voortgangsbeelden naar de client (het volledige document per event). */
const VIEW_THROTTLE_MS = 200

type ModelKind = 'process-flow' | 'timeline' | 'org-chart' | 'matrix-2x2' | 'model-grid' | 'none'
const MODEL_KINDS: ModelKind[] = ['process-flow', 'timeline', 'org-chart', 'matrix-2x2', 'model-grid', 'none']
const MODEL_FORMAT_LABELS: Record<Exclude<ModelKind, 'none'>, string> = {
  'process-flow': 'PROCESSCHEMA (table class="process-flow")',
  timeline: 'TIJDLIJN (table class="timeline")',
  'org-chart': 'ORGANOGRAM (table class="org-chart")',
  'matrix-2x2': 'KWADRANT / 2×2-MATRIX (table class="matrix-2x2")',
  'model-grid': 'MODELRASTER (table class="model-grid")',
}

type SectionPlan = {
  number: number
  title: string
  assessedOn: string
  brief: string
  topics: string[]
  words: number
  model: ModelKind
  modelTitle: string
  /** Nummer van de bestaande sectie (huidig concept) waar deze uit voortkomt. */
  sourceSection?: number
}

type DraftPlan = {
  title: string
  lead: string
  assessedOn: string
  sections: SectionPlan[]
  closing: boolean
}

type ExistingSection = {
  number: number
  title: string
  html: string
  text: string
}

type WordTarget = {
  /** Totaal zichtbare woorden voor het hele stuk. */
  total: number
  /** true bij een leidraadlimiet: secties mogen hun budget niet overschrijden. */
  hardMax: boolean
  /** Het bindende maximum in woorden — het strengste van woord-, karakter- en paginalimiet. */
  maxWords?: number
  maxChars?: number
  /** De limieten zoals de leidraad ze stelt, voor de instructie aan het model. */
  limits: VolumeLimits
  /** Woorden per A4 waarmee een paginalimiet is omgerekend (gemeten of standaard). */
  wordsPerPage: number
}

type Send = (payload: Record<string, unknown>) => void

/**
 * Bewaarde voortgang van één generatie. Een serverfunctie heeft een harde tijdslimiet;
 * een stuk van duizenden woorden past daar niet altijd in. Met dit checkpoint hervat een
 * volgende run met dezelfde opzet en schrijft alleen de secties die nog ontbreken —
 * geschreven tekst gaat nooit verloren.
 */
export type DraftCheckpoint = {
  plan?: DraftPlan
  /** Afgeronde sectie-HTML per positie in plan.sections; null = nog te schrijven. */
  sections?: (string | null)[]
  closing?: string | null
  /** true zodra opmaakherstel en inkorten zijn gedaan. */
  refined?: boolean
}

export type WriteRunOptions = {
  /** Voortgang van een eerdere, onderbroken run. */
  checkpoint?: DraftCheckpoint | null
  /** Bewaart de voortgang zodra er een onderdeel af is. */
  onCheckpoint?: (checkpoint: DraftCheckpoint) => void
  /** Tijdstip (Date.now()) waarop deze run moet stoppen; de rest volgt in een nieuwe run. */
  deadline?: number
}

/** Deze run raakte door zijn tijd heen; het meegegeven checkpoint bevat alles wat af is. */
export class WriteRunInterrupted extends Error {
  constructor(readonly checkpoint: DraftCheckpoint) {
    super('Het schrijven is onderbroken door de tijdslimiet en wordt hervat.')
    this.name = 'WriteRunInterrupted'
  }
}

function summarizeDocument(content: string, max: number): string {
  const clean = content.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max).trim()}…` : clean
}

function escapeHtml(text: string): string {
  return (text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function countVisibleWords(html: string): number {
  const plain = stripTags(html)
  return plain ? plain.split(' ').length : 0
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

function minimumWordTarget(request: WriteDraftRequest): number {
  const mandatory = request.analysis?.contentRequirements?.filter((item) => item.mandatory).length ?? 0
  return Math.max(2500, mandatory * 350)
}

/**
 * Woordbudget voor het hele stuk. Woord-, karakter- én paginalimiet worden alle drie naar
 * woorden omgerekend; het strengste wint. Een paginalimiet rekent met de opmaakdichtheid
 * die de werkplek aan een echt concept heeft gemeten (request.layout) — zonder meting
 * geldt de geijkte standaard. Zonder enige limiet mag het stuk ruim zijn.
 */
function wordTarget(request: WriteDraftRequest): WordTarget {
  const limits = limitsForAnalysis(request.analysis)
  const wordsPerPage = clampWordsPerPage(request.layout?.wordsPerPage)
  const maxWords = maxWordsFor(limits, wordsPerPage)

  if (maxWords) {
    return {
      total: Math.round(maxWords * VOLUME_TARGET_RATIO),
      hardMax: true,
      maxWords,
      maxChars: limits.maxChars,
      limits,
      wordsPerPage,
    }
  }
  return { total: minimumWordTarget(request), hardMax: false, limits, wordsPerPage }
}

function buildVolumeInstruction(request: WriteDraftRequest): string {
  const target = wordTarget(request)
  if (!target.hardMax) {
    return `VOLUME — GEEN MAXIMUM IN LEIDRAAD (schrijf zeer uitgebreid)
- Er is geen maximum aantal woorden of karakters gevonden in de leidraad
- Totaalbudget voor dit stuk: circa ${target.total.toLocaleString('nl-NL')} woorden — liever te uitgebreid dan te kort
- Per verplicht onderwerp: meerdere alinea's met concrete werkwijze, voorbeelden, KPI's, rollen, planning en bewijs
- Werk alle beoordelingscriteria volledig uit; geen samenvattingen of staccato bullets als enige inhoud
- Geen herhaling of opvulling; wel volledige, diepgaande uitwerking`
  }

  const limits = target.limits
  const lines = [
    'VOLUME — HARDE LIMIET + GEBRUIK HET BUDGET',
    'Tel alleen zichtbare tekst in het artikel (paragrafen, koppen, lijsten, tabelcellen). Geen HTML-tags, geen metadata.',
    'Schrijf richting het maximum uit de leidraad — een te kort stuk laat punten liggen; een te lang stuk is diskwalificerend.',
  ]
  if (limits.maxWords) {
    lines.push(`- Maximum woorden: ${limits.maxWords.toLocaleString('nl-NL')}`)
  }
  if (limits.maxChars) {
    lines.push(`- Maximum karakters: ${limits.maxChars.toLocaleString('nl-NL')}`)
  }
  if (limits.maxPages) {
    lines.push(
      `- Maximum pagina's: ${limits.maxPages} A4 — in de opmaak van dit stuk past daar circa ${wordsForPages(limits.maxPages, target.wordsPerPage).toLocaleString('nl-NL')} woorden zichtbare tekst in (de kop met titel en metadata kost al een deel van de eerste pagina)`,
    )
  }
  lines.push(
    `- Totaalbudget voor dit stuk (alle secties samen, incl. lead en slot): circa ${target.total.toLocaleString('nl-NL')} woorden; het budget per sectie staat in de deelopdracht en is een hard maximum`,
    '- Prioriteit: eerst alle verplichte onderwerpen volledig, daarna detail tot dicht bij het budget',
    '- Te lang? inkorten door herhaling te schrappen, niet door verplichte eisen weg te laten',
  )
  return lines.join('\n')
}

function formatVolumeSummary(request: WriteDraftRequest): string {
  const target = wordTarget(request)
  if (!request.analysis || !target.hardMax) {
    return `geen maximum — schrijf zeer uitgebreid (budget circa ${target.total.toLocaleString('nl-NL')} woorden)`
  }

  const limits = formatLimits(target.limits)
  return [limits, `budget circa ${target.total.toLocaleString('nl-NL')} woorden`].filter(Boolean).join(', ')
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

  return evaluationCriteria.map((criterion, index) => `${index + 1}. ${criterion}`).join('\n')
}

function formatDocumentRequirements(analysis: TenderAnalysis): string {
  const documentRequirements = analysis.documentRequirements ?? []
  if (!documentRequirements.length) return '- geen'

  return documentRequirements
    .map((doc) => `- ${doc.name} (${doc.mandatory ? 'verplicht' : 'optioneel'}) — ${doc.source}`)
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

function buildStructureInstruction(request: WriteDraftRequest): string {
  const analysis = request.analysis
  if (!analysis) {
    return `STRUCTUUR
- Leid koppen en secties af uit de aanbestedingsbronnen
- Geen vaste EMVI-template; alleen wat de opdrachtgever vraagt

${buildVolumeInstruction(request)}`
  }

  return `STRUCTUUR (verplicht volgen)
- Spiegel de indeling van de leidraad: zoek in de aanbestedingsbronnen op welke vragen/(sub)criteria het ingediende stuk wordt beoordeeld en gebruik exact die koppen, nummering en volgorde
- De onderstaande gedetecteerde punten zijn een CHECKLIST (mogelijk onvolledig of ruizig) — de leidraadtekst zelf is altijd leidend

${buildVolumeInstruction(request)}

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
${formatRequirementRegister(analysis, request.targetDocument)}

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

function buildAnalysisBlock(request: WriteDraftRequest): string {
  const analysis = request.analysis
  if (!analysis) return 'Geen leidraadanalyse beschikbaar — leid structuur af uit aanbestedingsbronnen.'

  const gaps =
    analysis.gaps.length > 0
      ? `\nAandachtspunten / gaten:\n${analysis.gaps.map((gap) => `- ${gap}`).join('\n')}`
      : ''

  return `Leidraadanalyse:
- Samenvatting: ${analysis.summary}
- Leidraad gevonden: ${analysis.leidraadFound ? `ja (${analysis.leidraadSource ?? 'bron'})` : 'nee'}
- Volume: ${formatVolumeSummary(request)}
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
 * stadia brons/zilver/goud en over alle deelopdrachten heen, zodat de
 * cache-marker aan het einde ervan (zie aiClient) maximaal wordt herlezen.
 */
function buildSourcesPrompt(request: WriteDraftRequest): string {
  return `=== BRONNEN ===

Aanbestedingsstukken (leidraad — leidend voor structuur en eisen):
${docsByType(request, 'tender') || '- geen'}

Bewijsbibliotheek — vastgelegde referenties, cases en cijfers (de harde feitenbasis; citeer met <span data-bewijs="…">):
${docsByType(request, 'evidence') || '- geen'}

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

function openComments(request: WriteDraftRequest) {
  return request.comments.filter((comment) => !comment.resolved)
}

/**
 * Taakcontext als tweede user-bericht: stabiel over alle deelopdrachten van
 * één generatie (opzet, secties, slot, herstel) en daarom eveneens gecachet.
 * Alles wat per deelopdracht wisselt staat in het derde bericht.
 */
function buildContextPrompt(request: WriteDraftRequest): string {
  const comments = openComments(request)
    .map((comment) => `- Fragment: ${comment.fragment}\n  Opmerking: ${comment.note}`)
    .join('\n')

  const currentDraftBlock = request.currentDraft?.trim()
    ? `HUIDIG CONCEPT (uitgangspunt — structuur behouden tenzij leidraad of reviewopmerkingen anders vereisen):
${request.currentDraft.slice(0, 120_000)}`
    : ''

  return `=== TAAKCONTEXT ===

Fase: ${stageLabels[request.stage]} — ${stageInstructions[request.stage]}

Project:
- Titel: ${request.project.title}
- Opdrachtgever: ${request.project.buyer}
- Deadline: ${request.project.deadline}
- TenderNed: ${request.project.tendernedId}

${buildDocumentBrief(request)}

${buildAnalysisBlock(request)}

${buildStructureInstruction(request)}

De bronnen staan in het vorige bericht.

Open reviewopmerkingen:
${comments || '- geen'}

${buildImprovementsBlock(request)}${currentDraftBlock}

De deelopdracht volgt in het volgende bericht.`
}

function baseMessages(request: WriteDraftRequest): AiMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildSourcesPrompt(request) },
    { role: 'user', content: buildContextPrompt(request) },
  ]
}

function withTask(base: AiMessage[], task: string): AiMessage[] {
  return [...base, { role: 'user', content: task }]
}

function chatOptions(request: WriteDraftRequest, overrides: Partial<AiCompletionOptions>): AiCompletionOptions {
  return {
    maxTokens: 12_000,
    timeoutMs: 180_000,
    useThinking: false,
    effort: request.stage === 'goud' ? 'xhigh' : 'high',
    // System prompt, bronnenblok en taakcontext zijn identiek over alle
    // deelopdrachten van één generatie én over de stadia heen — prompt caching
    // scheelt daar ~90% input. 1h-TTL omdat er tussen stadia doorgaans een
    // menselijke reviewronde zit.
    cachePrompt: true,
    cacheTtl: '1h',
    cacheUserMessages: 2,
    label: 'schrijfagent',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Huidig concept (zilver/goud): bestaande secties en opmerkingen per sectie
// ---------------------------------------------------------------------------

function parseExistingSections(html: string | undefined): ExistingSection[] {
  if (!html?.trim()) return []
  const blocks = html.match(/<section\b[\s\S]*?<\/section>/gi) ?? []
  return blocks.map((block, index) => {
    const heading = stripTags(block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? '')
    const parsedNumber = Number.parseInt(heading.match(/^\s*(\d+)/)?.[1] ?? '', 10)
    return {
      number: Number.isFinite(parsedNumber) ? parsedNumber : index + 1,
      title: heading.replace(/^\s*\d+(\.\d+)*[.)]?\s*/, '').trim(),
      html: block,
      text: stripTags(block),
    }
  })
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^\s*\d+(\.\d+)*[.)]?\s*/, '')
    .replace(/[^a-z0-9à-ÿ]+/g, ' ')
    .trim()
}

function existingFor(section: SectionPlan, existing: ExistingSection[]): ExistingSection | undefined {
  if (!existing.length) return undefined
  if (section.sourceSection) {
    const byNumber = existing.find((item) => item.number === section.sourceSection)
    if (byNumber) return byNumber
  }
  const wanted = normalizeTitle(section.title)
  if (!wanted) return undefined
  return existing.find((item) => {
    const have = normalizeTitle(item.title)
    return have === wanted || (have.length > 12 && wanted.includes(have)) || (wanted.length > 12 && have.includes(wanted))
  })
}

function commentKey(fragment: string): string {
  return fragment.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 60)
}

/** Opmerkingen waarvan het fragment in deze sectie voorkomt; overige opmerkingen gelden als 'algemeen'. */
function splitComments(request: WriteDraftRequest, existing: ExistingSection[]) {
  const comments = openComments(request)
  const matched = new Map<number, typeof comments>()
  const general: typeof comments = []
  for (const comment of comments) {
    const key = commentKey(comment.fragment)
    const owner = key ? existing.find((item) => item.text.toLowerCase().includes(key)) : undefined
    if (owner) {
      matched.set(owner.number, [...(matched.get(owner.number) ?? []), comment])
    } else {
      general.push(comment)
    }
  }
  return { matched, general }
}

// ---------------------------------------------------------------------------
// Stap 1 — opzet
// ---------------------------------------------------------------------------

function buildPlanPrompt(request: WriteDraftRequest, target: WordTarget, existing: ExistingSection[]): string {
  const docTitle = request.targetDocument?.title ?? 'het inschrijfstuk'
  const closingAllowed = target.total >= 700
  const sectionBudget = Math.max(MIN_SECTION_WORDS, target.total - LEAD_WORDS - (closingAllowed ? CLOSING_WORDS : 0))
  // Bij een krappe limiet past niet elke gewenste indeling: meer secties dan het budget
  // toelaat levert onvermijdelijk een te lang stuk, dus wordt het aantal begrensd.
  const maxSections = target.hardMax ? Math.max(2, Math.floor(sectionBudget / MIN_SECTION_WORDS)) : 16
  const lines = [
    `OPZET VAN HET STUK — deelopdracht 1 (nog géén lopende tekst)`,
    `Maak de opzet voor "${docTitle}": welke secties, wat elke sectie beantwoordt, het woordbudget per sectie en welk managementmodel (indien passend) de inhoud van die sectie versterkt. Elke sectie wordt daarna in een aparte aanroep op basis van jouw opzet uitgeschreven — de opzet moet dus volledig en zelfdragend zijn.`,
    '',
    'Regels:',
    '- Secties spiegelen de indeling die de leidraad voor dit stuk voorschrijft (zelfde benaming, nummering, volgorde). De deelvragen/onderwerpen onder "DIT STUK" krijgen elk een eigen sectie, in die volgorde; voeg alleen secties toe die de leidraad vraagt',
    `- Woordbudget: de secties samen circa ${sectionBudget.toLocaleString('nl-NL')} woorden zichtbare tekst (lead en slotsectie vallen daarbuiten). Verdeel naar de weging van de (sub)criteria; elke sectie minimaal ${MIN_SECTION_WORDS} woorden${target.hardMax ? '; het totaal is een hard maximum' : ''}`,
    '- brief per sectie: de kernzin van ons antwoord, wat concreet wordt uitgewerkt (wie/wat/wanneer/hoe vaak) en welk bewijs uit de bedrijfsbronnen erin hoort — specifiek genoeg om de sectie los te kunnen schrijven zonder overlap met andere secties',
    '- model per sectie: het inhoudelijk best passende erkende managementmodel ("process-flow", "timeline", "org-chart", "matrix-2x2" of "model-grid") met modelTitle (bijv. "PDCA-cyclus", "Risicomatrix (kans × impact)", "SWOT-analyse"), of "none" als een model niets toevoegt. Wissel van modeltype tussen opeenvolgende secties; gebruik modellen verspreid over het hele stuk, niet alleen vooraan',
    `- closing: ${closingAllowed ? 'true — slotsectie "Onze toezeggingen in het kort" met toezeggingentabel' : 'false — het budget is te krap voor een slotsectie'}`,
  ]

  if (target.hardMax) {
    lines.push(
      `- Maximaal ${maxSections} secties: het budget is hard (${formatLimits(target.limits) || `${target.maxWords} woorden`}). Voeg deelvragen die de leidraad samen stelt in één sectie samen in plaats van elke deelvraag een eigen sectie te geven`,
    )
  }

  if (existing.length) {
    lines.push(
      '',
      'Bestaande secties in het huidige concept (neem de structuur over tenzij de leidraad, de reviewopmerkingen of de verbeterronde anders vereisen; verwijs per sectie met sourceSection naar het nummer van de bestaande sectie waar deze uit voortkomt):',
      ...existing.map((item) => `${item.number}. ${item.title || '(zonder titel)'} — circa ${countVisibleWords(item.html)} woorden`),
    )
  }

  lines.push(
    '',
    'OUTPUT: uitsluitend dit JSON-object (geen tekst eromheen):',
    `{
  "title": "titel van dit stuk (zoals de leidraad het noemt)",
  "lead": "2–4 zinnen: de kern van ons antwoord op de vraag van dit stuk — direct het antwoord, geen herhaling van de vraag, geen feiten die niet in de bronnen staan",
  "assessedOn": "de criteria/subcriteria van dit stuk, kort",
  "sections": [
    {
      "number": 1,
      "title": "informatieve titel (benaming uit de leidraad)",
      "assessedOn": "criterium/subcriterium + deelvraag waarop deze sectie wordt beoordeeld",
      "brief": "kernzin + wat concreet wordt uitgewerkt + welk bewijs",
      "topics": ["deelonderwerp 1", "deelonderwerp 2"],
      "words": 450,
      "model": "process-flow",
      "modelTitle": "Onze aanpak in vier fasen",
      "sourceSection": 1
    }
  ],
  "closing": ${closingAllowed}
}`,
  )
  return lines.join('\n')
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asString).filter(Boolean) : []
}

function stripNumbering(title: string): string {
  return title.replace(/^\s*\d+(\.\d+)*[.)]?\s*/, '').trim()
}

function parsePlan(content: string, request: WriteDraftRequest, target: WordTarget): DraftPlan {
  const fenced = content.match(/```json?\s*([\s\S]*?)```/i)?.[1]?.trim()
  let jsonText = fenced ?? content.trim()
  if (!jsonText.startsWith('{')) {
    const start = jsonText.indexOf('{')
    const end = jsonText.lastIndexOf('}')
    if (start >= 0 && end > start) jsonText = jsonText.slice(start, end + 1)
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonText) as Record<string, unknown>
  } catch {
    throw new Error('De opzet van het stuk kon niet worden gelezen. Probeer opnieuw te genereren.')
  }

  const rawSections = Array.isArray(parsed.sections) ? (parsed.sections as Array<Record<string, unknown>>) : []
  const sections: SectionPlan[] = rawSections
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const model = asString(item.model) as ModelKind
      const sourceSection = Number(item.sourceSection)
      return {
        number: index + 1,
        title: stripNumbering(asString(item.title)) || `Onderdeel ${index + 1}`,
        assessedOn: asString(item.assessedOn),
        brief: asString(item.brief),
        topics: asStringList(item.topics),
        words: Math.max(MIN_SECTION_WORDS, Math.round(Number(item.words) || 0)),
        model: MODEL_KINDS.includes(model) ? model : 'none',
        modelTitle: asString(item.modelTitle),
        sourceSection: Number.isFinite(sourceSection) && sourceSection > 0 ? sourceSection : undefined,
      }
    })
    .slice(0, 16)

  if (!sections.length) {
    throw new Error('De opzet van het stuk bevat geen secties. Probeer opnieuw te genereren.')
  }

  const closing = typeof parsed.closing === 'boolean' ? parsed.closing : target.total >= 700
  const body = Math.max(1, target.total - LEAD_WORDS - (closing ? CLOSING_WORDS : 0))
  // Bij een hard maximum telt het budget, niet de ondergrens per sectie: plant het model meer
  // secties dan erin passen, dan worden ze allemaal korter in plaats van dat het stuk uitloopt.
  const floor = target.hardMax
    ? Math.max(ABSOLUTE_MIN_SECTION_WORDS, Math.min(MIN_SECTION_WORDS, Math.floor(body / sections.length)))
    : MIN_SECTION_WORDS
  const budget = target.hardMax ? body : Math.max(sections.length * MIN_SECTION_WORDS, body)
  const planned = sections.reduce((sum, section) => sum + section.words, 0)
  const factor = budget / planned
  // Bij een harde limiet altijd terugschalen naar het budget; zonder limiet
  // alleen corrigeren als de verdeling ver van het doel ligt.
  if ((target.hardMax && factor < 1) || Math.abs(factor - 1) > 0.15) {
    sections.forEach((section) => {
      section.words = Math.max(floor, Math.round(section.words * factor))
    })
  }

  const fallbackTitle = request.targetDocument?.title ?? request.project.title
  return {
    title: stripNumbering(asString(parsed.title)) || fallbackTitle,
    lead: asString(parsed.lead),
    assessedOn: asString(parsed.assessedOn) || request.targetDocument?.criteria.join('; ') || '',
    sections,
    closing,
  }
}

async function createPlan(
  ai: AiRuntimeConfig,
  request: WriteDraftRequest,
  base: AiMessage[],
  target: WordTarget,
  existing: ExistingSection[],
): Promise<DraftPlan> {
  const content = await completeChat(
    ai,
    withTask(base, buildPlanPrompt(request, target, existing)),
    chatOptions(request, {
      maxTokens: 6_000,
      timeoutMs: 150_000,
      jsonMode: ai.provider !== 'anthropic',
      label: 'schrijfagent-opzet',
    }),
  )
  return parsePlan(content, request, target)
}

// ---------------------------------------------------------------------------
// Header (deterministisch uit de opzet)
// ---------------------------------------------------------------------------

function renderHeader(request: WriteDraftRequest, plan: DraftPlan): string {
  const project = request.project
  const kicker = `${plan.title} · ${stageLabels[request.stage]} versie`
  const assessed = plan.assessedOn
    ? `\n      <div><dt>Beoordeeld op</dt><dd>${escapeHtml(plan.assessedOn)}</dd></div>`
    : ''
  const lead = plan.lead ? `\n    <p class="lead">${escapeHtml(plan.lead)}</p>` : ''
  return `<header class="doc-header">
    <p class="kicker">${escapeHtml(kicker)}</p>
    <p class="doc-subtitle">Inschrijving ${escapeHtml(project.title)} — ${escapeHtml(project.buyer)}</p>
    <h1>${escapeHtml(plan.title)}</h1>
    <dl class="doc-meta">
      <div><dt>Opdrachtgever</dt><dd>${escapeHtml(project.buyer)}</dd></div>${assessed}
      <div><dt>Deadline</dt><dd>${escapeHtml(project.deadline)}</dd></div>
      <div><dt>TenderNed</dt><dd>${escapeHtml(project.tendernedId)}</dd></div>
    </dl>${lead}
  </header>`
}

// ---------------------------------------------------------------------------
// Stap 2 — secties
// ---------------------------------------------------------------------------

type SectionStats = { words: number; lists: number; tables: number; figures: number }

function sectionStats(html: string): SectionStats {
  return {
    words: countVisibleWords(html),
    lists: (html.match(/<(ul|ol)\b/gi) ?? []).length,
    // Gewone datatabellen; de tabellen binnen managementmodellen tellen als figuur.
    tables: (html.match(/<table\b(?![^>]*class="(?:process-flow|timeline|org-chart|org-reports|matrix-2x2|model-grid)")/gi) ?? []).length,
    figures: (html.match(/<figure\b/gi) ?? []).length,
  }
}

/** Verplichte opmaak per sectie, afhankelijk van de omvang; de controle achteraf toetst hetzelfde. */
function formattingRequirement(words: number, model: ModelKind): string {
  if (words >= 250) {
    return `minimaal één opsomming (<ul>/<ol>) én minimaal één ${
      model === 'none' ? 'tabel (<div class="table-wrap"><table> met <caption>)' : 'tabel of het toegewezen managementmodel'
    }; alinea's blijven de drager van de inhoud`
  }
  if (words >= 120) return 'minimaal één opsomming (<ul>/<ol>) of tabel'
  return 'compact: alinea\'s, eventueel één korte opsomming'
}

function missingFormatting(stats: SectionStats): string[] {
  const missing: string[] = []
  if (stats.words >= 250) {
    if (stats.lists < 1) missing.push('een opsomming (<ul>/<ol>)')
    if (stats.tables + stats.figures < 1) missing.push('een tabel (<div class="table-wrap"><table> met <caption>) of het toegewezen managementmodel')
  } else if (stats.words >= 120 && stats.lists + stats.tables + stats.figures < 1) {
    missing.push('een opsomming of tabel')
  }
  return missing
}

function modelInstruction(section: SectionPlan): string {
  if (section.model === 'none') {
    return 'geen managementmodel in deze sectie (andere secties hebben er een) — dus geen <figure class="doc-model">; wel tabellen en opsommingen'
  }
  return `precies één <figure class="doc-model"> met "${section.modelTitle || section.model}" in het format ${MODEL_FORMAT_LABELS[section.model]} — exact het HTML-format uit de systeeminstructie, ingevuld met de concrete situatie van deze opdracht; figcaption = naam van het model`
}

function formatComments(comments: WriteDraftRequest['comments']): string {
  return comments.map((comment) => `  - Fragment: "${comment.fragment.slice(0, 300)}"\n    Opmerking: ${comment.note}`).join('\n')
}

function buildSectionPrompt(
  plan: DraftPlan,
  section: SectionPlan,
  target: WordTarget,
  existing: ExistingSection | undefined,
  sectionComments: WriteDraftRequest['comments'],
  generalComments: WriteDraftRequest['comments'],
): string {
  const total = plan.sections.length + (plan.closing ? 1 : 0)
  const low = Math.round(section.words * 0.9)
  const high = section.words
  const charsHint = target.maxChars ? ` (circa ${Math.round(high * CHARS_PER_WORD).toLocaleString('nl-NL')} karakters)` : ''
  const lines = [
    `SECTIE ${section.number} VAN ${total} — "${section.title}" (deelopdracht; de andere secties worden apart geschreven)`,
    'Schrijf uitsluitend deze sectie, volledig uitgewerkt en af.',
    `- Beoordeeld op: ${section.assessedOn || '(zie criteria in de taakcontext)'}`,
    `- Kern/opdracht: ${section.brief || '(werk het onderwerp uit volgens de leidraad)'}`,
  ]
  if (section.topics.length) {
    lines.push('- Onderwerpen (alle behandelen, in deze volgorde):', ...section.topics.map((topic) => `  • ${topic}`))
  }
  lines.push(
    `- Omvang: ${low}–${high} woorden zichtbare tekst${charsHint}${target.hardMax ? ` — ${high} is een HARD maximum (leidraadlimiet)` : ' — schrijf tot dicht bij het budget'}`,
    `- Opmaak (verplicht in deze sectie): ${formattingRequirement(section.words, section.model)}`,
    `- Managementmodel: ${modelInstruction(section)}`,
    '- Ritme: kernzin met ons antwoord → hoe wij dat concreet doen (wie, wat, wanneer, hoe vaak) → bewijs → wat het de opdrachtgever oplevert',
    '- Bewijs: citeer bij voorkeur een bouwsteen uit de bewijsbibliotheek en markeer die met <span data-bewijs="…">; zonder bouwsteen of bron géén cijfer, referentie of resultaat',
  )

  const others = plan.sections.filter((item) => item.number !== section.number)
  if (others.length) {
    lines.push(
      '- Overige secties van dit stuk (worden apart geschreven — hier NIET uitwerken; hooguit één verwijzende zin):',
      ...others.map((item) => `  ${item.number}. ${item.title}${item.brief ? ` — ${item.brief.slice(0, 140)}` : ''}`),
    )
  }

  if (existing) {
    lines.push(
      '',
      'BESTAANDE TEKST VAN DEZE SECTIE (uitgangspunt — verbeter, verwerk de reviewopmerkingen hieronder en de verbeterronde uit de taakcontext, breid uit tot het budget; behoud wat goed is):',
      existing.html.slice(0, 30_000),
    )
  }
  if (sectionComments.length) {
    lines.push('', 'Reviewopmerkingen over deze sectie (elk verwerken):', formatComments(sectionComments))
  }
  if (generalComments.length) {
    lines.push('', 'Algemene reviewopmerkingen (alleen verwerken voor zover ze op deze sectie slaan):', formatComments(generalComments))
  }

  lines.push(
    '',
    `OUTPUT: uitsluitend <section class="doc-section">…</section>, beginnend met <h2>${section.number}. ${section.title}</h2> en <p class="section-subtitle">Beoordeeld op: …</p>. Geen <article>, geen <header>, geen andere secties, geen markdown, geen tekst buiten de sectie.`,
  )
  return lines.join('\n')
}

function buildClosingPrompt(plan: DraftPlan, sectionsHtml: string[]): string {
  const number = plan.sections.length + 1
  const text = sectionsHtml.map(stripTags).join('\n\n')
  return `SLOTSECTIE ${number} VAN ${number} — "Onze toezeggingen in het kort"
Schrijf de slotsectie van dit stuk: één korte inleidende alinea en daarna één tabel (<div class="table-wrap"><table><caption>Onze toezeggingen</caption> met kolommen Toezegging | Meetpunt | Eigenaar) met de concrete, toetsbare toezeggingen uit de secties hieronder — één rij per toezegging, 5–10 rijen. Geen nieuwe feiten of toezeggingen die niet in de secties staan. Maximaal ${CLOSING_WORDS} woorden zichtbare tekst.

Tekst van de geschreven secties (alleen als bron voor de toezeggingen):
${text.slice(0, 16_000)}

OUTPUT: uitsluitend <section class="doc-section">…</section>, beginnend met <h2>${number}. Onze toezeggingen in het kort</h2> en <p class="section-subtitle">Samenvatting van de toetsbare toezeggingen uit dit stuk</p>. Geen andere secties, geen markdown.`
}

function buildRepairPrompt(section: SectionPlan, html: string, missing: string[]): string {
  return `OPMAAKHERSTEL — sectie ${section.number} "${section.title}"
De onderstaande sectie is inhoudelijk klaar maar mist de verplichte opmaak: ${missing.join(' en ')}.
Herschrijf de sectie met dezelfde inhoud, feiten en toezeggingen (geen nieuwe feiten), dezelfde omvang (±10% woorden) en voeg toe: ${missing.join(' en ')}. Zet gestructureerde gegevens uit de alinea's (stappen, rollen, KPI's, maatregelen, eis-vs-invulling) in die opsomming/tabel; de alinea's blijven de drager van de inhoud.
Managementmodel: ${modelInstruction(section)}
Behoud <h2> en <p class="section-subtitle"> letterlijk, en laat elke <span data-bewijs="…"> om het bijbehorende feit staan.

${html}

OUTPUT: uitsluitend de bijgewerkte <section class="doc-section">…</section>.`
}

function buildTrimPrompt(section: SectionPlan, html: string, targetWords: number): string {
  return `INKORTEN — sectie ${section.number} "${section.title}"
De onderstaande sectie telt circa ${countVisibleWords(html)} woorden zichtbare tekst; het budget voor deze sectie is ${targetWords} woorden (hard maximum door de leidraadlimiet). Kort in tot maximaal ${targetWords} woorden door herhaling, omhaal en bijzinnen te schrappen — laat geen verplichte eis, feit of toezegging weg en behoud ALLE opmaak (opsommingen, tabellen, managementmodel), <h2>, <p class="section-subtitle"> en de <span data-bewijs="…">-markeringen bij de feiten die blijven staan.

${html}

OUTPUT: uitsluitend de ingekorte <section class="doc-section">…</section>.`
}

function extractSection(content: string): string | null {
  const fenced = content.match(/```html?\s*([\s\S]*?)```/i)?.[1]
  const text = (fenced ?? content).trim()
  const match = text.match(/<section\b[\s\S]*<\/section>/i)
  return match?.[0]?.trim() ?? null
}

function isSectionComplete(content: string): boolean {
  return /<\/section>\s*(```)?\s*$/i.test(content.trim())
}

/** Vaste klasse op de root en deterministische nummering in de <h2>. */
function normalizeSection(html: string, number: number): string {
  let result = html.replace(/^<section\b[^>]*>/i, '<section class="doc-section">')
  result = result.replace(/<h2([^>]*)>\s*([\s\S]*?)<\/h2>/i, (_match, attrs: string, inner: string) => {
    const clean = inner.replace(/^\s*(\d+(\.\d+)*[.)]?\s*)+/, '').trim()
    return `<h2${attrs}>${number}. ${clean}</h2>`
  })
  return result
}

async function streamSection(
  ai: AiRuntimeConfig,
  request: WriteDraftRequest,
  messages: AiMessage[],
  label: string,
  onChunk: (accumulated: string) => void,
): Promise<string> {
  const options = chatOptions(request, { label })
  let accumulated = ''
  for await (const chunk of streamChat(ai, messages, options)) {
    accumulated += chunk
    onChunk(accumulated)
  }

  // Afgekapt (max_tokens of netwerk): één keer laten voortzetten.
  if (!isSectionComplete(accumulated) && accumulated.trim().startsWith('<')) {
    const continuation: AiMessage[] = [
      ...messages,
      { role: 'assistant', content: accumulated },
      {
        role: 'user',
        content:
          'Het vorige antwoord stopte voortijdig. Ga EXACT verder waar de tekst stopte — herhaal geen bestaande alinea\'s. Sluit alle open HTML-tags af en eindig met </section>. Behoud dezelfde opmaakkwaliteit (opsommingen, tabellen, model).',
      },
    ]
    for await (const chunk of streamChat(ai, continuation, options)) {
      accumulated += chunk
      onChunk(accumulated)
    }
  }

  const section = extractSection(accumulated)
  if (section) return section
  if (accumulated.trim().startsWith('<section')) return `${accumulated.trim()}\n</section>`
  throw new Error(`De sectie kon niet worden uitgelezen (${label}). Probeer opnieuw te genereren.`)
}

async function withRetry<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task()
  } catch (error) {
    // Eén herkansing: transiënte API-fouten (overbelasting, time-out) zijn bij
    // parallelle aanroepen niet ongewoon; een definitieve fout komt opnieuw terug.
    const message = error instanceof Error ? error.message : ''
    if (/\(4(0[0134]|2[29])\)/.test(message) && !/\(429\)/.test(message)) throw error
    return task()
  }
}

async function runPool<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      await worker(items[index], index)
    }
  })
  await Promise.all(runners)
}

// ---------------------------------------------------------------------------
// Orkestratie
// ---------------------------------------------------------------------------

function placeholderSection(section: SectionPlan): string {
  return `<section class="doc-section">
    <h2>${section.number}. ${escapeHtml(section.title)}</h2>
    <p class="section-subtitle">Beoordeeld op: ${escapeHtml(section.assessedOn || '…')}</p>
    <p class="generation-placeholder">Sectie wordt geschreven…</p>
  </section>`
}

function assembleArticle(header: string, sections: string[], closing: string | null): string {
  return `<article class="proposal-doc">\n${header}\n\n${sections.join('\n\n')}${closing ? `\n\n${closing}` : ''}\n</article>`
}

export async function writeDraftInParts(
  ai: AiRuntimeConfig,
  request: WriteDraftRequest,
  send: Send,
  options: WriteRunOptions = {},
): Promise<string> {
  const base = baseMessages(request)
  const target = wordTarget(request)
  const existing = parseExistingSections(request.currentDraft)
  const { matched, general } = splitComments(request, existing)
  const saved = options.checkpoint ?? {}
  const outOfTime = () => options.deadline != null && Date.now() >= options.deadline

  if (!saved.plan) send({ type: 'status', message: 'Opzet van het stuk maken…' })
  const plan: DraftPlan = saved.plan ?? (await withRetry(() => createPlan(ai, request, base, target, existing)))
  const header = renderHeader(request, plan)

  // Voortgangsbeeld: het volledige document met per sectie de tekst tot nu toe.
  const finals: string[] = plan.sections.map((_, index) => saved.sections?.[index] ?? '')
  const views: string[] = plan.sections.map((section, index) => finals[index] || placeholderSection(section))
  // closingHtml is de afgeronde slotsectie (gaat het checkpoint in), closingView de tekst
  // tot nu toe (gaat naar het scherm); een onderbroken slotsectie mag niet half bewaard blijven.
  let closingHtml: string | null = saved.closing ?? null
  let closingView: string | null = closingHtml
  let refined = saved.refined ?? false

  const snapshot = (): DraftCheckpoint => ({
    plan,
    sections: finals.map((html) => html || null),
    closing: closingHtml,
    refined,
  })
  const checkpoint = () => options.onCheckpoint?.(snapshot())
  // De opzet kost een volledige AI-aanroep; die meteen bewaren zodat een hervatting hem hergebruikt.
  if (!saved.plan) checkpoint()

  let lastView = 0
  const pushView = (force = false) => {
    const now = Date.now()
    if (!force && now - lastView < VIEW_THROTTLE_MS) return
    lastView = now
    send({ type: 'delta', text: '', accumulated: assembleArticle(header, views, closingView) })
  }
  pushView(true)

  const total = plan.sections.length
  const todo = plan.sections
    .map((section, index) => ({ section, index }))
    .filter(({ index }) => !finals[index])
  let done = total - todo.length
  send({ type: 'status', message: `Secties schrijven (${done}/${total} gereed)…` })

  // Bij een onderbroken run wordt geen nieuwe sectie meer gestart; wat al loopt maakt
  // zichzelf af en komt in het checkpoint, zodat de hervatting daar niet opnieuw begint.
  let interrupted = false
  await runPool(todo, SECTION_CONCURRENCY, async ({ section, index }) => {
    if (interrupted) return
    if (outOfTime()) {
      interrupted = true
      return
    }
    const source = existingFor(section, existing)
    const prompt = buildSectionPrompt(plan, section, target, source, source ? (matched.get(source.number) ?? []) : [], general)
    const html = await withRetry(() =>
      streamSection(ai, request, withTask(base, prompt), `schrijfagent-sectie-${section.number}`, (partial) => {
        views[index] = partial
        pushView()
      }),
    )
    finals[index] = normalizeSection(html, section.number)
    views[index] = finals[index]
    done += 1
    send({ type: 'status', message: `Secties schrijven (${done}/${total} gereed)…` })
    pushView(true)
    checkpoint()
  })
  if (interrupted) throw new WriteRunInterrupted(snapshot())

  if (plan.closing && closingHtml === null) {
    if (outOfTime()) throw new WriteRunInterrupted(snapshot())
    send({ type: 'status', message: 'Slotsectie met toezeggingen schrijven…' })
    const html = await withRetry(() =>
      streamSection(ai, request, withTask(base, buildClosingPrompt(plan, finals)), 'schrijfagent-slot', (partial) => {
        closingView = partial
        pushView()
      }),
    )
    closingHtml = normalizeSection(html, plan.sections.length + 1)
    closingView = closingHtml
    pushView(true)
    checkpoint()
  }

  // Deterministische controle: een sectie zonder de verplichte opmaak wordt
  // gericht hersteld; bij een leidraadlimiet wordt een te lange sectie ingekort.
  if (!refined) {
    if (outOfTime()) throw new WriteRunInterrupted(snapshot())

    const repairs = plan.sections
      .map((section, index) => ({ section, index, missing: missingFormatting(sectionStats(finals[index])) }))
      .filter((item) => item.missing.length)
    if (repairs.length) {
      send({ type: 'status', message: `Opmaak herstellen in ${repairs.length} sectie${repairs.length === 1 ? '' : 's'}…` })
      await runPool(repairs, SECTION_CONCURRENCY, async ({ section, index, missing }) => {
        const repaired = await reworkSection(ai, request, base, section, buildRepairPrompt(section, finals[index], missing), 'schrijfagent-opmaak')
        if (repaired && missingFormatting(sectionStats(repaired)).length < missing.length) {
          finals[index] = repaired
          views[index] = repaired
          pushView(true)
        }
      })
    }

    // Inkorten tot onder het leidraadmaximum. Eén ronde is niet genoeg: secties schieten
    // elk een beetje uit, en het maximum is een vormeis waarop de inschrijving kan
    // afvallen. Daarom herhaald, waarbij de overschrijding naar rato wordt weggehaald
    // bij de secties die de meeste ruimte innemen.
    if (target.hardMax && target.maxWords) {
      const maxWords = target.maxWords
      for (let round = 0; round < TRIM_ROUNDS; round += 1) {
        const totalWords = countVisibleWords(assembleArticle(header, finals, closingHtml))
        if (totalWords <= maxWords) break

        const candidates = plan.sections
          .map((section, index) => ({ section, index, words: countVisibleWords(finals[index]) }))
          .filter((item) => item.words > ABSOLUTE_MIN_SECTION_WORDS)
          .sort((a, b) => b.words - a.words)
          .slice(0, TRIM_BATCH)
        if (!candidates.length) break

        const batchWords = candidates.reduce((sum, item) => sum + item.words, 0)
        // De geselecteerde secties dragen samen de hele overschrijding, maar nooit meer
        // dan MAX_TRIM_PER_ROUND: verder inkorten kost inhoud in plaats van omhaal.
        const keep = Math.max(1 - MAX_TRIM_PER_ROUND, (batchWords - (totalWords - maxWords)) / batchWords)

        send({
          type: 'status',
          message: `Inkorten tot de leidraadlimiet (${totalWords.toLocaleString('nl-NL')} > ${maxWords.toLocaleString('nl-NL')} woorden)…`,
        })
        await runPool(candidates, SECTION_CONCURRENCY, async ({ section, index, words }) => {
          const goal = Math.max(ABSOLUTE_MIN_SECTION_WORDS, Math.round(words * keep))
          if (goal >= words) return
          const trimmed = await reworkSection(ai, request, base, section, buildTrimPrompt(section, finals[index], goal), 'schrijfagent-inkorten')
          if (trimmed && countVisibleWords(trimmed) < countVisibleWords(finals[index])) {
            finals[index] = trimmed
            views[index] = trimmed
            pushView(true)
          }
        })
      }
    }

    refined = true
    checkpoint()
  }

  return assembleArticle(header, finals, closingHtml)
}

/**
 * Bouw het document uit een checkpoint, ook als nog niet alle secties geschreven zijn
 * (nog niet geschreven secties blijven een placeholder). Gebruikt voor het voortgangsbeeld
 * van een lopende opdracht en als noodrem wanneer hervatten niet meer lukt: liever een
 * onvolledig stuk teruggeven dan het geschreven werk weggooien.
 */
export function assembleFromCheckpoint(request: WriteDraftRequest, checkpoint: DraftCheckpoint): string | null {
  const plan = checkpoint.plan
  if (!plan) return null
  const sections = plan.sections.map((section, index) => checkpoint.sections?.[index] || placeholderSection(section))
  return assembleArticle(renderHeader(request, plan), sections, checkpoint.closing ?? null)
}

/** Zijn alle secties uit de opzet geschreven? */
export function checkpointComplete(checkpoint: DraftCheckpoint): boolean {
  const plan = checkpoint.plan
  if (!plan) return false
  return plan.sections.every((_, index) => Boolean(checkpoint.sections?.[index]))
}

/** Gerichte bewerking van één sectie (herstel/inkorten); null bij een onbruikbaar antwoord — dan blijft het origineel staan. */
async function reworkSection(
  ai: AiRuntimeConfig,
  request: WriteDraftRequest,
  base: AiMessage[],
  section: SectionPlan,
  prompt: string,
  label: string,
): Promise<string | null> {
  try {
    const content = await completeChat(ai, withTask(base, prompt), chatOptions(request, { label }))
    const html = extractSection(content)
    return html ? normalizeSection(html, section.number) : null
  } catch (error) {
    console.warn(`[schrijfagent] ${label} voor sectie ${section.number} mislukt:`, error instanceof Error ? error.message : error)
    return null
  }
}

export function handleWriteDraftStreamRequest(request: WriteDraftRequest, ai: AiRuntimeConfig): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      const send: Send = (payload) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      try {
        const html = await writeDraftInParts(ai, request, send)
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
  const html = await writeDraftInParts(ai, request, () => undefined)
  return { html, model: ai.model, provider: ai.provider }
}

/** Spits de analyse toe op het te schrijven stuk (idempotent als de client dat al deed). */
function scopeRequest(request: WriteDraftRequest): WriteDraftRequest {
  const doc: RequestedDocument | undefined = request.targetDocument
  if (!doc || !request.analysis) return request
  const sole = !(request.siblingDocuments ?? []).some((item) => item.kind === 'schrijfstuk' && item.title !== doc.title)
  return { ...request, analysis: scopeAnalysisToDocument(request.analysis, doc, { soleDocument: sole }) }
}

/** Valideer en normaliseer een binnengekomen opdracht; gooit bij onbruikbare invoer. */
export function prepareWriteDraftRequest(body: unknown): WriteDraftRequest {
  const request = scopeRequest((body ?? {}) as WriteDraftRequest)
  if (!request.project?.title?.trim()) {
    throw new Error('Projectgegevens ontbreken.')
  }
  if (!['brons', 'zilver', 'goud'].includes(request.stage)) {
    throw new Error('Ongeldige fase.')
  }
  request.comments = Array.isArray(request.comments) ? request.comments : []
  request.documents = Array.isArray(request.documents) ? request.documents : []
  return request
}

export async function handleWriteDraftRequest(body: unknown): Promise<Response> {
  try {
    const request = prepareWriteDraftRequest(body)
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
