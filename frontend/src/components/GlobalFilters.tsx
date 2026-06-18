import { useState } from 'react'
import { Search, Filter, X, ChevronDown } from 'lucide-react'
import clsx from 'clsx'
import { Severity, EventSource } from '../types'

type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d' | 'custom'

interface GlobalFiltersProps {
    onSearchChange?: (search: string) => void
    onTimeRangeChange?: (range: TimeRange) => void
    onSeverityChange?: (severities: Severity[]) => void
    onSourceChange?: (sources: EventSource[]) => void
    timeRange?: TimeRange
    selectedSeverities?: Severity[]
    selectedSources?: EventSource[]
    search?: string
}

const timeRangeOptions: Array<{ value: TimeRange; label: string }> = [
    { value: '1h', label: 'Last 1 hour' },
    { value: '6h', label: 'Last 6 hours' },
    { value: '24h', label: 'Last 24 hours' },
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
]

const severityOptions: Array<{ value: Severity; label: string; color: string }> = [
    { value: 'critical', label: 'Critical', color: 'bg-red-500' },
    { value: 'high', label: 'High', color: 'bg-orange-500' },
    { value: 'medium', label: 'Medium', color: 'bg-yellow-500' },
    { value: 'low', label: 'Low', color: 'bg-blue-500' },
]

const sourceOptions: Array<{ value: EventSource; label: string }> = [
    { value: 'firewall', label: 'Firewall' },
    { value: 'ids', label: 'IDS / Suricata' },
    { value: 'endpoint', label: 'Endpoints' },
    { value: 'application', label: 'GLPI' },
]

export default function GlobalFilters({
    onSearchChange,
    onTimeRangeChange,
    onSeverityChange,
    onSourceChange,
    timeRange = '24h',
    selectedSeverities = [],
    selectedSources = [],
    search = '',
}: GlobalFiltersProps) {
    const [showSeverityDropdown, setShowSeverityDropdown] = useState(false)
    const [showSourceDropdown, setShowSourceDropdown] = useState(false)
    const [localSearch, setLocalSearch] = useState(search)

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onSearchChange?.(localSearch)
    }

    const handleSeverityToggle = (severity: Severity) => {
        const newSeverities = selectedSeverities.includes(severity)
            ? selectedSeverities.filter((s) => s !== severity)
            : [...selectedSeverities, severity]
        onSeverityChange?.(newSeverities)
    }

    const handleSourceToggle = (source: EventSource) => {
        const newSources = selectedSources.includes(source)
            ? selectedSources.filter((s) => s !== source)
            : [...selectedSources, source]
        onSourceChange?.(newSources)
    }

    const clearAllFilters = () => {
        setLocalSearch('')
        onSearchChange?.('')
        onSeverityChange?.([])
        onSourceChange?.([])
        onTimeRangeChange?.('24h')
    }

    const hasActiveFilters = localSearch || selectedSeverities.length > 0 || selectedSources.length > 0

    return (
        <div className="glass-card p-4">
            <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <form onSubmit={handleSearchSubmit} className="flex-1 min-w-[200px]">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search events, alerts..."
                            value={localSearch}
                            onChange={(e) => setLocalSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        {localSearch && (
                            <button
                                type="button"
                                onClick={() => {
                                    setLocalSearch('')
                                    onSearchChange?.('')
                                }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </form>

                {/* Time Range */}
                <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
                    {timeRangeOptions.slice(0, 4).map((option) => (
                        <button
                            key={option.value}
                            onClick={() => onTimeRangeChange?.(option.value)}
                            className={clsx(
                                'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                                timeRange === option.value
                                    ? 'bg-blue-600 text-white'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                            )}
                        >
                            {option.value}
                        </button>
                    ))}
                </div>

                {/* Severity Dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setShowSeverityDropdown(!showSeverityDropdown)}
                        className={clsx(
                            'flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors',
                            selectedSeverities.length > 0
                                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50'
                                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                        )}
                    >
                        <Filter className="w-4 h-4" />
                        Severity
                        {selectedSeverities.length > 0 && (
                            <span className="px-1.5 py-0.5 text-xs bg-blue-500 text-white rounded-full">
                                {selectedSeverities.length}
                            </span>
                        )}
                        <ChevronDown className="w-4 h-4" />
                    </button>

                    {showSeverityDropdown && (
                        <div className="absolute top-full left-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20">
                            <div className="p-2">
                                {severityOptions.map((option) => (
                                    <label
                                        key={option.value}
                                        className="flex items-center gap-3 px-3 py-2 hover:bg-slate-700 rounded-lg cursor-pointer"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedSeverities.includes(option.value)}
                                            onChange={() => handleSeverityToggle(option.value)}
                                            className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500"
                                        />
                                        <span className={clsx('w-2 h-2 rounded-full', option.color)} />
                                        <span className="text-sm text-slate-300">{option.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Source Dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setShowSourceDropdown(!showSourceDropdown)}
                        className={clsx(
                            'flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors',
                            selectedSources.length > 0
                                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50'
                                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                        )}
                    >
                        <Filter className="w-4 h-4" />
                        Source
                        {selectedSources.length > 0 && (
                            <span className="px-1.5 py-0.5 text-xs bg-blue-500 text-white rounded-full">
                                {selectedSources.length}
                            </span>
                        )}
                        <ChevronDown className="w-4 h-4" />
                    </button>

                    {showSourceDropdown && (
                        <div className="absolute top-full right-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20">
                            <div className="p-2">
                                {sourceOptions.map((option) => (
                                    <label
                                        key={option.value}
                                        className="flex items-center gap-3 px-3 py-2 hover:bg-slate-700 rounded-lg cursor-pointer"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedSources.includes(option.value)}
                                            onChange={() => handleSourceToggle(option.value)}
                                            className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-slate-300">{option.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Clear Filters */}
                {hasActiveFilters && (
                    <button
                        onClick={clearAllFilters}
                        className="flex items-center gap-1 px-3 py-2 text-sm text-red-400 hover:text-red-300 transition-colors"
                    >
                        <X className="w-4 h-4" />
                        Clear
                    </button>
                )}
            </div>

            {/* Active filter tags */}
            {hasActiveFilters && (
                <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-700/50">
                    <span className="text-xs text-slate-500">Active filters:</span>
                    {selectedSeverities.map((severity) => (
                        <span
                            key={severity}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded-full"
                        >
                            {severity}
                            <button
                                onClick={() => handleSeverityToggle(severity)}
                                className="hover:text-white"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                    {selectedSources.map((source) => (
                        <span
                            key={source}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded-full"
                        >
                            {source}
                            <button
                                onClick={() => handleSourceToggle(source)}
                                className="hover:text-white"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {/* Click outside to close dropdowns */}
            {(showSeverityDropdown || showSourceDropdown) && (
                <div
                    className="fixed inset-0 z-10"
                    onClick={() => {
                        setShowSeverityDropdown(false)
                        setShowSourceDropdown(false)
                    }}
                />
            )}
        </div>
    )
}
