'use client'

import dynamic from 'next/dynamic'

// Het projectenoverzicht leunt volledig op de client-side opslag; daarom alleen client-side renderen.
const ProjectsOverview = dynamic(() => import('@/views/ProjectsOverviewPage'), { ssr: false })

export default function Page() {
  return <ProjectsOverview />
}
