import type { ExtractRequirementsRequest, ExtractRequirementsResponse } from '../../src/types/extractRequirements'
import type { DocumentRole } from '../../src/types/tenderAnalysis'
import { completeChat, resolveAiFromRequest } from './aiClient'
import { detectDocumentRole } from './analyzeDocument'
import { normalizeRequirements } from '../../src/lib/requirements'

// Eisen-extractie: een aparte, gefocuste pass op het goedkope 'light'-tier. Het stuk wordt
// volledig gelezen (geen truncatie van eisen), maar de opdracht is smal — één lijst
// atomaire eisen — zodat een klein model dit betrouwbaar doet en het resultaat niet
// concurreert om outputbudget met het brede document-extract.
const DOC_CHAR_LIMIT = 200_000
const MAX_REQUIREMENTS = 80

function trimSource(text: string, max = DOC_CHAR_LIMIT): string {
  // eslint-disable-next-line no-control-regex -- strip null bytes uit ge-extraheerde PDF/Office-tekst
  const cleaned = text.replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').trim()
  if (cleaned.length <= max) return cleaned
  return `${cleaned.slice(0, max)}…`
}

const ROLE_GUIDANCE: Record<DocumentRole, string> = {
  leidraad: `Dit is de LEIDRAAD / het beschrijvend document: hier staan de meeste eisen. Wees volledig en loop elk hoofdstuk
langs (procedure, uitsluitingsgronden, geschiktheidseisen, gunningscriteria, in te dienen stukken, vormvereisten, indiening, voorwaarden).`,
  'nota-van-inlichtingen': `Dit is een NOTA VAN INLICHTINGEN. Neem ALLEEN eisen op die hierin nieuw zijn, gewijzigd of verduidelijkt.
Formuleer de eis zoals die NA deze nota geldt en zet in reference het vraagnummer.`,
  bijlage: `Dit is een BIJLAGE (format, overeenkomst, programma van eisen, prijsblad). Neem alleen eisen op die de inschrijver
via de inschrijving moet nakomen: invullen, ondertekenen, akkoord verklaren, bijvoegen, in een bepaalde vorm aanleveren.
Geen uitvoeringseisen aan de dienstverlening.`,
  overig: `Bepaal zelf de rol van dit stuk en extraheer uitsluitend eisen aan de inschrijving of de inschrijver.`,
}

