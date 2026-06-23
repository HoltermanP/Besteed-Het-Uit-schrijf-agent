import type { TenderAnalysis } from '../types/tenderAnalysis'
import type { SourceDocument } from '../types/tenderAnalysis'

type Stage = 'brons' | 'zilver' | 'goud'

type TenderProject = {
  title: string
  tendernedId: string
  buyer: string
  deadline: string
}

const stageLabels: Record<Stage, string> = {
  brons: 'Brons',
  zilver: 'Zilver',
  goud: 'Goud',
}

function summarize(text: string, max = 220) {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max).trim()}...` : clean
}

function escapeHtml(text: string) {
  return (text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderAnalysisSection(analysis: TenderAnalysis) {
  const wordLimitRows = analysis.wordLimits
    .map((limit) => {
      const value =
        limit.min && limit.max
          ? `${limit.min}–${limit.max} ${limit.unit}`
          : limit.max
            ? `max. ${limit.max} ${limit.unit}`
            : limit.min
              ? `min. ${limit.min} ${limit.unit}`
              : limit.unit
      return `<tr><td>${escapeHtml(limit.section ?? limit.label)}</td><td>${escapeHtml(value)}</td><td>${escapeHtml(limit.source)}</td></tr>`
    })
    .join('')

  const contentRows = analysis.contentRequirements
    .slice(0, 8)
    .map(
      (req) =>
        `<tr><td>${escapeHtml(req.topic)}</td><td>${escapeHtml(summarize(req.detail, 100))}</td><td>${req.mandatory ? 'Verplicht' : 'Gewenst'}</td></tr>`,
    )
    .join('')

  const docRows = analysis.documentRequirements
    .map(
      (req) =>
        `<tr><td>${escapeHtml(req.name)}</td><td>${req.mandatory ? 'Verplicht' : 'Optioneel'}</td><td>${escapeHtml(req.source)}</td></tr>`,
    )
    .join('')

  const criteriaList = analysis.evaluationCriteria
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')

  const styleList = [
    ...analysis.styleProfile.companySignals.map((s) => `<li><strong>Inschrijver:</strong> ${escapeHtml(s)}</li>`),
    ...analysis.styleProfile.buyerSignals.map((s) => `<li><strong>Opdrachtgever:</strong> ${escapeHtml(s)}</li>`),
  ].join('')

  const intentBlock = analysis.underlyingIntent
    ? `<div class="intent-brief internal-only">
    <h3>Vraag achter de vraag (intern — niet indienen)</h3>
    <p><strong>Expliciet gevraagd:</strong> ${escapeHtml(analysis.underlyingIntent.explicitQuestion)}</p>
    <p>${escapeHtml(analysis.underlyingIntent.questionBehindQuestion)}</p>
    <p><strong>Onderliggende behoefte:</strong> ${escapeHtml(analysis.underlyingIntent.underlyingNeed)}</p>
    <pre class="intent-team-brief">${escapeHtml(analysis.underlyingIntent.teamBrief)}</pre>
  </div>`
    : ''

  return `<section class="doc-section analysis-section">
    <h2>0. Leidraadanalyse en schrijfstijl</h2>
    <p class="section-subtitle">${escapeHtml(analysis.summary)}</p>
    <p>${escapeHtml(analysis.styleProfile.blendedGuidance)}</p>

    ${
      wordLimitRows
        ? `<div class="table-wrap"><table><caption>Formele eisen uit leidraad</caption><thead><tr><th>Onderdeel</th><th>Limit</th><th>Bron</th></tr></thead><tbody>${wordLimitRows}</tbody></table></div>`
        : ''
    }

    ${
      contentRows
        ? `<div class="table-wrap"><table><caption>Gevraagde inhoud en onderwerpen</caption><thead><tr><th>Onderwerp</th><th>Eis</th><th>Status</th></tr></thead><tbody>${contentRows}</tbody></table></div>`
        : ''
    }

    ${
      docRows
        ? `<div class="table-wrap"><table><caption>Verwachte documenten en bijlagen</caption><thead><tr><th>Document</th><th>Type</th><th>Bron</th></tr></thead><tbody>${docRows}</tbody></table></div>`
        : ''
    }

    ${criteriaList ? `<h3>Beoordelingscriteria</h3><ul>${criteriaList}</ul>` : ''}
    ${styleList ? `<h3>Gecombineerde schrijfstijl</h3><ul>${styleList}</ul>` : ''}
    ${intentBlock}
  </section>`
}

export function buildHtmlDraft(
  stage: Stage,
  project: TenderProject,
  documents: SourceDocument[],
  comments: Array<{ fragment: string; note: string; resolved: boolean }>,
  analysis?: TenderAnalysis | null,
) {
  const tenderDocs = documents.filter((doc) => doc.type === 'tender')
  const companyDocs = documents.filter((doc) => doc.type === 'company')
  const ruleDocs = documents.filter((doc) => doc.type === 'rules')
  const trainingDocs = documents.filter((doc) => doc.type === 'training')
  const openComments = comments.filter((comment) => !comment.resolved)
  const tenderText = tenderDocs.map((doc) => doc.content).join(' ')
  const companyText = companyDocs.map((doc) => doc.content).join(' ')
  const rulesText = ruleDocs.map((doc) => doc.content).join(' ')
  const trainingText = trainingDocs.map((doc) => doc.content).join(' ')
  const startClaim = tenderText.toLowerCase().includes('vier weken')
    ? 'binnen vier weken na gunning'
    : 'direct na gunning'

  const wordHint = analysis?.targetWordCount
    ? ` (streef naar max. ${analysis.targetWordCount} woorden volgens leidraad)`
    : ''

  const styleLead = analysis
    ? summarize(analysis.styleProfile.blendedGuidance, 280)
    : 'Wij bieden een beheerst, aantoonbaar en beoordelingsgericht plan waarmee de opdrachtgever zekerheid krijgt over kwaliteit, planning en resultaat.'

  const criteriaHint =
    analysis?.evaluationCriteria.length
      ? ` Beoordeling volgt: ${analysis.evaluationCriteria.slice(0, 3).join(', ')}.`
      : ''

  const analysisBlock = analysis ? renderAnalysisSection(analysis) : ''

  const sectionOffset = analysis ? 1 : 0

  return `<article class="proposal-doc">
  <header class="doc-header">
    <p class="kicker">${stageLabels[stage]} versie</p>
    <p class="doc-subtitle">Inschrijving voor ${escapeHtml(project.buyer)}</p>
    <h1>${escapeHtml(project.title)}</h1>
    <dl class="doc-meta">
      <div><dt>Opdrachtgever</dt><dd>${escapeHtml(project.buyer)}</dd></div>
      <div><dt>Deadline</dt><dd>${escapeHtml(project.deadline)}</dd></div>
      <div><dt>TenderNed</dt><dd>${escapeHtml(project.tendernedId)}</dd></div>
    </dl>
    <p class="lead">${escapeHtml(styleLead)}${escapeHtml(criteriaHint)}</p>
  </header>

  ${analysisBlock}

  <section class="doc-section">
    <h2>${sectionOffset + 1}. Begrip van de opdracht</h2>
    <p class="section-subtitle">Aansluiting op leidraad, beoordelingscriteria en opdrachtcontext${wordHint}</p>
    <p>${
      analysis?.underlyingIntent
        ? escapeHtml(
            `${analysis.underlyingIntent.questionBehindQuestion} Onze aanpak vertaalt de expliciete eisen (${analysis.underlyingIntent.explicitQuestion}) naar concrete werkafspraken, meetpunten en beslismomenten die aansluiten op wat ${project.buyer} werkelijk zoekt: ${summarize(analysis.underlyingIntent.underlyingNeed, 180)}.`,
          )
        : escapeHtml(
            'De aanbesteding vraagt om een partner die niet alleen voldoet aan de eisen uit de leidraad, maar zichtbaar stuurt op kwaliteit, continuiteit, duurzaamheid en implementatierisico’s. Onze aanpak vertaalt deze beoordelingscriteria naar concrete werkafspraken, meetpunten en beslismomenten.',
          )
    }</p>
    <blockquote>${escapeHtml(summarize(tenderText || 'Nog geen aanbestedingsstukken toegevoegd.'))}</blockquote>
  </section>

  <section class="doc-section">
    <h2>${sectionOffset + 2}. Onderscheidende aanpak</h2>
    <p class="section-subtitle">Hoe wij scoren op subcriteria en onderscheidend zijn</p>
    <p>Onze organisatie werkt met een vaste tenderregie: analyse van de leidraad, bewijslast, concept, review en finale aanscherping. Daarmee ontstaat een inschrijving die expliciet scoort op de gevraagde subcriteria en tegelijk herkenbaar blijft in onze bedrijfsstijl.</p>
    <figure class="doc-model">
      <figcaption>Onze tenderregie in vier fasen</figcaption>
      <table class="process-flow" role="presentation"><tbody><tr>
        <td class="process-step"><span class="step-no">1</span><span class="step-title">Analyse</span><span class="step-detail">Leidraad, eisen en beoordelingscriteria in kaart</span></td>
        <td class="process-arrow">→</td>
        <td class="process-step"><span class="step-no">2</span><span class="step-title">Bewijslast</span><span class="step-detail">Feiten en referenties verzamelen per claim</span></td>
        <td class="process-arrow">→</td>
        <td class="process-step"><span class="step-no">3</span><span class="step-title">Concept & review</span><span class="step-detail">Schrijven, toetsen aan eisen en aanscherpen</span></td>
        <td class="process-arrow">→</td>
        <td class="process-step"><span class="step-no">4</span><span class="step-title">Finale</span><span class="step-detail">Exportklaar, binnen vorm- en volume-eisen</span></td>
      </tr></tbody></table>
    </figure>
    <ul>
      <li><strong>Plan van aanpak:</strong> heldere fasering, eigenaarschap per resultaat en zichtbare kwaliteitsborging.</li>
      <li><strong>Team:</strong> senior expertise, vaste reviewers en expliciete escalatielijnen.</li>
      <li><strong>Continuiteit:</strong> documentatie, overdraagbare formats en structurele voortgangscontrole.</li>
      <li><strong>Duurzaamheid:</strong> compacte processen, minder herstelwerk en digitale samenwerking.</li>
    </ul>
  </section>

  <section class="doc-section">
    <h2>${sectionOffset + 3}. Implementatie en risicobeheersing</h2>
    <p class="section-subtitle">Planning, risico-eigenaren en beheersmaatregelen</p>
    <p>Na gunning starten wij ${startClaim} met een intake, broncontrole en planning. Elk risico krijgt een eigenaar, een preventieve maatregel en een herstelroute. De opdrachtgever ziet daardoor vroeg waar keuzes nodig zijn en behoudt grip op kwaliteit en planning.</p>
    <div class="table-wrap">
      <table>
        <caption>Risicomatrix met bewijsvoering</caption>
        <thead><tr><th>Risico</th><th>Maatregel</th><th>Bewijs</th></tr></thead>
        <tbody>
          <tr><td>Onvolledige broninformatie</td><td>Bronmatrix en gap-analyse bij start</td><td>${tenderDocs.length} aanbestedingsbron(nen) incl. leidraad</td></tr>
          <tr><td>Afwijking leidraad-eisen</td><td>Checklist op woorden, onderwerpen en bijlagen</td><td>${analysis?.documentRequirements.length ?? 0} document-eis(en)</td></tr>
          <tr><td>Generieke tekst</td><td>Blend bedrijfs- en opdrachtgeverstijl per paragraaf</td><td>${ruleDocs.length} rule-set(s)</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section class="doc-section">
    <h2>${sectionOffset + 4}. Bewijslast en organisatiekracht</h2>
    <p class="section-subtitle">Onderbouwing van claims en teamcapaciteit (inschrijver)</p>
    <p>${escapeHtml(summarize(companyText || 'Voeg bedrijfsinformatie toe om claims sterker en specifieker te maken.', 340))}</p>
  </section>

  <section class="doc-section">
    <h2>${sectionOffset + 5}. Schrijfkwaliteit</h2>
    <p class="section-subtitle">Combinatie van bedrijfsstijl, opdrachtgevertaal en schrijfregels</p>
    <p>De tekst volgt de gecombineerde schrijfwijze: ${escapeHtml(summarize(rulesText || 'geen extra rules geladen', 120))} ${analysis ? `Leidraadstijl: ${escapeHtml(summarize(analysis.styleProfile.buyerSignals.join('. '), 100))}. ` : ''}${trainingText ? `Training: ${escapeHtml(summarize(trainingText, 120))}` : ''}</p>
  </section>

  ${
    openComments.length
      ? `<section class="doc-section"><h2>${sectionOffset + 6}. Verwerkte reviewrichting</h2><p class="section-subtitle">Menselijke feedback verwerkt in het concept</p><ul>${openComments
          .map(
            (comment) =>
              `<li class="review-block"><strong>${escapeHtml(summarize(comment.fragment, 70))}</strong> — ${escapeHtml(summarize(comment.note, 150))}</li>`,
          )
          .join('')}</ul></section>`
      : ''
  }
</article>`
}
