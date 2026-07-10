'use client'

import dynamic from 'next/dynamic'

// De werkplek leunt volledig op localStorage; daarom alleen client-side renderen.
const WorkspaceView = dynamic(() => import('@/views/WorkspacePage'), { ssr: false })

export default function Page() {
  return <WorkspaceView />
}
