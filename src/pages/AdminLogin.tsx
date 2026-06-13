import { useState, type FormEvent } from 'react'
import { Lock, ShieldCheck } from 'lucide-react'
import { loginAdmin } from '../lib/adminAuth'
import '../Admin.css'

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
    <main className="admin-shell">
      <section className="admin-card admin-login">
        <div className="admin-card-header">
          <ShieldCheck size={22} />
          <div>
            <h1>Admin toegang</h1>
            <p>Alleen bevoegde gebruikers kunnen API-instellingen wijzigen.</p>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <label>
            Wachtwoord
            <div className="password-field">
              <Lock size={16} />
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Admin wachtwoord"
              />
            </div>
          </label>
          {error ? <p className="admin-error">{error}</p> : null}
          <button className="primary" type="submit" disabled={loading || !password.trim()}>
            {loading ? 'Controleren...' : 'Inloggen'}
          </button>
        </form>
      </section>
    </main>
  )
}
