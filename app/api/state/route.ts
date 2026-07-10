import { readAllState, writeState, clearState, type StateWriteRequest } from '@api-lib/appState'

export const maxDuration = 30

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback
  return Response.json({ error: message }, { status: 500 })
}

export async function GET() {
  try {
    return Response.json({ state: await readAllState() })
  } catch (error) {
    return errorResponse(error, 'Werkruimte-opslag kon niet worden gelezen.')
  }
}

async function applyWrite(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as StateWriteRequest
    await writeState(body)
    return Response.json({ ok: true })
  } catch (error) {
    return errorResponse(error, 'Werkruimte-opslag kon niet worden weggeschreven.')
  }
}

export const PUT = applyWrite
// POST als alias voor PUT: navigator.sendBeacon (flush bij sluiten tabblad) kan alleen POST.
export const POST = applyWrite

export async function DELETE() {
  try {
    await clearState()
    return Response.json({ ok: true })
  } catch (error) {
    return errorResponse(error, 'Werkruimte-opslag kon niet worden geleegd.')
  }
}
