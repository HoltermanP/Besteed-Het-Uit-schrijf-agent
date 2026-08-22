import { after } from 'next/server'
import { prepareWriteDraftRequest } from '@api-lib/writeDraft'
import { resolveAiFromRequest, type AiRuntimeConfig } from '@api-lib/aiClient'
import { createWriteJob, isJobStale, readWriteJob, runWriteJob, toJobSnapshot } from '@api-lib/writeJobs'
import type { WriteDraftJobStart, WriteDraftRequest } from '@/types/writeDraft'
import { usageContextFromRequest } from '@api-lib/usageContext'

// De opdracht draait ná het antwoord door (after), tot aan deze limiet; daarna hervat een
// volgende beurt de opdracht vanaf het checkpoint.
export const maxDuration = 300

type JobBody = (WriteDraftRequest & Partial<WriteDraftJobStart>) & {
  /** Interne vervolgbeurt van een opdracht die nog niet af is. */
  resume?: string
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status })
}

/**
 * POST zonder `resume`: start een nieuwe schrijfopdracht. Het antwoord komt direct — het
 * schrijven draait daarna verder op de server, ook als de browser wegvalt.
 * POST met `resume`: vervolgbeurt voor een opdracht die de tijdslimiet raakte.
 */
export async function POST(request: Request) {
  let body: JobBody
  try {
    body = (await request.json()) as JobBody
  } catch {
    return errorResponse('Onleesbare opdracht.', 400)
  }

  if (body.resume) {
    const job = await readWriteJob(body.resume)
    if (!job) return errorResponse('Onbekende opdracht.', 404)
    if (job.status !== 'lopend') return Response.json(toJobSnapshot(job))
    after(() => runWriteJob(job.id))
    return Response.json({ resumed: true, id: job.id })
  }

  try {
    const draft = prepareWriteDraftRequest(body)
    // Ontbrekende AI-configuratie hier al melden: de werkplek herkent die fout en valt
    // terug op een lokaal concept. Achteraf zou dat pas bij de eerste statuscheck blijken.
    resolveAiFromRequest(draft.ai as AiRuntimeConfig | undefined, 'WRITER_MODEL')

    // De opdracht draait straks buiten dit verzoek door; de herkomst voor de
    // verbruiksadministratie moet daarom nú mee de opdracht in.
    const scope = usageContextFromRequest(request)

    const job = await createWriteJob({
      request: draft,
      companyId: scope.companyId,
      projectId: body.projectId?.trim() || scope.projectId || 'onbekend',
      projectTitle: scope.projectTitle ?? draft.project.title ?? null,
      draftId: body.draftId?.trim() || draft.targetDocument?.id || 'onbekend',
      draftTitle: body.draftTitle?.trim() || draft.targetDocument?.title || draft.project.title,
      kind: body.kind ?? 'schrijven',
      origin: new URL(request.url).origin,
    })

    after(() => runWriteJob(job.id))
    return Response.json(toJobSnapshot(job))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Opdracht kon niet worden gestart.'
    return errorResponse(message, 400)
  }
}

/**
 * Status van een opdracht. `since` is de laatst gelezen versie; alleen nieuwe tekst gaat
 * mee terug. Een opdracht zonder teken van leven (serverbeurt afgebroken, hervatting niet
 * aangekomen) wordt hier alsnog opgepakt.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const id = params.get('id')?.trim()
  if (!id) return errorResponse('Geef de opdracht mee (id).', 400)

  const job = await readWriteJob(id)
  if (!job) return errorResponse('Onbekende opdracht.', 404)

  if (job.status === 'lopend' && isJobStale(job)) {
    after(() => runWriteJob(job.id))
  }

  const since = Number(params.get('since') ?? '0')
  return Response.json(toJobSnapshot(job, Number.isFinite(since) ? since : 0))
}
