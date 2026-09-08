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
  label: 'WeChat',
  labelZh: '微信',
  description: 'Quiet WeChat-inspired neutrals with compact typography and restrained green accents.',
  bodyBackground: '#f5f5f5',
  linkColor: '#576b95',
  logoStyle: 'rounded',
  theme: {
    shape: { borderRadius: 4 },
    palette: {
      mode: 'light',
      primary: { main: '#07c160', contrastText: '#ffffff' },
      secondary: { main: '#576b95' },
      text: {
        primary: '#191919',
        secondary: '#7f7f7f',
      },
      divider: '#e5e5e5',
      background: {
        default: '#f5f5f5',
        paper: '#ffffff',
      },
      action: {
        hover: 'rgba(0, 0, 0, 0.04)',
        selected: 'rgba(0, 0, 0, 0.08)',
      },
    },
    typography: {
      fontFamily: FONT_STACK,
      fontSize: 14,
      h1: { fontWeight: 600, fontSize: '1.75rem', lineHeight: 1.35 },
      h2: { fontWeight: 600, fontSize: '1.5rem', lineHeight: 1.4 },
      h3: { fontWeight: 600, fontSize: '1.25rem', lineHeight: 1.4 },
      h4: { fontWeight: 600, fontSize: '1.125rem', lineHeight: 1.45 },
      h5: { fontWeight: 600, fontSize: '1rem', lineHeight: 1.5 },
      h6: { fontWeight: 500, fontSize: '0.9375rem', lineHeight: 1.5 },
      body1: { fontSize: '0.9375rem', lineHeight: 1.65 },
      body2: { fontSize: '0.875rem', lineHeight: 1.6 },
      caption: { fontSize: '0.75rem', lineHeight: 1.5 },
      button: { fontWeight: 500, fontSize: '0.875rem' },
    },
    components: {
      MuiAvatar: {
        styleOverrides: {
          root: {
            borderRadius: 4,
            border: '1px solid rgba(0, 0, 0, 0.06)',
            boxSizing: 'border-box',
            background: '#f0f0f0',
            backgroundImage: 'none',
            boxShadow: 'none',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: 4,
            boxShadow: 'none',
            minHeight: 36,
            '&:hover': { boxShadow: 'none' },
          },
          contained: {
            background: '#07c160',
            color: '#ffffff',
            '&:hover': { background: '#06ad56' },
          },
          outlined: {
            borderColor: '#d9d9d9',
            background: '#ffffff',
            color: '#191919',
            '&:hover': { background: '#f7f7f7', borderColor: '#bfbfbf' },
          },
          text: { color: '#576b95' },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 4,
            background: 'transparent',
            border: 'none',
            boxShadow: 'none',
            color: '#4c4c4c',
            '&:hover': { background: 'rgba(0, 0, 0, 0.05)' },
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 0,
            margin: 0,
            backgroundColor: 'transparent',
            border: 'none',
            boxShadow: 'none',
            '&:hover': { backgroundColor: '#f5f5f5' },
            '&.Mui-selected': { backgroundColor: '#e9e9e9' },
            '&.Mui-selected:hover': { backgroundColor: '#e5e5e5' },
          },
        },
      },
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: '#f5f5f5',
            color: '#191919',
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: '#ededed',
            color: '#191919',
            borderBottom: '1px solid #d9d9d9',
            boxShadow: 'none',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            background: '#ffffff',
            boxShadow: 'none',
            backgroundImage: 'none',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            background: '#ffffff',
            boxShadow: 'none',
            border: '1px solid #e5e5e5',
            borderRadius: 4,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            background: '#ffffff',
            borderRadius: 8,
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.16)',
          },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: {
            borderRadius: 8,
            border: '1px solid #e5e5e5',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: 8,
            border: '1px solid #e5e5e5',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          InputLabelProps: { shrink: true },
        },
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              background: '#ffffff',
              borderRadius: 4,
            },
            '& .MuiInputLabel-root': { zIndex: 1 },
            '& .MuiInputLabel-root.MuiInputLabel-shrink': {
              backgroundColor: '#fff',
              padding: '0 4px',
            },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: '#d9d9d9' },
            '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#bfbfbf' },
            '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: '#07c160',
              borderWidth: 1,
            },
          },
        },
      },
      MuiDivider: {
        styleOverrides: { root: { borderColor: '#e5e5e5' } },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 4, background: '#f0f0f0' },
        },
      },
      MuiTableBody: {
        styleOverrides: {
          root: {
            '& .MuiTableRow-root:nth-of-type(even)': {
              backgroundColor: '#fafafa',
            },
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            '& .MuiTableRow-root': {
              backgroundColor: '#f5f5f5',
            },
          },
        },
      },
      MuiList: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
        },
      },
    },
  },
};
