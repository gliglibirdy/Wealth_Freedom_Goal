const BASE = 'https://api.finmindtrade.com/api/v4/data'

function getToken() {
  return import.meta.env.VITE_FINMIND_TOKEN || ''
}

export function hasToken() {
  return !!import.meta.env.VITE_FINMIND_TOKEN
}

// ── API calls ─────────────────────────────────────────────────

export async function fetchTWStockPrice(ticker) {
  const today = new Date().toISOString().slice(0, 10)
  const startDate = new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10)
  const url = new URL(BASE)
  url.searchParams.set('dataset', 'TaiwanStockPrice')
  url.searchParams.set('data_id', ticker)
  url.searchParams.set('start_date', startDate)
  url.searchParams.set('end_date', today)
  url.searchParams.set('token', getToken())

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`FinMind HTTP ${res.status}`)
  const json = await res.json()
  if (json.status && json.status !== 200) throw new Error(json.msg || 'FinMind API error')

  const rows = (json.data || []).filter(r => r.close > 0)
  if (!rows.length) return null
  rows.sort((a, b) => b.date.localeCompare(a.date))
  return { price: rows[0].close, date: rows[0].date }
}

export async function fetchTWStockDividend(ticker) {
  const threeYearsAgo = new Date(Date.now() - 3 * 365 * 86400_000).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const url = new URL(BASE)
  url.searchParams.set('dataset', 'TaiwanStockDividend')
  url.searchParams.set('data_id', ticker)
  url.searchParams.set('start_date', threeYearsAgo)
  url.searchParams.set('end_date', today)
  url.searchParams.set('token', getToken())

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`FinMind HTTP ${res.status}`)
  const json = await res.json()
  if (json.status && json.status !== 200) throw new Error(json.msg || 'FinMind API error')

  // Take up to 4 most recent cash dividends
  const rows = (json.data || [])
    .filter(r => (r.TotalCashDividend ?? r.CashEarningsDistribution ?? 0) > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4)

  const records = rows.map(r => ({
    date: r.date,
    dividendPerShare: r.TotalCashDividend ?? r.CashEarningsDistribution ?? 0,
  }))

  const avgDividendPerShare = records.length
    ? records.reduce((s, r) => s + r.dividendPerShare, 0) / records.length
    : 0

  const frequency = _inferFrequency(records)
  const dividendMonths = [..._inferDividendMonths(records)]

  return { records, avgDividendPerShare, frequency, dividendMonths }
}

function _inferFrequency(records) {
  if (records.length < 2) return 2
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date))
  const gaps = sorted.slice(1).map((r, i) => {
    const a = new Date(sorted[i].date)
    const b = new Date(r.date)
    return (b - a) / (30 * 86400_000)
  })
  const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length
  if (avgGap < 4) return 4
  if (avgGap < 8) return 2
  return 1
}

function _inferDividendMonths(records) {
  return new Set(records.map(r => new Date(r.date).getMonth() + 1))
}

// ── Stale checks ─────────────────────────────────────────────

export function isPriceStale(updatedAt) {
  if (!updatedAt) return true
  return (Date.now() - new Date(updatedAt).getTime()) > 8 * 60 * 60 * 1000
}

export function isDividendStale(updatedAt) {
  if (!updatedAt) return true
  return (Date.now() - new Date(updatedAt).getTime()) > 7 * 24 * 60 * 60 * 1000
}

// ── Dividend calculations ─────────────────────────────────────

// Expected annual dividend for one holding (NTD)
export function calcAnnualDividend(holding, usdNtd = 32) {
  if (holding.market === 'TW') {
    const avg = holding.finmindAvgDividendPerShare || 0
    const freq = holding.finmindDividendFrequency || 2
    return avg * (holding.shares || 0) * freq
  }
  // US: yahoo-fetched price first, fallback to manual
  const priceUSD = holding.yahooPrice || holding.manualPrice || holding.currentPrice || 0
  const yieldFrac = (holding.annualYieldPct || 0) / 100
  return priceUSD * yieldFrac * (holding.shares || 0) * usdNtd
}

// This month's expected dividend for one holding (NTD), 0 if not a dividend month
export function calcThisMonthDividend(holding, usdNtd = 32) {
  const thisMonth = new Date().getMonth() + 1

  if (holding.market === 'TW') {
    const dividendMonths = holding.finmindDividendMonths || []
    if (!dividendMonths.includes(thisMonth)) return 0
    const avg = holding.finmindAvgDividendPerShare || 0
    return avg * (holding.shares || 0)
  }

  // US: default quarterly (3, 6, 9, 12)
  const usMonths = holding.dividendMonths || [3, 6, 9, 12]
  if (!usMonths.includes(thisMonth)) return 0
  const priceUSD = holding.yahooPrice || holding.manualPrice || holding.currentPrice || 0
  const yieldFrac = (holding.annualYieldPct || 0) / 100
  return priceUSD * yieldFrac * (holding.shares || 0) * usdNtd / 4
}

// ── Shared refresh utility ────────────────────────────────────

// Fetch fresh FinMind data for one TW holding and write back via updateHoldingFn(userId, id, data)
// force=true bypasses staleness check and always re-fetches
export async function refreshHoldingFinMind(userId, holding, updateHoldingFn, { force = false } = {}) {
  if (holding.market !== 'TW') return
  const now = new Date().toISOString()
  const updates = {}
  if (force || isPriceStale(holding.finmindPriceUpdatedAt)) {
    const r = await fetchTWStockPrice(holding.ticker)
    if (r) {
      updates.finmindPrice = r.price
      updates.finmindPriceUpdatedAt = now
    }
  }
  if (force || isDividendStale(holding.finmindDividendUpdatedAt)) {
    const r = await fetchTWStockDividend(holding.ticker)
    updates.finmindDividends = r.records
    updates.finmindAvgDividendPerShare = r.avgDividendPerShare
    updates.finmindDividendFrequency = r.frequency
    updates.finmindDividendMonths = r.dividendMonths
    updates.finmindDividendUpdatedAt = now
  }
  if (Object.keys(updates).length > 0) {
    await updateHoldingFn(userId, holding.id, updates)
  }
}

// ── Formatting ────────────────────────────────────────────────

export function formatPriceUpdated(updatedAt) {
  if (!updatedAt) return null
  const d = new Date(updatedAt)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return `今日 ${d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`
  }
  return d.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })
}
