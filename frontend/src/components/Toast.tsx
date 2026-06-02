import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import clsx from 'clsx'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}

// Toast store (simple pub/sub pattern)
let toasts: Toast[] = []
let listeners: Array<(toasts: Toast[]) => void> = []

const subscribe = (listener: (toasts: Toast[]) => void) => {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

const notify = () => {
  listeners.forEach((listener) => listener([...toasts]))
}

export const toast = {
  success: (message: string, duration = 3000) => addToast('success', message, duration),
  error: (message: string, duration = 5000) => addToast('error', message, duration),
  warning: (message: string, duration = 4000) => addToast('warning', message, duration),
  info: (message: string, duration = 3000) => addToast('info', message, duration),
}

function addToast(type: ToastType, message: string, duration: number) {
  const id = Math.random().toString(36).substring(2, 9)
  toasts = [...toasts, { id, type, message, duration }]
  notify()

  if (duration > 0) {
    setTimeout(() => removeToast(id), duration)
  }
}

function removeToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id)
  notify()
}

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const styles = {
  success: 'bg-green-500/10 border-green-500/50 text-green-400',
  error: 'bg-red-500/10 border-red-500/50 text-red-400',
  warning: 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400',
  info: 'bg-blue-500/10 border-blue-500/50 text-blue-400',
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  const Icon = icons[toast.type]

  return (
    <div
      className={clsx(
        'flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm',
        'animate-toast-enter shadow-lg',
        styles[toast.type]
      )}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <p className="flex-1 text-sm font-medium">{toast.message}</p>
      <button
        onClick={onRemove}
        className="p-1 hover:bg-white/10 rounded transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export function ToastContainer() {
  const [currentToasts, setCurrentToasts] = useState<Toast[]>([])

  useEffect(() => {
    return subscribe(setCurrentToasts)
  }, [])

  if (currentToasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 min-w-[320px] max-w-md">
      {currentToasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={() => removeToast(t.id)} />
      ))}
    </div>
  )
}
