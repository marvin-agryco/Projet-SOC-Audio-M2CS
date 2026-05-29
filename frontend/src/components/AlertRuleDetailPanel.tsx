import { useEffect, useState } from 'react'
import { X, Mail, Webhook, FileText, Power, PowerOff, Edit2, Copy, Trash2,
         AlertTriangle, CheckCircle, Clock, Activity, Shield, TrendingUp } from 'lucide-react'
import clsx from 'clsx'
import { formatDistanceToNow } from 'date-fns'
import { fmtDate } from '../utils/dateFormat'
import { AlertRule, Incident } from '../types'
import { fetchIncidents } from '../api'
import SeverityBadge from './SeverityBadge'
import { formatEventType, formatSource, formatTimeframe } from '../utils/alertRuleFormatters'
import { useLanguage } from '../context/LanguageContext'

// ─── Severity colours ──────────────────────────────────────────────────────────
const SEV_BORDER: Record<string, string> = {
  critical:    'border-l-red-500',
  high:        'border-l-orange-400',
  medium:      'border-l-yellow-400',
  low:         'border-l-blue-400',
  investigating: 'border-l-orange-400',
}

const STATUS_STYLE: Record<string, string> = {
  new:            'bg-red-500/15 text-red-400 border-red-500/25',
  open:           'bg-orange-500/15 text-orange-400 border-orange-500/25',
  investigating:  'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
  resolved:       'bg-green-500/15 text-green-400 border-green-500/25',
  false_positive: 'bg-slate-600/40 text-slate-400 border-slate-600/40',
}

// ─── 7-day sparkline ──────────────────────────────────────────────────────────
function Sparkline({ incidents }: { incidents: Incident[] }) {
  const today = new Date()
  const bars = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (6 - i))
    const dateStr = d.toISOString().slice(0, 10)
    const count = incidents.filter(inc =>
      inc.created_at.slice(0, 10) === dateStr
    ).length
    const hasCrit = incidents.some(inc =>
      inc.created_at.slice(0, 10) === dateStr && inc.severity === 'critical'
    )
    return { dateStr, count, hasCrit }
  })

  const max = Math.max(...bars.map(b => b.count), 1)
  const W = 28
  const H = 44

  return (
    <div className="flex items-end gap-1" style={{ height: H }}>
      {bars.map((bar, i) => {
        const height = Math.max(4, Math.round((bar.count / max) * H))
        return (
          <div key={i} title={`${bar.dateStr}: ${bar.count} incident${bar.count !== 1 ? 's' : ''}`}
            className={clsx(
              'rounded-sm transition-all',
              bar.count === 0 ? 'bg-slate-700' :
              bar.hasCrit    ? 'bg-red-500/70' : 'bg-orange-400/70'
            )}
            style={{ width: W, height }}
          />
        )
      })}
    </div>
  )
}

// ─── Action icon ──────────────────────────────────────────────────────────────
function ActionIcon({ action }: { action: string }) {
  if (action === 'email')   return <Mail className="w-4 h-4 text-blue-400" />
  if (action === 'webhook') return <Webhook className="w-4 h-4 text-purple-400" />
  return                          <FileText className="w-4 h-4 text-slate-400" />
}

// ─── Props ───────────────────────────────────────────────────────────────────
interface Props {
  rule: AlertRule | null
  isOpen: boolean
  onClose: () => void
  onToggle: (id: string) => void
  onEdit: (rule: AlertRule) => void
  onDelete: (id: string) => void
  onDuplicate: (rule: AlertRule) => void
  canManage: boolean
}

