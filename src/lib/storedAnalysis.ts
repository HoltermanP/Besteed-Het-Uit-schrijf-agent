import type { TenderAnalysis } from '../types/tenderAnalysis'
import { deriveRequirementsFromAnalysis } from './requirements'

/**
 * Oudere, opgeslagen analyses missen mogelijk nieuwere array-velden (zoals
 * submissionRequirements of requestedDocuments). Zonder deze normalisatie crasht een
 * `.length`/`.map` in de render. Analyses van vóór het eisenregister krijgen een
 * afgeleid register, zodat de checklists direct werken zonder heranalyse.
 */
export function normalizeStoredAnalysis(analysis: TenderAnalysis | null): TenderAnalysis | null {
  if (!analysis) return analysis
  const normalized: TenderAnalysis = {
    ...analysis,
    wordLimits: analysis.wordLimits ?? [],
    contentRequirements: analysis.contentRequirements ?? [],
    documentRequirements: analysis.documentRequirements ?? [],
    requestedDocuments: analysis.requestedDocuments ?? [],
    submissionRequirements: analysis.submissionRequirements ?? [],
    evaluationCriteria: analysis.evaluationCriteria ?? [],
    gaps: analysis.gaps ?? [],
  }
  return { ...normalized, requirements: analysis.requirements ?? deriveRequirementsFromAnalysis(normalized) }
}
