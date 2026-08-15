import type { DistillDocumentRequest } from '../../src/types/distillDocument'
import { resolveAiFromRequest, type AiRuntimeConfig } from './aiClient'
import { analyzeSourceProfile, isEmptyProfile } from './analyzeSource'
import { distillRulesFromContent } from './distillRules'

/**
 * Comprimeert een niet-leidraaddocument (bedrijfsinfo, schrijfregels, stijl) tot
 * een compacte promptversie. De leidraad zelf wordt bewust nooit gecomprimeerd:
 * daar telt elke eis letterlijk. De compressie gebeurt eenmalig per upload; de
 * client cachet het resultaat zolang de brontekst niet wijzigt.
 */
async function distillByType(
  ai: AiRuntimeConfig,
  doc: { name: string; type: string; content: string },
): Promise<string> {
  if (doc.type === 'rules') {
    return distillRulesFromContent(ai, { name: doc.name, content: doc.content, category: 'richtlijnen' })
  }

  if (doc.type === 'training') {
    return distillRulesFromContent(ai, { name: doc.name, content: doc.content, category: 'schrijfstijl' })
  }

  if (doc.type === 'company') {
    const profile = await analyzeSourceProfile(ai, { name: doc.name, content: doc.content })
    if (isEmptyProfile(profile)) {
      throw new Error('Het document leverde geen bruikbaar distillaat op.')
    }
    return [
      profile.kennis ? `Kennis & feiten:\n${profile.kennis}` : '',
      profile.ervaringen ? `Ervaringen & cases:\n${profile.ervaringen}` : '',
      profile.achtergrond ? `Achtergrond & context:\n${profile.achtergrond}` : '',
      profile.schrijfstijl ? `Schrijfstijl:\n${profile.schrijfstijl}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  throw new Error(`Documenttype "${doc.type}" wordt niet gecomprimeerd.`)
}

export async function handleDistillDocumentRequest(request: DistillDocumentRequest): Promise<Response> {
  const doc = request.document
  if (!doc?.content?.trim()) {
    return Response.json({ error: 'Document bevat geen tekst om te comprimeren.' }, { status: 400 })
  }

  let ai: AiRuntimeConfig
  try {
    ai = resolveAiFromRequest(request.ai, 'INTENT_MODEL', 'analysis')
  } catch {
    return Response.json({ error: 'Geen AI-configuratie beschikbaar voor documentcompressie.' }, { status: 400 })
  }

  try {
    const content = await distillByType(ai, {
      name: doc.name?.trim() || 'document',
      type: doc.type,
      content: doc.content,
    })
    return Response.json({
      content: `[gedistilleerd uit ${doc.name?.trim() || 'document'}]\n${content.trim()}`,
      sourceChars: doc.content.length,
      provider: ai.provider,
      model: ai.model,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Comprimeren mislukt.'
    return Response.json({ error: message }, { status: 502 })
  }
}
