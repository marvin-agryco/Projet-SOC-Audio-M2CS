import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Trash2, Power, PowerOff, Edit2, Copy, AlertTriangle, Shield,
  Mail, Webhook, FileText, X, ChevronDown, ChevronUp, Clock, Search,
  Activity, Layers, FlaskConical, ArrowUpRight, CheckCircle2, XCircle,
  Loader2, Radio, Flame, Snowflake,
} from 'lucide-react'
import {
  fetchAlertRules, createAlertRule, deleteAlertRule, toggleAlertRule, updateAlertRule,
  testAlertCondition, fetchTriggeredAlerts, AlertTestResult,
  TriggeredInstance, TriggeredSummary,
} from '../api'
import { AlertRule } from '../types'
import SeverityBadge from '../components/SeverityBadge'
import AlertRuleDetailPanel from '../components/AlertRuleDetailPanel'
import CustomSelect from '../components/CustomSelect'
import { useRole } from '../context/RoleContext'
import { useLanguage } from '../context/LanguageContext'
import { useSocket } from '../hooks/useSocket'
import { fmtDateTime, timeAgo } from '../utils/dateFormat'
import clsx from 'clsx'
import {
  EVENT_SOURCES, EVENT_TYPES, formatSource, formatEventType,
  describeCondition, conditionSignature,
} from '../utils/alertRuleFormatters'

// ── Rule templates ────────────────────────────────────────────────────────────
const RULE_TEMPLATES = [
  {
    name: 'Brute Force Detection',
    description: 'Alert on multiple failed login attempts',
    condition: { event_type: 'auth_failure', source: 'any', count: 5, timeframe: '10m' },
    severity: 'high',
    action: 'email' as const,
  },
  {
    name: 'Malware Alert',
    description: 'Immediate alert on malware detection',
    condition: { event_type: 'malware_detected', source: 'endpoint', count: 1, timeframe: '5m' },
    severity: 'critical',
    action: 'email' as const,
  },
  {
    name: 'Port Scan Detection',
    description: 'Detect network reconnaissance attempts',
    condition: { event_type: 'port_scan', source: 'ids', count: 3, timeframe: '5m' },
    severity: 'high',
    action: 'log' as const,
  },
  {
    name: 'Privilege Escalation',
    description: 'Alert on unauthorized privilege changes',
    condition: { event_type: 'privilege_escalation', source: 'any', count: 1, timeframe: '5m' },
    severity: 'critical',
    action: 'email' as const,
  },
  {
    name: 'High Volume Events',
    description: 'Alert when event volume spikes',
    condition: { event_type: 'any', source: 'any', count: 100, timeframe: '5m' },
    severity: 'medium',
    action: 'log' as const,
  },
]

// ── Recency grading (A-001 / A-003) ───────────────────────────────────────────
type Recency = 'live' | 'fresh' | 'recent' | 'idle' | 'stale' | 'never'

function gradeRecency(lastTriggered: string | null | undefined, enabled: boolean): Recency {
  if (!lastTriggered) return 'never'
  const ageMs = Date.now() - new Date(lastTriggered).getTime()
  const min = ageMs / 60000
  if (min < 5) return 'live'
  if (min < 60) return 'fresh'
  if (min < 60 * 24) return 'recent'
  if (min < 60 * 24 * 30) return 'idle'
  return enabled ? 'stale' : 'idle'
}

const RECENCY_STYLE: Record<Recency, string> = {
  live:   'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
  fresh:  'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  recent: 'bg-blue-500/15 text-blue-300 border border-blue-500/25',
  idle:   'bg-slate-700/40 text-slate-400 border border-slate-600/40',
  stale:  'bg-rose-500/15 text-rose-300 border border-rose-500/40',
  never:  'bg-slate-800/60 text-slate-500 border border-slate-700/50',
}

function isStaleEnabled(rule: AlertRule): boolean {
  if (!rule.enabled) return false
  if (!rule.last_triggered) {
    // Created >30d ago but never fired = stale
    const createdMs = rule.created_at ? Date.now() - new Date(rule.created_at).getTime() : 0
    return createdMs > 30 * 24 * 60 * 60 * 1000
  }
  return gradeRecency(rule.last_triggered, rule.enabled) === 'stale'
}

function firedSinceHours(lastTriggered: string | null | undefined, hours: number): boolean {
  if (!lastTriggered) return false
  return Date.now() - new Date(lastTriggered).getTime() < hours * 3600 * 1000
}

// ── Overlap detection (A-005) ─────────────────────────────────────────────────
function findOverlapMap(rules: AlertRule[]): Map<string, AlertRule[]> {
  const bySig = new Map<string, AlertRule[]>()
  rules.forEach((r) => {
    const sig = conditionSignature(r.condition as Record<string, unknown>)
    if (!bySig.has(sig)) bySig.set(sig, [])
    bySig.get(sig)!.push(r)
  })
  // Only keep groups with 2+ enabled rules
  const overlapMap = new Map<string, AlertRule[]>()
  bySig.forEach((group) => {
    if (group.filter((r) => r.enabled).length >= 2) {
      group.forEach((r) => overlapMap.set(r.id, group))
    }
  })
  return overlapMap
}

// ─────────────────────────────────────────────────────────────────────────────

type TabKey = 'rules' | 'triggered'

