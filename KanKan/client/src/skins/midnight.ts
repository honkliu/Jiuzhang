import type { Skin } from './types';

const FONT_STACK = [
  '"Noto Sans SC"',
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  '"PingFang SC"',
  '"Source Han Sans SC"',
  '"Microsoft YaHei"',
  'Roboto',
  '"Helvetica Neue"',
  'Arial',
  'sans-serif',
].join(',');

const BG = '#0d1117';
const SURFACE = '#161b22';
const RAISED = '#1c2128';
const BORDER = '#30363d';
const TEXT = '#e6edf3';
const TEXT_SOFT = '#8b949e';
const LAVENDER = '#7c9ce8';
const LAVENDER_DEEP = '#5c7ed1';
const GOLD = '#f7b955';

export const midnight: Skin = {
  id: 'midnight',
  label: 'Midnight',
  labelZh: '深夜',
  description: 'Sophisticated dark: near-black canvas, muted lavender accent, pale gold highlights.',
  bodyBackground: BG,
  linkColor: LAVENDER,
  logoStyle: 'rounded',
  theme: {
    shape: { borderRadius: 10 },
    palette: {
      mode: 'dark',
      primary: { main: LAVENDER, contrastText: '#0a0e14' },
      secondary: { main: GOLD, contrastText: BG },
      background: { default: BG, paper: SURFACE },
      text: { primary: TEXT, secondary: TEXT_SOFT },
      divider: BORDER,
      error: { main: '#f85149' },
      warning: { main: GOLD },
      success: { main: '#3fb950' },
      action: {
        hover: 'rgba(124,156,232,0.08)',
        selected: 'rgba(124,156,232,0.16)',
        disabled: 'rgba(230,237,243,0.3)',
      },
    },
    typography: {
      fontFamily: FONT_STACK,
      h1: { fontWeight: 400 },
      h2: { fontWeight: 400 },
      h3: { fontWeight: 400 },
      h4: { fontWeight: 400 },
      h5: { fontWeight: 500 },
      h6: { fontWeight: 500 },
      body1: { fontWeight: 300, lineHeight: 1.5 },
      body2: { fontWeight: 300, lineHeight: 1.5 },
      button: { fontWeight: 500, letterSpacing: '0.02em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: { body: { background: BG, color: TEXT } },
      },
      MuiAvatar: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            border: `1px solid ${BORDER}`,
            background: RAISED,
            boxShadow: 'none',
            backgroundImage: 'none',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: 8,
            boxShadow: 'none',
            fontWeight: 500,
          },
          contained: {
            background: LAVENDER,
            color: '#0a0e14',
            border: 'none',
            '&:hover': { background: LAVENDER_DEEP, boxShadow: 'none' },
          },
          outlined: {
            borderColor: BORDER,
            color: TEXT,
            background: 'transparent',
            '&:hover': { background: 'rgba(124,156,232,0.08)', borderColor: LAVENDER },
          },
          text: {
            color: LAVENDER,
            '&:hover': { background: 'rgba(124,156,232,0.08)' },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            background: 'transparent',
            border: 'none',
            boxShadow: 'none',
            color: TEXT_SOFT,
            '&:hover': { background: 'rgba(124,156,232,0.10)', color: LAVENDER },
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            margin: '2px 6px',
            background: 'transparent',
            boxShadow: 'none',
            color: TEXT,
            '&:hover': { background: 'rgba(124,156,232,0.08)' },
            '&.Mui-selected': { background: 'rgba(124,156,232,0.16)' },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: SURFACE,
            color: TEXT,
            borderBottom: `1px solid ${BORDER}`,
            boxShadow: 'none',
            backgroundImage: 'none',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            background: SURFACE,
            border: `1px solid ${BORDER}`,
            boxShadow: 'none',
            backgroundImage: 'none',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            background: SURFACE,
            border: `1px solid ${BORDER}`,
            boxShadow: 'none',
            backgroundImage: 'none',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            background: RAISED,
            border: `1px solid ${BORDER}`,
            boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
            backgroundImage: 'none',
          },
        },
      },
      MuiTextField: {
        defaultProps: { InputLabelProps: { shrink: true } },
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': { background: RAISED, borderRadius: 8 },
            '& .MuiInputLabel-root': { color: TEXT_SOFT },
            '& .MuiInputLabel-root.MuiInputLabel-shrink': {
              backgroundColor: SURFACE,
              padding: '0 4px',
              color: TEXT_SOFT,
            },
            '& .MuiInputLabel-root.Mui-focused': { color: LAVENDER },
            '& .MuiInputBase-input': { color: TEXT },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            background: RAISED,
            borderRadius: 8,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: BORDER },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: LAVENDER },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: LAVENDER, borderWidth: 1 },
          },
        },
      },
      MuiCheckbox: {
        styleOverrides: { root: { color: TEXT_SOFT, '&.Mui-checked': { color: LAVENDER } } },
      },
      MuiAlert: {
        styleOverrides: {
          standardError: { background: 'rgba(248,81,73,0.12)', color: '#f85149' },
          standardWarning: { background: 'rgba(247,185,85,0.12)', color: GOLD },
          standardInfo: { background: 'rgba(124,156,232,0.12)', color: LAVENDER },
          standardSuccess: { background: 'rgba(63,185,80,0.12)', color: '#3fb950' },
        },
      },
      MuiDivider: { styleOverrides: { root: { borderColor: BORDER } } },
      MuiMenu: {
        styleOverrides: {
          paper: { background: RAISED, border: `1px solid ${BORDER}` },
        },
      },
    },
  },
};
