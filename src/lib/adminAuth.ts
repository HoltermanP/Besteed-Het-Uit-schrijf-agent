const SESSION_KEY = 'bid-agent-admin-session'
const SESSION_MS = 8 * 60 * 60 * 1000

type AdminSession = {
  token: string
  expiresAt: number
}

async function hashValue(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function getAdminPassword(): string | undefined {
  return import.meta.env.VITE_ADMIN_PASSWORD?.trim() || undefined
}

async function sessionToken(): Promise<string | null> {
  const password = getAdminPassword()
  if (!password) return null
  return hashValue(`${password}:bid-agent-admin`)
}

export function isAdminPasswordConfigured(): boolean {
  return Boolean(getAdminPassword())
}

export async function loginAdmin(password: string): Promise<boolean> {
  const expected = getAdminPassword()
  const token = await sessionToken()
  if (!expected || !token) return false

  const inputHash = await hashValue(password)
  const expectedHash = await hashValue(expected)
  if (inputHash !== expectedHash) return false

  const session: AdminSession = {
    token,
    expiresAt: Date.now() + SESSION_MS,
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return true
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const token = await sessionToken()
  if (!token) return false

  const raw = sessionStorage.getItem(SESSION_KEY)
  if (!raw) return false

  try {
    const session = JSON.parse(raw) as AdminSession
    return session.token === token && Date.now() < session.expiresAt
  } catch {
    return false
  }
}

export function logoutAdmin() {
  sessionStorage.removeItem(SESSION_KEY)
}
