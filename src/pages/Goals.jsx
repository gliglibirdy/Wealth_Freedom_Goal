import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  Box, Typography, Stack, Card, CardContent,
  CircularProgress, Alert, Button, Divider, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, IconButton, LinearProgress,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import { getRecords, getSettings, getHoldings, getGoals, addGoal, updateGoal, deleteGoal } from '../services/firestore'

const fmt = n => Math.round(n || 0).toLocaleString()

// ── 複利推算達成年份 ─────────────────────────────────────────
function estimateYears(currentAssets, target, monthlyContrib, annualReturnPct) {
  if (currentAssets >= target) return 0
  if (target <= 0) return null
  const r = annualReturnPct / 100 / 12
  let assets = currentAssets
  let months = 0
  const MAX = 12 * 100
  while (assets < target && months < MAX) {
    assets = assets * (1 + r) + monthlyContrib
    months++
  }
  return months >= MAX ? null : Math.round(months / 12 * 10) / 10
}

function currentYear() { return new Date().getFullYear() }

// ── Sub-components ───────────────────────────────────────────

function ProgressBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(value / max * 100, 100) : 0
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">NT${fmt(value)}</Typography>
        <Typography variant="caption" fontWeight={700} color={color || 'primary.main'}>
          {pct.toFixed(1)}%
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 8, borderRadius: 1,
          bgcolor: 'grey.100',
          '& .MuiLinearProgress-bar': { bgcolor: color || 'primary.main', borderRadius: 1 },
        }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', textAlign: 'right' }}>
        目標 NT${fmt(max)}
      </Typography>
    </Box>
  )
}

