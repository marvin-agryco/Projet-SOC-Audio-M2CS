import { useEffect, useState } from 'react'
import { X, Monitor, Cpu, MapPin, User, Hash, ShieldAlert, AlertTriangle, FileText, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { EnrichedAsset, SecurityEvent } from '../types'
import { fetchEvents } from '../api'
import { useLanguage } from '../context/LanguageContext'

interface AssetDetailPanelProps {
  asset: EnrichedAsset | null
  isOpen: boolean
  onClose: () => void
}

function VulnBar({ score }: { score: number }) {
  const color = score === 0 ? 'bg-green-500' :
    score <= 25 ? 'bg-green-500' :
    score <= 50 ? 'bg-yellow-500' :
    score <= 75 ? 'bg-orange-500' : 'bg-red-500'
  const label = score === 0 ? 'text-green-400' :
    score <= 25 ? 'text-green-400' :
    score <= 50 ? 'text-yellow-400' :
    score <= 75 ? 'text-orange-400' : 'text-red-400'
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-400">Vulnerability Score</span>
        <span className={clsx('text-sm font-bold', label)}>{score} / 100</span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${score}%` }} />
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg = {
    online:   { bg: 'bg-green-500/20 border-green-500/40',  dot: 'bg-green-500',  text: 'text-green-400' },
    degraded: { bg: 'bg-yellow-500/20 border-yellow-500/40', dot: 'bg-yellow-500', text: 'text-yellow-400' },
    offline:  { bg: 'bg-red-500/20 border-red-500/40',      dot: 'bg-red-500',    text: 'text-red-400' },
  }[status] ?? { bg: 'bg-slate-700/40 border-slate-600', dot: 'bg-slate-500', text: 'text-slate-400' }

  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold uppercase tracking-wider', cfg.bg, cfg.text)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {status}
    </span>
  )
}

function Row({ icon: Icon, label, value, mono = false }: { icon: React.ElementType; label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-700/40 last:border-0">
      <Icon className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
      <span className="text-xs text-slate-500 w-24 shrink-0">{label}</span>
      <span className={clsx('text-sm text-slate-200 flex-1 min-w-0 break-all', mono && 'font-mono text-xs')}>
        {value || '—'}
      </span>
    </div>
  )
}

export default function AssetDetailPanel({ asset, isOpen, onClose }: AssetDetailPanelProps) {
  const navigate = useNavigate()
  const { locale } = useLanguage()
  const [recentAlerts, setRecentAlerts] = useState<SecurityEvent[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)

  useEffect(() => {
    if (!isOpen || !asset?.siteId) return
    setAlertsLoading(true)
    fetchEvents({ site_id: asset.siteId, severity: 'critical,high', limit: 3 })
      .then(d => setRecentAlerts(d.events || []))
      .catch(() => setRecentAlerts([]))
      .finally(() => setAlertsLoading(false))
  }, [isOpen, asset?.siteId])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  const osIcon = asset?.osPlatform === 'windows' ? '⊞' : asset?.osPlatform === 'macos' ? '' : '🐧'

  return (
    <>
      {isOpen && (
        <div className="fixed left-64 top-0 bottom-0 right-0 z-40 bg-black/40" onClick={onClose} />
      )}

      <div className={clsx(
        'fixed top-0 right-0 h-full w-96 z-50 flex flex-col',
        'bg-slate-900 border-l border-slate-700/60 shadow-2xl',
        'transition-transform duration-300 ease-in-out',
        isOpen ? 'translate-x-0' : 'translate-x-full'
      )}>
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-700/60">
          <div className="min-w-0 flex-1 mr-3">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Asset Detail</p>
            <h2 className="text-base font-bold text-slate-100 font-mono truncate">{asset?.name}</h2>
            <div className="mt-1.5">
              {asset && <StatusBadge status={asset.status} />}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {asset && (
            <div className="p-4 space-y-5">

              {/* Vulnerability Score */}
              <div className="p-4 bg-slate-800/60 rounded-lg border border-slate-700/40">
                <VulnBar score={asset.vulnScore} />
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="text-center p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <ShieldAlert className="w-4 h-4 text-red-400 mx-auto mb-1" />
                    <p className="text-lg font-bold text-red-400">{asset.criticalAlerts}</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide">Critical</p>
                  </div>
                  <div className="text-center p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-orange-400 mx-auto mb-1" />
                    <p className="text-lg font-bold text-orange-400">{asset.highAlerts}</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide">High</p>
                  </div>
                </div>
              </div>

              {/* Identity */}
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Identity</p>
                <div className="bg-slate-800/40 rounded-lg px-3">
                  <Row icon={Monitor} label="OS" value={`${osIcon} ${asset.os}`} />
                  <Row icon={Hash} label="Serial" value={asset.serial} mono />
                  <Row icon={User} label="Owner" value={asset.contact} />
                  <Row icon={Cpu} label="State" value={typeof asset.states_id === 'string' ? asset.states_id : undefined} />
                </div>
              </div>

              {/* Network */}
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Network</p>
                <div className="bg-slate-800/40 rounded-lg px-3">
                  <Row icon={Monitor} label="IP Address" value={asset.ip} mono />
                  <Row icon={MapPin} label="Department" value={asset.dept} />
                  <Row icon={MapPin} label="Site ID" value={asset.siteId || '—'} mono />
                </div>
              </div>

              {/* Recent Alerts */}
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Recent Critical Alerts</p>
                {alertsLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-blue-500" />
                  </div>
                ) : recentAlerts.length === 0 ? (
                  <p className="text-xs text-slate-600 py-2 px-3 bg-slate-800/40 rounded-lg">No recent critical alerts</p>
                ) : (
                  <div className="space-y-2">
                    {recentAlerts.map(alert => (
                      <div key={alert.id} className={clsx(
                        'flex items-start gap-2 p-3 rounded-lg border text-xs',
                        alert.severity === 'critical'
                          ? 'bg-red-500/10 border-red-500/20'
                          : 'bg-orange-500/10 border-orange-500/20'
                      )}>
                        {alert.severity === 'critical'
                          ? <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                          : <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
                        }
                        <div className="min-w-0 flex-1">
                          <p className="text-slate-200 font-medium truncate">{alert.description}</p>
                          <p className="text-slate-500 mt-0.5">
                            {new Date(alert.timestamp).toLocaleString(locale())}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700/60 space-y-2">
          <button
            onClick={() => { onClose(); navigate('/events', { state: { site_id: asset?.siteId, severity: 'critical,high' } }) }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-600/30 text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
          >
            <ShieldAlert className="w-4 h-4" />
            View Critical Alerts
          </button>
          <button
            onClick={() => { onClose(); navigate('/events', { state: { site_id: asset?.siteId } }) }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-sm font-medium transition-colors"
          >
            <FileText className="w-4 h-4" />
            View All Events
            <ExternalLink className="w-3.5 h-3.5 ml-auto" />
          </button>
        </div>
      </div>
    </>
  )
}
