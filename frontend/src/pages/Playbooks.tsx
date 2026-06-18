import { useState, useEffect } from 'react'
import { useRole } from '../context/RoleContext'
import {
  BookOpen,
  Plus,
  Clock,
  CheckCircle2,
  Play,
  Pause,
  Edit2,
  Trash2,
  X,
  ChevronRight,
  ChevronDown,
  Shield,
  Mail,
  Ban,
  Search,
  FileText,
  Users,
  Zap,
  Copy,
  Eye,
  Archive,
  RotateCcw,
  Activity,
  StopCircle,
  History,
  Loader2,
} from 'lucide-react'
import { toast } from '../components/Toast'
import clsx from 'clsx'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Playbook, PlaybookStep, PlaybookExecution } from '../types'
import { useSocket } from '../hooks/useSocket'
import {
  fetchPlaybooks,
  createPlaybook as apiCreatePlaybook,
  updatePlaybook as apiUpdatePlaybook,
  deletePlaybook as apiDeletePlaybook,
  duplicatePlaybook as apiDuplicatePlaybook,
  togglePlaybook as apiTogglePlaybook,
  archivePlaybook as apiArchivePlaybook,
  executePlaybook as apiExecutePlaybook,
  fetchExecutions,
  updateExecutionStep,
  abortExecution as apiAbortExecution,
  completeExecution as apiCompleteExecution,
} from '../api'

// Action types available for playbook steps
const STEP_TYPES = [
  { value: 'action', label: 'Action', icon: Zap, description: 'Execute an automated action' },
  { value: 'condition', label: 'Condition', icon: Search, description: 'Branch based on conditions' },
  { value: 'notification', label: 'Notification', icon: Mail, description: 'Send notifications' },
  { value: 'manual', label: 'Manual', icon: Users, description: 'Require manual approval' },
]

// Available actions for steps
const AVAILABLE_ACTIONS = [
  { value: 'isolate_host', label: 'Isolate Host', icon: Ban, category: 'containment' },
  { value: 'block_ip', label: 'Block IP Address', icon: Shield, category: 'containment' },
  { value: 'disable_account', label: 'Disable User Account', icon: Users, category: 'containment' },
  { value: 'collect_logs', label: 'Collect System Logs', icon: FileText, category: 'investigation' },
  { value: 'scan_endpoint', label: 'Scan Endpoint', icon: Search, category: 'investigation' },
  { value: 'notify_team', label: 'Notify SOC Team', icon: Mail, category: 'notification' },
  { value: 'create_ticket', label: 'Create Incident Ticket', icon: FileText, category: 'notification' },
  { value: 'restore_backup', label: 'Restore from Backup', icon: RotateCcw, category: 'remediation' },
]

