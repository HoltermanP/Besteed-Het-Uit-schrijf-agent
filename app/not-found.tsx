'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Onbekende routes gaan terug naar de werkplek (zelfde gedrag als de oude catch-all).
export default function NotFound() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/')
  }, [router])

  return null
}