function ScenarioCard({ label, years, returnPct, color }) {
  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 0 }}>
      <CardContent sx={{ pb: '16px !important', textAlign: 'center' }}>
        <Chip label={`年報酬 ${returnPct}%`} size="small" sx={{ mb: 1, bgcolor: color + '22', color }} />
        <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
        <Typography variant="h5" fontWeight={800} color={color}>
          {years === 0 ? '已達成！' : years == null ? '100年+' : `${years} 年`}
        </Typography>
        {years != null && years > 0 && (
          <Typography variant="caption" color="text.secondary">
            約 {currentYear() + Math.ceil(years)} 年
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}

// ── Goal dialog ──────────────────────────────────────────────

function GoalDialog({ open, onClose, onSave, initial }) {
  const [name, setName] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [deadline, setDeadline] = useState('')

  useEffect(() => {
    if (open) {
      setName(initial?.name || '')
      setTargetAmount(initial?.targetAmount ? String(initial.targetAmount) : '')
      setDeadline(initial?.deadline || '')
    }
  }, [open, initial])

  const valid = name.trim() && parseFloat(targetAmount) > 0

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{initial ? '編輯目標' : '新增目標'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="目標名稱"
            value={name}
            onChange={e => setName(e.target.value)}
            fullWidth
            placeholder="例：買車頭期款"
          />
          <TextField
            label="目標金額（NT$）"
            type="number"
            value={targetAmount}
            onChange={e => setTargetAmount(e.target.value)}
            fullWidth
            slotProps={{ htmlInput: { min: 1, step: 1000 } }}
          />
          <TextField
            label="截止日期（選填）"
            type="month"
            value={deadline}
            onChange={e => setDeadline(e.target.value)}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>取消</Button>
        <Button
          variant="contained"
          disabled={!valid}
          onClick={() => onSave({ name: name.trim(), targetAmount: parseFloat(targetAmount), deadline })}
        >
          儲存
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Main component ───────────────────────────────────────────

export default function Goals() {
  const { user } = useAuth()
  const [records, setRecords] = useState([])
  const [settings, setSettings] = useState(null)
  const [holdings, setHoldings] = useState([])
  const [goals, setGoalsList] = useState([])
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState({ open: false, edit: null })
  const [deleteId, setDeleteId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [r, s, h, g] = await Promise.all([
      getRecords(user.uid),
      getSettings(user.uid),
      getHoldings(user.uid),
      getGoals(user.uid),
    ])
    setRecords(r)
    setSettings(s)
    setHoldings(h)
    setGoalsList(g)
    setLoading(false)
  }, [user.uid])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', pt: 6 }}>
      <CircularProgress />
    </Box>
  )

  // ── Calculations ─────────────────────────────────────────
  const latest = records[0]
  const currentAssets = latest?.totalAssets || 0
  const monthlyExpense = settings?.monthlyExpense || 0
  const freedomTarget = monthlyExpense * 12 * 25

  // 每月新增估算（近 6 個月平均資產增加額）
  const recentPairs = records.slice(0, 6)
  const monthlyContrib = recentPairs.length >= 2
    ? Math.max(0, recentPairs.reduce((sum, r, i, arr) => {
        if (i === arr.length - 1) return sum
        return sum + (arr[i].totalAssets - arr[i + 1].totalAssets)
      }, 0) / (recentPairs.length - 1))
    : 0

  // 預估月股息
  const estimatedDiv = latest?.estimatedMonthlyDividend || Math.round(
    holdings.reduce((sum, h) => {
      if (h.dividendPerShare > 0) return sum + h.dividendPerShare * h.shares * (h.dividendFrequency || 2) / 12
      return sum
    }, 0)
  )

  const scenarios = [
    { label: '保守', returnPct: 5, color: '#42A5F5' },
    { label: '中性', returnPct: 8, color: '#66BB6A' },
    { label: '樂觀', returnPct: 12, color: '#FFA726' },
  ].map(s => ({
    ...s,
    years: freedomTarget > 0
      ? estimateYears(currentAssets, freedomTarget, monthlyContrib, s.returnPct)
      : null,
  }))

  // ── Goal CRUD ────────────────────────────────────────────
  const handleSaveGoal = async (data) => {
    if (dialog.edit) {
      await updateGoal(user.uid, dialog.edit.id, data)
    } else {
      await addGoal(user.uid, { ...data, createdAt: new Date().toISOString() })
    }
    setDialog({ open: false, edit: null })
    load()
  }

  const handleDelete = async (id) => {
    await deleteGoal(user.uid, id)
    setDeleteId(null)
    load()
  }

  return (
    <Box>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>目標</Typography>

      {/* ── 財務自由進度 ────────────────────────────────── */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
            <EmojiEventsIcon color="primary" fontSize="small" />
            <Typography variant="body2" fontWeight={600}>財務自由進度</Typography>
          </Stack>

          {monthlyExpense === 0 ? (
            <Alert severity="info" variant="outlined">
              請先在「設定」頁面設定每月支出，才能計算財務自由目標。
            </Alert>
          ) : (
            <>
              <ProgressBar value={currentAssets} max={freedomTarget} />
              <Divider sx={{ my: 1.5 }} />
              <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                <Box>
                  <Typography variant="caption" color="text.secondary">月支出設定</Typography>
                  <Typography variant="body2" fontWeight={600}>NT${fmt(monthlyExpense)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">財務自由目標</Typography>
                  <Typography variant="body2" fontWeight={600}>NT${fmt(freedomTarget)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">目前總資產</Typography>
                  <Typography variant="body2" fontWeight={600}>NT${fmt(currentAssets)}</Typography>
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
            </>
          )}
        </CardContent>
      </Card>

      {/* ── 預估達成年份 ────────────────────────────────── */}
      {monthlyExpense > 0 && (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>預估達成年份</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
              基於近期平均月增 NT${fmt(monthlyContrib)}，複利成長推算（僅供參考）
            </Typography>
            <Stack direction="row" spacing={1.5} useFlexGap>
              {scenarios.map(s => (
                <ScenarioCard key={s.label} {...s} />
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* ── 個人目標清單 ────────────────────────────────── */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Typography variant="body2" fontWeight={600}>個人目標</Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setDialog({ open: true, edit: null })}
        >
          新增目標
        </Button>
      </Stack>

      {goals.length === 0 ? (
        <Card variant="outlined">
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary" variant="body2">
              還沒有個人目標，點擊「新增目標」開始設定。
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={1.5}>
          {goals.map(g => {
            const pct = currentAssets > 0 && g.targetAmount > 0
              ? Math.min(currentAssets / g.targetAmount * 100, 100)
              : 0
            const done = currentAssets >= g.targetAmount
            const today = new Date().toISOString().slice(0, 7)
            const overdue = g.deadline && g.deadline < today && !done

            return (
              <Card key={g.id} variant="outlined">
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
                    <Box sx={{ flex: 1 }}>
                      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                        <Typography variant="body2" fontWeight={700}>{g.name}</Typography>
                        {done && <Chip label="達成！" size="small" color="success" />}
                        {overdue && <Chip label="已逾期" size="small" color="error" variant="outlined" />}
                        {g.deadline && !done && !overdue && (
                          <Chip label={`截止 ${g.deadline}`} size="small" variant="outlined" />
                        )}
                      </Stack>
                    </Box>
                    <Stack direction="row">
                      <IconButton size="small" onClick={() => setDialog({ open: true, edit: g })}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => setDeleteId(g.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Stack>
                  <ProgressBar
                    value={currentAssets}
                    max={g.targetAmount}
                    color={done ? '#66BB6A' : overdue ? '#EF5350' : undefined}
                  />
                </CardContent>
              </Card>
            )
          })}
        </Stack>
      )}

      {/* ── Dialogs ───────────────────────────────────────── */}
      <GoalDialog
        open={dialog.open}
        onClose={() => setDialog({ open: false, edit: null })}
        onSave={handleSaveGoal}
        initial={dialog.edit}
      />

      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} maxWidth="xs">
        <DialogTitle>刪除目標</DialogTitle>
        <DialogContent>
          <Typography>確定要刪除這個目標嗎？此操作無法復原。</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteId(null)}>取消</Button>
          <Button variant="contained" color="error" onClick={() => handleDelete(deleteId)}>
            確認刪除
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
