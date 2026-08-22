import { handleBackupRequest } from '@api-lib/backup'

// Volledige export van de werkruimte. Het samenstellen raakt de hele opslag; ruimer
// tijdslimiet dan de gewone state-route.
export const maxDuration = 60

export async function GET(request: Request) {
  try {
    return await handleBackupRequest(request)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Back-up kon niet worden samengesteld.'
    return Response.json({ error: message }, { status: 500 })
  }
}
