import { useEffect } from 'react'
import { X, ShieldAlert, AlertTriangle, Info, Zap, FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useNotification, Notification } from '../context/NotificationContext'
import { useLanguage } from '../context/LanguageContext'

interface NotificationPanelProps {
  isOpen: boolean
  onClose: () => void
}

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function NotifIcon({ n, className }: { n: Notification; className?: string }) {
  const cls = `w-4 h-4 shrink-0 ${className ?? ''}`
  if (n.type === 'playbook') return <Zap className={cls} />
  if (n.severity === 'critical') return <ShieldAlert className={cls} />
  if (n.severity === 'high') return <AlertTriangle className={cls} />
  return <Info className={cls} />
}

const SEVERITY_STYLE = {
  critical: {
    card: 'bg-gradient-to-r from-red-800/70 to-slate-800/80 border border-red-700/50 border-l-4 border-l-red-500',
    iconBg: 'bg-red-500/40',
    iconColor: 'text-red-300',
    label: 'text-red-300',
  },
  high: {
    card: 'bg-gradient-to-r from-orange-800/70 to-slate-800/80 border border-orange-700/50 border-l-4 border-l-orange-400',
    iconBg: 'bg-orange-500/40',
    iconColor: 'text-orange-300',
    label: 'text-orange-300',
  },
  medium: {
    card: 'bg-gradient-to-r from-yellow-800/60 to-slate-800/80 border border-yellow-700/40 border-l-4 border-l-yellow-400',
    iconBg: 'bg-yellow-500/30',
    iconColor: 'text-yellow-300',
    label: 'text-yellow-300',
  },
  low: {
    card: 'bg-gradient-to-r from-yellow-800/60 to-slate-800/80 border border-yellow-700/40 border-l-4 border-l-yellow-400',
    iconBg: 'bg-yellow-500/30',
    iconColor: 'text-yellow-300',
    label: 'text-yellow-300',
  },
  playbook: {
    card: 'bg-gradient-to-r from-blue-800/70 to-slate-800/80 border border-blue-700/50 border-l-4 border-l-blue-400',
    iconBg: 'bg-blue-500/40',
    iconColor: 'text-blue-300',
    label: 'text-blue-300',
  },
}

function getSeverityStyle(n: Notification) {
  if (n.type === 'playbook') return SEVERITY_STYLE.playbook
  return SEVERITY_STYLE[n.severity ?? 'low']
}

function NotifRow({ n, onClick }: { n: Notification; onClick: () => void }) {
  const style = getSeverityStyle(n)
  const labelText = n.type === 'playbook' ? 'SOAR' : (n.severity ?? '').toUpperCase()

  return (
    <div
      onClick={onClick}
      className={clsx(
        'rounded-lg border p-3.5 cursor-pointer transition-all hover:brightness-110 active:scale-[0.99]',
        style.card
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon with colored background */}
        <div className={clsx('p-1.5 rounded-md shrink-0 mt-0.5', style.iconBg)}>
          <NotifIcon n={n} className={style.iconColor} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-slate-100 leading-snug">
              {n.title}
              {n.count > 1 && (
                <span className="ml-1.5 text-xs font-normal text-slate-400">({n.count} attempts)</span>
              )}
            </p>
            {!n.read && (
              <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0 mt-1.5" />
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{n.subtitle}</p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <span className={clsx('text-[11px] font-bold tracking-wider', style.label)}>{labelText}</span>
        <span className="text-xs text-white font-medium">{timeAgo(n.timestamp)}</span>
      </div>
    </div>
  )
}

export default function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { notifications, unreadCount, markAllRead } = useNotification()

  // Escape key
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  function handleNotifClick(n: Notification) {
    onClose()
    if (n.type === 'playbook') {
      navigate('/playbooks')
    } else {
      navigate('/events', { state: { site_id: n.siteId, severity: 'critical,high' } })
    }
  }

  function handleViewAll() {
    onClose()
    navigate('/events', { state: { severity: 'critical,high' } })
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed left-64 top-0 bottom-0 right-0 z-40 bg-black/40"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div className={clsx(
        'fixed top-0 right-0 h-full w-96 z-50 flex flex-col',
        'bg-slate-900 border-l border-slate-700/60 shadow-2xl',
        'transition-transform duration-300 ease-in-out',
        isOpen ? 'translate-x-0' : 'translate-x-full'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
          <div>
            <h2 className="text-base font-semibold text-slate-100">{t('topbar.notifications')}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded hover:bg-slate-800"
              >
                {t('topbar.markAllRead')}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-500 gap-2">
              <ShieldAlert className="w-8 h-8 text-slate-700" />
              <p className="text-sm">{t('topbar.noNewAlerts')}</p>
            </div>
          ) : (
            notifications.map((n) => (
              <NotifRow key={n.id} n={n} onClick={() => handleNotifClick(n)} />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700/60">
          <button
            onClick={handleViewAll}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-sm font-medium transition-colors"
          >
            <FileText className="w-4 h-4" />
            {t('topbar.viewAll')} — Events Log
          </button>
        </div>
      </div>
    </>
  )
}
