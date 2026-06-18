import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useLanguage } from '../context/LanguageContext'

interface DailyEntry {
  date: string
  critical: number
  high: number
  medium: number
  low: number
}

interface Props {
  data: DailyEntry[]
  loading?: boolean
}

const COLORS = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#22c55e',
}

export default function SeverityTrendChart({ data, loading }: Props) {
  const { t } = useLanguage()

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
        <div className="h-[260px] flex items-center justify-center text-gray-500">{t('common.loading')}</div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">{t('severityTrend.title')}</h3>
        <div className="h-[260px] flex items-center justify-center text-gray-500 text-sm">
          {t('severityTrend.selectRange')}
        </div>
      </div>
    )
  }

  // Format date labels
  const formatted = data.map((d) => ({
    ...d,
    label: d.date.slice(5), // "MM-DD"
  }))

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">{t('severityTrend.title')}</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={formatted} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#94a3b8', fontSize: 12 }}
            itemStyle={{ fontSize: 12 }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, color: '#94a3b8' }}
          />
          <Bar dataKey="critical" name={t('severityTrend.critical')} stackId="a" fill={COLORS.critical} radius={[0, 0, 0, 0]} />
          <Bar dataKey="high" name={t('severityTrend.high')} stackId="a" fill={COLORS.high} />
          <Bar dataKey="medium" name={t('severityTrend.medium')} stackId="a" fill={COLORS.medium} />
          <Bar dataKey="low" name={t('severityTrend.low')} stackId="a" fill={COLORS.low} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
