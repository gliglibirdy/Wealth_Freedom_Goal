import { createContext, useContext, useState } from 'react'

const SESSION_KEY = 'wf_authenticated'
const FIXED_USER = { uid: 'owner' }

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [authed, setAuthed] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === '1'
  )

  const login = (password) => {
    const correct = import.meta.env.VITE_APP_PASSWORD
    if (!correct) {
      // No password set — allow access (dev convenience)
      sessionStorage.setItem(SESSION_KEY, '1')
      setAuthed(true)
      return true
    }
    if (password === correct) {
      sessionStorage.setItem(SESSION_KEY, '1')
      setAuthed(true)
      return true
    }
    return false
  }

  const logout = () => {
    sessionStorage.removeItem(SESSION_KEY)
    setAuthed(false)
  }

  return (
    <AuthContext.Provider value={{ user: authed ? FIXED_USER : null, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
