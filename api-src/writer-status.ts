import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getWriterStatusPayload } from './_lib/writerStatus'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json(getWriterStatusPayload())
}
