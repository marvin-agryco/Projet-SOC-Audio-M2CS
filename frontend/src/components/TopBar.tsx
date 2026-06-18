import { Bell, User, ChevronDown, Sun, Moon, LogOut } from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { useRole, JwtRole } from '../context/RoleContext'
import { useLanguage } from '../context/LanguageContext'
import { useNotification } from '../context/NotificationContext'
import NotificationPanel from './NotificationPanel'

interface TopBarProps {
    systemStatus?: 'online' | 'offline' | 'degraded'
    monitoringCount?: number
    alertCount?: number
}

const roles: { value: JwtRole; label: string }[] = [
    { value: 'analyst', label: 'Analyst' },
    { value: 'supervisor', label: 'Supervisor' },
    { value: 'admin', label: 'Admin' },
]

export default function TopBar({
    systemStatus = 'online',
    monitoringCount = 30,
    alertCount: _alertCount = 0,
}: TopBarProps) {
    void _alertCount
    const { theme, toggleTheme } = useTheme()
    const { user, logout } = useAuth()
    const { effectiveRole, setEffectiveRole } = useRole()
    const { lang, toggleLang, t } = useLanguage()
    const [showUserMenu, setShowUserMenu] = useState(false)
    const [showNotifications, setShowNotifications] = useState(false)
    const { unreadCount } = useNotification()

    const statusColors = {
        online: 'bg-green-500',
        offline: 'bg-red-500',
        degraded: 'bg-yellow-500',
    }

    return (
        <>
        <header className="sticky top-0 z-50 h-14 border-b px-6 flex items-center justify-between transition-colors duration-300"
            style={{
                backgroundColor: 'var(--color-topbar)',
                borderColor: 'var(--color-border)'
            }}
        >
            {/* Left: System Status */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <span className={clsx('w-2 h-2 rounded-full', statusColors[systemStatus])} />
                    <span className="text-sm text-slate-300 uppercase tracking-wide">
                        {t('topbar.system')} {systemStatus}
                    </span>
                </div>
                <span className="text-slate-500">|</span>
                <span className="text-sm text-slate-400">
                    {t('topbar.monitoring')} <span className="text-slate-200 font-medium">{monitoringCount} {t('topbar.centers')}</span>
                </span>
            </div>

            {/* Right: Role switcher, notifications, user */}
            <div className="flex items-center gap-4">
                {/* Role Switcher — admin only */}
                {user?.role === 'admin' && (
                    <div className="flex items-center gap-1 text-sm">
                        <span className="text-slate-400 mr-2">{t('topbar.viewAs')}</span>
                        {roles.map((role) => (
                            <button
                                key={role.value}
                                onClick={() => setEffectiveRole(role.value)}
                                className={clsx(
                                    'px-3 py-1.5 rounded-md transition-colors',
                                    effectiveRole === role.value
                                        ? 'bg-blue-600 text-white'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                )}
                            >
                                {role.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* Language Toggle */}
                <button
                    onClick={toggleLang}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all bg-slate-800 hover:bg-slate-700 border border-slate-700"
                    title={lang === 'en' ? 'Passer en français' : 'Switch to English'}
                >
                    <span>{lang === 'en' ? '🇬🇧' : '🇫🇷'}</span>
                    <span className="text-slate-300">{lang.toUpperCase()}</span>
                </button>

                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    className="theme-toggle flex items-center gap-2 group"
                    title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                    {theme === 'dark' ? (
                        <>
                            <Sun className="w-4 h-4 text-yellow-400 group-hover:rotate-45 transition-transform duration-300" />
                            <span className="text-xs text-slate-400 hidden sm:inline">{t('topbar.light')}</span>
                        </>
                    ) : (
                        <>
                            <Moon className="w-4 h-4 text-blue-400 group-hover:-rotate-12 transition-transform duration-300" />
                            <span className="text-xs text-slate-600 hidden sm:inline">{t('topbar.dark')}</span>
                        </>
                    )}
                </button>

                {/* Notifications — opens drawer panel */}
                <button
                    onClick={() => setShowNotifications(true)}
                    className="relative p-2 hover:bg-slate-800 rounded-lg transition-colors"
                >
                    <Bell className="w-5 h-5 text-slate-400" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    )}
                </button>

                {/* User Profile */}
                <div className="relative">
                    <button
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center">
                            <User className="w-4 h-4 text-slate-400" />
                        </div>
                        <div className="text-left">
                            <p className="text-sm font-medium text-slate-200">{user?.username}</p>
                            <p className="text-xs text-slate-500 capitalize">{effectiveRole}</p>
                        </div>
                        <ChevronDown className={clsx('w-4 h-4 text-slate-500 transition-transform', showUserMenu && 'rotate-180')} />
                    </button>

                    {showUserMenu && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
                            <div className="absolute right-0 top-full mt-2 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 overflow-hidden">
                                <div className="p-3 border-b border-slate-700">
                                    <p className="text-sm font-medium text-slate-200">{user?.username}</p>
                                    <p className="text-xs text-slate-500">{user?.email}</p>
                                </div>
                                <div className="p-1">
                                    <button
                                        onClick={() => {
                                            setShowUserMenu(false)
                                            logout()
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-slate-700 rounded-md transition-colors"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        {t('topbar.signOut')}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </header>

        {/* Notification drawer — rendered outside header to avoid z-index stacking issues */}
        <NotificationPanel
            isOpen={showNotifications}
            onClose={() => setShowNotifications(false)}
        />
        </>
    )
}
