import { handleStyleDocumentsRequest } from '../server/styleDocuments'

export const config = {
  runtime: 'nodejs',
}

export default async function handler(request: Request): Promise<Response> {
  return handleStyleDocumentsRequest(request)
}
