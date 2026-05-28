import { ReactNode } from 'react'
import { TrendingUp, TrendingDown, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import clsx from 'clsx'

export interface StatCardProps {
    icon: ReactNode
    label: string
    value: number | string
    subValue?: string | ReactNode
    statusColor?: 'normal' | 'success' | 'warning' | 'critical'
    trend?: {
        value: number
        isPositive?: boolean
        severity?: 'normal' | 'warning' | 'critical'
    }
    sparklineData?: number[] // Optional array of numbers to draw a mini sparkline
    pulse?: boolean // Briefly pulse the card when a realtime event arrives
    onClick?: () => void
    linkTo?: string
    linkParams?: Record<string, string>
}

// Simple sparkline SVG component
const Sparkline = ({ data, colorClass }: { data: number[], colorClass: string }) => {
    if (!data || data.length < 2) return null;
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    
    // Normalize to 0-100 height, 0-100 width
    const points = data.map((d, i) => {
        const x = (i / (data.length - 1)) * 100;
        const y = 100 - ((d - min) / range) * 100;
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg 
            className="absolute bottom-0 left-0 w-full h-1/2 opacity-20 pointer-events-none" 
            viewBox="0 -10 100 120" 
            preserveAspectRatio="none"
        >
            <polyline 
                points={points} 
                fill="none" 
                className={colorClass} 
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
            />
            <polygon 
                points={`0,100 ${points} 100,100`} 
                className={colorClass} 
                fill="currentColor"
                opacity="0.1"
            />
        </svg>
    )
}

export default function StatCard({ icon, label, value, subValue, statusColor = 'normal', trend, sparklineData, pulse, onClick, linkTo, linkParams }: StatCardProps) {
    const navigate = useNavigate()
    const { t } = useLanguage()
    const isClickable = onClick || linkTo

    const handleClick = () => {
        if (onClick) {
            onClick()
        } else if (linkTo) {
            const params = linkParams ? `?${new URLSearchParams(linkParams).toString()}` : ''
            navigate(`${linkTo}${params}`)
        }
    }

    // Determine colors based on statusColor
    const iconColorClass = {
        normal: 'text-blue-400 bg-blue-500/10',
        success: 'text-green-400 bg-green-500/10',
        warning: 'text-amber-400 bg-amber-500/10',
        critical: 'text-red-400 bg-red-500/10'
    }[statusColor];

    const sparklineStrokeClass = {
        normal: 'stroke-blue-400 text-blue-400',
        success: 'stroke-green-400 text-green-400',
        warning: 'stroke-amber-400 text-amber-400',
        critical: 'stroke-red-400 text-red-400'
    }[statusColor];

    const borderHoverClass = {
        normal: 'hover:border-blue-500/30 hover:shadow-blue-500/10',
        success: 'hover:border-green-500/30 hover:shadow-green-500/10',
        warning: 'hover:border-amber-500/30 hover:shadow-amber-500/10',
        critical: 'hover:border-red-500/30 hover:shadow-red-500/10'
    }[statusColor];

    return (
        <div
            onClick={isClickable ? handleClick : undefined}
            className={clsx(
                'glass-card p-5 transition-all duration-200 relative overflow-hidden',
                isClickable && `cursor-pointer hover:bg-slate-800/80 -translate-y-0 hover:-translate-y-1 hover:shadow-lg group`,
                isClickable && borderHoverClass,
                statusColor === 'critical' && 'border-red-500/20 bg-red-500/5',
                statusColor === 'warning' && 'border-amber-500/20 bg-amber-500/5',
                pulse && 'statcard-pulse'
            )}
        >
            {pulse && (
                <span className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-500/20 text-green-300 z-20">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                    LIVE
                </span>
            )}
            {sparklineData && <Sparkline data={sparklineData} colorClass={sparklineStrokeClass} />}
            
            <div className="flex items-start justify-between relative z-10">
                <div className="flex-1">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                        {label}
                    </p>
                    <p className={clsx(
                        "text-3xl font-bold",
                        statusColor === 'critical' ? 'text-red-100' :
                        statusColor === 'warning' ? 'text-amber-100' :
                        'text-slate-100'
                    )}>
                        {typeof value === 'number' ? value.toLocaleString() : value}
                    </p>
                    
                    {/* Sub Value or Trend (mutually exclusive in this design for space) */}
                    {subValue ? (
                        <div className="mt-2 text-sm text-slate-400 font-medium">
                            {subValue}
                        </div>
                    ) : trend ? (
                        <div
                            className={clsx(
                                'flex items-center gap-1 mt-2 text-sm',
                                trend.severity === 'critical' ? 'text-red-400'
                                  : trend.severity === 'warning' ? 'text-amber-400'
                                  : trend.isPositive !== false ? 'text-green-400'
                                  : 'text-red-400'
                            )}
                        >
                            {trend.isPositive !== false ? (
                                <TrendingDown className="w-4 h-4" />
                            ) : (
                                <TrendingUp className="w-4 h-4" />
                            )}
                            <span>{trend.value}%</span>
                            <span className="text-slate-500">{t('dashboard.fromYesterday')}</span>
                        </div>
                    ) : null}
                </div>
                <div className="flex items-center gap-2">
                    <div className={clsx("p-3 rounded-lg", iconColorClass)}>
                        {icon}
                    </div>
                    {isClickable && (
                        <ChevronRight className="w-5 h-5 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 group-hover:-translate-x-2" />
                    )}
                </div>
            </div>
        </div>
    )
}
