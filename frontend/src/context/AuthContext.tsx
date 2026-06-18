import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import axios from 'axios'

interface User {
  id: string
  username: string
  email: string
  role: 'admin' | 'analyst' | 'supervisor'
  is_active: boolean
  last_login: string | null
}

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  register: (username: string, email: string, password: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const TOKEN_KEY = 'soc-auth-token'
const USER_KEY = 'soc-auth-user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load stored auth on mount
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY)
    const storedUser = localStorage.getItem(USER_KEY)

    if (storedToken && storedUser) {
      setToken(storedToken)
      setUser(JSON.parse(storedUser))

      // Set axios default header
      axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`

      // Verify token is still valid
      verifyToken(storedToken)
    } else {
      setIsLoading(false)
    }
  }, [])

  async function verifyToken(t: string) {
    try {
      const response = await axios.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${t}` }
      })
      setUser(response.data)
      localStorage.setItem(USER_KEY, JSON.stringify(response.data))
    } catch (error) {
      // Token invalid, clear auth
      logout()
    } finally {
      setIsLoading(false)
    }
  }

  async function login(username: string, password: string) {
    const response = await axios.post('/api/auth/login', { username, password })
    const { token: newToken, user: newUser } = response.data

    setToken(newToken)
    setUser(newUser)

    localStorage.setItem(TOKEN_KEY, newToken)
    localStorage.setItem(USER_KEY, JSON.stringify(newUser))

    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
  }

  function logout() {
    setToken(null)
    setUser(null)

    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)

    delete axios.defaults.headers.common['Authorization']
  }

  async function register(username: string, email: string, password: string) {
    await axios.post('/api/auth/register', { username, email, password })
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        logout,
        register,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
