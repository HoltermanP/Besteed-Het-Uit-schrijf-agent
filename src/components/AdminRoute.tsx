import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { isAdminAuthenticated, isAdminPasswordConfigured } from '../lib/adminAuth'
import AdminLogin from '../pages/AdminLogin'

type Props = {
  children: ReactNode
}

export default function AdminRoute({ children }: Props) {
  const [ready, setReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
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
  }, [])

  if (!isAdminPasswordConfigured()) {
    return <Navigate to="/" replace />
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
