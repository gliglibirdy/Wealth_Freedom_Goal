import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Overview from './pages/Overview'
import Assets from './pages/Assets'
import CashFlow from './pages/CashFlow'
import Goals from './pages/Goals'
import Settings from './pages/Settings'
import { lightTheme as theme } from './theme'

function AppRoutes() {
  const { user } = useAuth()

  if (!user) return <Login />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/assets" element={<Assets />} />
        <Route path="/cashflow" element={<CashFlow />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
