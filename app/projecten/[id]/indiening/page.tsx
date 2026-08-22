'use client'

import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'

// Het indieningsscherm leest het dossier uit de client-side opslag; daarom alleen client-side renderen.
const SubmissionView = dynamic(() => import('@/views/SubmissionPage'), { ssr: false })

export default function SubmissionRoutePage() {
  const params = useParams<{ id: string }>()
  const id = decodeURIComponent(params.id)
  return <SubmissionView projectId={id} />
}
