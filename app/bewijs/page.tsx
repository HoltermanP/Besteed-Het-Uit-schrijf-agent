'use client'

import dynamic from 'next/dynamic'

const EvidenceView = dynamic(() => import('@/views/EvidencePage'), { ssr: false })

export default function Page() {
  return <EvidenceView />
}
