import { useEffect, useState } from 'react'
import { Plus, Trash2, Power, PowerOff, Edit2, Copy, AlertTriangle, Shield, Mail, Webhook, FileText, X, ChevronDown, ChevronUp } from 'lucide-react'
import { fetchAlertRules, createAlertRule, deleteAlertRule, toggleAlertRule, updateAlertRule } from '../api'
import { AlertRule } from '../types'
import SeverityBadge from '../components/SeverityBadge'
import AlertRuleDetailPanel from '../components/AlertRuleDetailPanel'
import { useRole } from '../context/RoleContext'
import { fmtDateTime } from '../utils/dateFormat'
import clsx from 'clsx'
import { EVENT_SOURCES, EVENT_TYPES, formatCondition as fmtCondition, formatTimeframe } from '../utils/alertRuleFormatters'

// Rule templates for quick setup
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

export default function Alerts() {
  const { canManageRules } = useRole()
  const [rules, setRules] = useState<AlertRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set())
  const [detailRule, setDetailRule] = useState<AlertRule | null>(null)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)

  useEffect(() => {
    loadRules()
  }, [])

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
    if (!confirm('Delete this alert rule?')) return
    try {
      await deleteAlertRule(id)
      setRules(rules.filter((r) => r.id !== id))
    } catch (error) {
      console.error('Failed to delete rule:', error)
    }
  }

  async function handleToggle(id: string) {
    try {
      const updated = await toggleAlertRule(id)
      setRules(rules.map((r) => (r.id === id ? updated : r)))
    } catch (error) {
      console.error('Failed to toggle rule:', error)
    }
  }

  async function handleCreate(data: Partial<AlertRule>) {
    try {
      const newRule = await createAlertRule(data as any)
      setRules([newRule, ...rules])
      setShowForm(false)
    } catch (error) {
      console.error('Failed to create rule:', error)
    }
  }

  async function handleUpdate(id: string, data: Partial<AlertRule>) {
    try {
      const updated = await updateAlertRule(id, data)
      setRules(rules.map((r) => (r.id === id ? updated : r)))
      setEditingRule(null)
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
      last_triggered: null,
      created_at: new Date().toISOString(),
    } as AlertRule)
    setShowTemplates(false)
    setShowForm(true)
  }

  function toggleRuleExpand(id: string) {
    const newExpanded = new Set(expandedRules)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRules(newExpanded)
  }

  function getActionIcon(action: string) {
    switch (action) {
      case 'email': return <Mail className="w-4 h-4" />
      case 'webhook': return <Webhook className="w-4 h-4" />
      default: return <FileText className="w-4 h-4" />
    }
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
            Alert Rules Engine
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Configure automated alerts based on security events
          </p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)'
              }}
            >
              <Shield className="w-4 h-4" />
              Templates
              <ChevronDown className={clsx('w-4 h-4 transition-transform', showTemplates && 'rotate-180')} />
            </button>

            {showTemplates && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowTemplates(false)} />
                <div
                  className="absolute right-0 top-full mt-2 w-80 rounded-lg shadow-xl z-20 overflow-hidden"
                  style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)'
                  }}
                >
                  <div className="p-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <p className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      Quick Start Templates
                    </p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      Pre-configured rules for common scenarios
                    </p>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {RULE_TEMPLATES.map((template, i) => (
                      <button
                        key={i}
                        onClick={() => handleTemplateSelect(template)}
                        className="w-full p-3 text-left hover:bg-slate-700/50 transition-colors border-b last:border-b-0"
                        style={{ borderColor: 'var(--color-border)' }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>
                            {template.name}
                          </span>
                          <SeverityBadge severity={template.severity as any} size="sm" />
                        </div>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {template.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {canManageRules && (
            <button
              onClick={() => {
                setEditingRule(null)
                setShowForm(true)
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Rule
            </button>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 rounded-lg">
              <Shield className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {rules.length}
              </p>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Total Rules</p>
            </div>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-600/20 rounded-lg">
              <Power className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {rules.filter(r => r.enabled).length}
              </p>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Active</p>
            </div>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-600/20 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {rules.filter(r => r.severity === 'critical').length}
              </p>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Critical Rules</p>
            </div>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-600/20 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {rules.reduce((sum, r) => sum + r.trigger_count, 0)}
              </p>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Total Triggers</p>
            </div>
          </div>
        </div>
      </div>

      {/* Create/Edit Form Modal */}
      {showForm && (
        <AlertRuleForm
          rule={editingRule}
          onSubmit={editingRule?.id ? (data) => handleUpdate(editingRule.id, data) : handleCreate}
          onCancel={() => {
            setShowForm(false)
            setEditingRule(null)
          }}
        />
      )}

      {/* Rules List */}
      {rules.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Shield className="w-16 h-16 mx-auto mb-4 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
          <p className="text-lg font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>
            No alert rules configured
          </p>
          <p className="mb-4" style={{ color: 'var(--color-text-muted)' }}>
            Create your first rule or start from a template
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setShowTemplates(true)}
              className="px-4 py-2 rounded-lg transition-colors"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)'
              }}
            >
              Browse Templates
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create Rule
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              onClick={() => { setDetailRule(rule); setDetailPanelOpen(true) }}
              className={clsx(
                'glass-card overflow-hidden transition-all cursor-pointer',
                'hover:ring-1 hover:ring-slate-600/60',
                detailRule?.id === rule.id && detailPanelOpen && 'ring-1 ring-blue-500/50',
                !rule.enabled && 'opacity-60'
              )}
            >
              {/* Main Rule Info */}
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg" style={{ color: 'var(--color-text-primary)' }}>
                        {rule.name}
                      </h3>
                      <SeverityBadge severity={rule.severity as any} size="sm" />
                      <span
                        className={clsx(
                          'text-xs px-2 py-0.5 rounded',
                          rule.enabled
                            ? 'bg-green-600/20 text-green-400'
                            : 'bg-gray-600/20 text-gray-400'
                        )}
                      >
                        {rule.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </div>

                    {rule.description && (
                      <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>
                        {rule.description}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <span style={{ color: 'var(--color-text-muted)' }}>Condition:</span>
                        <span className="px-2 py-0.5 rounded text-blue-400" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
                          {fmtCondition(rule.condition as Record<string, unknown>)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span style={{ color: 'var(--color-text-muted)' }}>Action:</span>
                        <span className="flex items-center gap-1.5">
                          {getActionIcon(rule.action)}
                          <span className="capitalize" style={{ color: 'var(--color-text-primary)' }}>
                            {rule.action}
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span style={{ color: 'var(--color-text-muted)' }}>Triggered:</span>
                        <span style={{ color: 'var(--color-text-primary)' }}>
                          {rule.trigger_count} times
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleRuleExpand(rule.id) }}
                      className="p-2 rounded-lg transition-colors hover:bg-slate-700/50"
                      title="Expand details"
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
                          title="Edit"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDuplicate(rule) }}
                          className="p-2 rounded-lg bg-slate-600/20 hover:bg-slate-600/30 transition-colors"
                          style={{ color: 'var(--color-text-muted)' }}
                          title="Duplicate"
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
                          title={rule.enabled ? 'Disable' : 'Enable'}
                        >
                          {rule.enabled ? (
                            <Power className="w-5 h-5" />
                          ) : (
                            <PowerOff className="w-5 h-5" />
                          )}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(rule.id) }}
                          className="p-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedRules.has(rule.id) && (
                <div
                  className="px-4 pb-4 pt-0 border-t"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
                    <div>
                      <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                        Created
                      </p>
                      <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                        {fmtDateTime(rule.created_at)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                        Last Triggered
                      </p>
                      <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                        {rule.last_triggered
                          ? fmtDateTime(rule.last_triggered)
                          : 'Never'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                        Event Type Filter
                      </p>
                      <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                        {EVENT_TYPES.find(e => e.value === rule.condition?.event_type)?.label || 'Any'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                        Source Filter
                      </p>
                      <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                        {EVENT_SOURCES.find(s => s.value === rule.condition?.source)?.label || 'Any'}
                      </p>
                    </div>
                  </div>

                  {rule.action_config && Object.keys(rule.action_config).length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
                        Action Configuration
                      </p>
                      <pre
                        className="text-xs p-2 rounded overflow-x-auto"
                        style={{
                          backgroundColor: 'var(--color-bg-tertiary)',
                          color: 'var(--color-text-primary)'
                        }}
                      >
                        {JSON.stringify(rule.action_config, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
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

interface AlertRuleFormProps {
  rule?: AlertRule | null
  onSubmit: (data: Partial<AlertRule>) => void
  onCancel: () => void
}

function AlertRuleForm({ rule, onSubmit, onCancel }: AlertRuleFormProps) {
  const isEditing = rule?.id ? true : false

  const [name, setName] = useState(rule?.name || '')
  const [description, setDescription] = useState(rule?.description || '')
  const [eventType, setEventType] = useState(rule?.condition?.event_type || 'any')
  const [source, setSource] = useState(rule?.condition?.source || 'any')
  const [count, setCount] = useState(rule?.condition?.count || 5)
  const [timeframe, setTimeframe] = useState(rule?.condition?.timeframe || '10m')
  const [action, setAction] = useState<'log' | 'email' | 'webhook'>(rule?.action as any || 'log')
  const [severity, setSeverity] = useState(rule?.severity || 'high')
  const [emailRecipients, setEmailRecipients] = useState(
    rule?.action_config?.recipients?.join(', ') || ''
  )
  const [webhookUrl, setWebhookUrl] = useState(rule?.action_config?.webhook_url || '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const actionConfig: any = {}
    if (action === 'email' && emailRecipients) {
      actionConfig.recipients = emailRecipients.split(',').map(e => e.trim()).filter(Boolean)
    }
    if (action === 'webhook' && webhookUrl) {
      actionConfig.webhook_url = webhookUrl
    }

    onSubmit({
      name,
      description,
      condition: {
        event_type: eventType,
        source,
        count,
        timeframe,
      },
      action,
      action_config: actionConfig,
      severity,
      enabled: rule?.enabled ?? true,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)'
        }}
      >
        {/* Header */}
        <div
          className="sticky top-0 flex items-center justify-between p-4 border-b"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border)'
          }}
        >
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {isEditing ? 'Edit Alert Rule' : 'New Alert Rule'}
          </h2>
          <button
            onClick={onCancel}
            className="p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            <X className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-5">
          {/* Basic Info */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Rule Name *
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
                color: 'var(--color-text-primary)'
              }}
              placeholder="e.g., Multiple Failed Logins"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              style={{
                backgroundColor: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)'
              }}
              placeholder="Describe when this rule should trigger"
            />
          </div>

          {/* Condition Section */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>
              Trigger Condition
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  Event Type
                </label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{
                    backgroundColor: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-primary)'
                  }}
                >
                  {EVENT_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  Source
                </label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{
                    backgroundColor: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-primary)'
                  }}
                >
                  {EVENT_SOURCES.map(src => (
                    <option key={src.value} value={src.value}>{src.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div
              className="p-3 rounded-lg text-sm"
              style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
            >
              <p style={{ color: 'var(--color-text-muted)' }}>
                Alert when
                <input
                  type="number"
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value) || 1)}
                  min={1}
                  className="w-16 mx-2 px-2 py-1 rounded text-center"
                  style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-primary)'
                  }}
                />
                or more matching events occur within
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  className="ml-2 px-2 py-1 rounded"
                  style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-primary)'
                  }}
                >
                  <option value="1m">1 minute</option>
                  <option value="5m">5 minutes</option>
                  <option value="10m">10 minutes</option>
                  <option value="30m">30 minutes</option>
                  <option value="1h">1 hour</option>
                  <option value="24h">24 hours</option>
                </select>
              </p>
            </div>
          </div>

          {/* Severity */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
              Alert Severity
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
                    backgroundColor: sev === 'critical' ? 'rgba(239, 68, 68, 0.2)' :
                                    sev === 'high' ? 'rgba(249, 115, 22, 0.2)' :
                                    sev === 'medium' ? 'rgba(234, 179, 8, 0.2)' :
                                    'rgba(59, 130, 246, 0.2)',
                    color: sev === 'critical' ? '#ef4444' :
                           sev === 'high' ? '#f97316' :
                           sev === 'medium' ? '#eab308' :
                           '#3b82f6',
                    ...(severity === sev && { ringColor: sev === 'critical' ? '#ef4444' :
                                                        sev === 'high' ? '#f97316' :
                                                        sev === 'medium' ? '#eab308' :
                                                        '#3b82f6' })
                  }}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          {/* Action */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
              Action
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'log', label: 'Log Only', icon: FileText },
                { value: 'email', label: 'Email', icon: Mail },
                { value: 'webhook', label: 'Webhook', icon: Webhook },
              ].map((act) => (
                <button
                  key={act.value}
                  type="button"
                  onClick={() => setAction(act.value as any)}
                  className={clsx(
                    'flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                    action === act.value
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-slate-700/50'
                  )}
                  style={action !== act.value ? {
                    backgroundColor: 'var(--color-bg-tertiary)',
                    color: 'var(--color-text-primary)'
                  } : undefined}
                >
                  <act.icon className="w-4 h-4" />
                  {act.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action Config */}
          {action === 'email' && (
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>
                Email Recipients (comma-separated)
              </label>
              <input
                type="text"
                value={emailRecipients}
                onChange={(e) => setEmailRecipients(e.target.value)}
                className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{
                  backgroundColor: 'var(--color-bg-tertiary)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)'
                }}
                placeholder="admin@example.com, security@example.com"
              />
            </div>
          )}

          {action === 'webhook' && (
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>
                Webhook URL
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{
                  backgroundColor: 'var(--color-bg-tertiary)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)'
                }}
                placeholder="https://hooks.slack.com/..."
              />
            </div>
          )}

          {/* Form Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 rounded-lg transition-colors"
              style={{
                backgroundColor: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-primary)'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {isEditing ? 'Update Rule' : 'Create Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
