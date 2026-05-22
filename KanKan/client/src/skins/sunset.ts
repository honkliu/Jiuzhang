import type { Skin } from './types';

const FONT_STACK = [
  '"Inter"',
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

const CORAL = '#ff7a45';
const CORAL_DEEP = '#e85d24';
const AMBER = '#ffa940';
const BG_GRADIENT = 'linear-gradient(135deg, #fff1e6 0%, #ffe4d6 60%, #ffd4c0 100%)';
const SURFACE = '#ffffff';
const CARD = '#fff8f2';
const TEXT = '#3d2817';
const TEXT_SOFT = '#7a5c3f';
const HAIR = '#f0d8c0';

export const sunset: Skin = {
  id: 'sunset',
  label: 'Sunset',
  labelZh: '夕阳',
  description: 'Warm coral & amber, friendly rounded pills, cozy paper feel.',
  bodyBackground: BG_GRADIENT,
  linkColor: CORAL_DEEP,
  logoStyle: 'circle',
  theme: {
    shape: { borderRadius: 20 },
    palette: {
      mode: 'light',
      primary: { main: CORAL, contrastText: SURFACE },
      secondary: { main: AMBER, contrastText: TEXT },
      background: { default: 'transparent', paper: SURFACE },
      text: { primary: TEXT, secondary: TEXT_SOFT },
      divider: HAIR,
      action: { hover: 'rgba(255,122,69,0.08)', selected: 'rgba(255,122,69,0.14)' },
    },
    typography: {
      fontFamily: FONT_STACK,
      h1: { fontWeight: 700 },
      h2: { fontWeight: 700 },
      h3: { fontWeight: 600 },
      h4: { fontWeight: 600 },
      subtitle1: { fontWeight: 500 },
      button: { fontWeight: 600, letterSpacing: '0.02em' },
      body1: { fontSize: '0.95rem', lineHeight: 1.55 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: { body: { background: BG_GRADIENT, color: TEXT } },
      },
      MuiAvatar: {
        styleOverrides: {
          root: {
            borderRadius: '50%',
            border: `2px solid ${SURFACE}`,
            background: CARD,
            boxShadow: '0 4px 12px rgba(255,122,69,0.20)',
            backgroundImage: 'none',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: 999,
            boxShadow: 'none',
            paddingLeft: 22,
            paddingRight: 22,
            fontWeight: 600,
          },
          contained: {
            background: `linear-gradient(135deg, ${CORAL} 0%, ${AMBER} 100%)`,
            color: SURFACE,
            border: 'none',
            boxShadow: '0 6px 16px rgba(255,122,69,0.30)',
            '&:hover': {
              background: `linear-gradient(135deg, ${CORAL_DEEP} 0%, ${CORAL} 100%)`,
              boxShadow: '0 8px 22px rgba(255,122,69,0.38)',
            },
          },
          outlined: {
            borderColor: CORAL,
            color: CORAL_DEEP,
            background: SURFACE,
            borderWidth: 1.5,
            '&:hover': { background: 'rgba(255,122,69,0.06)', borderColor: CORAL_DEEP, borderWidth: 1.5 },
          },
          text: {
            color: CORAL_DEEP,
            '&:hover': { background: 'rgba(255,122,69,0.08)' },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 999,
            background: 'transparent',
            border: 'none',
            boxShadow: 'none',
            color: CORAL_DEEP,
            '&:hover': { background: 'rgba(255,122,69,0.10)' },
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 14,
            margin: '3px 8px',
            background: 'transparent',
            boxShadow: 'none',
            '&:hover': { background: 'rgba(255,122,69,0.06)' },
            '&.Mui-selected': { background: 'rgba(255,122,69,0.14)' },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: SURFACE,
            color: TEXT,
            borderBottom: `1px solid ${HAIR}`,
            boxShadow: '0 1px 4px rgba(255,122,69,0.06)',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            background: SURFACE,
            border: 'none',
            boxShadow: '0 12px 40px rgba(255,122,69,0.12)',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            background: SURFACE,
            border: 'none',
            boxShadow: '0 6px 20px rgba(255,122,69,0.10)',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            background: SURFACE,
            border: 'none',
            boxShadow: '0 20px 60px rgba(255,122,69,0.20)',
          },
        },
      },
      MuiTextField: {
        defaultProps: { InputLabelProps: { shrink: true } },
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': { background: CARD, borderRadius: 14 },
            '& .MuiInputLabel-root.MuiInputLabel-shrink': {
              backgroundColor: SURFACE,
              padding: '0 4px',
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            background: CARD,
            borderRadius: 14,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: HAIR },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: CORAL },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: CORAL, borderWidth: 1.5 },
          },
        },
      },
      MuiCheckbox: {
        styleOverrides: { root: { color: TEXT_SOFT, '&.Mui-checked': { color: CORAL } } },
      },
    },
  },
};
