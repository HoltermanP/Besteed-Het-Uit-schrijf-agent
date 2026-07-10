import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '@/index.css'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import StorageGate from '@/components/StorageGate'

export const metadata: Metadata = {
  title: 'AI Schrijfagent | Besteed Het Uit',
  icons: { icon: '/favicon.svg' },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <StorageGate>{children}</StorageGate>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
