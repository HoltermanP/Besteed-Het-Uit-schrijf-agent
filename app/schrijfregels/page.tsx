'use client'

import dynamic from 'next/dynamic'

const RulesView = dynamic(() => import('@/views/RulesPage'), { ssr: false })

export default function Page() {
  return <RulesView />
}