export default function Playbooks() {
  const { socket } = useSocket()
  const { canManagePlaybooks } = useRole()
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [executions, setExecutions] = useState<PlaybookExecution[]>([])
  const [activeExecutions, setActiveExecutions] = useState<PlaybookExecution[]>([])
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null)
  const [selectedExecution, setSelectedExecution] = useState<PlaybookExecution | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingPlaybook, setEditingPlaybook] = useState<Playbook | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(false)

  // Listen to socket for real-time execution updates
  useEffect(() => {
    if (!socket) return

    const handleExecutionUpdate = (updatedExecution: PlaybookExecution) => {
      // Update active executions
      setActiveExecutions(prev => {
        const isCompleted = ['completed', 'failed', 'aborted'].includes(updatedExecution.status)
        if (isCompleted) {
          // It's finished, load history
          setTimeout(loadData, 500)
          return prev.filter(e => e.id !== updatedExecution.id)
        }
        
        const exists = prev.find(e => e.id === updatedExecution.id)
        if (exists) {
          return prev.map(e => e.id === updatedExecution.id ? updatedExecution : e)
        } else {
          return [updatedExecution, ...prev]
        }
      })

      // Update selected execution if it's the one we're viewing
      setSelectedExecution(prev => 
        prev?.id === updatedExecution.id ? updatedExecution : prev
      )
    }

    socket.on('playbook_execution_update', handleExecutionUpdate)
    return () => {
      socket.off('playbook_execution_update', handleExecutionUpdate)
    }
  }, [socket])

  // Load data
  useEffect(() => {
    loadData()
    // Refresh active executions every 5 seconds
    const interval = setInterval(loadActiveExecutions, 5000)
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      const [playbooksRes, executionsRes, activeRes] = await Promise.all([
        fetchPlaybooks(),
        fetchExecutions({ status: undefined }),
        fetchExecutions({ active: 'true' }),
      ])
      setPlaybooks(playbooksRes.playbooks)
      setExecutions(executionsRes.executions)
      setActiveExecutions(activeRes.executions)
    } catch (error) {
      console.error('Failed to load playbooks:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadActiveExecutions() {
    try {
      const res = await fetchExecutions({ active: 'true' })
      setActiveExecutions(res.executions)
    } catch (error) {
      console.error('Failed to load active executions:', error)
    }
  }

  // Filter playbooks
  const filteredPlaybooks = playbooks.filter(pb => {
    if (filterStatus !== 'all' && pb.status !== filterStatus) return false
    if (filterCategory !== 'all' && pb.category !== filterCategory) return false
    if (searchQuery && !pb.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !pb.description.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  // Stats
  const stats = {
    total: playbooks.length,
    active: playbooks.filter(p => p.status === 'active').length,
    totalRuns: playbooks.reduce((sum, p) => sum + p.triggeredCount, 0),
    inProgress: activeExecutions.length,
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this playbook?')) return
    try {
      await apiDeletePlaybook(id)
      setPlaybooks(playbooks.filter(p => p.id !== id))
      if (selectedPlaybook?.id === id) setSelectedPlaybook(null)
    } catch (error) {
      console.error('Failed to delete playbook:', error)
    }
  }

  async function handleDuplicate(playbook: Playbook) {
    try {
      const newPlaybook = await apiDuplicatePlaybook(playbook.id)
      setPlaybooks([newPlaybook, ...playbooks])
    } catch (error) {
      console.error('Failed to duplicate playbook:', error)
    }
  }

  async function handleToggleStatus(id: string) {
    try {
      const updated = await apiTogglePlaybook(id)
      setPlaybooks(playbooks.map(p => p.id === id ? updated : p))
      if (selectedPlaybook?.id === id) setSelectedPlaybook(updated)
    } catch (error) {
      console.error('Failed to toggle playbook:', error)
    }
  }

  async function handleArchive(id: string) {
    try {
      const updated = await apiArchivePlaybook(id)
      setPlaybooks(playbooks.map(p => p.id === id ? updated : p))
      if (selectedPlaybook?.id === id) setSelectedPlaybook(updated)
    } catch (error) {
      console.error('Failed to archive playbook:', error)
    }
  }

  async function handleRun(playbook: Playbook) {
    try {
      const execution = await apiExecutePlaybook(playbook.id, { startedBy: 'analyst' })
      setActiveExecutions([execution, ...activeExecutions])
      setSelectedExecution(execution)
      // Reload playbooks to update stats
      const res = await fetchPlaybooks()
      setPlaybooks(res.playbooks)
    } catch (error) {
      console.error('Failed to run playbook:', error)
    }
  }

  async function handleCreate(data: Partial<Playbook>) {
    try {
      const newPlaybook = await apiCreatePlaybook({
        name: data.name || 'New Playbook',
        description: data.description || '',
        trigger: data.trigger || 'manual',
        triggerConfig: data.triggerConfig || {},
        category: data.category || 'incident',
        steps: data.steps || [],
      })
      setPlaybooks([newPlaybook, ...playbooks])
      setShowForm(false)
    } catch (error) {
      console.error('Failed to create playbook:', error)
    }
  }

  async function handleUpdate(data: Partial<Playbook>) {
    if (!editingPlaybook) return
    try {
      const updated = await apiUpdatePlaybook(editingPlaybook.id, data)
      setPlaybooks(playbooks.map(p => p.id === editingPlaybook.id ? updated : p))
      if (selectedPlaybook?.id === editingPlaybook.id) setSelectedPlaybook(updated)
      setEditingPlaybook(null)
      setShowForm(false)
    } catch (error) {
      console.error('Failed to update playbook:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Playbooks
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Automated response procedures for security incidents
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors',
              showHistory ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            )}
          >
            <History className="w-4 h-4" />
            History
          </button>
          {canManagePlaybooks && (
            <button
              onClick={() => {
                setEditingPlaybook(null)
                setShowForm(true)
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Playbook
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 rounded-lg">
              <BookOpen className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{stats.total}</p>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Total Playbooks</p>
            </div>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-600/20 rounded-lg">
              <Play className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{stats.active}</p>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Active</p>
            </div>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-600/20 rounded-lg">
              <Activity className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{stats.inProgress}</p>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>In Progress</p>
            </div>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600/20 rounded-lg">
              <Zap className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{stats.totalRuns}</p>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Total Executions</p>
            </div>
          </div>
        </div>
      </div>

      {/* Active Executions Widget */}
      {activeExecutions.length > 0 && (
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-5 h-5 text-yellow-400 animate-pulse" />
            <h3 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Active Executions ({activeExecutions.length})
            </h3>
          </div>
          <div className="space-y-2">
            {activeExecutions.map(exec => (
              <div
                key={exec.id}
                onClick={() => setSelectedExecution(exec)}
                className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-slate-700/30 transition-colors"
                style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                  <div>
                    <p className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>
                      {exec.playbookName}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      Step {exec.currentStep + 1} of {exec.stepsData.length} • Started by {exec.startedBy}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {exec.startedAt && format(new Date(exec.startedAt), 'HH:mm')}
                  </span>
                  <ChevronRight className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Execution History */}
      {showHistory && (
        <ExecutionHistory
          executions={executions}
          onSelectExecution={setSelectedExecution}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search playbooks..."
            className="w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)'
            }}
          />
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)'
          }}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)'
          }}
        >
          <option value="all">All Categories</option>
          <option value="incident">Incident Response</option>
          <option value="investigation">Investigation</option>
          <option value="remediation">Remediation</option>
          <option value="compliance">Compliance</option>
        </select>
      </div>

      {/* Main Content - Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Playbooks List */}
        <div className="space-y-3">
          {filteredPlaybooks.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
              <p className="font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>No playbooks found</p>
              <p style={{ color: 'var(--color-text-muted)' }}>Create your first playbook to get started</p>
            </div>
          ) : (
            filteredPlaybooks.map((playbook) => (
              <div
                key={playbook.id}
                onClick={() => { setSelectedPlaybook(playbook); setSelectedExecution(null) }}
                className={clsx(
                  'glass-card p-4 cursor-pointer transition-all',
                  selectedPlaybook?.id === playbook.id && !selectedExecution && 'ring-2 ring-blue-500',
                  playbook.status === 'archived' && 'opacity-60'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <div className={clsx(
                      'p-2 rounded-lg',
                      playbook.status === 'active' ? 'bg-blue-600/20' : 'bg-slate-600/20'
                    )}>
                      <BookOpen className={clsx(
                        'w-5 h-5',
                        playbook.status === 'active' ? 'text-blue-400' : 'text-slate-400'
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                          {playbook.name}
                        </h3>
                        <StatusBadge status={playbook.status} />
                      </div>
                      <p className="text-sm truncate mt-1" style={{ color: 'var(--color-text-muted)' }}>
                        {playbook.description}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 flex-shrink-0 ml-2" style={{ color: 'var(--color-text-muted)' }} />
                </div>

                <div className="flex items-center gap-4 mt-3 pt-3 border-t text-sm" style={{ borderColor: 'var(--color-border)' }}>
                  <span className="flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                    <Zap className="w-4 h-4" />
                    {playbook.steps.length} steps
                  </span>
                  <span className="flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                    <CheckCircle2 className="w-4 h-4" />
                    {playbook.triggeredCount} runs
                  </span>
                  {playbook.lastRun && (
                    <span className="flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                      <Clock className="w-4 h-4" />
                      {format(new Date(playbook.lastRun), 'Pp', { locale: fr })}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Detail Panel */}
        {selectedExecution ? (
          <ExecutionDetail
            execution={selectedExecution}
            onUpdateStep={async (stepIndex, status) => {
              const updated = await updateExecutionStep(selectedExecution.id, stepIndex, { status })
              setSelectedExecution(updated)
              if (updated.status !== 'in_progress') {
                setActiveExecutions(activeExecutions.filter(e => e.id !== updated.id))
                loadData()
              }
            }}
            onAbort={async () => {
              const updated = await apiAbortExecution(selectedExecution.id)
              setSelectedExecution(updated)
              setActiveExecutions(activeExecutions.filter(e => e.id !== updated.id))
              loadData()
            }}
            onComplete={async () => {
              const updated = await apiCompleteExecution(selectedExecution.id)
              setSelectedExecution(updated)
              setActiveExecutions(activeExecutions.filter(e => e.id !== updated.id))
              loadData()
            }}
            onClose={() => setSelectedExecution(null)}
          />
        ) : selectedPlaybook ? (
          <PlaybookDetail
            playbook={selectedPlaybook}
            onEdit={() => {
              setEditingPlaybook(selectedPlaybook)
              setShowForm(true)
            }}
            onDelete={() => handleDelete(selectedPlaybook.id)}
            onDuplicate={() => handleDuplicate(selectedPlaybook)}
            onToggle={() => handleToggleStatus(selectedPlaybook.id)}
            onArchive={() => handleArchive(selectedPlaybook.id)}
            onRun={() => handleRun(selectedPlaybook)}
            onClose={() => setSelectedPlaybook(null)}
          />
        ) : (
          <div className="glass-card p-12 flex items-center justify-center">
            <div className="text-center">
              <Eye className="w-12 h-12 mx-auto mb-3 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
              <p style={{ color: 'var(--color-text-muted)' }}>Select a playbook to view details</p>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <PlaybookForm
          playbook={editingPlaybook}
          onSubmit={editingPlaybook ? handleUpdate : handleCreate}
          onCancel={() => {
            setShowForm(false)
            setEditingPlaybook(null)
          }}
        />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: Playbook['status'] }) {
  const styles = {
    active: 'bg-green-500/20 text-green-400 border-green-500/30',
    draft: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    archived: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  }

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded border capitalize ${styles[status]}`}>
      {status}
    </span>
  )
}

function CategoryBadge({ category }: { category: Playbook['category'] }) {
  const styles = {
    incident: 'bg-red-500/20 text-red-400',
    investigation: 'bg-blue-500/20 text-blue-400',
    remediation: 'bg-green-500/20 text-green-400',
    compliance: 'bg-purple-500/20 text-purple-400',
  }

  const labels = {
    incident: 'Incident Response',
    investigation: 'Investigation',
    remediation: 'Remediation',
    compliance: 'Compliance',
  }

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${styles[category]}`}>
      {labels[category]}
    </span>
  )
}

// Execution History Component
function ExecutionHistory({
  executions,
  onSelectExecution,
  onClose,
}: {
  executions: PlaybookExecution[]
  onSelectExecution: (exec: PlaybookExecution) => void
  onClose: () => void
}) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-blue-400" />
          <h3 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Execution History
          </h3>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-slate-700/50 rounded">
          <X className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
        </button>
      </div>

      {executions.length === 0 ? (
        <p className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
          No execution history yet
        </p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {executions.slice(0, 20).map(exec => (
            <div
              key={exec.id}
              onClick={() => onSelectExecution(exec)}
              className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-slate-700/30 transition-colors"
              style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
            >
              <div className="flex items-center gap-3">
                <ExecutionStatusIcon status={exec.status} />
                <div>
                  <p className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>
                    {exec.playbookName}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {exec.startedAt && format(new Date(exec.startedAt), 'PPp', { locale: fr })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={clsx(
                  'text-xs px-2 py-0.5 rounded capitalize',
                  exec.status === 'completed' && 'bg-green-600/20 text-green-400',
                  exec.status === 'in_progress' && 'bg-yellow-600/20 text-yellow-400',
                  exec.status === 'aborted' && 'bg-red-600/20 text-red-400',
                  exec.status === 'failed' && 'bg-red-600/20 text-red-400'
                )}>
                  {exec.status.replace('_', ' ')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ExecutionStatusIcon({ status }: { status: PlaybookExecution['status'] }) {
  if (status === 'completed') return <CheckCircle2 className="w-5 h-5 text-green-400" />
  if (status === 'in_progress') return <Activity className="w-5 h-5 text-yellow-400 animate-pulse" />
  if (status === 'aborted') return <StopCircle className="w-5 h-5 text-red-400" />
  return <X className="w-5 h-5 text-red-400" />
}

// Execution Detail Component
function ExecutionDetail({
  execution,
  onUpdateStep,
  onAbort,
  onComplete,
  onClose,
}: {
  execution: PlaybookExecution
  onUpdateStep: (stepIndex: number, status: string) => Promise<void>
  onAbort: () => void
  onComplete: () => void
  onClose: () => void
}) {
  const isActive = execution.status === 'in_progress'
  const [savingStepIndex, setSavingStepIndex] = useState<number | null>(null)

  async function handleStep(index: number, status: 'completed' | 'skipped') {
    setSavingStepIndex(index)
    try {
      await onUpdateStep(index, status)
      toast.success(`Step ${index + 1} ${status === 'completed' ? 'completed' : 'skipped'}`)
    } catch {
      toast.error(`Failed to update step ${index + 1}`)
    } finally {
      setSavingStepIndex(null)
    }
  }

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <ExecutionStatusIcon status={execution.status} />
              <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {execution.playbookName}
              </h2>
              <span className={clsx(
                'text-xs px-2 py-0.5 rounded capitalize',
                execution.status === 'completed' && 'bg-green-600/20 text-green-400',
                execution.status === 'in_progress' && 'bg-yellow-600/20 text-yellow-400',
                execution.status === 'aborted' && 'bg-red-600/20 text-red-400'
              )}>
                {execution.status.replace('_', ' ')}
              </span>
            </div>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Started by {execution.startedBy} at {execution.startedAt && format(new Date(execution.startedAt), 'PPp', { locale: fr })}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-700/50 rounded">
            <X className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>

        {/* Action buttons */}
        {isActive && (
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={onComplete}
              className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              Mark Complete
            </button>
            <button
              onClick={onAbort}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
            >
              <StopCircle className="w-4 h-4" />
              Abort
            </button>
          </div>
        )}
      </div>

      {/* Steps */}
      <div className="p-4">
        <h3 className="font-medium mb-3" style={{ color: 'var(--color-text-primary)' }}>
          Execution Progress
        </h3>
        <div className="space-y-2">
          {execution.stepsData.map((step, index) => (
            <div key={step.id}>
              <div
                className="flex items-center gap-3 p-3 rounded-lg"
                style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
              >
                {/* Step number */}
                <div className={clsx(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
                  step.status === 'completed' ? 'bg-green-600 text-white' :
                  step.status === 'running' ? 'bg-blue-600 text-white animate-pulse' :
                  step.status === 'failed' ? 'bg-red-600 text-white' :
                  step.status === 'skipped' ? 'bg-yellow-600 text-white' :
                  'bg-slate-600 text-slate-300'
                )}>
                  {step.status === 'completed' ? <CheckCircle2 className="w-4 h-4" /> : index + 1}
                </div>

                {/* Step info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>
                      {step.name}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {step.description}
                  </p>
                </div>

                {/* Status / Actions */}
                {isActive && step.status === 'pending' && index === execution.currentStep && (
                  <div className="flex items-center gap-1">
                    {savingStepIndex === index ? (
                      <span className="flex items-center gap-1.5 px-2 py-1 text-xs text-slate-300">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Saving…
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => handleStep(index, 'completed')}
                          disabled={savingStepIndex !== null}
                          className="px-2 py-1 text-xs bg-green-600/20 text-green-400 rounded hover:bg-green-600/30 disabled:opacity-40"
                        >
                          Complete
                        </button>
                        <button
                          onClick={() => handleStep(index, 'skipped')}
                          disabled={savingStepIndex !== null}
                          className="px-2 py-1 text-xs bg-yellow-600/20 text-yellow-400 rounded hover:bg-yellow-600/30 disabled:opacity-40"
                        >
                          Skip
                        </button>
                      </>
                    )}
                  </div>
                )}
                {step.status && step.status !== 'pending' && (
                  <span className={clsx(
                    'text-xs px-2 py-0.5 rounded capitalize',
                    step.status === 'completed' && 'bg-green-600/20 text-green-400',
                    step.status === 'running' && 'bg-blue-600/20 text-blue-400',
                    step.status === 'failed' && 'bg-red-600/20 text-red-400',
                    step.status === 'skipped' && 'bg-yellow-600/20 text-yellow-400'
                  )}>
                    {step.status}
                  </span>
                )}
              </div>

              {/* Connector line */}
              {index < execution.stepsData.length - 1 && (
                <div className="ml-6 h-4 border-l-2 border-dashed" style={{ borderColor: 'var(--color-border)' }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

interface PlaybookDetailProps {
  playbook: Playbook
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
  onToggle: () => void
  onArchive: () => void
  onRun: () => void
  onClose: () => void
}

function PlaybookDetail({ playbook, onEdit, onDelete, onDuplicate, onToggle, onArchive, onRun, onClose }: PlaybookDetailProps) {
  const { canManagePlaybooks } = useRole()
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())

  function toggleStep(id: string) {
    const newExpanded = new Set(expandedSteps)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedSteps(newExpanded)
  }

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {playbook.name}
              </h2>
              <StatusBadge status={playbook.status} />
              <CategoryBadge category={playbook.category} />
            </div>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{playbook.description}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-700/50 rounded lg:hidden">
            <X className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {playbook.status === 'active' && (
            <button
              onClick={onRun}
              className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
            >
              <Play className="w-4 h-4" />
              Run Now
            </button>
          )}
          {canManagePlaybooks && (
            <>
              <button
                onClick={onEdit}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-sm"
                style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)' }}
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={onDuplicate}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-sm"
                style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)' }}
              >
                <Copy className="w-4 h-4" />
                Duplicate
              </button>
              <button
                onClick={onToggle}
                className={clsx(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-sm',
                  playbook.status === 'active' ? 'bg-yellow-600/20 text-yellow-400' : 'bg-green-600/20 text-green-400'
                )}
              >
                {playbook.status === 'active' ? (
                  <>
                    <Pause className="w-4 h-4" />
                    Disable
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Activate
                  </>
                )}
              </button>
              {playbook.status !== 'archived' && (
                <button
                  onClick={onArchive}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-sm bg-slate-600/20"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  <Archive className="w-4 h-4" />
                  Archive
                </button>
              )}
              <button
                onClick={onDelete}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-sm bg-red-600/20 text-red-400"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-4 p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Trigger</p>
          <p className="text-sm font-medium capitalize" style={{ color: 'var(--color-text-primary)' }}>
            {playbook.trigger === 'alert_rule' ? `Alert Rule: ${playbook.triggerConfig?.rule_name || 'N/A'}` : playbook.trigger}
          </p>
        </div>
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Total Runs</p>
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{playbook.triggeredCount}</p>
        </div>
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Last Run</p>
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {playbook.lastRun ? format(new Date(playbook.lastRun), 'PPp', { locale: fr }) : 'Never'}
          </p>
        </div>
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Avg Duration</p>
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{playbook.avgDuration || 'N/A'}</p>
        </div>
      </div>

      {/* Steps */}
      <div className="p-4">
        <h3 className="font-medium mb-3" style={{ color: 'var(--color-text-primary)' }}>
          Workflow Steps ({playbook.steps.length})
        </h3>
        {playbook.steps.length === 0 ? (
          <p className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
            No steps defined yet
          </p>
        ) : (
          <div className="space-y-2">
            {playbook.steps.map((step, index) => (
              <div key={step.id}>
                <div
                  onClick={() => toggleStep(step.id)}
                  className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-slate-700/30"
                  style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
                >
                  {/* Step number */}
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-slate-600 text-slate-300">
                    {index + 1}
                  </div>

                  {/* Step info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>
                        {step.name}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded capitalize" style={{
                        backgroundColor: 'var(--color-bg-secondary)',
                        color: 'var(--color-text-muted)'
                      }}>
                        {step.type}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                      {step.description}
                    </p>
                  </div>

                  <ChevronDown className={clsx(
                    'w-4 h-4 transition-transform',
                    expandedSteps.has(step.id) && 'rotate-180'
                  )} style={{ color: 'var(--color-text-muted)' }} />
                </div>

                {/* Expanded step details */}
                {expandedSteps.has(step.id) && (
                  <div
                    className="ml-10 mt-1 p-3 rounded-lg text-sm"
                    style={{ backgroundColor: 'var(--color-bg-secondary)' }}
                  >
                    <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>Configuration:</p>
                    <pre className="text-xs overflow-x-auto" style={{ color: 'var(--color-text-primary)' }}>
                      {JSON.stringify(step.config, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Connector line */}
                {index < playbook.steps.length - 1 && (
                  <div className="ml-6 h-4 border-l-2 border-dashed" style={{ borderColor: 'var(--color-border)' }} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface PlaybookFormProps {
  playbook?: Playbook | null
  onSubmit: (data: Partial<Playbook>) => void
  onCancel: () => void
}

function PlaybookForm({ playbook, onSubmit, onCancel }: PlaybookFormProps) {
  const isEditing = !!playbook?.id

  const [name, setName] = useState(playbook?.name || '')
  const [description, setDescription] = useState(playbook?.description || '')
  const [category, setCategory] = useState<Playbook['category']>(playbook?.category || 'incident')
  const [trigger, setTrigger] = useState<Playbook['trigger']>(playbook?.trigger || 'manual')
  const [steps, setSteps] = useState<PlaybookStep[]>(playbook?.steps || [])
  const [showStepForm, setShowStepForm] = useState(false)

  function handleAddStep(step: Omit<PlaybookStep, 'id' | 'order'>) {
    const newStep: PlaybookStep = {
      ...step,
      id: Date.now().toString(),
      order: steps.length + 1,
    }
    setSteps([...steps, newStep])
    setShowStepForm(false)
  }

  function handleRemoveStep(id: string) {
    setSteps(steps.filter(s => s.id !== id).map((s, i) => ({ ...s, order: i + 1 })))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      name,
      description,
      category,
      trigger,
      steps,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
      >
        {/* Header */}
        <div
          className="sticky top-0 flex items-center justify-between p-4 border-b"
          style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}
        >
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {isEditing ? 'Edit Playbook' : 'New Playbook'}
          </h2>
          <button onClick={onCancel} className="p-2 rounded-lg hover:bg-slate-700/50">
            <X className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-5">
          {/* Basic Info */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Playbook Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g., Ransomware Response"
              className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{
                backgroundColor: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)'
              }}
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
              placeholder="Describe what this playbook does"
              className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              style={{
                backgroundColor: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)'
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Playbook['category'])}
                className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{
                  backgroundColor: 'var(--color-bg-tertiary)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)'
                }}
              >
                <option value="incident">Incident Response</option>
                <option value="investigation">Investigation</option>
                <option value="remediation">Remediation</option>
                <option value="compliance">Compliance</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
                Trigger
              </label>
              <select
                value={trigger}
                onChange={(e) => setTrigger(e.target.value as Playbook['trigger'])}
                className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{
                  backgroundColor: 'var(--color-bg-tertiary)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)'
                }}
              >
                <option value="manual">Manual</option>
                <option value="alert_rule">Alert Rule</option>
                <option value="scheduled">Scheduled</option>
              </select>
            </div>
          </div>

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
                Workflow Steps ({steps.length})
              </label>
              <button
                type="button"
                onClick={() => setShowStepForm(true)}
                className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Add Step
              </button>
            </div>

            {steps.length === 0 ? (
              <div
                className="p-8 text-center rounded-lg border-2 border-dashed"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" style={{ color: 'var(--color-text-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  No steps added yet. Add steps to define the workflow.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {steps.map((step, index) => (
                  <div
                    key={step.id}
                    className="flex items-center gap-3 p-3 rounded-lg"
                    style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
                  >
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-slate-600 text-white"
                    >
                      {index + 1}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>
                        {step.name}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {step.type} - {step.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveStep(step.id)}
                      className="p-1 text-red-400 hover:bg-red-600/20 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Step Form Modal */}
          {showStepForm && (
            <StepForm
              onSubmit={handleAddStep}
              onCancel={() => setShowStepForm(false)}
            />
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 rounded-lg"
              style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {isEditing ? 'Update Playbook' : 'Create Playbook'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface StepFormProps {
  onSubmit: (step: Omit<PlaybookStep, 'id' | 'order'>) => void
  onCancel: () => void
}

function StepForm({ onSubmit, onCancel }: StepFormProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<PlaybookStep['type']>('action')
  const [description, setDescription] = useState('')
  const [action, setAction] = useState('')
  const [target, setTarget] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      name,
      type,
      description,
      config: type === 'action' ? { action_type: action, target: target } : {},
    })
  }

  return (
    <div
      className="p-4 rounded-lg border"
      style={{ backgroundColor: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border)' }}
    >
      <h4 className="font-medium mb-3" style={{ color: 'var(--color-text-primary)' }}>Add Step</h4>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Step Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g., Isolate Host"
              className="w-full px-2 py-1.5 text-sm rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)'
              }}
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as PlaybookStep['type'])}
              className="w-full px-2 py-1.5 text-sm rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)'
              }}
            >
              {STEP_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this step do?"
            className="w-full px-2 py-1.5 text-sm rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)'
            }}
          />
        </div>

        {type === 'action' && (
          <>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Action</label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="w-full px-2 py-1.5 text-sm rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{
                  backgroundColor: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)'
                }}
              >
                <option value="">Select action...</option>
                {AVAILABLE_ACTIONS.map(a => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            
            {action === 'block_ip' && (
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  Target IP / Variable
                </label>
                <input
                  type="text"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="e.g., {{event.src_ip}} or 192.168.1.100"
                  className="w-full px-2 py-1.5 text-sm rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-primary)'
                  }}
                />
              </div>
            )}
          </>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-3 py-1.5 text-sm rounded"
            style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!name}
            className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}
