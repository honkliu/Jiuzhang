import type { Skin } from './types';

const FONT_STACK = [
  '"Noto Sans SC"',
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  '"PingFang SC"',
  '"Source Han Sans SC"',
  '"Noto Sans CJK SC"',
  '"Hiragino Sans GB"',
  '"Microsoft YaHei"',
  '"WenQuanYi Micro Hei"',
  '"Heiti SC"',
  '"SimHei"',
  'Roboto',
  '"Helvetica Neue"',
  'Arial',
  'sans-serif',
].join(',');

export const glass: Skin = {
  id: 'glass',
  label: 'WeChat Glass',
  labelZh: '微信玻璃',
  description: 'Translucent green glassmorphism (default).',
  bodyBackground: '#f4f7fb',
  linkColor: '#1976d2',
  logoStyle: 'rounded',
  theme: {
    shape: { borderRadius: 16 },
    palette: {
      primary: { main: '#07c160' },
      secondary: { main: '#576b95' },
      background: {
        default: 'rgba(244, 247, 251, 0.9)',
        paper: 'rgba(255, 255, 255, 0.6)',
      },
    },
    typography: { fontFamily: FONT_STACK },
    components: {
      MuiAvatar: {
        styleOverrides: {
          root: {
            borderRadius: 5,
            border: '1px solid rgba(255, 255, 255, 0.6)',
            boxSizing: 'border-box',
            backgroundClip: 'padding-box',
            backgroundImage:
              'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(210,230,255,0.75)),\
               linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.2))',
            backgroundOrigin: 'border-box',
            backgroundBlendMode: 'overlay',
            boxShadow:
              '0 6px 18px rgba(15, 23, 42, 0.15), inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -1px 0 rgba(255,255,255,0.35)',
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.9), rgba(210,230,255,0.7))',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: 12,
            boxShadow:
              '0 8px 20px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -1px 0 rgba(255,255,255,0.35)',
          },
          contained: {
            background: 'linear-gradient(135deg, rgba(7,193,96,0.9), rgba(35,208,124,0.85))',
            border: '1px solid rgba(255,255,255,0.4)',
          },
          outlined: {
            borderColor: 'rgba(255,255,255,0.5)',
            background: 'rgba(255,255,255,0.4)',
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            background: 'rgba(255,255,255,0.45)',
            border: '1px solid rgba(255,255,255,0.5)',
            boxShadow:
              '0 8px 20px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -1px 0 rgba(255,255,255,0.35)',
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 14,
            margin: '4px 8px',
            background: 'rgba(255,255,255,0.55)',
            border: '1px solid rgba(255,255,255,0.5)',
            boxShadow:
              '0 8px 20px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255,255,255,0.75), inset 0 -1px 0 rgba(255,255,255,0.3)',
          },
        },
      },
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: 'transparent' },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: '#eef2f6',
            borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            background: 'rgba(255, 255, 255, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.5)',
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            background: 'rgba(255, 255, 255, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.5)',
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            background: 'rgba(255, 255, 255, 0.7)',
            border: '1px solid rgba(255, 255, 255, 0.5)',
            boxShadow: '0 12px 40px rgba(15, 23, 42, 0.12)',
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          InputLabelProps: { shrink: true },
        },
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': { background: 'rgba(255, 255, 255, 0.6)' },
            '& .MuiInputLabel-root': { zIndex: 1 },
            '& .MuiInputLabel-root.MuiInputLabel-shrink': {
              backgroundColor: '#fff',
              padding: '0 4px',
            },
          },
        },
      },
    },
  },
};
