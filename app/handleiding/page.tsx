'use client'

import dynamic from 'next/dynamic'

const HandleidingView = dynamic(() => import('@/views/HandleidingPage'), { ssr: false })

export default function Page() {
  return <HandleidingView />
}
