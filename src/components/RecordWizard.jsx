import { useState, useEffect } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Stepper, Step, StepLabel,
  TextField, Typography, Box, Stack, Divider, Chip,
  Table, TableBody, TableRow, TableCell,
  InputAdornment, CircularProgress, Alert,
} from '@mui/material'
import { saveRecord } from '../services/firestore'
import { calcAnnualDividend } from '../services/finmind'

const fmt = n => Math.round(n || 0).toLocaleString()
const STEPS = ['銀行存款', '本月持股', '確認儲存']

export default function RecordWizard({
  open, onClose, onSaved,
  userId, accounts, holdings, rates,
  lastRecord, editRecord,
}) {
  const today = new Date()
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const [step, setStep] = useState(0)
  const [month, setMonth] = useState(defaultMonth)
  const [bankAmounts, setBankAmounts] = useState({})
  const [holdingAmounts, setHoldingAmounts] = useState({})
  const [passiveIncome, setPassiveIncome] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const usdNtd = rates?.USD_NTD || 32
  const jpyNtd = rates?.JPY_NTD || 0.21

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return
    setSaving(false)
    setStep(0)

    if (editRecord) {
      setMonth(editRecord.month)
      const ba = {}
      editRecord.bankSnapshots?.forEach(s => { ba[s.accountId] = String(s.balance) })
      setBankAmounts(ba)
      const ha = {}
      editRecord.stockSnapshots?.forEach(s => {
        ha[s.holdingId] = { shares: String(s.shares || ''), avgCost: String(s.avgCost || '') }
      })
      setHoldingAmounts(ha)
      setPassiveIncome(String(editRecord.passiveIncome ?? ''))
      setNote(editRecord.note || '')
    } else {
      setMonth(defaultMonth)
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
      const ha = {}
      if (lastRecord) {
        lastRecord.stockSnapshots?.forEach(s => {
          ha[s.holdingId] = { shares: String(s.shares || ''), avgCost: String(s.avgCost || '') }
        })
      }
      setHoldingAmounts(ha)
      setPassiveIncome('')
      setNote('')
    }
  }, [open])

  const toNTD = (val, currency) => {
    if (currency === 'USD') return val * usdNtd
    if (currency === 'JPY') return val * jpyNtd
    return val
  }

  const bankSnapshots = accounts.map(acc => {
    const balance = parseFloat(bankAmounts[acc.id]) || 0
    return {
      accountId: acc.id,
      name: acc.name,
      currency: acc.currency,
      balance,
      balanceNTD: Math.round(toNTD(balance, acc.currency)),
    }
  })
  const bankTotal = bankSnapshots.reduce((s, x) => s + x.balanceNTD, 0)

  // Stock snapshots built from user-entered shares/avgCost + cached prices
  const stockSnapshots = holdings.map(h => {
    const ha = holdingAmounts[h.id] || {}
    const shares = parseFloat(ha.shares) || 0
    const avgCost = parseFloat(ha.avgCost) || 0
    // For US stocks: prefer live yahooPrice, fallback to manualPrice, then to previously stored snapshot price
    const prevSnapPrice =
      editRecord?.stockSnapshots?.find(s => s.holdingId === h.id)?.price ??
      lastRecord?.stockSnapshots?.find(s => s.holdingId === h.id)?.price ??
      0
    const price = h.market === 'TW'
      ? (h.finmindPrice || 0)
      : (h.yahooPrice || h.manualPrice || prevSnapPrice)
    const marketValueNTD = Math.round(shares * price * (h.market === 'US' ? usdNtd : 1))
    return {
      holdingId: h.id,
      name: h.name,
      ticker: h.ticker,
      market: h.market,
      shares,
      avgCost,
      price,
      priceSource: h.market === 'TW' && h.finmindPrice ? 'auto' : 'manual',
      currency: h.market === 'US' ? 'USD' : 'NTD',
      marketValueNTD,
    }
  })
  const twStockTotal = stockSnapshots.filter(s => s.market === 'TW').reduce((s, x) => s + x.marketValueNTD, 0)
  const usStockTotal = stockSnapshots.filter(s => s.market === 'US').reduce((s, x) => s + x.marketValueNTD, 0)
  const totalAssets = bankTotal + twStockTotal + usStockTotal

  const estimatedMonthlyDiv = Math.round(
    holdings.reduce((sum, h) => sum + calcAnnualDividend(h, usdNtd) / 12, 0)
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

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {editRecord ? `編輯紀錄 — ${editRecord.month}` : `新增紀錄 — ${month}`}
      </DialogTitle>

      <DialogContent dividers>
        <Stepper activeStep={step} sx={{ mb: 3 }}>
          {STEPS.map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
        </Stepper>

        {/* ── 銀行存款 ─────────────────────────────────────── */}
        {step === 0 && (
          <Stack spacing={2}>
            <TextField
              label="月份"
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              fullWidth
              disabled={!!editRecord}
              slotProps={{ inputLabel: { shrink: true } }}
            />

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

        {/* ── 本月持股 ─────────────────────────────────────── */}
        {step === 1 && (
          <Stack spacing={2.5}>
            {holdings.length === 0 ? (
              <Alert severity="info">
                尚無追蹤中的股票，請先在「設定 → 持股」新增股票後再記錄。
              </Alert>
            ) : holdings.map(h => {
              const ha = holdingAmounts[h.id] || {}
              const shares = parseFloat(ha.shares) || 0
              const prevSnapPrice =
                editRecord?.stockSnapshots?.find(s => s.holdingId === h.id)?.price ??
                lastRecord?.stockSnapshots?.find(s => s.holdingId === h.id)?.price ??
                0
              const price = h.market === 'TW'
                ? (h.finmindPrice || 0)
                : (h.yahooPrice || h.manualPrice || prevSnapPrice)
              const value = Math.round(shares * price * (h.market === 'US' ? usdNtd : 1))
              return (
                <Box key={h.id}>
                  <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1 }}>
                    <Typography variant="body2" fontWeight={600}>{h.name}</Typography>
                    <Chip label={h.ticker} size="small" variant="outlined" />
                    <Chip
                      label={h.market === 'TW' ? '台股' : '美股'}
                      size="small"
                      color={h.market === 'TW' ? 'success' : 'secondary'}
                    />
                  </Stack>
                  <Stack direction="row" spacing={1.5}>
                    <TextField
                      label="股數"
                      type="number"
                      value={ha.shares ?? ''}
                      onChange={e => setHoldingAmounts(p => ({ ...p, [h.id]: { ...p[h.id], shares: e.target.value } }))}
                      slotProps={{ htmlInput: { step: 0.0001, min: 0 } }}
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      label={h.market === 'TW' ? '成交均價（NT$）' : '成交均價（USD）'}
                      type="number"
                      value={ha.avgCost ?? ''}
                      onChange={e => setHoldingAmounts(p => ({ ...p, [h.id]: { ...p[h.id], avgCost: e.target.value } }))}
                      slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: '0.01', min: 0 } }}
                      sx={{ flex: 1 }}
                    />
                  </Stack>
                  {value > 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      市值約 NT${value.toLocaleString()}
                      {price > 0 ? `（參考價 ${h.market === 'TW' ? `NT$${price}` : `USD ${price}`}）` : ''}
                    </Typography>
                  )}
                </Box>
              )
            })}
            {holdings.length > 0 && (
              <Box sx={{ textAlign: 'right', pt: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                  股票小計：<strong>NT${fmt(twStockTotal + usStockTotal)}</strong>
                </Typography>
              </Box>
            )}
          </Stack>
        )}

        {/* ── 確認儲存 ─────────────────────────────────────── */}
        {step === 2 && (
          <Stack spacing={2}>
            <Table size="small">
              <TableBody>
                <TableRow>
                  <TableCell sx={{ pl: 0 }}>銀行存款</TableCell>
                  <TableCell align="right">NT${fmt(bankTotal)}</TableCell>
                </TableRow>
                {twStockTotal > 0 && (
                  <TableRow>
                    <TableCell sx={{ pl: 0 }}>台股（自動計算）</TableCell>
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

            {hasTWHoldings && (
              <Alert severity="info" variant="outlined" sx={{ py: 0.5 }}>
                台股市值由 FinMind API 自動計算（使用最新快取股價）
              </Alert>
            )}

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
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving}>取消</Button>
        <Box sx={{ flex: 1 }} />
        {step > 0 && (
          <Button onClick={() => setStep(s => s - 1)} disabled={saving}>上一步</Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button variant="contained" onClick={() => setStep(s => s + 1)}>下一步</Button>
        ) : (
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {saving ? '儲存中...' : '確認儲存'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
