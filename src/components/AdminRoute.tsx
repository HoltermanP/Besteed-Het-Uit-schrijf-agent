'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { isAdminAuthenticated, isAdminPasswordConfigured } from '../lib/adminAuth'
import AdminLogin from '../views/AdminLogin'

type Props = {
  children: ReactNode
}

export default function AdminRoute({ children }: Props) {
  const router = useRouter()
  const configured = isAdminPasswordConfigured()
  const [ready, setReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    if (!configured) {
      router.replace('/')
      return
    }
    let active = true
    isAdminAuthenticated().then((ok) => {
      if (active) {
        setAuthenticated(ok)
        setReady(true)
      }
    })
    return () => {
      active = false
    }
  }, [configured, router])

  if (!configured) {
    return null
  }

  if (!ready) {
    return (
      <main className="min-h-screen bg-background p-6">
        <p className="text-sm text-muted-foreground">Beveiliging controleren...</p>
      </main>
    )
  }

  if (!authenticated) {
    return <AdminLogin onSuccess={() => setAuthenticated(true)} />
  }

  return children
}
