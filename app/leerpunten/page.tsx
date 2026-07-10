'use client'

import dynamic from 'next/dynamic'

const LessonsView = dynamic(() => import('@/views/LessonsPage'), { ssr: false })

export default function Page() {
  return <LessonsView />
}
