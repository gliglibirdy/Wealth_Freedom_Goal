import { useNavigate, useLocation } from 'react-router-dom'
import {
  Box, BottomNavigation, BottomNavigationAction, Paper,
  Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  Typography, useMediaQuery, useTheme, Toolbar, AppBar, IconButton, Divider,
} from '@mui/material'
import DashboardIcon from '@mui/icons-material/Dashboard'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import FlagIcon from '@mui/icons-material/Flag'
import SettingsIcon from '@mui/icons-material/Settings'

const NAV_ITEMS = [
  { label: '總覽', path: '/', icon: <DashboardIcon /> },
  { label: '資產', path: '/assets', icon: <AccountBalanceIcon /> },
  { label: '現金流', path: '/cashflow', icon: <TrendingUpIcon /> },
  { label: '目標', path: '/goals', icon: <FlagIcon /> },
]

const DRAWER_WIDTH = 220

export default function Layout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const theme = useTheme()
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'))

  const currentIndex = NAV_ITEMS.findIndex((item) => item.path === location.pathname)

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {isDesktop ? (
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
              pt: 2,
              display: 'flex',
              flexDirection: 'column',
            },
          }}
        >
          <Typography variant="h6" fontWeight={700} sx={{ px: 3, mb: 3 }}>
            財富地圖
          </Typography>
          <List sx={{ flexGrow: 1 }}>
            {NAV_ITEMS.map((item) => (
              <ListItemButton
                key={item.path}
                selected={location.pathname === item.path}
                onClick={() => navigate(item.path)}
                sx={{ borderRadius: 2, mx: 1, mb: 0.5 }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}
          </List>
          <Divider />
          <List sx={{ pb: 2 }}>
            <ListItemButton
              selected={location.pathname === '/settings'}
              onClick={() => navigate('/settings')}
              sx={{ borderRadius: 2, mx: 1, mt: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}><SettingsIcon /></ListItemIcon>
              <ListItemText primary="設定" />
            </ListItemButton>
          </List>
        </Drawer>
      ) : (
        <AppBar position="fixed" color="default" elevation={1}>
          <Toolbar sx={{ justifyContent: 'space-between' }}>
            <Typography variant="h6" fontWeight={700}>財富地圖</Typography>
            <IconButton onClick={() => navigate('/settings')}>
              <SettingsIcon />
            </IconButton>
          </Toolbar>
        </AppBar>
      )}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, md: 4 },
          mt: { xs: 7, md: 0 },
          mb: { xs: 8, md: 0 },
          maxWidth: { md: 900 },
        }}
      >
        {children}
      </Box>

      {!isDesktop && (
        <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0 }} elevation={3}>
          <BottomNavigation
            value={currentIndex === -1 ? false : currentIndex}
            onChange={(_, val) => navigate(NAV_ITEMS[val].path)}
            showLabels
          >
            {NAV_ITEMS.map((item) => (
              <BottomNavigationAction key={item.path} label={item.label} icon={item.icon} />
            ))}
          </BottomNavigation>
        </Paper>
      )}
    </Box>
  )
}
