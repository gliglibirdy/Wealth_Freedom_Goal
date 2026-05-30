import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import {
  Box, Typography, Stack, Card, CardContent,
  CircularProgress, Alert, Button, Divider, Chip,
} from '@mui/material'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import AddIcon from '@mui/icons-material/Add'
import {
  BarChart, Bar, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts'
import { getRecords, getHoldings, getExchangeRates } from '../services/firestore'
import { calcAnnualDividend, calcThisMonthDividend } from '../services/finmind'

const fmt = n => Math.round(n || 0).toLocaleString()

function KpiCard({ label, value, color, sub }) {
  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 0 }}>
      <CardContent sx={{ pb: '16px !important' }}>
        <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
        <Typography variant="h6" fontWeight={700} color={color || 'text.primary'} noWrap>
          NT${fmt(value)}
        </Typography>
        {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
      </CardContent>
    </Card>
  )
}

function SectionCard({ title, children }) {
  return (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardContent>
        {title && <Typography variant="body2" fontWeight={600} sx={{ mb: 1.5 }}>{title}</Typography>}
        {children}
      </CardContent>
    </Card>
  )
}

export default function CashFlow() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [holdings, setHoldings] = useState([])
  const [usdNtd, setUsdNtd] = useState(32)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [r, h, rates] = await Promise.all([
      getRecords(user.uid),
      getHoldings(user.uid),
      getExchangeRates(user.uid),
    ])
    setRecords(r)
    setHoldings(h)
    setUsdNtd(rates.USD_NTD || 32)
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
        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>現金流</Typography>
        <Alert severity="info" sx={{ mb: 3 }}>尚無資產紀錄，先新增你的第一個月吧！</Alert>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/assets')}>
          前往新增紀錄
        </Button>
      </Box>
    )
  }

  const latest = records[0]
  const previous = records[1]

  // ── 計算 ──────────────────────────────────────────────────
  const bankDelta = previous ? (latest.bankTotal || 0) - (previous.bankTotal || 0) : null
  const passiveIncome = latest.passiveIncome || 0
  const netCashFlow = bankDelta != null ? bankDelta + passiveIncome : null
  const netPos = netCashFlow == null || netCashFlow >= 0

  // 年度累計被動收入
  const thisYear = new Date().getFullYear().toString()
  const ytdPassive = records
    .filter(r => r.month.startsWith(thisYear))
    .reduce((s, r) => s + (r.passiveIncome || 0), 0)

  // Dividend calculations: holdings metadata + shares from latest record's snapshots
  const latestSnapshots = records[0]?.stockSnapshots || []
  const holdingsWithShares = holdings.map(h => {
    const snap = latestSnapshots.find(s => s.holdingId === h.id)
    return { ...h, shares: snap?.shares || 0 }
  })
  const annualDivTotal = Math.round(holdingsWithShares.reduce((s, h) => s + calcAnnualDividend(h, usdNtd), 0))
  const monthlyAvgDiv = Math.round(annualDivTotal / 12)
  const thisMonthDiv = Math.round(holdingsWithShares.reduce((s, h) => s + calcThisMonthDividend(h, usdNtd), 0))

  // ── Chart data（oldest → newest）────────────────────────
  const chartData = [...records].reverse().map((r, i, arr) => {
    const prev = arr[i - 1]
    return {
      month: r.month.slice(5),
      label: r.month,
      passive: r.passiveIncome || 0,
      bank: r.bankTotal || 0,
      netCash: prev ? (r.bankTotal - prev.bankTotal) + (r.passiveIncome || 0) : null,
    }
  })

  const hasPassiveData = chartData.some(d => d.passive > 0)

  return (
    <Box>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>現金流</Typography>

      {/* ── 本月淨現金流 ──────────────────────────────── */}
      <Card
        sx={{
          mb: 2,
          bgcolor: netPos ? 'success.light' : 'error.light',
          color: netPos ? 'success.dark' : 'error.dark',
        }}
      >
        <CardContent>
          <Typography variant="body2" sx={{ opacity: 0.65 }}>
            本月淨現金流
          </Typography>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ my: 0.5 }}>
            {netCashFlow != null
              ? (netPos ? <TrendingUpIcon /> : <TrendingDownIcon />)
              : null}
            <Typography variant="h4" fontWeight={800}>
              {netCashFlow != null
                ? `${netPos ? '+' : ''}NT$${fmt(netCashFlow)}`
                : '—'}
            </Typography>
          </Stack>
          {bankDelta != null && (
            <Stack direction="row" spacing={2}>
              <Typography variant="caption" sx={{ opacity: 0.75 }}>
                存款變動 {bankDelta >= 0 ? '+' : ''}NT${fmt(bankDelta)}
              </Typography>
              {passiveIncome > 0 && (
                <Typography variant="caption" sx={{ opacity: 0.75 }}>
                  + 被動收入 NT${fmt(passiveIncome)}
                </Typography>
              )}
            </Stack>
          )}
          {records.length < 2 && (
            <Typography variant="caption" sx={{ opacity: 0.75 }}>
              需至少 2 筆紀錄才能計算淨現金流
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* ── 被動收入概況 ──────────────────────────────── */}
      <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>被動收入概況</Typography>
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <KpiCard
          label="月均預期配息"
          value={monthlyAvgDiv}
          color="primary.main"
          sub={`年預期 NT$${Math.round(annualDivTotal).toLocaleString()}`}
        />
        <KpiCard
          label="本月預期配息"
          value={thisMonthDiv}
          color={thisMonthDiv > 0 ? 'success.main' : 'text.secondary'}
          sub="依配息月份計算"
        />
      </Stack>
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <KpiCard label={`${thisYear} 年度累計`} value={ytdPassive} />
        <Box sx={{ flex: 1 }} />
      </Stack>

      {records.length < 2 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          新增更多月份紀錄後，可查看趨勢圖與現金流走勢。
        </Alert>
      )}

      {records.length >= 2 && (
        <>
          {/* ── 被動收入趨勢 ────────────────────────────── */}
          {hasPassiveData && (
            <SectionCard title="被動收入趨勢">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} width={54} />
                  <Tooltip
                    formatter={v => [`NT$${fmt(v)}`, '被動收入']}
                    labelFormatter={l => chartData.find(d => d.month === l)?.label || l}
                  />
                  <Bar dataKey="passive" radius={[3, 3, 0, 0]}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={i === chartData.length - 1 ? '#2E7D32' : '#A5D6A7'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>
          )}

          {/* ── 存款走勢 ────────────────────────────────── */}
          <SectionCard title="銀行存款走勢">
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={v => `${Math.round(v / 10000)}萬`}
                  width={46}
                />
                <Tooltip
                  formatter={v => [`NT$${fmt(v)}`, '銀行存款']}
                  labelFormatter={l => chartData.find(d => d.month === l)?.label || l}
                />
                <Line
                  type="monotone"
                  dataKey="bank"
                  stroke="#1565C0"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#1565C0' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </SectionCard>

          {/* ── 淨現金流走勢 ────────────────────────────── */}
          {chartData.some(d => d.netCash != null) && (
            <SectionCard title="每月淨現金流">
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} width={54} />
                  <Tooltip
                    formatter={v => v != null ? [`NT$${fmt(v)}`, '淨現金流'] : ['—', '淨現金流']}
                    labelFormatter={l => chartData.find(d => d.month === l)?.label || l}
                  />
                  <Bar dataKey="netCash" radius={[3, 3, 0, 0]}>
                    {chartData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.netCash == null ? 'transparent' : d.netCash >= 0 ? '#66BB6A' : '#EF5350'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>
          )}
        </>
      )}
    </Box>
  )
}
