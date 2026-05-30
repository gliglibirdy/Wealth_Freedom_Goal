// Yahoo Finance unofficial API — for US stocks only
// Set VITE_YAHOO_PROXY in .env.local if you run into CORS issues.
// Example: VITE_YAHOO_PROXY=https://corsproxy.io/?

// Default to corsproxy.io to avoid CORS issues in the browser.
// Override with VITE_YAHOO_PROXY in .env.local if needed.
const PROXY = import.meta.env.VITE_YAHOO_PROXY || 'https://corsproxy.io/?'

export async function fetchYahooPrice(ticker) {
  const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=2d`
  const url = PROXY ? `${PROXY}${target}` : target

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status}`)
  const json = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error('Yahoo: 無資料')
  const price = result.meta?.regularMarketPrice
  if (!price) throw new Error('Yahoo: 無法取得股價')
  return { price, currency: result.meta?.currency || 'USD' }
}

export function isYahooPriceStale(updatedAt) {
  if (!updatedAt) return true
  return (Date.now() - new Date(updatedAt).getTime()) > 8 * 60 * 60 * 1000
}

export async function refreshHoldingYahoo(userId, holding, updateHoldingFn, { force = false } = {}) {
  if (holding.market !== 'US') return
  if (!force && !isYahooPriceStale(holding.yahooPriceUpdatedAt)) return

  const { price } = await fetchYahooPrice(holding.ticker)
  await updateHoldingFn(userId, holding.id, {
    yahooPrice: price,
    yahooPriceUpdatedAt: new Date().toISOString(),
  })
}