// ─── Panel ───────────────────────────────────────────────────────────────────
export default function AlertRuleDetailPanel({
  rule, isOpen, onClose, onToggle, onEdit, onDelete, onDuplicate, canManage
}: Props) {
  const { t } = useLanguage()
  const [incidents,        setIncidents]        = useState<Incident[]>([])
  const [incidentsLoading, setIncidentsLoading] = useState(false)
  const [incidentsError,   setIncidentsError]   = useState(false)

  // Fetch incidents when panel opens or rule changes; reset on close
  useEffect(() => {
    if (!isOpen || !rule?.id) {
      setIncidents([])
      setIncidentsError(false)
      return
    }
    setIncidentsLoading(true)
    setIncidentsError(false)
    fetchIncidents({ alert_rule_id: rule.id, per_page: 5 })
      .then(data => setIncidents(data.incidents))
      .catch(() => setIncidentsError(true))
      .finally(() => setIncidentsLoading(false))
  }, [rule?.id, isOpen])

  // Escape to close
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!rule) return null

  const condParts = (rule.condition as Record<string, unknown>) ?? {}
  const condEventType = typeof condParts.event_type === 'string' ? condParts.event_type : ''
  const condSource = typeof condParts.source === 'string' ? condParts.source : ''
  const condCount = typeof condParts.count === 'number' ? condParts.count : 0
  const condTimeframe = typeof condParts.timeframe === 'string' ? condParts.timeframe : ''

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
        'fixed top-0 right-0 bottom-0 h-screen w-[440px] z-50 flex flex-col',
        'bg-slate-900 border-l border-slate-700/60 shadow-2xl',
        'transition-transform duration-300 ease-in-out',
        isOpen ? 'translate-x-0' : 'translate-x-full'
      )}>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-700/60">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <SeverityBadge severity={rule.severity as any} size="sm" />
              <span className={clsx(
                'text-xs px-2 py-0.5 rounded-full border font-medium',
                rule.enabled
                  ? 'bg-green-500/15 text-green-400 border-green-500/25'
                  : 'bg-slate-600/30 text-slate-400 border-slate-600/30'
              )}>
                {rule.enabled ? `● ${t('panel.active')}` : `○ ${t('panel.disabled')}`}
              </span>
            </div>
            <h2 className="text-base font-semibold text-slate-100 leading-tight">{rule.name}</h2>
            {rule.description && (
              <p className="text-xs text-slate-400 mt-1 line-clamp-2">{rule.description}</p>
            )}
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-700/50 transition-colors shrink-0">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Health strip */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: t('panel.totalTriggers'), value: rule.trigger_count.toString(), icon: TrendingUp, color: 'text-blue-400' },
              {
                label: t('panel.lastTriggered'),
                value: rule.last_triggered
                  ? formatDistanceToNow(new Date(rule.last_triggered), { addSuffix: true })
                  : t('panel.never'),
                icon: Clock,
                color: rule.last_triggered ? 'text-orange-400' : 'text-slate-500',
              },
              {
                label: t('panel.created'),
                value: fmtDate(rule.created_at),
                icon: Shield,
                color: 'text-slate-400',
              },
            ].map(item => (
              <div key={item.label}
                className="bg-slate-800/60 border border-slate-700/40 rounded-lg p-3 text-center">
                <item.icon className={clsx('w-4 h-4 mx-auto mb-1', item.color)} />
                <p className="text-sm font-bold text-slate-100">{item.value}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>

          {/* Trigger sparkline */}
          <div className="bg-slate-800/60 border border-slate-700/40 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" /> {t('panel.incidentActivity')}
              </span>
              <span className="text-xs text-slate-500">{incidents.length} {t('panel.incidentsLoaded')}</span>
            </div>
            {incidentsLoading
              ? <div className="h-11 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-500" />
                </div>
              : <Sparkline incidents={incidents} />
            }
          </div>

          {/* Condition */}
          <div className="bg-slate-800/60 border border-slate-700/40 rounded-lg p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              {t('panel.detectionCondition')}
            </p>
            <div className="flex flex-wrap gap-2">
              {condEventType && condEventType !== 'any' && (
                <span className="px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-500/25 text-blue-300 text-xs font-medium">
                  {formatEventType(condEventType)}
                </span>
              )}
              {condSource && condSource !== 'any' && (
                <span className="px-2.5 py-1 rounded-full bg-purple-500/15 border border-purple-500/25 text-purple-300 text-xs font-medium">
                  {t('panel.from')} {formatSource(condSource)}
                </span>
              )}
              {condCount > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-yellow-500/15 border border-yellow-500/25 text-yellow-300 text-xs font-medium">
                  ≥ {condCount} {t('panel.events')}
                </span>
              )}
              {condTimeframe && (
                <span className="px-2.5 py-1 rounded-full bg-slate-600/40 border border-slate-600/40 text-slate-300 text-xs font-medium">
                  {t('panel.within')} {formatTimeframe(condTimeframe)}
                </span>
              )}
              {!condEventType && !condSource && (
                <span className="text-xs text-slate-500">{t('panel.anyEvent')}</span>
              )}
            </div>
          </div>

          {/* Action */}
          <div className="bg-slate-800/60 border border-slate-700/40 rounded-lg p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              {t('panel.actionOnTrigger')}
            </p>
            <div className="flex items-center gap-2 mb-2">
              <ActionIcon action={rule.action} />
              <span className="text-sm font-medium text-slate-200 capitalize">{rule.action}</span>
            </div>
            {rule.action_config && Object.keys(rule.action_config).length > 0 && (
              <pre className="text-xs bg-slate-900/60 rounded p-2 text-slate-400 overflow-x-auto">
                {JSON.stringify(rule.action_config, null, 2)}
              </pre>
            )}
          </div>

          {/* Recent Incidents */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              {t('panel.recentIncidents')}
            </p>

            {incidentsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500" />
              </div>
            ) : incidentsError ? (
              <div className="text-center py-6 text-sm text-red-400 bg-red-500/10 rounded-lg border border-red-500/20">
                <AlertTriangle className="w-5 h-5 mx-auto mb-2" />
                {t('panel.failedLoad')}
              </div>
            ) : incidents.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-500">
                <CheckCircle className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                {t('panel.noIncidents')}
              </div>
            ) : (
              <div className="space-y-2">
                {incidents.map(inc => (
                  <div key={inc.id}
                    className={clsx(
                      'bg-slate-800/60 border border-slate-700/40 border-l-4 rounded-lg p-3',
                      SEV_BORDER[inc.severity] ?? 'border-l-slate-600'
                    )}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-sm font-medium text-slate-200 truncate">{inc.title}</span>
                      <span className={clsx(
                        'text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap shrink-0',
                        STATUS_STYLE[inc.status] ?? 'bg-slate-700 text-slate-300 border-slate-600'
                      )}>
                        {inc.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>{inc.event_count} {t('panel.events')}</span>
                      <span>{formatDistanceToNow(new Date(inc.created_at), { addSuffix: true })}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        {canManage && (
          <div className="border-t border-slate-700/60 px-5 py-3 flex gap-2">
            <button onClick={() => onEdit(rule)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors text-xs font-medium">
              <Edit2 className="w-3.5 h-3.5" /> {t('panel.edit')}
            </button>
            <button onClick={() => onDuplicate(rule)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/40 text-slate-300 hover:bg-slate-700/60 transition-colors text-xs font-medium">
              <Copy className="w-3.5 h-3.5" /> {t('panel.duplicate')}
            </button>
            <button onClick={() => onToggle(rule.id)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-xs font-medium',
                rule.enabled
                  ? 'bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25'
                  : 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
              )}>
              {rule.enabled
                ? <><PowerOff className="w-3.5 h-3.5" /> {t('panel.disable')}</>
                : <><Power className="w-3.5 h-3.5" /> {t('panel.enable')}</>
              }
            </button>
            <button onClick={() => { onDelete(rule.id); onClose() }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/15 text-red-400 hover:bg-red-600/25 transition-colors text-xs font-medium ml-auto">
              <Trash2 className="w-3.5 h-3.5" /> {t('panel.delete')}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
