import { getActiveCompanyId } from './companies'

/*
 * Waar hoort dit AI-werk bij?
 *
 * Om te kunnen tonen wat de AI per project en per stuk heeft gekost, moet de server bij
 * elke aanroep weten waar hij mee bezig is. In de werkplek is dat altijd precies één ding:
 * het geopende project en het geopende stuk. Die stand houden we hier bij en sturen we als
 * kopregels mee met elk verzoek aan een AI-route.
 *
 * Waarom kopregels en geen veld in de body: dan hoeft geen enkel verzoektype te veranderen
 * en blijven de bestaande API-contracten intact. De server leest ze in usageContext.ts.
 */

export type UsageScope = {
  projectId?: string
  projectTitle?: string
  draftId?: string
  draftTitle?: string
}

let activeScope: UsageScope = {}

/** De werkplek meldt hier welk project en stuk open staan. */
export function setUsageScope(scope: UsageScope) {
  activeScope = scope
}

/** Werk buiten een project (aanbestedingen scoren, bedrijfsverrijking) hoort nergens bij. */
export function clearUsageScope() {
  activeScope = {}
}

export function getUsageScope(): UsageScope {
  return activeScope
}

/** Kopregels mogen alleen ASCII bevatten; titels kunnen alles bevatten. */
function encode(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return encodeURIComponent(trimmed.slice(0, 200))
}

/**
 * Kopregels met de herkomst van deze aanroep. Een `override` gaat vóór de actieve stand;
 * dat is nodig voor werk dat buiten de geopende werkplek om start, zoals een
 * schrijfopdracht die op de achtergrond wordt hervat.
 */
export function usageHeaders(override: UsageScope = {}): Record<string, string> {
  const scope = { ...activeScope, ...override }
  const headers: Record<string, string> = { 'x-bedrijf-id': encodeURIComponent(getActiveCompanyId()) }

  const project = encode(scope.projectId)
  if (project) headers['x-project-id'] = project
  const projectTitle = encode(scope.projectTitle)
  if (projectTitle) headers['x-project-titel'] = projectTitle
  const draft = encode(scope.draftId)
  if (draft) headers['x-stuk-id'] = draft
  const draftTitle = encode(scope.draftTitle)
  if (draftTitle) headers['x-stuk-titel'] = draftTitle

  return headers
}
