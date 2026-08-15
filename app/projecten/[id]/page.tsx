'use client'

import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'

// De projectomgeving leunt volledig op de client-side opslag; daarom alleen client-side renderen.
const WorkspaceView = dynamic(() => import('@/views/WorkspacePage'), { ssr: false })

export default function ProjectPage() {
  const params = useParams<{ id: string }>()
  const id = decodeURIComponent(params.id)
  return <WorkspaceView projectId={id} />
}
