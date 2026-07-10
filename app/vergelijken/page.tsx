'use client'

import dynamic from 'next/dynamic'

const CompareProjectsView = dynamic(() => import('@/views/CompareProjectsPage'), { ssr: false })

export default function Page() {
  return <CompareProjectsView />
}
