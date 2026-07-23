import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  clearStoredSession,
  loadStoredSession,
  persistSession,
  type StoredSession,
} from '../lib/auth'
import type { AppRole } from '../lib/auth'

type AuthContextValue = {
  session: StoredSession | null
  hydrated: boolean
  setSession: (session: StoredSession) => void
  selectRole: (role: AppRole) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<StoredSession | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setSessionState(loadStoredSession())
    setHydrated(true)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      hydrated,
      setSession(nextSession) {
        persistSession(nextSession)
        setSessionState(nextSession)
      },
      selectRole(role) {
        setSessionState((current) => {
          if (!current || !current.user.roles.includes(role)) {
            return current
          }

          const nextSession = {
            ...current,
            user: {
              ...current.user,
              role,
            },
          }
          persistSession(nextSession)
          return nextSession
        })
      },
      logout() {
        clearStoredSession()
        setSessionState(null)
      },
    }),
    [hydrated, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth 必须在 AuthProvider 内使用')
  }

  return context
}
