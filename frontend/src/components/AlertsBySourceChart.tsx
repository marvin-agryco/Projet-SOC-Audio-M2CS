import { useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, Sector } from 'recharts'
import { X } from 'lucide-react'
import clsx from 'clsx'

interface AlertsBySourceChartProps {
    data: Array<{ name: string; value: number; color: string; sourceKey?: string }>
    onSourceSelect?: (source: string | null, sourceName: string | null) => void
    selectedSource?: string | null
}

// Custom active shape for selected segment
const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value } = props

    return (
        <g>
            <Sector
                cx={cx}
                cy={cy}
                innerRadius={innerRadius - 5}
                outerRadius={outerRadius + 8}
                startAngle={startAngle}
                endAngle={endAngle}
                fill={fill}
                style={{ filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.3))' }}
            />
            <text x={cx} y={cy - 10} textAnchor="middle" fill="#e2e8f0" fontSize={14} fontWeight="bold">
                {payload.name}
            </text>
            <text x={cx} y={cy + 12} textAnchor="middle" fill="#94a3b8" fontSize={12}>
                {value} alerts
            </text>
        </g>
    )
}

export default function AlertsBySourceChart({ data, onSourceSelect, selectedSource }: AlertsBySourceChartProps) {
    const [, setActiveIndex] = useState<number | undefined>(undefined)
    const [hoveredIndex, setHoveredIndex] = useState<number | undefined>(undefined)

    // Find the index of the selected source
    const selectedIndex = selectedSource
        ? data.findIndex((d) => d.sourceKey === selectedSource || d.name === selectedSource)
        : -1

    const handleClick = (entry: any, index: number) => {
        if (onSourceSelect) {
            const isCurrentlySelected = selectedIndex === index
            if (isCurrentlySelected) {
                onSourceSelect(null, null)
                setActiveIndex(undefined)
            } else {
                onSourceSelect(entry.sourceKey || entry.name, entry.name)
                setActiveIndex(index)
            }
        }
    }

    const handleClearFilter = () => {
        if (onSourceSelect) {
            onSourceSelect(null, null)
            setActiveIndex(undefined)
        }
    }

    const displayIndex = selectedIndex >= 0 ? selectedIndex : hoveredIndex

    return (
        <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-100">
                    Alerts by Source
                </h3>
                {selectedSource && (
                    <button
                        onClick={handleClearFilter}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded-full hover:bg-blue-500/30 transition-colors"
                    >
                        <X className="w-3 h-3" />
                        Clear filter
                    </button>
                )}
            </div>

            {/* Selected source indicator */}
            {selectedSource && (
                <div className="mb-3 px-3 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <p className="text-sm text-blue-400">
                        Showing alerts from: <span className="font-semibold">{data.find(d => d.sourceKey === selectedSource || d.name === selectedSource)?.name}</span>
                    </p>
                </div>
            )}

            <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        activeIndex={displayIndex}
                        activeShape={renderActiveShape}
                        onMouseEnter={(_, index) => setHoveredIndex(index)}
                        onMouseLeave={() => setHoveredIndex(undefined)}
                        onClick={(entry, index) => handleClick(entry, index)}
                        style={{ cursor: onSourceSelect ? 'pointer' : 'default' }}
                    >
                        {data.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={entry.color}
                                opacity={selectedIndex >= 0 && selectedIndex !== index ? 0.4 : 1}
                                style={{ transition: 'opacity 0.2s' }}
                            />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#1e293b',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            color: '#e2e8f0',
                        }}
                        itemStyle={{ color: '#ffffff' }}
                        labelStyle={{ color: '#94a3b8' }}
                        formatter={(value: number) => [`${value} alerts`, '']}
                    />
                    <Legend
                        verticalAlign="bottom"
                        height={36}
                        formatter={(value) => (
                            <span
                                className={clsx(
                                    'text-sm cursor-pointer transition-colors',
                                    selectedIndex >= 0 && data[selectedIndex]?.name !== value
                                        ? 'text-slate-500'
                                        : 'text-slate-300 hover:text-white'
                                )}
                            >
                                {value}
                            </span>
                        )}
                        onClick={(entry: any) => {
                            const index = data.findIndex((d) => d.name === entry.value)
                            if (index >= 0) {
                                handleClick(data[index], index)
                            }
                        }}
                    />
                </PieChart>
            </ResponsiveContainer>

            {onSourceSelect && (
                <p className="text-xs text-slate-500 text-center mt-2">
                    Click on a segment to filter alerts
                </p>
            )}
        </div>
    )
}
