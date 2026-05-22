import type { Skin } from './types';

const SERIF = [
  '"Noto Serif SC"',
  '"Source Han Serif SC"',
  '"Songti SC"',
  'STSong',
  'SimSun',
  'serif',
].join(',');

const SANS = [
  '"Noto Sans SC"',
  '-apple-system',
  'BlinkMacSystemFont',
  '"PingFang SC"',
  '"Source Han Sans SC"',
  '"Microsoft YaHei"',
  'Roboto',
  '"Helvetica Neue"',
  'sans-serif',
].join(',');

const BAMBOO = '#4a7c59';
const BAMBOO_DARK = '#365e44';
const WOOD = '#b08968';
const RICE = '#f5f1e8';
const CREAM = '#fffdf7';
const TEXT = '#2a3a2f';
const TEXT_SOFT = '#6b6356';
const HAIR = '#d6cdb8';

export const bamboo: Skin = {
  id: 'bamboo',
  label: 'Bamboo & Stone',
  labelZh: '竹石',
  description: 'Calmer Chinese aesthetic: bamboo green, warm wood, cream paper.',
  bodyBackground: RICE,
  linkColor: BAMBOO_DARK,
  logoStyle: 'square',
  theme: {
    shape: { borderRadius: 8 },
    palette: {
      mode: 'light',
      primary: { main: BAMBOO, contrastText: CREAM },
      secondary: { main: WOOD, contrastText: CREAM },
      background: { default: RICE, paper: CREAM },
      text: { primary: TEXT, secondary: TEXT_SOFT },
      divider: HAIR,
      action: { hover: 'rgba(74,124,89,0.06)', selected: 'rgba(74,124,89,0.10)' },
    },
    typography: {
      fontFamily: SANS,
      h1: { fontFamily: SERIF, fontWeight: 500 },
      h2: { fontFamily: SERIF, fontWeight: 500 },
      h3: { fontFamily: SERIF, fontWeight: 500 },
      h4: { fontFamily: SERIF, fontWeight: 500 },
      h5: { fontFamily: SERIF, fontWeight: 500 },
      h6: { fontFamily: SERIF, fontWeight: 500 },
      subtitle1: { fontWeight: 500 },
      button: { fontWeight: 500, letterSpacing: '0.02em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: { body: { background: RICE, color: TEXT } },
      },
      MuiAvatar: {
        styleOverrides: {
          root: {
            borderRadius: 4,
            border: `1px solid ${HAIR}`,
            background: CREAM,
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
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
            background: BAMBOO,
            color: CREAM,
            border: `1px solid ${BAMBOO_DARK}`,
            '&:hover': { background: BAMBOO_DARK, boxShadow: '0 2px 6px rgba(74,124,89,0.25)' },
          },
          outlined: {
            borderColor: BAMBOO,
            color: BAMBOO_DARK,
            background: CREAM,
            '&:hover': { background: 'rgba(74,124,89,0.06)', borderColor: BAMBOO_DARK },
          },
          text: { color: BAMBOO_DARK, '&:hover': { background: 'rgba(74,124,89,0.06)' } },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            background: 'transparent',
            border: 'none',
            boxShadow: 'none',
            color: TEXT,
            '&:hover': { background: 'rgba(74,124,89,0.08)' },
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            margin: '2px 6px',
            background: 'transparent',
            boxShadow: 'none',
            '&:hover': { background: 'rgba(74,124,89,0.06)' },
            '&.Mui-selected': {
              background: 'rgba(74,124,89,0.12)',
              borderLeft: `3px solid ${BAMBOO}`,
            },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: CREAM,
            color: TEXT,
            borderBottom: `1px solid ${HAIR}`,
            boxShadow: 'none',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            background: CREAM,
            border: `1px solid ${HAIR}`,
            boxShadow: '0 1px 3px rgba(43,58,47,0.05)',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            background: CREAM,
            border: `1px solid ${HAIR}`,
            boxShadow: '0 2px 6px rgba(43,58,47,0.06)',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            background: CREAM,
            border: `1px solid ${HAIR}`,
            boxShadow: '0 8px 24px rgba(43,58,47,0.12)',
          },
        },
      },
      MuiTextField: {
        defaultProps: { InputLabelProps: { shrink: true } },
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': { background: CREAM },
            '& .MuiInputLabel-root.MuiInputLabel-shrink': {
              backgroundColor: CREAM,
              padding: '0 4px',
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            background: CREAM,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: HAIR },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: BAMBOO },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: BAMBOO, borderWidth: 1 },
          },
        },
      },
    },
  },
};
