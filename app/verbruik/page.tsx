'use client'

import dynamic from 'next/dynamic'
import AdminRoute from '@/components/AdminRoute'

// Verbruik en plafonds zijn beheerderswerk: dezelfde poort als API-beheer.
const UsageView = dynamic(() => import('@/views/UsagePage'), { ssr: false })

export default function Page() {
  return (
    <AdminRoute>
      <UsageView />
    </AdminRoute>
  )
}
