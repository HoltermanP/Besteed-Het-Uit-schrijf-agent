'use client'

import dynamic from 'next/dynamic'

const ConfigView = dynamic(() => import('@/views/ConfigPage'), { ssr: false })

export default function Page() {
  return <ConfigView />
}