export default function Alerts() {
  const { canManageRules } = useRole()
  const { socket } = useSocket()
  const { t } = useLanguage()
  const navigate = useNavigate()

  const [tab, setTab] = useState<TabKey>('rules')
  const [rules, setRules] = useState<AlertRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set())
  const [detailRule, setDetailRule] = useState<AlertRule | null>(null)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)

  // Search / filter / sort (A-010)
  const [search, setSearch] = useState('')
  const [filterSeverity, setFilterSeverity] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'enabled' | 'disabled' | 'stale'>('all')
  const [sortBy, setSortBy] = useState<'last_triggered' | 'name' | 'trigger_count' | 'created'>(
    'last_triggered'
  )

  // Live (A-012)
  const [recentlyTriggered, setRecentlyTriggered] = useState<Set<string>>(new Set())
  const [liveCount, setLiveCount] = useState(0)

  useEffect(() => {
    loadRules()
  }, [])

  // Socket: rule_triggered listener (A-012)
  useEffect(() => {
    if (!socket) return
    const handler = (payload: { rule_id: string }) => {
      if (!payload?.rule_id) return
      setLiveCount((c) => c + 1)
      setRecentlyTriggered((prev) => {
        const next = new Set(prev)
        next.add(payload.rule_id)
        return next
      })
      // Refresh after a brief delay to pick up server-side trigger_count/last_triggered
      setTimeout(loadRules, 600)
      // Auto-clear the visual pulse after 30s
      setTimeout(() => {
        setRecentlyTriggered((prev) => {
          const next = new Set(prev)
          next.delete(payload.rule_id)
          return next
        })
      }, 30000)
    }
    socket.on('rule_triggered', handler)
    return () => { socket.off('rule_triggered', handler) }
  }, [socket])

  async function loadRules() {
    try {
      const data = await fetchAlertRules()
      setRules(data.rules)
    } catch (error) {
      console.error('Failed to load alert rules:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('alertRules.confirmDelete'))) return
    try {
      await deleteAlertRule(id)
      setRules((rs) => rs.filter((r) => r.id !== id))
    } catch (error) {
      console.error('Failed to delete rule:', error)
    }
  }

  async function handleToggle(id: string) {
    try {
      const updated = await toggleAlertRule(id)
      setRules((rs) => rs.map((r) => (r.id === id ? updated : r)))
    } catch (error) {
      console.error('Failed to toggle rule:', error)
    }
  }

  async function handleCreate(data: Partial<AlertRule>) {
    try {
      const newRule = await createAlertRule(data as Omit<AlertRule, 'id' | 'created_at' | 'last_triggered' | 'trigger_count'>)
      setRules((rs) => [newRule, ...rs])
      setShowForm(false)
    } catch (error) {
      console.error('Failed to create rule:', error)
    }
  }

  async function handleUpdate(id: string, data: Partial<AlertRule>) {
    try {
      const updated = await updateAlertRule(id, data)
      setRules((rs) => rs.map((r) => (r.id === id ? updated : r)))
      setEditingRule(null)
      setShowForm(false)
    } catch (error) {
      console.error('Failed to update rule:', error)
    }
  }

  function handleEdit(rule: AlertRule) {
    setEditingRule(rule)
    setShowForm(true)
  }

  function handleDuplicate(rule: AlertRule) {
    setEditingRule({
      ...rule,
      id: '',
      name: `${rule.name} (Copy)`,
    })
    setShowForm(true)
  }

  function handleTemplateSelect(template: typeof RULE_TEMPLATES[0]) {
    setEditingRule({
      id: '',
      name: template.name,
      description: template.description,
      condition: template.condition,
      action: template.action,
      action_config: {},
      severity: template.severity,
      enabled: true,
      trigger_count: 0,
      last_triggered: undefined,
      created_at: new Date().toISOString(),
    } as AlertRule)
    setShowTemplates(false)
    setShowForm(true)
  }

  function toggleRuleExpand(id: string) {
    setExpandedRules((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function getActionIcon(action: string) {
    switch (action) {
      case 'email': return <Mail className="w-4 h-4" />
      case 'webhook': return <Webhook className="w-4 h-4" />
      default: return <FileText className="w-4 h-4" />
    }
  }

  // Derived stats (A-004)
  const overlapMap = useMemo(() => findOverlapMap(rules), [rules])
  const stats = useMemo(() => {
    const active = rules.filter((r) => r.enabled)
    const firedToday = rules.filter((r) => firedSinceHours(r.last_triggered, 24))
    const hotToday = [...firedToday].sort((a, b) => {
      const at = a.last_triggered ? new Date(a.last_triggered).getTime() : 0
      const bt = b.last_triggered ? new Date(b.last_triggered).getTime() : 0
      return bt - at
    })[0]
    const stale = rules.filter(isStaleEnabled)
    const overlapping = Array.from(new Set(Array.from(overlapMap.keys()))).length
    return {
      total: rules.length,
      active: active.length,
      firedTodayCount: firedToday.length,
      hotToday,
      stale,
      overlapping,
    }
  }, [rules, overlapMap])

  // Filtered + sorted (A-010)
  const visibleRules = useMemo(() => {
    let list = rules.slice()
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((r) =>
        r.name.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
      )
    }
    if (filterSeverity !== 'all') list = list.filter((r) => r.severity === filterSeverity)
    if (filterStatus === 'enabled') list = list.filter((r) => r.enabled)
    else if (filterStatus === 'disabled') list = list.filter((r) => !r.enabled)
    else if (filterStatus === 'stale') list = list.filter(isStaleEnabled)

    list.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'trigger_count':
          return (b.trigger_count || 0) - (a.trigger_count || 0)
        case 'created':
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        case 'last_triggered':
        default: {
          const at = a.last_triggered ? new Date(a.last_triggered).getTime() : 0
          const bt = b.last_triggered ? new Date(b.last_triggered).getTime() : 0
          return bt - at
        }
      }
    })
    return list
  }, [rules, search, filterSeverity, filterStatus, sortBy])

  // Trigger-count click → Events page filtered by rule's source + severity (A-008)
  function gotoEventsForRule(rule: AlertRule) {
    const cond = (rule.condition || {}) as Record<string, string>
    const state: Record<string, string> = {}
    if (cond.severity && cond.severity !== 'any') state.severity = cond.severity
    if (cond.site_id && cond.site_id !== 'any') state.site_id = cond.site_id
    navigate('/events', { state })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {t('alertRules.title')}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {t('alertRules.subtitle')}
          </p>
        </div>
        <div className="flex gap-3">
          {tab === 'rules' && (
            <div className="relative">
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
                style={{
                  backgroundColor: 'var(--color-bg-secondary)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <Shield className="w-4 h-4" />
                {t('alertRules.templates')}
                <ChevronDown className={clsx('w-4 h-4 transition-transform', showTemplates && 'rotate-180')} />
              </button>
              {showTemplates && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowTemplates(false)} />
                  <div
                    className="absolute right-0 top-full mt-2 w-80 rounded-lg shadow-xl z-20 overflow-hidden"
                    style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
                  >
                    <div className="p-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                      <p className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        {t('alertRules.templatesTitle')}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {t('alertRules.templatesSubtitle')}
                      </p>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {RULE_TEMPLATES.map((template, i) => {
                        const dup = rules.find(
                          (r) =>
                            r.name.toLowerCase() === template.name.toLowerCase() ||
                            conditionSignature(r.condition as Record<string, unknown>) ===
                              conditionSignature(template.condition as Record<string, unknown>)
                        )
                        return (
                          <button
                            key={i}
                            onClick={() => handleTemplateSelect(template)}
                            className="w-full p-3 text-left hover:bg-slate-700/50 transition-colors border-b last:border-b-0"
                            style={{ borderColor: 'var(--color-border)' }}
                          >
                            <div className="flex items-center justify-between mb-1 gap-2">
                              <span className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>
                                {template.name}
                              </span>
                              <SeverityBadge severity={template.severity as 'critical' | 'high' | 'medium' | 'low'} size="sm" />
                            </div>
                            <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                              {template.description}
                            </p>
                            {dup && (
                              <p className="text-[11px] mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                <AlertTriangle size={10} />
                                {t('alertRules.alreadyUsed')} "{dup.name}"
                              </p>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {canManageRules && tab === 'rules' && (
            <button
              onClick={() => { setEditingRule(null); setShowForm(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('alertRules.newRule')}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <TabButton active={tab === 'rules'} onClick={() => setTab('rules')} icon={<Shield className="w-4 h-4" />}>
          {t('alertRules.tabRules')} <span className="ml-1.5 text-xs opacity-70">({rules.length})</span>
        </TabButton>
        <TabButton active={tab === 'triggered'} onClick={() => setTab('triggered')} icon={<Activity className="w-4 h-4" />}>
          {t('alertRules.tabTriggered')}
          {liveCount > 0 && tab !== 'triggered' && (
            <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {liveCount} {t('alertRules.newBadge')}
            </span>
          )}
        </TabButton>
      </div>

      {tab === 'rules' && (
        <>
          {/* Actionable Stats (A-004) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatTile
              icon={<Shield className="w-5 h-5 text-blue-400" />}
              label={t('alertRules.statActive')}
              value={`${stats.active}/${stats.total}`}
              hint={stats.active === 0 ? t('alertRules.statActiveHintNone') : `${stats.total - stats.active} ${t('alertRules.statActiveHintSome')}`}
              tone="blue"
            />
            <StatTile
              icon={<Flame className="w-5 h-5 text-amber-400" />}
              label={t('alertRules.statFired')}
              value={String(stats.firedTodayCount)}
              hint={stats.hotToday ? `${t('alertRules.statFiredHot')} ${stats.hotToday.name}` : t('alertRules.statFiredQuiet')}
              tone="amber"
              onClick={stats.firedTodayCount > 0 ? () => setTab('triggered') : undefined}
            />
            <StatTile
              icon={<Snowflake className="w-5 h-5 text-rose-400" />}
              label={t('alertRules.statStale')}
              value={String(stats.stale.length)}
              hint={stats.stale.length > 0 ? t('alertRules.statStaleReview') : t('alertRules.statStaleNone')}
              tone="rose"
              onClick={
                stats.stale.length > 0
                  ? () => { setFilterStatus('stale'); setTab('rules') }
                  : undefined
              }
            />
            <StatTile
              icon={<Layers className="w-5 h-5 text-violet-400" />}
              label={t('alertRules.statOverlap')}
              value={String(stats.overlapping)}
              hint={stats.overlapping > 0 ? t('alertRules.statOverlapSome') : t('alertRules.statOverlapNone')}
              tone="violet"
            />
          </div>

          {/* Search + Filter + Sort (A-010) */}
          <div className="glass-card p-3 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder={t('alertRules.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{
                  backgroundColor: 'var(--color-bg-tertiary)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>
            <SelectFilter
              value={filterSeverity}
              onChange={setFilterSeverity}
              options={[
                { v: 'all', label: t('alertRules.allSeverities') },
                { v: 'critical', label: t('severity.critical') },
                { v: 'high', label: t('severity.high') },
                { v: 'medium', label: t('severity.medium') },
                { v: 'low', label: t('severity.low') },
              ]}
            />
            <SelectFilter
              value={filterStatus}
              onChange={(v) => setFilterStatus(v as 'all' | 'enabled' | 'disabled' | 'stale')}
              options={[
                { v: 'all', label: t('alertRules.allStates') },
                { v: 'enabled', label: t('alertRules.enabledOnly') },
                { v: 'disabled', label: t('alertRules.disabledOnly') },
                { v: 'stale', label: `${t('alertRules.staleFilter')} (${stats.stale.length})` },
              ]}
            />
            <SelectFilter
              value={sortBy}
              onChange={(v) => setSortBy(v as typeof sortBy)}
              options={[
                { v: 'last_triggered', label: t('alertRules.sortLastTriggered') },
                { v: 'trigger_count', label: t('alertRules.sortTriggerCount') },
                { v: 'name', label: t('alertRules.sortName') },
                { v: 'created', label: t('alertRules.sortCreated') },
              ]}
            />
            {(search || filterSeverity !== 'all' || filterStatus !== 'all') && (
              <button
                onClick={() => { setSearch(''); setFilterSeverity('all'); setFilterStatus('all') }}
                className="px-3 py-2 text-xs rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/40"
              >
                {t('common.clear')}
              </button>
            )}
            <div className="text-xs text-slate-500 ml-auto">
              {t('alertRules.showing')} {visibleRules.length} {t('alertRules.of')} {rules.length}
            </div>
          </div>

          {showForm && (
            <AlertRuleForm
              rule={editingRule}
              onSubmit={editingRule?.id ? (data) => handleUpdate(editingRule.id, data) : handleCreate}
              onCancel={() => { setShowForm(false); setEditingRule(null) }}
            />
          )}

          {visibleRules.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <Shield className="w-16 h-16 mx-auto mb-4 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
              <p className="text-lg font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>
                {rules.length === 0 ? t('alertRules.emptyTitle') : t('alertRules.noMatchTitle')}
              </p>
              <p className="mb-4" style={{ color: 'var(--color-text-muted)' }}>
                {rules.length === 0 ? t('alertRules.emptyText') : t('alertRules.noMatchText')}
              </p>
              {rules.length === 0 && (
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => setShowTemplates(true)}
                    className="px-4 py-2 rounded-lg transition-colors"
                    style={{
                      backgroundColor: 'var(--color-bg-secondary)',
                      color: 'var(--color-text-primary)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    {t('alertRules.browseTemplates')}
                  </button>
                  <button
                    onClick={() => setShowForm(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {t('alertRules.createRule')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {visibleRules.map((rule) => {
                const recency = gradeRecency(rule.last_triggered, rule.enabled)
                const stale = isStaleEnabled(rule)
                const overlapping = overlapMap.get(rule.id)
                const justFired = recentlyTriggered.has(rule.id)
                return (
                  <div
                    key={rule.id}
                    onClick={() => { setDetailRule(rule); setDetailPanelOpen(true) }}
                    className={clsx(
                      'glass-card overflow-hidden transition-all cursor-pointer',
                      'hover:ring-1 hover:ring-slate-600/60',
                      detailRule?.id === rule.id && detailPanelOpen && 'ring-1 ring-blue-500/50',
                      justFired && 'ring-1 ring-emerald-500/50 shadow-emerald-500/10 shadow-lg',
                      !rule.enabled && 'opacity-60',
                      stale && 'border border-rose-500/30'
                    )}
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          {/* Title row */}
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            {justFired && (
                              <span
                                title={t('alertRules.justTriggered')}
                                className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"
                              />
                            )}
                            <h3 className="font-semibold text-lg" style={{ color: 'var(--color-text-primary)' }}>
                              {rule.name}
                            </h3>
                            <SeverityBadge severity={rule.severity as 'critical' | 'high' | 'medium' | 'low'} size="sm" />
                            <span
                              className={clsx(
                                'text-xs px-2 py-0.5 rounded',
                                rule.enabled
                                  ? 'bg-green-600/20 text-green-400'
                                  : 'bg-gray-600/20 text-gray-400'
                              )}
                            >
                              {rule.enabled ? t('alertRules.active') : t('alertRules.disabled')}
                            </span>
                            {stale && (
                              <span
                                title={t('alertRules.staleTooltip')}
                                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30"
                              >
                                <Snowflake size={10} /> {t('alertRules.stale')}
                              </span>
                            )}
                            {overlapping && (
                              <span
                                title={t('alertRules.overlapTooltip')}
                                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30"
                              >
                                <Layers size={10} /> {t('alertRules.overlap')} × {overlapping.length}
                              </span>
                            )}
                          </div>

                          {/* Natural-language condition (A-007) */}
                          <p
                            className="text-sm mb-2"
                            style={{ color: 'var(--color-text-primary)' }}
                          >
                            {describeCondition(rule.condition as Record<string, unknown>, t)}
                          </p>
                          {rule.description && (
                            <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                              {rule.description}
                            </p>
                          )}

                          <div className="flex flex-wrap gap-4 text-sm items-center">
                            <div className="flex items-center gap-2">
                              <span style={{ color: 'var(--color-text-muted)' }}>{t('alertRules.actionLabel')}</span>
                              <span className="flex items-center gap-1.5">
                                {getActionIcon(rule.action)}
                                <span className="capitalize" style={{ color: 'var(--color-text-primary)' }}>
                                  {rule.action}
                                </span>
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span style={{ color: 'var(--color-text-muted)' }}>{t('alertRules.triggeredLabel')}</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); gotoEventsForRule(rule) }}
                                className="font-semibold inline-flex items-center gap-1 hover:underline"
                                style={{ color: 'var(--color-text-primary)' }}
                                title={t('alertRules.viewMatchingEvents')}
                              >
                                {rule.trigger_count || 0}×
                                <ArrowUpRight size={12} />
                              </button>
                              <span
                                className={clsx(
                                  'flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
                                  RECENCY_STYLE[recency]
                                )}
                                title={rule.last_triggered ? fmtDateTime(rule.last_triggered) : t('ruleForm.neverTriggered')}
                              >
                                <Clock size={11} />
                                {rule.last_triggered ? timeAgo(rule.last_triggered) : t('common.never')}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleRuleExpand(rule.id) }}
                            className="p-2 rounded-lg transition-colors hover:bg-slate-700/50"
                            title={t('alertRules.expandDetails')}
                          >
                            {expandedRules.has(rule.id) ? (
                              <ChevronUp className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
                            ) : (
                              <ChevronDown className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
                            )}
                          </button>
                          {canManageRules && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleEdit(rule) }}
                                className="p-2 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors"
                                title={t('alertRules.edit')}
                              >
                                <Edit2 className="w-5 h-5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDuplicate(rule) }}
                                className="p-2 rounded-lg bg-slate-600/20 hover:bg-slate-600/30 transition-colors"
                                style={{ color: 'var(--color-text-muted)' }}
                                title={t('alertRules.duplicate')}
                              >
                                <Copy className="w-5 h-5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleToggle(rule.id) }}
                                className={clsx(
                                  'p-2 rounded-lg transition-colors',
                                  rule.enabled
                                    ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                                    : 'bg-gray-600/20 text-gray-400 hover:bg-gray-600/30'
                                )}
                                title={rule.enabled ? t('alertRules.disable') : t('alertRules.enable')}
                              >
                                {rule.enabled ? <Power className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(rule.id) }}
                                className="p-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
                                title={t('alertRules.delete')}
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {expandedRules.has(rule.id) && (
                      <div className="px-4 pb-4 pt-0 border-t" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
                          <Field label={t('alertRules.created')} value={fmtDateTime(rule.created_at)} />
                          <Field
                            label={t('alertRules.lastTriggered')}
                            value={rule.last_triggered ? fmtDateTime(rule.last_triggered) : t('panel.never')}
                          />
                          <Field
                            label={t('alertRules.eventType')}
                            value={formatEventType(((rule.condition as Record<string, string>)?.event_type) || 'any')}
                          />
                          <Field
                            label={t('alertRules.source')}
                            value={formatSource(((rule.condition as Record<string, string>)?.source) || 'any')}
                          />
                        </div>

                        {overlapping && overlapping.length > 1 && (
                          <div className="mt-4 p-3 rounded-lg bg-violet-500/10 border border-violet-500/30">
                            <p className="text-xs font-medium text-violet-300 mb-1.5">
                              <Layers className="w-3.5 h-3.5 inline mr-1" />
                              {t('alertRules.sameConditionAs')}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {overlapping
                                .filter((r) => r.id !== rule.id)
                                .map((r) => (
                                  <span
                                    key={r.id}
                                    className="px-2 py-0.5 rounded text-xs bg-violet-500/15 text-violet-200 border border-violet-500/20"
                                  >
                                    {r.name}
                                  </span>
                                ))}
                            </div>
                          </div>
                        )}

                        {rule.action_config && Object.keys(rule.action_config).length > 0 && (
                          <div className="mt-4">
                            <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
                              {t('alertRules.actionConfig')}
                            </p>
                            <pre
                              className="text-xs p-2 rounded overflow-x-auto"
                              style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)' }}
                            >
                              {JSON.stringify(rule.action_config, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {tab === 'triggered' && (
        <TriggeredTab onClearLive={() => setLiveCount(0)} liveCount={liveCount} />
      )}

      <AlertRuleDetailPanel
        rule={detailRule}
        isOpen={detailPanelOpen}
        onClose={() => setDetailPanelOpen(false)}
        onToggle={handleToggle}
        onEdit={(rule) => { handleEdit(rule); setDetailPanelOpen(false) }}
        onDelete={handleDelete}
        onDuplicate={(rule) => { handleDuplicate(rule); setDetailPanelOpen(false) }}
        canManage={canManageRules}
      />
    </div>
  )
}

// ── Small UI helpers ─────────────────────────────────────────────────────────
function TabButton({
  active, onClick, icon, children,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
        active
          ? 'border-blue-500 text-blue-300'
          : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function StatTile({
  icon, label, value, hint, tone, onClick,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  tone: 'blue' | 'amber' | 'rose' | 'violet'
  onClick?: () => void
}) {
  const toneBg: Record<typeof tone, string> = {
    blue: 'bg-blue-600/20', amber: 'bg-amber-600/20', rose: 'bg-rose-600/20', violet: 'bg-violet-600/20',
  }
  return (
    <div
      onClick={onClick}
      className={clsx(
        'glass-card p-4 transition-colors',
        onClick && 'cursor-pointer hover:ring-1 hover:ring-slate-600/60'
      )}
    >
      <div className="flex items-center gap-3">
        <div className={clsx('p-2 rounded-lg', toneBg[tone])}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-bold leading-tight" style={{ color: 'var(--color-text-primary)' }}>
            {value}
          </p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
          {hint && (
            <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }} title={hint}>
              {hint}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function SelectFilter({
  value, onChange, options,
}: { value: string; onChange: (v: string) => void; options: Array<{ v: string; label: string }> }) {
  return (
    <CustomSelect
      value={value}
      onChange={onChange}
      options={options.map((o) => ({ value: o.v, label: o.label }))}
    />
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
      <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{value}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Triggered Tab (A-002)
// ─────────────────────────────────────────────────────────────────────────────
function TriggeredTab({ onClearLive, liveCount }: { onClearLive: () => void; liveCount: number }) {
  const navigate = useNavigate()
  const { socket } = useSocket()
  const { t } = useLanguage()
  const [hours, setHours] = useState<number>(24)
  const [data, setData] = useState<{
    instances: TriggeredInstance[]
    summary: TriggeredSummary[]
    total: number
  } | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      setLoading(true)
      const res = await fetchTriggeredAlerts({ hours, limit: 200 })
      setData({ instances: res.instances, summary: res.summary, total: res.total })
      onClearLive()
    } catch (e) {
      console.error('Failed to load triggered alerts:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [hours])
  useEffect(() => {
    if (!socket) return
    const handler = () => { load() }
    socket.on('rule_triggered', handler)
    return () => { socket.off('rule_triggered', handler) }
  }, [socket, hours])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {t('triggered.title')}
          </h2>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {t('triggered.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {liveCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              <Radio className="w-3 h-3 animate-pulse" /> {t('triggered.live')}
            </span>
          )}
          <SelectFilter
            value={String(hours)}
            onChange={(v) => setHours(Number(v))}
            options={[
              { v: '1', label: t('triggered.last1h') },
              { v: '24', label: t('triggered.last24h') },
              { v: '168', label: t('triggered.last7d') },
              { v: '720', label: t('triggered.last30d') },
            ]}
          />
        </div>
      </div>

      {loading ? (
        <div className="glass-card p-12 text-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          {t('triggered.loading')}
        </div>
      ) : !data || data.total === 0 ? (
        <div className="glass-card p-12 text-center">
          <Activity className="w-16 h-16 mx-auto mb-4 opacity-20 text-slate-500" />
          <p className="text-lg font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>
            {t('triggered.emptyTitle')}
          </p>
          <p style={{ color: 'var(--color-text-muted)' }}>
            {t('triggered.emptyText')}
          </p>
        </div>
      ) : (
        <>
          {/* Per-rule summary */}
          <div className="glass-card p-4">
            <p className="text-xs uppercase tracking-wider mb-3 text-slate-400">
              {t('triggered.perRule')} ({data.summary.length} {data.summary.length === 1 ? t('triggered.rule') : t('triggered.rules')})
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {data.summary
                .slice()
                .sort((a, b) => b.fired_count - a.fired_count)
                .map((s) => (
                  <div
                    key={s.rule_id}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-900/40 border border-slate-700/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {s.rule_name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {t('triggered.last')} {s.last_fired ? timeAgo(s.last_fired) : '—'}
                      </p>
                    </div>
                    <span className="ml-3 px-2 py-1 rounded text-sm font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {s.fired_count}×
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* Incident timeline */}
          <div className="glass-card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/40 flex items-center justify-between">
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {t('triggered.timeline')}
              </p>
              <p className="text-xs text-slate-500">{data.instances.length} {t('triggered.incidents')}</p>
            </div>
            <div className="divide-y divide-slate-700/40">
              {data.instances.map((inc) => (
                <button
                  key={inc.incident_id}
                  onClick={() => navigate('/incidents', { state: { incident_id: inc.incident_id, severity: inc.incident_severity } })}
                  className="w-full text-left p-4 hover:bg-slate-800/40 transition-colors flex items-center gap-4"
                >
                  <div className="shrink-0">
                    <SeverityBadge severity={inc.incident_severity as 'critical' | 'high' | 'medium' | 'low'} size="sm" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                      {inc.incident_title}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {t('triggered.ruleLabel')} <span className="text-slate-300">{inc.rule_name}</span>
                      {' · '}
                      {inc.event_count} {inc.event_count === 1 ? t('triggered.event') : t('triggered.events')}
                      {' · '}
                      {t('triggered.statusLabel')} <span className="capitalize">{inc.incident_status}</span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-slate-300">
                      {inc.created_at ? timeAgo(inc.created_at) : '—'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {inc.created_at ? fmtDateTime(inc.created_at) : ''}
                    </p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-slate-500 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert Rule Form (with dry-run preview, A-009)
// ─────────────────────────────────────────────────────────────────────────────
interface AlertRuleFormProps {
  rule?: AlertRule | null
  onSubmit: (data: Partial<AlertRule>) => void
  onCancel: () => void
}

function AlertRuleForm({ rule, onSubmit, onCancel }: AlertRuleFormProps) {
  const { t } = useLanguage()
  const isEditing = !!rule?.id

  const [name, setName] = useState(rule?.name || '')
  const [description, setDescription] = useState(rule?.description || '')
  const [eventType, setEventType] = useState<string>((rule?.condition?.event_type as string) || 'any')
  const [source, setSource] = useState<string>((rule?.condition?.source as string) || 'any')
  const [count, setCount] = useState<number>(Number(rule?.condition?.count) || 5)
  const [timeframe, setTimeframe] = useState<string>((rule?.condition?.timeframe as string) || '10m')
  const [action, setAction] = useState<'log' | 'email' | 'webhook'>(
    (rule?.action as 'log' | 'email' | 'webhook') || 'log'
  )
  const [severity, setSeverity] = useState<string>(rule?.severity || 'high')

  const initialRecipients = Array.isArray((rule?.action_config as Record<string, unknown>)?.recipients)
    ? ((rule!.action_config as Record<string, unknown>).recipients as string[]).join(', ')
    : ''
  const initialWebhook = typeof (rule?.action_config as Record<string, unknown>)?.webhook_url === 'string'
    ? ((rule!.action_config as Record<string, unknown>).webhook_url as string)
    : ''

  const [emailRecipients, setEmailRecipients] = useState<string>(initialRecipients)
  const [webhookUrl, setWebhookUrl] = useState<string>(initialWebhook)

  // Dry-run preview (A-009)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<AlertTestResult | null>(null)
  const [testHours, setTestHours] = useState<number>(24)
  const [testError, setTestError] = useState<string | null>(null)

  async function runDryRun() {
    setTestError(null)
    setTesting(true)
    try {
      const res = await testAlertCondition(
        { event_type: eventType, source, count, timeframe },
        testHours
      )
      setTestResult(res)
    } catch (e) {
      setTestError(e instanceof Error ? e.message : t('ruleForm.testFailed'))
    } finally {
      setTesting(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const actionConfig: Record<string, unknown> = {}
    if (action === 'email' && emailRecipients) {
      actionConfig.recipients = emailRecipients.split(',').map((s) => s.trim()).filter(Boolean)
    }
    if (action === 'webhook' && webhookUrl) {
      actionConfig.webhook_url = webhookUrl
    }
    onSubmit({
      name,
      description,
      condition: { event_type: eventType, source, count, timeframe },
      action,
      action_config: actionConfig,
      severity,
      enabled: rule?.enabled ?? true,
    })
  }

  const previewSentence = describeCondition({ event_type: eventType, source, count, timeframe, severity }, t)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="rounded-lg w-full max-w-xl max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
      >
        <div
          className="sticky top-0 flex items-center justify-between p-4 border-b z-10"
          style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}
        >
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {isEditing ? t('ruleForm.editTitle') : t('ruleForm.newTitle')}
          </h2>
          <button onClick={onCancel} className="p-2 rounded-lg hover:bg-slate-700/50 transition-colors">
            <X className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
              {t('ruleForm.name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{
                backgroundColor: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
              placeholder={t('ruleForm.namePlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
              {t('ruleForm.description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              style={{
                backgroundColor: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
              placeholder={t('ruleForm.descriptionPlaceholder')}
            />
          </div>

          <div className="space-y-4">
            <h3 className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>
              {t('ruleForm.triggerCondition')}
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  {t('ruleForm.eventType')}
                </label>
                <CustomSelect
                  value={eventType}
                  onChange={(v) => { setEventType(v); setTestResult(null) }}
                  options={EVENT_TYPES.map((opt) => ({ value: opt.value, label: opt.label }))}
                />
              </div>

              <div>
                <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  {t('ruleForm.source')}
                </label>
                <CustomSelect
                  value={source}
                  onChange={(v) => { setSource(v); setTestResult(null) }}
                  options={EVENT_SOURCES.map((s) => ({ value: s.value, label: s.label }))}
                />
              </div>
            </div>

            <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
              <p style={{ color: 'var(--color-text-muted)' }}>
                {t('ruleForm.alertWhen')}
                <input
                  type="number"
                  value={count}
                  onChange={(e) => { setCount(parseInt(e.target.value) || 1); setTestResult(null) }}
                  min={1}
                  className="w-16 mx-2 px-2 py-1 rounded text-center"
                  style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                />
                {t('ruleForm.orMoreWithin')}
                <span className="inline-block ml-2 align-middle">
                  <CustomSelect
                    value={timeframe}
                    onChange={(v) => { setTimeframe(v); setTestResult(null) }}
                    options={[
                      { value: '1m', label: t('ruleForm.tf1m') },
                      { value: '5m', label: t('ruleForm.tf5m') },
                      { value: '10m', label: t('ruleForm.tf10m') },
                      { value: '30m', label: t('ruleForm.tf30m') },
                      { value: '1h', label: t('ruleForm.tf1h') },
                      { value: '24h', label: t('ruleForm.tf24h') },
                    ]}
                  />
                </span>
              </p>
              <p className="mt-2 pt-2 border-t border-slate-700/40 text-xs italic" style={{ color: 'var(--color-text-primary)' }}>
                "{previewSentence}"
              </p>
            </div>

            {/* Dry-run (A-009) */}
            <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm font-medium text-violet-200">
                  <FlaskConical className="w-4 h-4" />
                  {t('ruleForm.testTitle')}
                </div>
                <div className="flex items-center gap-2">
                  <CustomSelect
                    value={String(testHours)}
                    onChange={(v) => setTestHours(Number(v))}
                    options={[
                      { value: '1', label: t('ruleForm.testHours1') },
                      { value: '24', label: t('ruleForm.testHours24') },
                      { value: '168', label: t('ruleForm.testHours168') },
                    ]}
                  />
                  <button
                    type="button"
                    onClick={runDryRun}
                    disabled={testing}
                    className="px-3 py-1 text-xs rounded bg-violet-600/80 text-white hover:bg-violet-600 disabled:opacity-60 inline-flex items-center gap-1.5"
                  >
                    {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <FlaskConical className="w-3 h-3" />}
                    {t('ruleForm.dryRun')}
                  </button>
                </div>
              </div>
              {testError && (
                <p className="text-xs text-rose-300">{testError}</p>
              )}
              {testResult && (
                <div className="text-xs space-y-2">
                  <div className="flex items-center gap-3">
                    {testResult.would_fire ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3" /> {t('ruleForm.wouldFire')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-700/50 text-slate-300 border border-slate-600/40">
                        <XCircle className="w-3 h-3" /> {t('ruleForm.wouldNotFire')}
                      </span>
                    )}
                    <span className="text-slate-300">
                      {testResult.matched} {t('ruleForm.matchingEventsThreshold')} {testResult.threshold}
                    </span>
                  </div>
                  {testResult.samples.length > 0 ? (
                    <div className="bg-slate-900/40 rounded p-2 space-y-1">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">{t('ruleForm.recentSamples')}</p>
                      {testResult.samples.map((s) => (
                        <div key={s.id} className="flex items-center gap-2 text-[11px] text-slate-300">
                          <span className="text-slate-500 shrink-0">{new Date(s.timestamp).toLocaleTimeString()}</span>
                          <SeverityBadge severity={s.severity as 'critical' | 'high' | 'medium' | 'low'} size="sm" />
                          <span className="truncate">{s.event_type} — {s.description}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400 italic">
                      {t('ruleForm.noMatches')}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
              {t('ruleForm.severity')}
            </label>
            <div className="flex gap-2">
              {['critical', 'high', 'medium', 'low'].map((sev) => (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setSeverity(sev)}
                  className={clsx(
                    'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors capitalize',
                    severity === sev ? 'ring-2 ring-offset-2 ring-offset-slate-900' : 'opacity-60 hover:opacity-80'
                  )}
                  style={{
                    backgroundColor:
                      sev === 'critical' ? 'rgba(239, 68, 68, 0.2)' :
                      sev === 'high'     ? 'rgba(249, 115, 22, 0.2)' :
                      sev === 'medium'   ? 'rgba(234, 179, 8, 0.2)' :
                                           'rgba(59, 130, 246, 0.2)',
                    color:
                      sev === 'critical' ? '#ef4444' :
                      sev === 'high'     ? '#f97316' :
                      sev === 'medium'   ? '#eab308' :
                                           '#3b82f6',
                  }}
                >
                  {t(`severity.${sev}`)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
              {t('ruleForm.action')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'log',     label: t('ruleForm.actionLog'), icon: FileText },
                { value: 'email',   label: t('ruleForm.actionEmail'),    icon: Mail },
                { value: 'webhook', label: t('ruleForm.actionWebhook'),  icon: Webhook },
              ].map((act) => (
                <button
                  key={act.value}
                  type="button"
                  onClick={() => setAction(act.value as 'log' | 'email' | 'webhook')}
                  className={clsx(
                    'flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                    action === act.value ? 'bg-blue-600 text-white' : 'hover:bg-slate-700/50'
                  )}
                  style={
                    action !== act.value
                      ? {
                          backgroundColor: 'var(--color-bg-tertiary)',
                          color: 'var(--color-text-primary)',
                        }
                      : undefined
                  }
                >
                  <act.icon className="w-4 h-4" />
                  {act.label}
                </button>
              ))}
            </div>
          </div>

          {action === 'email' && (
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>
                {t('ruleForm.emailRecipients')}
              </label>
              <input
                type="text"
                value={emailRecipients}
                onChange={(e) => setEmailRecipients(e.target.value)}
                className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{
                  backgroundColor: 'var(--color-bg-tertiary)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
                placeholder={t('ruleForm.emailPlaceholder')}
              />
            </div>
          )}

          {action === 'webhook' && (
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>
                {t('ruleForm.webhookUrl')}
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{
                  backgroundColor: 'var(--color-bg-tertiary)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
                placeholder={t('ruleForm.webhookPlaceholder')}
              />
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 rounded-lg transition-colors"
              style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)' }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {isEditing ? t('ruleForm.updateRule') : t('ruleForm.createRule')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
