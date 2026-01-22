import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import clsx from 'clsx'

type TimeRange = '5m' | '15m' | '30m' | '1h' | '6h' | '24h' | '7d' | '30d'

interface EventVolumeChartProps {
    data: Array<{ time: string; value: number }>
    timeRange?: TimeRange
    onTimeRangeChange?: (range: TimeRange) => void
    onDataPointClick?: (time: string, value: number) => void
    loading?: boolean
}

const timeRangeOptions: Array<{ value: TimeRange; label: string }> = [
    { value: '5m', label: '5m' },
    { value: '15m', label: '15m' },
    { value: '30m', label: '30m' },
    { value: '1h', label: '1h' },
    { value: '6h', label: '6h' },
    { value: '24h', label: '24h' },
    { value: '7d', label: '7d' },
    { value: '30d', label: '30d' },
]

export default function EventVolumeChart({
    data,
    timeRange = '24h',
    onTimeRangeChange,
    onDataPointClick,
    loading = false,
}: EventVolumeChartProps) {
    const handleClick = (data: any) => {
        if (data && data.activePayload && data.activePayload[0] && onDataPointClick) {
            const { time, value } = data.activePayload[0].payload
            onDataPointClick(time, value)
        }
    }

    return (
        <div className="glass-card p-5 relative">
            {/* Loading overlay */}
            {loading && (
                <div className="absolute inset-0 bg-slate-800/50 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
                </div>
            )}

            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-100">
                    Event Volume (Ingestion)
                </h3>

                {/* Time range selector */}
                {onTimeRangeChange && (
                    <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
                        {timeRangeOptions.map((option) => (
                            <button
                                key={option.value}
                                onClick={() => onTimeRangeChange(option.value)}
                                className={clsx(
                                    'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                                    timeRange === option.value
                                        ? 'bg-blue-600 text-white shadow-lg'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <ResponsiveContainer width="100%" height={280}>
                <AreaChart
                    data={data}
                    onClick={handleClick}
                    style={{ cursor: onDataPointClick ? 'crosshair' : 'default' }}
                >
                    <defs>
                        <linearGradient id="eventGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <XAxis
                        dataKey="time"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 12 }}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 12 }}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#1e293b',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            color: '#e2e8f0',
                        }}
                        formatter={(value: number) => [`${value.toLocaleString()} events`, 'Volume']}
                        labelFormatter={(label) => `Time: ${label}`}
                    />
                    <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fill="url(#eventGradient)"
                        animationDuration={500}
                    />
                </AreaChart>
            </ResponsiveContainer>

            {onDataPointClick && (
                <p className="text-xs text-slate-500 text-center mt-2">
                    Click on the chart to view events for that time period
                </p>
            )}
        </div>
    )
}
