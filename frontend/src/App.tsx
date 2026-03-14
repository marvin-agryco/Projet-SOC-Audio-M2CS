import { Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Events from './pages/Events'
import Alerts from './pages/Alerts'
import Incidents from './pages/Incidents'
import Sites from './pages/Sites'
import Playbooks from './pages/Playbooks'
import Login from './pages/Login'
import { SocketProvider } from './hooks/useSocket'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { RoleProvider } from './context/RoleContext'
import { LanguageProvider } from './context/LanguageContext'
import { NotificationProvider } from './context/NotificationContext'
import { SecurityEvent } from './types'

// Protected Route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function AppRoutes() {
  const [realtimeEvents, setRealtimeEvents] = useState<SecurityEvent[]>([])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <SocketProvider
              onNewEvent={(event) => {
                setRealtimeEvents((prev) => [event, ...prev].slice(0, 100))
              }}
            >
              <NotificationProvider>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard realtimeEvents={realtimeEvents} />} />
                  <Route path="/dashboard" element={<Navigate to="/" replace />} />
                  <Route path="/events" element={<Events />} />
                  <Route path="/alerts" element={<Alerts />} />
                  <Route path="/incidents" element={<Incidents />} />
                  <Route path="/sites" element={<Sites />} />
                  <Route path="/playbooks" element={<Playbooks />} />
                </Routes>
              </Layout>
              </NotificationProvider>
            </SocketProvider>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <RoleProvider>
            <AppRoutes />
          </RoleProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}

export default App
