'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminRoute from '@/components/AdminRoute'
import AdminPage from '@/views/AdminPage'
import { isAdminPasswordConfigured } from '@/lib/adminAuth'

// Zonder geconfigureerd admin-wachtwoord bestaat de adminpagina niet: terug naar de werkplek.
export default function AdminGate() {
  const router = useRouter()
  const configured = isAdminPasswordConfigured()

  useEffect(() => {
    if (!configured) router.replace('/')
  }, [configured, router])

  if (!configured) return null

  return (
    <AdminRoute>
      <AdminPage />
    </AdminRoute>
  )
}
