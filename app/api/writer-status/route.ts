import { getWriterStatusPayload } from '@api-lib/writerStatus'

export async function GET() {
  return Response.json(getWriterStatusPayload())
}
