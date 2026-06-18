import { useState, useEffect, useCallback } from 'react'
import { X, Wifi, WifiOff, Zap, Clock, Server } from 'lucide-react'
import clsx from 'clsx'
import { SourceDetail } from '../types'
import { fetchSourceDetails } from '../api'
import { useLanguage } from '../context/LanguageContext'

interface SourcesPanelProps {
  isOpen: boolean
  onClose: () => void
}

const SOURCE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  firewall:    { label: 'Firewall',        color: '#f97316', bg: 'bg-orange-500/10',  border: 'border-orange-500/30' },
  endpoint:    { label: 'Endpoint',        color: '#3b82f6', bg: 'bg-blue-500/10',    border: 'border-blue-500/30'   },
  ids:         { label: 'IDS / Suricata',  color: '#8b5cf6', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
  application: { label: 'Application',    color: '#22c55e', bg: 'bg-green-500/10',   border: 'border-green-500/30'  },
}

const SOURCE_ORDER = ['firewall', 'endpoint', 'ids', 'application']

function relativeTime(iso: string | null, t: (k: string) => string): string {
  if (!iso) return t('sources.noData')
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 5)   return t('sources.justNow')
  if (diff < 60)  return `${diff}${t('sources.secAgo')}`
  if (diff < 3600) return `${Math.floor(diff / 60)}${t('sources.minAgo')}`
  return `${Math.floor(diff / 3600)}${t('sources.hrAgo')}`
}

function isActive(detail: SourceDetail): boolean {
  // Primary: recent keepalive (pipeline health, independent of security activity)
  if (detail.last_keepalive_at) {
    return (Date.now() - new Date(detail.last_keepalive_at).getTime()) < 10 * 60 * 1000
  }
  // Fallback for sources with no keepalive yet: had security events in last 24h
  return detail.events_24h > 0
}

function SourceCard({ source, detail }: { source: string; detail: SourceDetail }) {
  const { t } = useLanguage()
  const cfg = SOURCE_CONFIG[source]
  const active = isActive(detail)
  const eps = (detail.events_last_60s / 60).toFixed(2)

  function specificMeta() {
    if (source === 'firewall') {
      return <span>{t('sources.host')}: <span className="font-mono">firewall-gw</span></span>
    }
    if (source === 'endpoint') {
      return <span>{detail.active_sites} {t('sources.agents')} active</span>
    }
    if (source === 'ids') {
      return detail.top_event_type
        ? <span>{t('sources.lastRule')}: <span className="font-mono truncate">{detail.top_event_type}</span></span>
        : <span className="text-slate-500">{t('sources.noData')}</span>
    }
    if (source === 'application') {
      const connected = active || detail.events_24h > 0
      return (
        <span>
          {t('sources.glpiStatus')}:{' '}
          <span className={connected ? 'text-green-400' : 'text-red-400'}>
            {connected ? t('sources.connected') : t('sources.timeout')}
          </span>
        </span>
      )
    }
    return null
  }

  return (
    <div className={clsx('rounded-lg border p-4 space-y-3', cfg.bg, cfg.border)}>
      {/* Header: source name + badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cfg.color }} />
          <span className="font-semibold text-slate-100 text-sm">{cfg.label}</span>
        </div>
        <span className={clsx(
          'flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full',
          active
            ? 'bg-green-500/20 text-green-400'
            : 'bg-red-500/20 text-red-400'
        )}>
          {active ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {active ? t('sources.active') : t('sources.disconnected')}
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-slate-400">
          <Clock className="w-3 h-3 shrink-0" />
          <span>{t('sources.lastSignal')}: <span className="text-white font-medium">{relativeTime(detail.last_event_at, t)}</span></span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400">
          <Zap className="w-3 h-3 shrink-0" />
          <span>{t('sources.eps')}: <span className="text-slate-200">{eps}</span></span>
        </div>
      </div>

      {/* 24h count + source-specific metadata */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <Server className="w-3 h-3 shrink-0" />
          <span className="truncate">{specificMeta()}</span>
        </div>
        <span className="text-white font-medium shrink-0 ml-2">{detail.events_24h.toLocaleString()} {t('sources.events24h')}</span>
      </div>
    </div>
  )
}

export default function SourcesPanel({ isOpen, onClose }: SourcesPanelProps) {
  const { t } = useLanguage()
  const [sources, setSources] = useState<Record<string, SourceDetail>>({})
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetchSourceDetails()
      .then(d => setSources(d.sources))
      .catch(() => setSources({}))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (isOpen) load()
  }, [isOpen, load])

  // Escape key
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  return (
    <>
      {/* Backdrop — only covers content area (left-64 = after sidebar), not the nav */}
      {isOpen && (
        <div
          className="fixed left-64 top-0 bottom-0 right-0 z-40 bg-black/40"
          onClick={onClose}
        />
      )}

      {/* Drawer — slides in from the right edge of the content area */}
      <div className={clsx(
        'fixed top-0 right-0 h-full w-80 z-50 flex flex-col',
        'bg-slate-900 border-l border-slate-700/60 shadow-2xl',
        'transition-transform duration-300 ease-in-out',
        isOpen ? 'translate-x-0' : 'translate-x-full'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
          <div>
            <h2 className="text-base font-semibold text-slate-100">{t('sources.title')}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{t('sources.subtitle')}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500" />
            </div>
          ) : (
            SOURCE_ORDER.map(src => {
              const detail = sources[src]
              if (!detail) return (
                <div key={src} className={clsx('rounded-lg border p-4', SOURCE_CONFIG[src]?.bg, SOURCE_CONFIG[src]?.border)}>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                    <span className="font-semibold text-slate-400 text-sm">{SOURCE_CONFIG[src]?.label}</span>
                    <span className="ml-auto text-xs text-slate-500">{t('sources.noData')}</span>
                  </div>
                </div>
              )
              return <SourceCard key={src} source={src} detail={detail} />
            })
          )}
        </div>
      </div>
    </>
  )
}
