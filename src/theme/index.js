import { createTheme } from '@mui/material'
import rawTheme from './material-theme.json'

function buildTheme(mode = 'light') {
  const s = rawTheme.schemes[mode]

  return createTheme({
    palette: {
      mode,
      primary: {
        main: s.primary,
        contrastText: s.onPrimary,
        light: s.primaryContainer,
        dark: s.onPrimaryContainer,
      },
      secondary: {
        main: s.secondary,
        contrastText: s.onSecondary,
        light: s.secondaryContainer,
        dark: s.onSecondaryContainer,
      },
      error: {
        main: s.error,
        contrastText: s.onError,
        light: s.errorContainer,
        dark: s.onErrorContainer,
      },
      success: {
        main: s.tertiary,
        contrastText: s.onTertiary,
        light: s.tertiaryContainer,
        dark: s.onTertiaryContainer,
      },
      background: {
        default: s.background,
        paper: s.surfaceContainerLow,
      },
      text: {
        primary: s.onSurface,
        secondary: s.onSurfaceVariant,
        disabled: s.outline,
      },
      divider: s.outlineVariant,
    },
    typography: {
      fontFamily: '"Noto Sans TC", "Roboto", sans-serif',
    },
    shape: {
      borderRadius: 12,
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 20,
            textTransform: 'none',
            fontWeight: 600,
          },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { borderRadius: 12 },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 16 },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 8 },
        },
      },
    },
  })
}

export const lightTheme = buildTheme('light')
export const darkTheme = buildTheme('dark')
export default lightTheme
