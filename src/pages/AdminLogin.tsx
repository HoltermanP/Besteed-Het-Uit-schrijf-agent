import { useState, type FormEvent } from 'react'
import { Lock, ShieldCheck } from 'lucide-react'
import { loginAdmin } from '../lib/adminAuth'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  onSuccess: () => void
}

export default function AdminLogin({ onSuccess }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    const ok = await loginAdmin(password)
    setLoading(false)
    if (ok) {
      onSuccess()
      return
    }
    setError('Onjuist wachtwoord.')
    setPassword('')
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-background p-4 text-foreground sm:p-6">
      <Card className="mt-[12vh] w-full max-w-md">
        <CardHeader>
          <div className="flex items-start gap-3">
            <ShieldCheck size={22} className="mt-0.5 shrink-0" />
            <div>
              <CardTitle>Admin toegang</CardTitle>
              <CardDescription>
                Alleen bevoegde gebruikers kunnen API-instellingen wijzigen.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-3">
            <div className="space-y-2">
              <Label htmlFor="admin-password">Wachtwoord</Label>
              <div className="relative">
                <Lock
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Admin wachtwoord"
                  className="pl-9"
                />
              </div>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={loading || !password.trim()}>
              {loading ? 'Controleren...' : 'Inloggen'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
