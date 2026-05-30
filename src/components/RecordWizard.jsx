import { useState, useEffect } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Stepper, Step, StepLabel,
  TextField, Typography, Box, Stack, Divider,
  Table, TableBody, TableRow, TableCell,
  InputAdornment, CircularProgress, Alert, Chip,
  ToggleButtonGroup, ToggleButton,
} from '@mui/material'
import SyncIcon from '@mui/icons-material/Sync'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import DashboardIcon from '@mui/icons-material/Dashboard'
import { saveRecord } from '../services/firestore'

const fmt = n => Math.round(n || 0).toLocaleString()

// ── TWSE 即時股價（透過 CORS proxy）────────────────────────────
async function fetchTWSEPrice(ticker) {
  const encode = s => encodeURIComponent(s)
  const base = 'https://corsproxy.io/?'

  for (const exchange of ['tse', 'otc']) {
    try {
      const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${exchange}_${ticker}.tw&json=1&delay=0`
      const resp = await fetch(base + encode(url), { signal: AbortSignal.timeout(6000) })
      const data = await resp.json()
      const info = data.msgArray?.[0]
      if (!info) continue
      const price = info.z !== '-' ? parseFloat(info.z) : parseFloat(info.y)
      if (!isNaN(price) && price > 0) return price
    } catch { /* try next */ }
  }
  return null
}

// ── mode → steps ────────────────────────────────────────────
function getSteps(mode) {
  if (mode === 'bank')  return ['銀行存款', '確認儲存']
  if (mode === 'stock') return ['股票市值', '確認儲存']
  return ['銀行存款', '股票市值', '確認儲存']  // 'both'
}

// Which stepper step index corresponds to which screen
// returns: 'bank' | 'stock' | 'confirm'
function screenAt(mode, step) {
  if (mode === 'bank')  return step === 0 ? 'bank'  : 'confirm'
  if (mode === 'stock') return step === 0 ? 'stock' : 'confirm'
  // 'both'
  if (step === 0) return 'bank'
  if (step === 1) return 'stock'
  return 'confirm'
}

export default function RecordWizard({
  open, onClose, onSaved,
  userId, accounts, holdings, rates,
  lastRecord, editRecord,
}) {
  const today = new Date()
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  // 'select' = mode picker screen, otherwise 'bank'|'stock'|'both'
  const [mode, setMode] = useState('select')
  const [step, setStep] = useState(0)
  const [month, setMonth] = useState(defaultMonth)
  const [bankAmounts, setBankAmounts] = useState({})
  const [stockPrices, setStockPrices] = useState({})
  const [passiveIncome, setPassiveIncome] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [fetchMsg, setFetchMsg] = useState('')

  const usdNtd = rates?.USD_NTD || 32
  const jpyNtd = rates?.JPY_NTD || 0.21

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return
    setSaving(false)
    setFetchMsg('')

    if (editRecord) {
      // Edit mode: skip mode selection, show full flow
      setMode('both')
      setStep(0)
      setMonth(editRecord.month)
      const ba = {}
      editRecord.bankSnapshots?.forEach(s => { ba[s.accountId] = String(s.balance) })
      setBankAmounts(ba)
      const sp = {}
      editRecord.stockSnapshots?.forEach(s => { sp[s.holdingId] = String(s.price) })
      setStockPrices(sp)
      setPassiveIncome(String(editRecord.passiveIncome ?? ''))
      setNote(editRecord.note || '')
    } else {
      setMode('select')
      setStep(0)
      setMonth(defaultMonth)
      // Pre-fill bank from last record
      const ba = {}
      if (lastRecord) {
        accounts.forEach(acc => {
          if (acc.isFixed) {
            const snap = lastRecord.bankSnapshots?.find(s => s.accountId === acc.id)
            if (snap) ba[acc.id] = String(snap.balance)
          }
        })
      }
      setBankAmounts(ba)
      // Pre-fill stock prices from holdings.currentPrice
      const sp = {}
      holdings.forEach(h => {
        if (h.currentPrice > 0) sp[h.id] = String(h.currentPrice)
      })
      setStockPrices(sp)
      setPassiveIncome('')
      setNote('')
    }
  }, [open])

  // Auto-fetch TW stock prices from TWSE
  const fetchTWPrices = async () => {
    const twHoldings = holdings.filter(h => h.market === 'TW')
    if (!twHoldings.length) return
    setFetching(true)
    setFetchMsg('')
    try {
      const results = await Promise.all(twHoldings.map(h => fetchTWSEPrice(h.ticker)))
      const updates = {}
      const failed = []
      twHoldings.forEach((h, i) => {
        if (results[i] != null) updates[h.id] = String(results[i])
        else failed.push(h.ticker)
      })
      setStockPrices(p => ({ ...p, ...updates }))
      if (failed.length) {
        setFetchMsg(`${failed.join('、')} 抓取失敗，請手動輸入`)
      } else {
        setFetchMsg(`已更新 ${Object.keys(updates).length} 支台股股價`)
      }
    } catch {
      setFetchMsg('股價抓取失敗，請手動輸入')
    } finally {
      setFetching(false)
    }
  }

  const toNTD = (val, currency) => {
    if (currency === 'USD') return val * usdNtd
    if (currency === 'JPY') return val * jpyNtd
    return val
  }

  // Use last record values for skipped sections
  const bankSnapshots = accounts.map(acc => {
    let balance
    if (mode === 'stock' && lastRecord) {
      // Not updating bank — carry forward last record
      const prev = lastRecord.bankSnapshots?.find(s => s.accountId === acc.id)
      balance = prev?.balance ?? 0
    } else {
      balance = parseFloat(bankAmounts[acc.id]) || 0
    }
    return {
      accountId: acc.id,
      name: acc.name,
      currency: acc.currency,
      balance,
      balanceNTD: Math.round(toNTD(balance, acc.currency)),
    }
  })
  const bankTotal = bankSnapshots.reduce((s, x) => s + x.balanceNTD, 0)

  const stockSnapshots = holdings.map(h => {
    let price
    if (mode === 'bank' && lastRecord) {
      // Not updating stocks — carry forward last record
      const prev = lastRecord.stockSnapshots?.find(s => s.holdingId === h.id)
      price = prev?.price ?? 0
    } else {
      price = parseFloat(stockPrices[h.id]) || 0
    }
    const marketValueNTD = Math.round(h.shares * price * (h.market === 'US' ? usdNtd : 1))
    return {
      holdingId: h.id,
      name: h.name,
      ticker: h.ticker,
      market: h.market,
      shares: h.shares,
      price,
      currency: h.market === 'US' ? 'USD' : 'NTD',
      marketValueNTD,
    }
  })
  const twStockTotal = stockSnapshots.filter(s => s.market === 'TW').reduce((s, x) => s + x.marketValueNTD, 0)
  const usStockTotal = stockSnapshots.filter(s => s.market === 'US').reduce((s, x) => s + x.marketValueNTD, 0)
  const totalAssets = bankTotal + twStockTotal + usStockTotal

  // Support both new schema (dividendPerShare) and old (dividendYield)
  const estimatedMonthlyDiv = Math.round(
    holdings.reduce((sum, h) => {
      if (h.dividendPerShare > 0) {
        return sum + (h.dividendPerShare * h.shares * (h.dividendFrequency || 2) / 12)
      }
      if (h.dividendYield > 0) {
        const snap = stockSnapshots.find(s => s.holdingId === h.id)
        return sum + ((snap?.marketValueNTD || 0) * h.dividendYield / 100 / 12)
      }
      return sum
    }, 0)
  )

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveRecord(userId, month, {
        month,
        updatedAt: new Date().toISOString(),
        note,
        bankSnapshots,
        bankTotal,
        stockSnapshots,
        twStockTotal,
        usStockTotal,
        totalAssets,
        passiveIncome: parseFloat(passiveIncome) || 0,
        estimatedMonthlyDividend: estimatedMonthlyDiv,
        exchangeRates: { USD_NTD: usdNtd, JPY_NTD: jpyNtd },
      })
      onSaved()
      onClose()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const hasTWHoldings = holdings.some(h => h.market === 'TW')
  const steps = mode !== 'select' ? getSteps(mode) : []
  const screen = mode !== 'select' ? screenAt(mode, step) : null

  const confirmDisabled = saving
  const nextDisabled = fetching
  const lastStep = steps.length - 1

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {editRecord
          ? `編輯紀錄 — ${editRecord.month}`
          : mode === 'select' ? '新增月份紀錄' : `新增紀錄 — ${month}`}
      </DialogTitle>

      <DialogContent dividers>

        {/* ── Mode selection screen ─────────────────────── */}
        {mode === 'select' && (
          <Stack spacing={3}>
            <TextField
              label="月份"
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />

            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                本次要更新哪些資料？
              </Typography>
              <Stack spacing={1.5}>
                <ModeCard
                  icon={<AccountBalanceIcon />}
                  title="只更新存款"
                  description="手動輸入各銀行帳戶餘額，股票沿用上次紀錄"
                  onClick={() => { setMode('bank'); setStep(0) }}
                  disabled={accounts.length === 0}
                  disabledHint="請先在「設定 → 帳戶」新增銀行帳戶"
                />
                <ModeCard
                  icon={<ShowChartIcon />}
                  title="只更新股票"
                  description="自動抓取台股股價，銀行存款沿用上次紀錄"
                  onClick={() => { setMode('stock'); setStep(0) }}
                  disabled={holdings.length === 0}
                  disabledHint="請先在「設定 → 持股」新增持股資料"
                />
                <ModeCard
                  icon={<DashboardIcon />}
                  title="全部更新"
                  description="同時更新存款與股票，取得最完整的資產快照"
                  onClick={() => { setMode('both'); setStep(0) }}
                />
              </Stack>
            </Box>

            {!lastRecord && (mode === 'bank' || mode === 'stock') && (
              <Alert severity="info" sx={{ mt: 1 }}>
                尚無上月紀錄，建議選擇「全部更新」取得完整資產快照。
              </Alert>
            )}
          </Stack>
        )}

        {/* ── Stepper (non-select mode) ─────────────────── */}
        {mode !== 'select' && (
          <>
            <Stepper activeStep={step} sx={{ mb: 3 }}>
              {steps.map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
            </Stepper>

            {/* ── Bank screen ───────────────────────────── */}
            {screen === 'bank' && (
              <Stack spacing={2}>
                {mode === 'both' && (
                  <TextField
                    label="月份"
                    type="month"
                    value={month}
                    onChange={e => setMonth(e.target.value)}
                    fullWidth
                    disabled={!!editRecord}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                )}

                {accounts.length === 0 ? (
                  <Typography color="text.secondary" variant="body2">
                    請先在「設定 → 帳戶」新增銀行帳戶。
                  </Typography>
                ) : accounts.map(acc => (
                  <TextField
                    key={acc.id}
                    label={`${acc.name}（${acc.currency}）`}
                    type="number"
                    value={bankAmounts[acc.id] ?? ''}
                    onChange={e => setBankAmounts(p => ({ ...p, [acc.id]: e.target.value }))}
                    fullWidth
                    helperText={acc.isFixed ? '固定帳戶，已自動帶入上月餘額' : undefined}
                    slotProps={{
                      htmlInput: { step: 1, min: 0 },
                      ...(acc.currency !== 'NTD' && {
                        input: {
                          endAdornment: (
                            <InputAdornment position="end">
                              <Typography variant="caption" color="text.secondary" noWrap>
                                ≈ NT${fmt(toNTD(parseFloat(bankAmounts[acc.id]) || 0, acc.currency))}
                              </Typography>
                            </InputAdornment>
                          ),
                        },
                      }),
                    }}
                  />
                ))}

                <Box sx={{ textAlign: 'right', pt: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    存款小計：<strong>NT${fmt(bankTotal)}</strong>
                  </Typography>
                </Box>
              </Stack>
            )}

            {/* ── Stock screen ──────────────────────────── */}
            {screen === 'stock' && (
              <Stack spacing={2}>
                {hasTWHoldings && (
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={fetching ? <CircularProgress size={14} /> : <SyncIcon />}
                      onClick={fetchTWPrices}
                      disabled={fetching}
                    >
                      {fetching ? '抓取中…' : '自動抓取台股股價'}
                    </Button>
                    {fetchMsg && (
                      <Typography variant="caption" color={fetchMsg.includes('失敗') ? 'error' : 'success.main'}>
                        {fetchMsg}
                      </Typography>
                    )}
                  </Stack>
                )}

                {holdings.length === 0 ? (
                  <Typography color="text.secondary" variant="body2">
                    尚未設定持股，可直接跳至下一步。
                  </Typography>
                ) : holdings.map(h => (
                  <TextField
                    key={h.id}
                    label={`${h.name}（${h.ticker}）× ${h.shares.toLocaleString()} 股`}
                    type="number"
                    value={stockPrices[h.id] ?? ''}
                    onChange={e => setStockPrices(p => ({ ...p, [h.id]: e.target.value }))}
                    fullWidth
                    placeholder={h.market === 'US' ? '輸入 USD 股價' : '輸入 NTD 股價'}
                    slotProps={{
                      inputLabel: { shrink: true },
                      htmlInput: { step: 0.01, min: 0 },
                      input: {
                        startAdornment: h.market === 'US'
                          ? <InputAdornment position="start"><Chip label="USD" size="small" /></InputAdornment>
                          : undefined,
                        endAdornment: (
                          <InputAdornment position="end">
                            <Typography variant="caption" color="text.secondary" noWrap>
                              = NT${fmt(h.shares * (parseFloat(stockPrices[h.id]) || 0) * (h.market === 'US' ? usdNtd : 1))}
                            </Typography>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                ))}

                <Divider />
                <Box sx={{ textAlign: 'right' }}>
                  {twStockTotal > 0 && (
                    <Typography variant="body2" color="text.secondary">台股：NT${fmt(twStockTotal)}</Typography>
                  )}
                  {usStockTotal > 0 && (
                    <Typography variant="body2" color="text.secondary">美股：NT${fmt(usStockTotal)}</Typography>
                  )}
                  <Typography variant="body2">
                    股票小計：<strong>NT${fmt(twStockTotal + usStockTotal)}</strong>
                  </Typography>
                  {estimatedMonthlyDiv > 0 && (
                    <Typography variant="caption" color="success.main">
                      預估月股息：NT${fmt(estimatedMonthlyDiv)}
                    </Typography>
                  )}
                </Box>
              </Stack>
            )}

            {/* ── Confirm screen ────────────────────────── */}
            {screen === 'confirm' && (
              <Stack spacing={2}>
                {mode !== 'both' && (
                  <Alert severity="info" variant="outlined" sx={{ py: 0.5 }}>
                    {mode === 'bank'
                      ? '股票數值沿用上月紀錄'
                      : '銀行存款沿用上月紀錄'}
                  </Alert>
                )}
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell sx={{ pl: 0 }}>銀行存款</TableCell>
                      <TableCell align="right">NT${fmt(bankTotal)}</TableCell>
                    </TableRow>
                    {twStockTotal > 0 && (
                      <TableRow>
                        <TableCell sx={{ pl: 0 }}>台股</TableCell>
                        <TableCell align="right">NT${fmt(twStockTotal)}</TableCell>
                      </TableRow>
                    )}
                    {usStockTotal > 0 && (
                      <TableRow>
                        <TableCell sx={{ pl: 0 }}>美股</TableCell>
                        <TableCell align="right">NT${fmt(usStockTotal)}</TableCell>
                      </TableRow>
                    )}
                    <TableRow sx={{ '& td': { fontWeight: 700, borderTop: '2px solid', borderColor: 'divider' } }}>
                      <TableCell sx={{ pl: 0 }}>本月總資產</TableCell>
                      <TableCell align="right">NT${fmt(totalAssets)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>

                <Divider />

                <TextField
                  label="本月實際被動收入（NT$）"
                  type="number"
                  value={passiveIncome}
                  onChange={e => setPassiveIncome(e.target.value)}
                  fullWidth
                  placeholder="0"
                  helperText={estimatedMonthlyDiv > 0 ? `預估月股息：NT$${fmt(estimatedMonthlyDiv)}` : undefined}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 1, min: 0 } }}
                />
                <TextField
                  label="備註（選填）"
                  multiline
                  rows={2}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  fullWidth
                />
              </Stack>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving}>取消</Button>
        <Box sx={{ flex: 1 }} />

        {/* Back button */}
        {mode !== 'select' && step > 0 && (
          <Button onClick={() => setStep(s => s - 1)} disabled={saving || fetching}>
            上一步
          </Button>
        )}
        {mode !== 'select' && step === 0 && !editRecord && (
          <Button onClick={() => { setMode('select'); setStep(0) }} disabled={saving}>
            返回
          </Button>
        )}

        {/* Next / Save */}
        {mode === 'select' ? null : step < lastStep ? (
          <Button variant="contained" onClick={() => setStep(s => s + 1)} disabled={nextDisabled}>
            下一步
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={confirmDisabled}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {saving ? '儲存中...' : '確認儲存'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

// ── Mode selection card ──────────────────────────────────────
function ModeCard({ icon, title, description, onClick, disabled, disabledHint }) {
  return (
    <Box
      onClick={disabled ? undefined : onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 2,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'all 0.15s',
        '&:hover': disabled ? {} : {
          borderColor: 'primary.main',
          bgcolor: 'primary.50',
        },
      }}
    >
      <Box sx={{ color: disabled ? 'text.disabled' : 'primary.main', display: 'flex' }}>
        {icon}
      </Box>
      <Box sx={{ flex: 1 }}>
        <Typography variant="body1" fontWeight={600}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {disabled ? disabledHint : description}
        </Typography>
      </Box>
      {!disabled && (
        <Typography variant="body2" color="primary.main">›</Typography>
      )}
    </Box>
  )
}
