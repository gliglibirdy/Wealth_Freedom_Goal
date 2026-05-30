import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  Box, Button, Typography, Stack, Chip, IconButton,
  Accordion, AccordionSummary, AccordionDetails,
  Table, TableBody, TableRow, TableCell,
  CircularProgress, Alert, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import {
  getRecords, deleteRecord,
  getAccounts, getHoldings,
  getExchangeRates,
} from '../services/firestore'
import RecordWizard from '../components/RecordWizard'

const fmt = n => Math.round(n || 0).toLocaleString()

function ChangeChip({ current, previous }) {
  if (previous == null) return null
  const delta = current - previous
  const pct = previous > 0 ? (delta / previous * 100).toFixed(1) : '0.0'
  const positive = delta >= 0
  return (
    <Chip
      size="small"
      icon={positive ? <TrendingUpIcon /> : <TrendingDownIcon />}
      label={`${positive ? '+' : ''}${pct}%`}
      color={positive ? 'success' : 'error'}
      variant="outlined"
      sx={{ flexShrink: 0 }}
    />
  )
}

function RecordCard({ record, previousTotal, onEdit, onDelete, expanded, onToggle }) {
  return (
    <Accordion
      expanded={expanded}
      onChange={onToggle}
      disableGutters
      elevation={0}
      variant="outlined"
      sx={{ '&:before': { display: 'none' }, borderRadius: '8px !important' }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexGrow: 1, mr: 1, minWidth: 0 }}>
          <Chip
            label={record.month}
            color="primary"
            size="small"
            sx={{ fontWeight: 600, flexShrink: 0 }}
          />
          <Typography fontWeight={700} sx={{ flexGrow: 1, minWidth: 0 }}>
            NT${fmt(record.totalAssets)}
          </Typography>
          <ChangeChip current={record.totalAssets} previous={previousTotal} />
          <IconButton
            size="small"
            onClick={e => { e.stopPropagation(); onEdit() }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            color="error"
            onClick={e => { e.stopPropagation(); onDelete() }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Stack>
      </AccordionSummary>

      <AccordionDetails sx={{ pt: 0, px: 2, pb: 2 }}>
        <Stack spacing={2}>
          {/* Bank */}
          {record.bankSnapshots?.length > 0 && (
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                fontWeight={600}
                display="block"
                sx={{ mb: 0.5 }}
              >
                銀行存款
              </Typography>
              <Table size="small">
                <TableBody>
                  {record.bankSnapshots.map(s => (
                    <TableRow key={s.accountId}>
                      <TableCell sx={{ pl: 0, py: 0.5 }}>{s.name}</TableCell>
                      <TableCell align="right" sx={{ py: 0.5, color: 'text.secondary', fontSize: 12 }}>
                        {s.currency !== 'NTD' ? `${s.currency} ${s.balance.toLocaleString()}` : ''}
                      </TableCell>
                      <TableCell align="right" sx={{ py: 0.5 }}>
                        NT${fmt(s.balanceNTD)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell sx={{ pl: 0, py: 0.5, fontWeight: 600, borderTop: '1px solid', borderColor: 'divider' }}>
                      小計
                    </TableCell>
                    <TableCell sx={{ borderTop: '1px solid', borderColor: 'divider' }} />
                    <TableCell align="right" sx={{ py: 0.5, fontWeight: 600, borderTop: '1px solid', borderColor: 'divider' }}>
                      NT${fmt(record.bankTotal)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Box>
          )}

          {/* Stocks */}
          {record.stockSnapshots?.length > 0 && (
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                fontWeight={600}
                display="block"
                sx={{ mb: 0.5 }}
              >
                股票 ETF
              </Typography>
              <Table size="small">
                <TableBody>
                  {record.stockSnapshots.map(s => (
                    <TableRow key={s.holdingId}>
                      <TableCell sx={{ pl: 0, py: 0.5 }}>
                        <Typography variant="body2">{s.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {s.ticker} × {s.shares.toLocaleString()} 股 @ {s.currency} {s.price}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ py: 0.5 }}>
                        NT${fmt(s.marketValueNTD)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell sx={{ pl: 0, py: 0.5, fontWeight: 600, borderTop: '1px solid', borderColor: 'divider' }}>
                      小計
                    </TableCell>
                    <TableCell align="right" sx={{ py: 0.5, fontWeight: 600, borderTop: '1px solid', borderColor: 'divider' }}>
                      NT${fmt((record.twStockTotal || 0) + (record.usStockTotal || 0))}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Box>
          )}

          {/* Footer row */}
          <Divider />
          <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
            <Box>
              <Typography variant="caption" color="text.secondary">被動收入</Typography>
              <Typography fontWeight={600}>NT${fmt(record.passiveIncome || 0)}</Typography>
            </Box>
            {record.estimatedMonthlyDividend > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary">預估月股息</Typography>
                <Typography fontWeight={600} color="success.main">
                  NT${fmt(record.estimatedMonthlyDividend)}
                </Typography>
              </Box>
            )}
            {record.note && (
              <Box sx={{ flexBasis: '100%' }}>
                <Typography variant="caption" color="text.secondary">備註</Typography>
                <Typography variant="body2">{record.note}</Typography>
              </Box>
            )}
          </Stack>
        </Stack>
      </AccordionDetails>
    </Accordion>
  )
}

function DeleteDialog({ open, month, onClose, onConfirm }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>確認刪除</DialogTitle>
      <DialogContent>
        <Typography>
          確定要刪除 <strong>{month}</strong> 的紀錄嗎？此操作無法復原。
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button color="error" variant="contained" onClick={onConfirm}>刪除</Button>
      </DialogActions>
    </Dialog>
  )
}

export default function Assets() {
  const { user } = useAuth()
  const [records, setRecords] = useState([])
  const [accounts, setAccounts] = useState([])
  const [holdings, setHoldings] = useState([])
  const [rates, setRates] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [wizard, setWizard] = useState({ open: false, edit: null })
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [r, a, h, rt] = await Promise.all([
      getRecords(user.uid),
      getAccounts(user.uid),
      getHoldings(user.uid),
      getExchangeRates(user.uid),
    ])
    setRecords(r)
    setAccounts(a)
    setHoldings(h)
    setRates(rt)
    setLoading(false)
  }, [user.uid])

  useEffect(() => { load() }, [load])

  const handleDelete = async () => {
    await deleteRecord(user.uid, deleteTarget.id)
    setDeleteTarget(null)
    load()
  }

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', pt: 6 }}>
      <CircularProgress />
    </Box>
  )

  return (
    <Box>
      <Stack direction="row" alignItems="flex-start" sx={{ mb: 3 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" fontWeight={700}>資產紀錄</Typography>
          {records.length > 0 && (
            <Typography variant="body2" color="text.secondary">共 {records.length} 筆紀錄</Typography>
          )}
        </Box>
        <Button
          startIcon={<AddIcon />}
          variant="contained"
          onClick={() => setWizard({ open: true, edit: null })}
        >
          新增紀錄
        </Button>
      </Stack>

      {records.length === 0 ? (
        <Alert severity="info">
          尚無任何資產紀錄，點選「新增紀錄」開始記錄你的第一個月！
        </Alert>
      ) : (
        <Stack spacing={1}>
          {records.map((r, i) => (
            <RecordCard
              key={r.id}
              record={r}
              previousTotal={records[i + 1]?.totalAssets}
              expanded={expanded === r.id}
              onToggle={() => setExpanded(p => p === r.id ? null : r.id)}
              onEdit={() => setWizard({ open: true, edit: r })}
              onDelete={() => setDeleteTarget(r)}
            />
          ))}
        </Stack>
      )}

      <RecordWizard
        open={wizard.open}
        onClose={() => setWizard({ open: false, edit: null })}
        onSaved={load}
        userId={user.uid}
        accounts={accounts}
        holdings={holdings}
        rates={rates}
        lastRecord={records.length > 0 ? records[0] : null}
        editRecord={wizard.edit}
      />

      <DeleteDialog
        open={!!deleteTarget}
        month={deleteTarget?.month}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </Box>
  )
}
