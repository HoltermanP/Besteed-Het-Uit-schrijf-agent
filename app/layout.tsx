import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import '@/index.css'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import StorageGate from '@/components/StorageGate'

export const metadata: Metadata = {
  title: 'AI Schrijfagent | Besteed Het Uit',
  icons: { icon: '/favicon.svg' },
}

/**
 * Zonder deze viewport-meta legt een mobiele browser de pagina op een vaste, veel bredere
 * breedte uit en zoomt het geheel uit: piepkleine tekst, en aanraakposities die niet meer
 * overeenkomen met wat er staat (een keuzelijst reageerde daardoor niet op een tik).
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <StorageGate>{children}</StorageGate>
          <Toaster richColors closeButton position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
