'use client'

import dynamic from 'next/dynamic'

const AdminGate = dynamic(() => import('@/views/AdminGate'), { ssr: false })

export default function Page() {
  return <AdminGate />
}
