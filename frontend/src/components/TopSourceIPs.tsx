import { useEffect, useState } from 'react'
import { Globe, MoreHorizontal, ExternalLink, Shield, Ban } from 'lucide-react'
import { fetchTopIPs } from '../api'
import { TopIP } from '../types'
import { toast } from './Toast'
import { useLanguage } from '../context/LanguageContext'

interface Props {
  refreshTrigger?: number
}

export default function TopSourceIPs({ refreshTrigger }: Props) {
  const { t } = useLanguage()
  const [ips, setIps] = useState<TopIP[]>([])
  const [loading, setLoading] = useState(true)
  const [activePopover, setActivePopover] = useState<string | null>(null)

  useEffect(() => {
    fetchTopIPs(24)
      .then((data) => setIps(data.top_ips || []))
      .catch(() => setIps([]))
      .finally(() => setLoading(false))
  }, [refreshTrigger])

  // Close popover on click outside
  useEffect(() => {
    if (!activePopover) return
    const handleClickOutside = () => setActivePopover(null)
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [activePopover])

  const maxCount = ips.length > 0 ? ips[0].count : 1

  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Globe className="w-5 h-5 text-slate-400" />
        <h3 className="text-lg font-semibold text-slate-100">{t('topIPs.title')}</h3>
        <span className="text-xs text-slate-500 ml-auto">{t('topIPs.last24h')}</span>
      </div>

      {loading ? (
        <div className="h-[200px] flex items-center justify-center text-slate-500">
          {t('topIPs.loading')}
        </div>
      ) : ips.length === 0 ? (
        <div className="h-[200px] flex items-center justify-center text-slate-500 text-sm">
          {t('topIPs.noData')}
        </div>
      ) : (
        <div className="space-y-2">
          {ips.map((entry, i) => (
            <div key={entry.ip} className="group">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-4">{i + 1}</span>
                  <span className="text-sm font-mono text-slate-200 group-hover:text-blue-400 transition-colors">
                    {entry.ip}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {entry.critical > 0 && (
                    <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-red-500/20 text-red-400">
                      {entry.critical} crit
                    </span>
                  )}
                  {entry.high > 0 && (
                    <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-orange-500/20 text-orange-400">
                      {entry.high} high
                    </span>
                  )}
                  <span className="text-sm text-slate-400 font-medium w-10 text-right">
                    {entry.count}
                  </span>
                  {/* IP Actions button */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setActivePopover(activePopover === entry.ip ? null : entry.ip)
                      }}
                      className="p-1 rounded hover:bg-slate-700 text-slate-600 hover:text-slate-300 transition-colors opacity-0 group-hover:opacity-100"
                      title={t('topIPs.actions')}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {activePopover === entry.ip && (
                      <div className="absolute right-0 top-full mt-1 w-44 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 py-1">
                        <a
                          href={`https://who.is/whois-ip/ip-address/${entry.ip}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> {t('topIPs.whois')}
                        </a>
                        <a
                          href={`https://www.virustotal.com/gui/ip-address/${entry.ip}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                        >
                          <Shield className="w-3.5 h-3.5" /> {t('topIPs.virustotal')}
                        </a>
                        <button
                          onClick={() => {
                            setActivePopover(null)
                            toast.success(`${t('topIPs.blockSent')} ${entry.ip}`)
                          }}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-slate-700 transition-colors"
                        >
                          <Ban className="w-3.5 h-3.5" /> {t('topIPs.blockIP')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    entry.critical > 0
                      ? 'bg-red-500'
                      : entry.high > 0
                        ? 'bg-orange-500'
                        : 'bg-blue-500'
                  }`}
                  style={{ width: `${(entry.count / maxCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
