import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  Box, Paper, Typography, TextField, Button,
  InputAdornment, IconButton, Alert,
} from '@mui/material'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'

export default function Login() {
  const { login } = useAuth()
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    const ok = login(password)
    if (!ok) {
      setError(true)
      setPassword('')
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Paper elevation={3} sx={{ p: 5, maxWidth: 360, width: '100%', textAlign: 'center' }}>
        <Box
          sx={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            bgcolor: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 2,
          }}
        >
          <LockOutlinedIcon sx={{ color: 'white' }} />
        </Box>

        <Typography variant="h5" fontWeight={700} gutterBottom>
          財富地圖
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          追蹤資產，邁向財務自由
        </Typography>

        <form onSubmit={handleSubmit}>
          <TextField
            label="密碼"
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={e => { setPassword(e.target.value); setError(false) }}
            fullWidth
            autoFocus
            error={error}
            sx={{ mb: 2 }}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowPw(v => !v)} edge="end" size="small">
                      {showPw ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              密碼錯誤，請再試一次
            </Alert>
          )}

          <Button
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            disabled={!password}
          >
            進入
          </Button>
        </form>
      </Paper>
    </Box>
  )
}
