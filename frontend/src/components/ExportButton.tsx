import { useState } from 'react'
import { Download, FileText, FileSpreadsheet, ChevronDown } from 'lucide-react'
import clsx from 'clsx'

type ExportFormat = 'csv' | 'pdf' | 'json'

interface ExportButtonProps {
  onExport: (format: ExportFormat) => void
  disabled?: boolean
  formats?: ExportFormat[]
  label?: string
}

const formatConfig: Record<ExportFormat, { icon: typeof Download; label: string; color: string }> = {
  csv: { icon: FileSpreadsheet, label: 'Export CSV', color: 'text-green-400' },
  pdf: { icon: FileText, label: 'Export PDF', color: 'text-red-400' },
  json: { icon: Download, label: 'Export JSON', color: 'text-blue-400' },
}

export default function ExportButton({
  onExport,
  disabled = false,
  formats = ['csv', 'pdf'],
  label = 'Export',
}: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleExport = (format: ExportFormat) => {
    onExport(format)
    setIsOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={clsx(
          'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
          'bg-blue-600 text-white hover:bg-blue-700',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        <Download className="w-4 h-4" />
        {label}
        <ChevronDown className={clsx('w-4 h-4 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 overflow-hidden">
            {formats.map((format) => {
              const config = formatConfig[format]
              const Icon = config.icon
              return (
                <button
                  key={format}
                  onClick={() => handleExport(format)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  <Icon className={clsx('w-4 h-4', config.color)} />
                  {config.label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