function buildSystemPrompt(role: DocumentRole): string {
  return `Je bent een nauwkeurige eisen-analist voor Nederlandse aanbestedingen (Aanbestedingswet 2012, EMVI/BPKV).
Je leest ÉÉN aanbestedingsstuk en stelt het EISENREGISTER op: alle eisen waaraan de INSCHRIJVING en de INSCHRIJVER
moeten voldoen om geldig te zijn en punten te scoren.

${ROLE_GUIDANCE[role]}

WAT WEL (eisen aan de inschrijving of de inschrijver):
- geschiktheid: referenties/kerncompetenties (aantal, periode, omvang), omzet, verzekeringen, certificaten en keurmerken (ISO, VCA …), financiële en technische bekwaamheid
- uitsluiting: UEA, Gedragsverklaring aanbesteden, KvK-uittreksel, verklaringen (met geldigheidstermijn)
- document: bewijsstukken, formulieren, verklaringen, prijsblad, akkoordverklaringen en bijlagen die ingediend moeten worden
- inhoud: verplichte onderwerpen/vragen die een schrijfstuk inhoudelijk moet beantwoorden, verplichte opbouw of kopjes
- vorm: taal, anonimisering, bestandsformaat, bestandsnaam, aantal exemplaren
- opmaak: lettertype, lettergrootte, marges, papierformaat
- indiening: deadline, kanaal (TenderNed/Negometrix/Mercell), rechtsgeldige ondertekening, gestanddoeningstermijn, voorwaarden voor combinaties/onderaanneming
- proces: vragenronde/Nota van Inlichtingen, presentatie of interview, verificatie, geen voorbehouden
- contract: voorwaarden waarmee de inschrijver akkoord moet gaan (ARVODI/UAV, concept-overeenkomst, geen afwijkingen)

WAT NIET:
- eisen aan de UITVOERING van de opdracht (programma van eisen, SLA's, technische specificaties) — tenzij de inschrijver er in de
  inschrijving expliciet op moet antwoorden of mee moet instemmen; neem dan één eis op zoals "Akkoord verklaren met het programma van eisen (bijlage 3)"
- woord-, karakter- en paginalimieten en de lijst van op te stellen schrijfstukken zelf: die legt een andere stap al vast
- context, toelichting of planning van de aanbesteding zonder verplichting voor de inschrijver

REGELS
- Eén eis per item, atomair en toetsbaar; splits opsommingen ("minimaal 2 referenties" en "elke referentie ≥ € 250.000" zijn twee eisen).
- Formuleer als concrete eis in het Nederlands, dicht bij de brontekst; neem getallen, termijnen en bedragen letterlijk over.
- mandatory = true bij verplicht/dient/moet/knock-out/op straffe van uitsluiting; false bij wens/kan/bij voorkeur.
- checkBy = "agent" als de eis aan de TEKST van een schrijfstuk te toetsen is (inhoud, opbouw, taal, anonimiteit, opmaak van het stuk);
  "gebruiker" als er iets buiten de tekst voor nodig is (bewijsstuk, certificaat, ondertekening, upload, akkoordverklaring, prijs, formulier).
- question: bij checkBy "gebruiker" één concrete vraag aan het bidteam die de eis afdekt, bv. "Beschikt u over een geldig
  ISO 9001-certificaat? Upload het als bijlage 4." Bij "agent" leeg laten.
- documentTitle: de naam van het in te dienen stuk waarop de eis specifiek slaat, zoals de bron het noemt; leeg als de eis voor de hele inschrijving geldt.
- reference: paragraaf-, artikel- of bijlagenummer waar de eis staat.
- Verzin NIETS; alleen wat in dit document staat. Maximaal ${MAX_REQUIREMENTS} eisen; bij meer: de verplichte eerst.

Antwoord UITSLUITEND met geldig JSON in exact deze vorm:
{
  "requirements": [
    { "category": "geschiktheid|uitsluiting|document|inhoud|vorm|opmaak|indiening|proces|contract|overig", "text": "", "mandatory": true, "checkBy": "agent|gebruiker", "question": "", "documentTitle": "", "reference": "" }
  ]
}`
}

function parseRequirements(content: string, source: string) {
  const jsonText = content.match(/```json?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? content.trim()
  let parsed: { requirements?: unknown }
  try {
    parsed = JSON.parse(jsonText) as { requirements?: unknown }
  } catch {
    return null
  }
  return normalizeRequirements(parsed.requirements, source).slice(0, MAX_REQUIREMENTS)
}

export async function handleExtractRequirementsRequest(request: ExtractRequirementsRequest): Promise<Response> {
  const doc = request.document
  if (!doc?.content?.trim()) {
    return Response.json({ error: 'Document bevat geen tekst om eisen uit te halen.' }, { status: 400 })
  }

  const source = doc.name?.trim() || 'document'
  const role = request.role ?? detectDocumentRole(source)

  let ai: ReturnType<typeof resolveAiFromRequest>
  try {
    ai = resolveAiFromRequest(request.ai, 'REQUIREMENTS_MODEL', 'light')
  } catch {
    return Response.json({ error: 'Geen AI-configuratie beschikbaar voor eisen-extractie.' }, { status: 400 })
  }

  const userContent = `Documentnaam: ${source}
${request.buyerName ? `Opdrachtgever: ${request.buyerName}\n` : ''}Vermoedelijke rol: ${role}

Documentinhoud:
${trimSource(doc.content)}

Lever het eisenregister als JSON volgens het opgegeven schema.`

  try {
    const content = await completeChat(
      ai,
      [
        { role: 'system', content: buildSystemPrompt(role) },
        { role: 'user', content: userContent },
      ],
      { jsonMode: ai.provider !== 'anthropic', maxTokens: 8_000, timeoutMs: 110_000, useThinking: false, label: 'eisen-extractie' },
    )

    const requirements = parseRequirements(content, source)
    if (!requirements) {
      return Response.json({ error: 'Eisen-extractie leverde geen geldige JSON op.' }, { status: 502 })
    }

    return Response.json({
      requirements,
      provider: ai.provider,
      model: ai.model,
    } satisfies ExtractRequirementsResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Eisen-extractie mislukt.'
    return Response.json({ error: message }, { status: 500 })
  }
}
