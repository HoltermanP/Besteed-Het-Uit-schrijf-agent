'use client'

import dynamic from 'next/dynamic'

const TenderBrowserView = dynamic(() => import('@/views/TenderBrowserPage'), { ssr: false })

export default function Page() {
  return <TenderBrowserView />
}
