import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import {
  Box, Typography, Stack, Chip, Button,
  Card, CardContent, CircularProgress, Divider, Alert,
  useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import NoteAltIcon from '@mui/icons-material/NoteAlt'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Cell,
  PieChart, Pie, Legend,
} from 'recharts'
import { getRecords, getSettings, getHoldings } from '../services/firestore'

const fmt = n => Math.round(n || 0).toLocaleString()

const PIE_COLORS = { bank: '#42A5F5', tw: '#DBC66E', us: '#FFA726' }

// ── Sub-components ───────────────────────────────────────────

function KpiCard({ label, main, mainColor, sub }) {
  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 0 }}>
      <CardContent sx={{ pb: '16px !important' }}>
        <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
        <Typography variant="h6" fontWeight={700} color={mainColor || 'text.primary'} noWrap>
          {main}
        </Typography>
        {sub && (
          <Typography variant="caption" color="text.secondary" display="block">{sub}</Typography>
        )}
      </CardContent>
    </Card>
  )
}

function AssetRow({ label, value, prev, cost, isLast }) {
  const delta = prev != null ? value - prev : null
  const deltaPct = delta != null && prev > 0 ? delta / prev * 100 : null
  const pos = delta == null || delta >= 0
  const pnl = cost > 0 ? value - cost : null
  const pnlPct = cost > 0 ? pnl / cost * 100 : null

  return (
    <Box sx={{ py: 1.25, borderBottom: isLast ? 'none' : '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" alignItems="flex-start">
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" fontWeight={500}>{label}</Typography>
          {cost > 0 && (
            <Typography variant="caption" color="text.secondary">
              {'成本 NT$' + fmt(cost)}
              {pnlPct != null && (
                <Box
                  component="span"
                  sx={{ ml: 0.75, color: pnl >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}
                >
                  {pnl >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                </Box>
              )}
            </Typography>
          )}
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="body2" fontWeight={700}>NT${fmt(value)}</Typography>
          {delta != null && (
            <Typography
              variant="caption"
              color={pos ? 'success.main' : 'error.main'}
              display="block"
            >
              {pos ? '+' : ''}{fmt(delta)}（{pos ? '+' : ''}{deltaPct?.toFixed(1)}%）
            </Typography>
          )}
        </Box>
      </Stack>
    </Box>
  )
}

function SectionCard({ title, children }) {
  return (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardContent>
        {title && (
          <Typography variant="body2" fontWeight={600} sx={{ mb: 1.5 }}>{title}</Typography>
        )}
        {children}
      </CardContent>
    </Card>
  )
}

function ProgressBar({ value, max }) {
  const pct = max > 0 ? Math.min(value / max * 100, 100) : 0
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">財務自由進度</Typography>
        <Typography variant="caption" fontWeight={700} color="primary.main">
          {pct.toFixed(1)}%
        </Typography>
      </Stack>
      <Box sx={{ bgcolor: 'secondary.light', borderRadius: 1, height: 8 }}>
        <Box sx={{ width: `${pct}%`, bgcolor: 'primary.main', height: '100%', borderRadius: 1, transition: 'width 0.6s ease' }} />
      </Box>
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary">NT${fmt(value)}</Typography>
        <Typography variant="caption" color="text.secondary">目標 NT${fmt(max)}</Typography>
      </Stack>
    </Box>
  )
}

// ── Main component ───────────────────────────────────────────

export default function Overview() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const theme = useTheme()
  const [records, setRecords] = useState([])
  const [settings, setSettings] = useState(null)
  const [holdings, setHoldings] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [r, s, h] = await Promise.all([
      getRecords(user.uid),
      getSettings(user.uid),
      getHoldings(user.uid),
    ])
    setRecords(r)
    setSettings(s)
    setHoldings(h)
    setLoading(false)
  }, [user.uid])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', pt: 6 }}>
      <CircularProgress />
    </Box>
  )

  if (records.length === 0) {
    return (
      <Box>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>總覽</Typography>
        <Alert severity="info" sx={{ mb: 3 }}>
          尚無資產紀錄，先新增你的第一個月吧！
        </Alert>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/assets')}>
          前往新增紀錄
        </Button>
      </Box>
    )
  }

  const latest = records[0]
  const previous = records[1]

  // ── Calculations ─────────────────────────────────────────
  const twStockTotal = latest.twStockTotal || 0
  const usStockTotal = latest.usStockTotal || 0
  const stockTotal = twStockTotal + usStockTotal

  const delta = previous ? latest.totalAssets - previous.totalAssets : null
  const deltaPct = delta != null && previous.totalAssets > 0
    ? delta / previous.totalAssets * 100 : null
  const positive = delta == null || delta >= 0

  // Stock costs from holdings
  const twStockCost = holdings
    .filter(h => h.market === 'TW')
    .reduce((s, h) => s + (h.totalCost || (h.shares || 0) * (h.avgCost || 0)), 0)
  const usStockCost = holdings
    .filter(h => h.market === 'US')
    .reduce((s, h) => s + (h.totalCost || (h.shares || 0) * (h.avgCost || 0)), 0)
  const totalStockCost = twStockCost + usStockCost

  // Net cash flow & savings rate
  const netCashFlow = previous
    ? (latest.bankTotal - previous.bankTotal) + (latest.passiveIncome || 0)
    : null
  const monthlyExpense = settings?.monthlyExpense || 0
  const savingsRate = netCashFlow != null && monthlyExpense > 0
    ? netCashFlow / (netCashFlow + monthlyExpense) * 100
    : null

  const target = monthlyExpense * 12 * 25
  const estimatedDiv = latest.estimatedMonthlyDividend || 0

  // ── Chart data ───────────────────────────────────────────
  const chartData = [...records].reverse().map(r => ({
    month: r.month.slice(5),
    label: r.month,
    total: r.totalAssets,
    passive: r.passiveIncome || 0,
  }))

  const pieData = [
    { name: '銀行存款', value: latest.bankTotal || 0, color: PIE_COLORS.bank },
    { name: '台股', value: twStockTotal, color: PIE_COLORS.tw },
    { name: '美股', value: usStockTotal, color: PIE_COLORS.us },
  ].filter(d => d.value > 0)

  const hasPassiveData = chartData.some(d => d.passive > 0)

  return (
    <Box>
      <Stack direction="row" alignItems="flex-start" sx={{ mb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" fontWeight={700}>總覽</Typography>
          <Typography variant="caption" color="text.secondary">最新紀錄：{latest.month}</Typography>
        </Box>
        <Button startIcon={<AddIcon />} variant="outlined" size="small" onClick={() => navigate('/assets')}>
          新增紀錄
        </Button>
      </Stack>

      {/* ── Hero ─────────────────────────────────────────── */}
      <Card sx={{ mb: 2, bgcolor: 'success.light', color: 'success.dark' }}>
        <CardContent>
          <Typography variant="body2" sx={{ opacity: 0.65 }}>本月總資產</Typography>
          <Typography variant="h4" fontWeight={800} sx={{ my: 0.5 }}>
            NT${fmt(latest.totalAssets)}
          </Typography>
          {delta != null && (
            <Chip
              size="small"
              icon={positive ? <TrendingUpIcon /> : <TrendingDownIcon />}
              label={`${positive ? '+' : ''}NT${fmt(delta)}（${positive ? '+' : ''}${deltaPct?.toFixed(1)}%）`}
              sx={{
                bgcolor: positive ? 'success.light' : 'error.light',
                color: positive ? 'success.dark' : 'error.dark',
                border: 'none',
                '& .MuiChip-icon': { color: positive ? 'success.dark' : 'error.dark' },
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* ── 兩個關鍵指標 ─────────────────────────────────── */}
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} useFlexGap>
        <KpiCard
          label="本月被動收入"
          main={`NT$${fmt(latest.passiveIncome || 0)}`}
          mainColor="success.main"
          sub={estimatedDiv > 0 ? `預估股息 NT$${fmt(estimatedDiv)}/月` : undefined}
        />
        <KpiCard
          label="本月儲蓄率"
          main={
            savingsRate != null
              ? `${savingsRate.toFixed(1)}%`
              : monthlyExpense === 0 ? '—' : '—'
          }
          mainColor={savingsRate != null ? (savingsRate >= 0 ? 'success.main' : 'error.main') : 'text.secondary'}
          sub={
            savingsRate != null
              ? `淨現金流 NT$${fmt(netCashFlow)}`
              : monthlyExpense === 0 ? '請設定月支出' : '需至少 2 筆紀錄'
          }
        />
      </Stack>

      {/* ── 資產組成明細 ─────────────────────────────────── */}
      <SectionCard title="資產組成">
        <AssetRow
          label="銀行存款"
          value={latest.bankTotal || 0}
          prev={previous?.bankTotal}
        />
        {(twStockTotal > 0 || (previous?.twStockTotal || 0) > 0) && (
          <AssetRow
            label="台股"
            value={twStockTotal}
            prev={previous?.twStockTotal}
            cost={twStockCost > 0 ? twStockCost : 0}
          />
        )}
        {(usStockTotal > 0 || (previous?.usStockTotal || 0) > 0) && (
          <AssetRow
            label="美股"
            value={usStockTotal}
            prev={previous?.usStockTotal}
            cost={usStockCost > 0 ? usStockCost : 0}
            isLast
          />
        )}
        {totalStockCost === 0 && (
          <AssetRow
            label="股票"
            value={stockTotal}
            prev={previous ? (previous.twStockTotal || 0) + (previous.usStockTotal || 0) : undefined}
            isLast
          />
        )}
      </SectionCard>

      {/* ── Charts ───────────────────────────────────────── */}
      {records.length >= 2 && (
        <>
          {/* 資產走勢 */}
          <SectionCard title="資產走勢">
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 10000)}萬`} width={46} />
                <Tooltip
                  formatter={v => [`NT$${fmt(v)}`, '總資產']}
                  labelFormatter={l => chartData.find(d => d.month === l)?.label || l}
                />
                <Line type="monotone" dataKey="total" stroke={theme.palette.primary.main} strokeWidth={2.5}
                  dot={{ r: 4, fill: theme.palette.primary.main }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </SectionCard>

          {/* 資產比例（只有多種資產類別時才顯示） */}
          {pieData.length >= 2 && (
            <SectionCard title="資產比例">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="45%"
                    innerRadius={52}
                    outerRadius={78}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, name) => [`NT$${fmt(v)}`, name]} />
                  <Legend
                    formatter={(value, entry) => {
                      const pct = latest.totalAssets > 0
                        ? (entry.payload.value / latest.totalAssets * 100).toFixed(1)
                        : 0
                      return `${value} ${pct}%`
                    }}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </SectionCard>
          )}

          {/* 被動收入趨勢 */}
          {hasPassiveData && (
            <SectionCard title="被動收入趨勢">
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} width={50} />
                  <Tooltip
                    formatter={v => [`NT$${fmt(v)}`, '被動收入']}
                    labelFormatter={l => chartData.find(d => d.month === l)?.label || l}
                  />
                  <Bar dataKey="passive" radius={[3, 3, 0, 0]}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={i === chartData.length - 1 ? theme.palette.primary.main : theme.palette.primary.light} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>
          )}
        </>
      )}

      {/* ── 財務自由進度 ─────────────────────────────────── */}
      {target > 0 && (
        <SectionCard title="財務自由進度">
          <ProgressBar value={latest.totalAssets} max={target} />
          <Divider sx={{ my: 1.5 }} />
          <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
            <Box>
              <Typography variant="caption" color="text.secondary">月支出設定</Typography>
              <Typography variant="body2" fontWeight={600}>NT${fmt(monthlyExpense)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">財務自由目標</Typography>
              <Typography variant="body2" fontWeight={600}>NT${fmt(target)}</Typography>
            </Box>
            {estimatedDiv > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary">預估月股息</Typography>
                <Typography variant="body2" fontWeight={600} color="success.main">
                  NT${fmt(estimatedDiv)}
                </Typography>
              </Box>
            )}
          </Stack>
        </SectionCard>
      )}

      {/* ── 本月備註 ─────────────────────────────────────── */}
      {latest.note && (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <NoteAltIcon fontSize="small" color="action" sx={{ mt: 0.2, flexShrink: 0 }} />
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">本月備註</Typography>
                <Typography variant="body2">{latest.note}</Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      )}

    </Box>
  )
}
