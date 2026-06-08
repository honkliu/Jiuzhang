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
  bodyBackground: '#ffffff',
  linkColor: '#1976d2',
  logoStyle: 'rounded',
  theme: {
    shape: { borderRadius: 16 },
    palette: {
      primary: { main: '#07c160' },
      secondary: { main: '#576b95' },
      background: {
        default: '#ffffff',
        paper: '#ffffff',
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
            borderRadius: 8,
            boxShadow: 'none',
            '&:hover': { boxShadow: 'none' },
          },
          contained: {
            background: '#07c160',
            color: '#ffffff',
            '&:hover': { background: '#06ad56' },
          },
          outlined: {
            borderColor: 'rgba(15, 23, 42, 0.2)',
            background: 'transparent',
            '&:hover': { background: 'rgba(15, 23, 42, 0.04)', borderColor: 'rgba(15, 23, 42, 0.35)' },
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
            '&:hover': { background: 'rgba(15, 23, 42, 0.06)' },
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            margin: '2px 6px',
            background: 'transparent',
            border: 'none',
            boxShadow: 'none',
            '&:hover': { background: 'rgba(15, 23, 42, 0.04)' },
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
            background: '#ffffff',
            boxShadow: 'none',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            background: '#ffffff',
            boxShadow: 'none',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            background: '#ffffff',
            boxShadow: '0 8px 32px rgba(15, 23, 42, 0.12)',
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          InputLabelProps: { shrink: true },
        },
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': { background: '#ffffff' },
            '& .MuiInputLabel-root': { zIndex: 1 },
            '& .MuiInputLabel-root.MuiInputLabel-shrink': {
              backgroundColor: '#fff',
              padding: '0 4px',
            },
          },
        },
      },
      MuiTableBody: {
        styleOverrides: {
          root: {
            '& .MuiTableRow-root:nth-of-type(even)': {
              backgroundColor: '#f7f8fa',
            },
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            '& .MuiTableRow-root': {
              backgroundColor: '#f0f2f5',
            },
          },
        },
      },
      MuiList: {
        styleOverrides: {
          root: {
            '& .MuiListItem-root:nth-of-type(even)': {
              backgroundColor: '#f7f8fa',
            },
          },
        },
      },
    },
  },
};
