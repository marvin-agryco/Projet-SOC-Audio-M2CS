import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Shield,
  LayoutDashboard,
  Bell,
  BookOpen,
  Server,
  FileText,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useSocket } from '../hooks/useSocket'
import { useLanguage } from '../context/LanguageContext'
import TopBar from './TopBar'
import clsx from 'clsx'

interface LayoutProps {
  children: ReactNode
}

const navItems = [
  { path: '/', icon: LayoutDashboard, labelKey: 'sidebar.dashboard' },
  { path: '/events', icon: FileText, labelKey: 'sidebar.eventsLog' },
  { path: '/alerts', icon: Bell, labelKey: 'sidebar.alerts' },
  { path: '/incidents', icon: Shield, labelKey: 'sidebar.incidents' },
  { path: '/playbooks', icon: BookOpen, labelKey: 'sidebar.playbooks' },
  { path: '/sites', icon: Server, labelKey: 'sidebar.assets' },
]

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { connected, alerts } = useSocket()
  const { t } = useLanguage()

  return (
    <div className="min-h-screen flex transition-colors duration-300" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
      {/* Fixed Sidebar */}
      <aside
        className="fixed left-0 top-0 bottom-0 w-64 border-r flex flex-col z-40 transition-colors duration-300"
        style={{
          backgroundColor: 'var(--color-sidebar)',
          borderColor: 'var(--color-border)'
        }}
      >
        {/* Logo */}
        <div className="p-5 border-b border-slate-700">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-slate-100">AudioSOC</h1>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path)
            const Icon = item.icon
            return (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  'flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200',
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{t(item.labelKey)}</span>
                {item.path === '/alerts' && alerts.length > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                    {alerts.length}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Footer with connection status */}
        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center gap-2 text-sm">
            {connected ? (
              <>
                <Wifi className="w-4 h-4 text-green-500" />
                <span className="text-slate-400">v1.0.4-demo</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-red-500" />
                <span className="text-red-400">{t('sidebar.disconnected')}</span>
              </>
            )}
          </div>
          <p className="text-xs text-slate-600 mt-1">{t('sidebar.secureConnection')}</p>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 ml-64 flex flex-col">
        {/* TopBar */}
        <TopBar
          systemStatus={connected ? 'online' : 'offline'}
          monitoringCount={30}
          alertCount={alerts.length}
        />

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
