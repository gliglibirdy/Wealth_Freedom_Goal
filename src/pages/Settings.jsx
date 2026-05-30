import { useState, useEffect, useCallback, useRef } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { useAuth } from '../context/AuthContext'
import {
  Box, Tabs, Tab, Typography, Button, List, ListItem,
  ListItemText, ListItemSecondaryAction, IconButton, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, FormControlLabel, Switch,
  Paper, Stack, CircularProgress, Divider, Alert, Avatar,
  ToggleButtonGroup, ToggleButton, LinearProgress,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import LogoutIcon from '@mui/icons-material/Logout'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import EditNoteIcon from '@mui/icons-material/EditNote'
import RefreshIcon from '@mui/icons-material/Refresh'
import {
  getAccounts, addAccount, updateAccount, deleteAccount,
  getHoldings, addHolding, updateHolding, deleteHolding,
  getExchangeRates, updateExchangeRates,
  getSettings, updateSettings, saveRecord,
} from '../services/firestore'
import {
  hasToken, formatPriceUpdated, refreshHoldingFinMind,
} from '../services/finmind'
import { refreshHoldingYahoo } from '../services/yahoo'

const fmt = n => Math.round(n || 0).toLocaleString()

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ── Account Dialog ───────────────────────────────────────────
function AccountDialog({ open, initial, onClose, onSave }) {
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm()

  useEffect(() => {
    reset(initial || { name: '', currency: 'NTD', isFixed: false })
  }, [initial, reset])

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{initial ? '編輯帳戶' : '新增帳戶'}</DialogTitle>
      <form onSubmit={handleSubmit(onSave)}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            label="帳戶名稱"
            fullWidth
            autoFocus
            error={!!errors.name}
            helperText={errors.name ? '必填' : ''}
            {...register('name', { required: true })}
          />
          <Controller
            name="currency"
            control={control}
            render={({ field }) => (
              <TextField select label="幣別" fullWidth {...field}>
                <MenuItem value="NTD">NTD 新台幣</MenuItem>
                <MenuItem value="USD">USD 美元</MenuItem>
                <MenuItem value="JPY">JPY 日幣</MenuItem>
              </TextField>
            )}
          />
          <Controller
            name="isFixed"
            control={control}
            render={({ field }) => (
              <FormControlLabel
                control={<Switch checked={!!field.value} onChange={e => field.onChange(e.target.checked)} />}
                label={
                  <Box>
                    <Typography variant="body2">固定帳戶</Typography>
                    <Typography variant="caption" color="text.secondary">
                      餘額不常變動，每月自動帶入上月金額
                    </Typography>
                  </Box>
                }
              />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>取消</Button>
          <Button type="submit" variant="contained">儲存</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

// ── Holding Dialog ───────────────────────────────────────────
function HoldingDialog({ open, initial, onClose, onSave }) {
  const { register, handleSubmit, reset, control, watch, setValue, formState: { errors } } = useForm()
  const [mode, setMode] = useState('manual')
  const [recognizing, setRecognizing] = useState(false)
  const [ocrError, setOcrError] = useState('')
  const fileInputRef = useRef(null)
  const hasApiKey = !!import.meta.env.VITE_ANTHROPIC_API_KEY
  const market = watch('market', 'TW')

  useEffect(() => {
    if (!open) return
    setMode('manual')
    setOcrError('')
    setRecognizing(false)
    reset(initial ? {
      name: initial.name || '',
      ticker: initial.ticker || '',
      market: initial.market || 'TW',
      // US-only fields
      manualPrice: initial.manualPrice ?? initial.currentPrice ?? '',
      annualYieldPct: initial.annualYieldPct ?? '',
      dividendFrequency: initial.dividendFrequency ?? 4,
    } : {
      name: '', ticker: '', market: 'TW',
      manualPrice: '', annualYieldPct: '', dividendFrequency: 4,
    })
  }, [open, initial, reset])

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (!hasApiKey) {
      setOcrError('請先在 .env 設定 VITE_ANTHROPIC_API_KEY')
      return
    }

    setRecognizing(true)
    setOcrError('')

    try {
      const base64 = await fileToBase64(file)
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: file.type || 'image/jpeg', data: base64 },
              },
              {
                type: 'text',
                text: '這是台灣券商 App 的庫存明細截圖。請提取以下欄位，以純 JSON 格式回傳（僅回傳 JSON，不要其他說明文字）：\n{"ticker":"股票代號","name":"股票名稱"}',
              },
            ],
          }],
        }),
      })

      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error?.message || `HTTP ${resp.status}`)

      const text = data.content?.[0]?.text || ''
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error(`模型未回傳 JSON：${text.slice(0, 100)}`)
      const parsed = JSON.parse(match[0])

      if (parsed.ticker) setValue('ticker', parsed.ticker)
      if (parsed.name) setValue('name', parsed.name)

    } catch (err) {
      console.error('[OCR]', err)
      setOcrError(`辨識失敗：${err.message}`)
    } finally {
      setRecognizing(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{initial ? '編輯持股' : '新增持股'}</DialogTitle>
      <form onSubmit={handleSubmit(onSave)}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>

          {/* Mode toggle */}
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={(_, v) => { if (v) { setMode(v); setOcrError('') } }}
            size="small"
            fullWidth
          >
            <ToggleButton value="manual" sx={{ gap: 0.5 }}>
              <EditNoteIcon fontSize="small" /> 手動填寫
            </ToggleButton>
            <ToggleButton value="ocr" sx={{ gap: 0.5 }}>
              <CameraAltIcon fontSize="small" /> 截圖辨識
            </ToggleButton>
          </ToggleButtonGroup>

          {/* OCR section */}
          {mode === 'ocr' && (
            <Box>
              {!hasApiKey && (
                <Alert severity="warning" sx={{ mb: 1 }}>
                  需要在 <code>.env</code> 設定 <code>VITE_ANTHROPIC_API_KEY</code> 才能使用截圖辨識。
                </Alert>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleImageUpload} />
              <Button
                variant="outlined"
                startIcon={recognizing ? <CircularProgress size={16} /> : <CameraAltIcon />}
                onClick={() => fileInputRef.current?.click()}
                disabled={recognizing || !hasApiKey}
                fullWidth
              >
                {recognizing ? '辨識中…' : '選擇券商截圖上傳'}
              </Button>
              {recognizing && <LinearProgress sx={{ mt: 1 }} />}
              {ocrError && <Alert severity="error" sx={{ mt: 1 }}>{ocrError}</Alert>}
              {!recognizing && !ocrError && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  辨識代碼與股數後自動填入，可手動調整後儲存。
                </Typography>
              )}
            </Box>
          )}

          <Divider>
            <Typography variant="caption" color="text.secondary">
              {mode === 'ocr' ? '辨識結果（可調整）' : '股票資料'}
            </Typography>
          </Divider>

          {/* Market selector */}
          <Controller
            name="market"
            control={control}
            defaultValue="TW"
            render={({ field }) => (
              <TextField select label="市場" fullWidth {...field}>
                <MenuItem value="TW">台股（股價與配息自動取得）</MenuItem>
                <MenuItem value="US">美股（股價由 Yahoo Finance 自動取得）</MenuItem>
              </TextField>
            )}
          />

          {/* Ticker + Name */}
          <Stack direction="row" spacing={1.5}>
            <TextField
              label="代號"
              placeholder={market === 'TW' ? '0050' : 'VT'}
              sx={{ width: 110 }}
              error={!!errors.ticker}
              helperText={errors.ticker ? '必填' : ''}
              slotProps={{ inputLabel: { shrink: true } }}
              {...register('ticker', { required: true })}
            />
            <TextField
              label="股票名稱"
              placeholder={market === 'TW' ? '元大台灣50' : 'Vanguard Total World'}
              fullWidth
              error={!!errors.name}
              helperText={errors.name ? '必填' : ''}
              slotProps={{ inputLabel: { shrink: true } }}
              {...register('name', { required: true })}
            />
          </Stack>

          {/* TW info banner */}
          {market === 'TW' && (
            <Alert severity="info" icon={false} sx={{ py: 0.5 }}>
              台股股價與配息資料由 FinMind API 自動取得，儲存後系統會自動抓取。
            </Alert>
          )}

          {/* US-only fields */}
          {market === 'US' && (
            <>
              <Stack direction="row" spacing={1.5}>
                <TextField
                  label="手動股價（USD，可選）"
                  type="number"
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: '0.01', min: 0 } }}
                  sx={{ flex: 1 }}
                  placeholder="如：105.4"
                  helperText="留空則由 Yahoo Finance 自動取得"
                  {...register('manualPrice', { min: 0 })}
                />
                <TextField
                  label="年殖利率（%）"
                  type="number"
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: '0.01', min: 0 } }}
                  sx={{ flex: 1 }}
                  placeholder="如：3.5"
                  helperText="用於估算被動收入"
                  {...register('annualYieldPct', { min: 0 })}
                />
              </Stack>
              <Controller
                name="dividendFrequency"
                control={control}
                defaultValue={4}
                render={({ field }) => (
                  <TextField select label="配息頻率" fullWidth {...field}>
                    <MenuItem value={1}>年配（1次）</MenuItem>
                    <MenuItem value={2}>半年配（2次）</MenuItem>
                    <MenuItem value={4}>季配（4次）</MenuItem>
                  </TextField>
                )}
              />
            </>
          )}

        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>取消</Button>
          <Button type="submit" variant="contained">儲存</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

