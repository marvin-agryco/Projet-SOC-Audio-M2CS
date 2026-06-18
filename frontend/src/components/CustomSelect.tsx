import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface SelectOption {
  value: string
  label: string
}

interface CustomSelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
}

export default function CustomSelect({ value, onChange, options, placeholder = 'Select...' }: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const selected = options.find(o => o.value === value)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-2 min-w-[150px] justify-between"
        style={{ backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
      >
        <span className="text-sm">{selected ? selected.label : placeholder}</span>
        <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
      </button>
      {open && (
        <div
          className="absolute top-full mt-1 left-0 z-50 rounded-lg shadow-xl min-w-full py-1"
          style={{ backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}
        >
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => { onChange(option.value); setOpen(false) }}
              className="w-full px-4 py-2 text-left text-sm transition-colors"
              style={{
                color: option.value === value ? '#3b82f6' : 'var(--color-text-primary)',
                backgroundColor: option.value === value ? 'rgba(59,130,246,0.12)' : 'transparent',
              }}
              onMouseEnter={e => { if (option.value !== value) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(59,130,246,0.08)' }}
              onMouseLeave={e => { if (option.value !== value) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