// ── Delete Confirm Dialog ────────────────────────────────────
function ConfirmDialog({ open, message, onClose, onConfirm }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>確認刪除</DialogTitle>
      <DialogContent>
        <Typography>{message}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button color="error" variant="contained" onClick={onConfirm}>刪除</Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Accounts Tab ─────────────────────────────────────────────
function AccountsTab({ userId }) {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState({ open: false, item: null })
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setAccounts(await getAccounts(userId))
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  const handleSave = async (data) => {
    if (dialog.item) {
      await updateAccount(userId, dialog.item.id, data)
    } else {
      await addAccount(userId, data)
    }
    setDialog({ open: false, item: null })
    load()
  }

  const handleDelete = async () => {
    await deleteAccount(userId, deleteTarget.id)
    setDeleteTarget(null)
    load()
  }

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}>
      <CircularProgress />
    </Box>
  )

  return (
    <Box>
      <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
          {accounts.length > 0 ? `共 ${accounts.length} 個帳戶` : '帳戶列表'}
        </Typography>
        <Button
          startIcon={<AddIcon />}
          variant="contained"
          size="small"
          onClick={() => setDialog({ open: true, item: null })}
        >
          新增帳戶
        </Button>
      </Stack>

      {accounts.length === 0 ? (
        <Alert severity="info">尚未新增任何帳戶，請點選「新增帳戶」開始設定。</Alert>
      ) : (
        <List disablePadding>
          {accounts.map((acc, i) => (
            <Box key={acc.id}>
              {i > 0 && <Divider />}
              <ListItem disableGutters sx={{ py: 1.5 }}>
                <ListItemText
                  primary={
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography>{acc.name}</Typography>
                      <Chip label={acc.currency} size="small" variant="outlined" />
                      {acc.isFixed && <Chip label="固定" size="small" color="primary" />}
                    </Stack>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton size="small" onClick={() => setDialog({ open: true, item: acc })}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => setDeleteTarget(acc)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            </Box>
          ))}
        </List>
      )}

      <AccountDialog
        open={dialog.open}
        initial={dialog.item}
        onClose={() => setDialog({ open: false, item: null })}
        onSave={handleSave}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        message={`確定要刪除「${deleteTarget?.name}」嗎？`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </Box>
  )
}

// ── Holdings Tab ─────────────────────────────────────────────
function HoldingsTab({ userId }) {
  const [holdings, setHoldings] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')
  const [dialog, setDialog] = useState({ open: false, item: null })
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [migrating, setMigrating] = useState(false)
  const [migrateMsg, setMigrateMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setHoldings(await getHoldings(userId))
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  const handleRefresh = async () => {
    const twHoldings = holdings.filter(h => h.market === 'TW')
    const usHoldings = holdings.filter(h => h.market === 'US')
    if (!twHoldings.length && !usHoldings.length) return

    setRefreshing(true)
    setRefreshMsg('')
    let done = 0
    const total = (hasToken() ? twHoldings.length : 0) + usHoldings.length

    if (twHoldings.length) {
      if (!hasToken()) {
        setRefreshMsg('VITE_FINMIND_TOKEN 未設定，跳過台股')
      } else {
        for (const h of twHoldings) {
          try {
            await refreshHoldingFinMind(userId, h, updateHolding, { force: true })
            done++
            setRefreshMsg(`更新中… ${done}/${total}`)
          } catch (e) {
            console.warn(`[FinMind] ${h.ticker}:`, e)
          }
          if (done < total) await new Promise(r => setTimeout(r, 300))
        }
      }
    }

    for (const h of usHoldings) {
      try {
        await refreshHoldingYahoo(userId, h, updateHolding, { force: true })
        done++
        setRefreshMsg(`更新中… ${done}/${total}`)
      } catch (e) {
        console.warn(`[Yahoo] ${h.ticker}:`, e)
        setRefreshMsg(`${h.ticker} 更新失敗：${e.message}`)
      }
      if (done < total) await new Promise(r => setTimeout(r, 300))
    }

    setRefreshing(false)
    setRefreshMsg(`已更新 ${done} 支持股`)
    load()
    setTimeout(() => setRefreshMsg(''), 4000)
  }

  const handleSave = async (data) => {
    const isTW = data.market === 'TW'

    const base = {
      name: data.name,
      ticker: data.ticker,
      market: data.market,
      currency: isTW ? 'TWD' : 'USD',
      updatedAt: new Date().toISOString().slice(0, 10),
    }

    const existing = dialog.item
    const payload = isTW ? {
      ...base,
      finmindPrice: existing?.finmindPrice || 0,
      finmindPriceUpdatedAt: existing?.finmindPriceUpdatedAt || null,
      finmindDividends: existing?.finmindDividends || [],
      finmindAvgDividendPerShare: existing?.finmindAvgDividendPerShare || 0,
      finmindDividendFrequency: existing?.finmindDividendFrequency || 2,
      finmindDividendMonths: existing?.finmindDividendMonths || [],
      finmindDividendUpdatedAt: existing?.finmindDividendUpdatedAt || null,
    } : {
      ...base,
      manualPrice: Number(data.manualPrice) || 0,
      annualYieldPct: Number(data.annualYieldPct) || 0,
      dividendFrequency: Number(data.dividendFrequency) || 4,
      dividendMonths: [3, 6, 9, 12],
      yahooPrice: existing?.yahooPrice || 0,
      yahooPriceUpdatedAt: existing?.yahooPriceUpdatedAt || null,
    }

    let savedId
    if (existing) {
      await updateHolding(userId, existing.id, payload)
      savedId = existing.id
    } else {
      const ref = await addHolding(userId, payload)
      savedId = ref.id
    }
    setDialog({ open: false, item: null })

    if (isTW && hasToken()) {
      refreshHoldingFinMind(userId, { ...payload, id: savedId }, updateHolding)
        .then(load)
        .catch(e => console.warn('[FinMind] Auto-fetch failed:', e))
    } else if (!isTW) {
      refreshHoldingYahoo(userId, { ...payload, id: savedId }, updateHolding)
        .then(load)
        .catch(e => console.warn('[Yahoo] Auto-fetch failed:', e))
    }

    load()
  }

  const handleMigrate = async () => {
    setMigrating(true)
    setMigrateMsg('')
    try {
      const rates = await getExchangeRates(userId)
      const usdNtd = rates.USD_NTD || 32
      const stockSnapshots = holdings.map(h => {
        const price = h.market === 'TW'
          ? (h.finmindPrice || h.currentPrice || 0)
          : (h.manualPrice || h.currentPrice || 0)
        const shares = h.shares || 0
        const avgCost = h.avgCost || 0
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
      await saveRecord(userId, '2026-05', { stockSnapshots, twStockTotal, usStockTotal })
      setMigrateMsg(`已將 ${stockSnapshots.length} 支持股遷移至 2026-05 紀錄`)
    } catch (e) {
      console.error('[migrate]', e)
      setMigrateMsg('遷移失敗：' + e.message)
    } finally {
      setMigrating(false)
    }
  }

  const handleDelete = async () => {
    await deleteHolding(userId, deleteTarget.id)
    setDeleteTarget(null)
    load()
  }

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}>
      <CircularProgress />
    </Box>
  )

  return (
    <Box>
      <Stack direction="row" alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap gap={1}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
          {holdings.length > 0 ? `共 ${holdings.length} 支持股` : '持股列表'}
        </Typography>
        <Button
          startIcon={refreshing ? <CircularProgress size={14} /> : <RefreshIcon />}
          size="small"
          variant="outlined"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? '更新中' : '重新整理'}
        </Button>
        <Button
          startIcon={<AddIcon />}
          variant="contained"
          size="small"
          onClick={() => setDialog({ open: true, item: null })}
        >
          新增持股
        </Button>
      </Stack>

      {refreshMsg && (
        <Alert severity={refreshMsg.includes('請先') ? 'warning' : 'success'} sx={{ mb: 1.5 }}>
          {refreshMsg}
        </Alert>
      )}

      {!hasToken() && holdings.some(h => h.market === 'TW') && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          尚未設定 VITE_FINMIND_TOKEN，台股股價與配息將無法自動取得。
        </Alert>
      )}

      {holdings.length === 0 ? (
        <Alert severity="info">尚未新增任何持股，請點選「新增持股」開始設定。</Alert>
      ) : (
        <List disablePadding>
          {holdings.map((h, i) => {
            const currentPx = h.market === 'TW'
              ? (h.finmindPrice || 0)
              : (h.yahooPrice || h.manualPrice || 0)
            const priceUpdated = h.market === 'TW'
              ? formatPriceUpdated(h.finmindPriceUpdatedAt)
              : formatPriceUpdated(h.yahooPriceUpdatedAt)
            const divPerShare = h.market === 'TW'
              ? (h.finmindAvgDividendPerShare || 0) * (h.finmindDividendFrequency || 2)
              : 0

            return (
              <Box key={h.id}>
                {i > 0 && <Divider />}
                <ListItem disableGutters sx={{ py: 1.5, alignItems: 'flex-start' }}>
                  <ListItemText
                    primary={
                      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                        <Typography fontWeight={600}>{h.name}</Typography>
                        <Chip label={h.ticker} size="small" variant="outlined" />
                        <Chip
                          label={h.market === 'TW' ? '台股' : '美股'}
                          size="small"
                          color={h.market === 'TW' ? 'success' : 'secondary'}
                        />
                      </Stack>
                    }
                    secondary={
                      <Stack spacing={0.25} sx={{ mt: 0.5 }}>
                        {currentPx > 0 ? (
                          <Typography variant="body2" color="text.secondary">
                            {h.market === 'TW'
                              ? `市價 NT$${currentPx}${priceUpdated ? ` (${priceUpdated})` : ''}`
                              : `市價 USD ${currentPx}${priceUpdated ? ` (${priceUpdated})` : ''}`
                            }
                          </Typography>
                        ) : (
                          <Typography variant="caption" color="text.disabled">
                            {h.market === 'TW'
                              ? '尚未取得 FinMind 股價，請點「重新整理」'
                              : '尚未取得 Yahoo Finance 股價，請點「重新整理」'}
                          </Typography>
                        )}
                        {divPerShare > 0 && (
                          <Typography variant="caption" color="success.main">
                            年配息/股 NT${divPerShare.toFixed(2)}
                          </Typography>
                        )}
                        {h.market === 'US' && h.annualYieldPct > 0 && (
                          <Typography variant="caption" color="text.secondary">
                            年殖利率 {h.annualYieldPct}%
                          </Typography>
                        )}
                      </Stack>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton size="small" onClick={() => setDialog({ open: true, item: h })}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => setDeleteTarget(h)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              </Box>
            )
          })}
        </List>
      )}

      <HoldingDialog
        open={dialog.open}
        initial={dialog.item}
        onClose={() => setDialog({ open: false, item: null })}
        onSave={handleSave}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        message={`確定要刪除「${deleteTarget?.name}」嗎？`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      <Divider sx={{ my: 2 }} />
      <Box>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>資料遷移</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          將持股設定中的股數與成交均價遷移至 2026-05 月份資產紀錄（僅需執行一次）。
        </Typography>
        {migrateMsg && (
          <Alert severity={migrateMsg.includes('失敗') ? 'error' : 'success'} sx={{ mb: 1 }}>
            {migrateMsg}
          </Alert>
        )}
        <Button
          variant="outlined"
          size="small"
          onClick={handleMigrate}
          disabled={migrating || holdings.length === 0}
          startIcon={migrating ? <CircularProgress size={14} /> : null}
        >
          {migrating ? '遷移中…' : '遷移持股至 2026-05 紀錄'}
        </Button>
      </Box>
    </Box>
  )
}

// ── Rates & Expense Tab ──────────────────────────────────────
function RatesTab({ userId }) {
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm()
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    Promise.all([getExchangeRates(userId), getSettings(userId)]).then(([rates, settings]) => {
      reset({
        USD_NTD: rates.USD_NTD,
        JPY_NTD: rates.JPY_NTD,
        monthlyExpense: settings.monthlyExpense || 0,
      })
    })
  }, [userId, reset])

  const onSubmit = async (data) => {
    await Promise.all([
      updateExchangeRates(userId, {
        USD_NTD: Number(data.USD_NTD),
        JPY_NTD: Number(data.JPY_NTD),
      }),
      updateSettings(userId, { monthlyExpense: Number(data.monthlyExpense) }),
    ])
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Stack spacing={3} sx={{ maxWidth: 360 }}>
        <Box>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>匯率設定</Typography>
          <Stack spacing={2}>
            <TextField
              label="1 USD = ? NTD"
              type="number"
              slotProps={{ htmlInput: { step: 0.01 } }}
              fullWidth
              {...register('USD_NTD', { required: true, min: 1 })}
            />
            <TextField
              label="1 JPY = ? NTD"
              type="number"
              slotProps={{ htmlInput: { step: 0.01 } }}
              fullWidth
              {...register('JPY_NTD', { required: true, min: 0.01 })}
            />
          </Stack>
        </Box>

        <Divider />

        <Box>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>財務自由計算基準</Typography>
          <TextField
            label="每月支出（NTD）"
            type="number"
            helperText="用於計算財務自由目標（月支出 × 12 × 25）"
            fullWidth
            {...register('monthlyExpense', { required: true, min: 0 })}
          />
        </Box>

        <Box>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting ? '儲存中...' : '儲存設定'}
          </Button>
          {saved && (
            <Typography variant="caption" color="success.main" sx={{ ml: 2 }}>已儲存</Typography>
          )}
        </Box>
      </Stack>
    </form>
  )
}

// ── Main Settings Page ───────────────────────────────────────
export default function Settings() {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState(0)

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h6" fontWeight={700}>設定</Typography>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Avatar src={user?.photoURL} sx={{ width: 32, height: 32 }} />
          <Typography variant="body2" color="text.secondary">{user?.displayName}</Typography>
          <IconButton size="small" onClick={logout} title="登出">
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>

      <Paper variant="outlined" sx={{ mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
          <Tab label="帳戶" />
          <Tab label="持股" />
          <Tab label="匯率與支出" />
        </Tabs>
      </Paper>

      <Box sx={{ py: 1 }}>
        {tab === 0 && <AccountsTab userId={user.uid} />}
        {tab === 1 && <HoldingsTab userId={user.uid} />}
        {tab === 2 && <RatesTab userId={user.uid} />}
      </Box>
    </Box>
  )
}
