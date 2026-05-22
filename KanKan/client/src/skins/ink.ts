import type { Skin } from './types';

const SERIF = [
  '"Noto Serif SC"',
  '"Source Han Serif SC"',
  '"Source Han Serif CN"',
  '"Songti SC"',
  'STSong',
  'SimSun',
  'NSimSun',
  '"Times New Roman"',
  'serif',
].join(',');

const INK = '#1f1f1f';
const INK_SOFT = '#3a3a3a';
const PAPER = '#fffaf0';
const RICE = '#f4ecd8';
const SEAL = '#9b2a1f';
const RULE = '#8b7d6b';

export const ink: Skin = {
  id: 'ink',
  label: 'Ink & Paper',
  labelZh: '水墨家谱',
  description: 'Heritage Chinese: ink black on rice paper, vermilion seal accents.',
  bodyBackground: RICE,
  linkColor: SEAL,
  logoStyle: 'square',
  theme: {
    shape: { borderRadius: 2 },
    palette: {
      mode: 'light',
      primary: { main: INK, contrastText: PAPER },
      secondary: { main: SEAL, contrastText: PAPER },
      background: { default: RICE, paper: PAPER },
      text: { primary: '#1a1a1a', secondary: '#5d5345' },
      divider: RULE,
      error: { main: SEAL },
      action: {
        hover: 'rgba(31,31,31,0.05)',
        selected: 'rgba(155,42,31,0.08)',
      },
    },
    typography: {
      fontFamily: SERIF,
      h1: { fontWeight: 600, letterSpacing: '0.05em' },
      h2: { fontWeight: 600, letterSpacing: '0.04em' },
      h3: { fontWeight: 600 },
      h4: { fontWeight: 500 },
      subtitle1: { fontWeight: 500 },
      button: { fontWeight: 500, letterSpacing: '0.15em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { background: RICE, color: '#1a1a1a' },
        },
      },
      MuiAvatar: {
        styleOverrides: {
          root: {
            borderRadius: 0,
            border: `1px solid ${INK}`,
            background: PAPER,
            boxShadow: 'none',
            backgroundImage: 'none',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: 0,
            boxShadow: 'none',
            letterSpacing: '0.15em',
            paddingLeft: 20,
            paddingRight: 20,
          },
          contained: {
            background: INK,
            color: PAPER,
            border: `1px solid ${INK}`,
            '&:hover': { background: '#000', boxShadow: 'none' },
          },
          outlined: {
            borderColor: INK,
            borderWidth: 1,
            color: INK,
            background: 'transparent',
            '&:hover': { background: 'rgba(31,31,31,0.05)', borderColor: INK },
          },
          text: { color: INK, '&:hover': { background: 'rgba(31,31,31,0.05)' } },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 0,
            background: 'transparent',
            border: 'none',
            boxShadow: 'none',
            color: INK,
            '&:hover': { background: 'rgba(31,31,31,0.06)' },
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 0,
            margin: 0,
            borderBottom: `1px solid ${RULE}55`,
            background: 'transparent',
            boxShadow: 'none',
            '&:hover': { background: 'rgba(31,31,31,0.04)' },
            '&.Mui-selected': { background: 'rgba(155,42,31,0.06)' },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: PAPER,
            color: INK,
            borderBottom: `1px solid ${RULE}`,
            boxShadow: 'none',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            background: PAPER,
            border: `1px solid ${RULE}55`,
            boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            background: PAPER,
            border: `1px solid ${RULE}55`,
            boxShadow: 'none',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            background: PAPER,
            border: `1px solid ${RULE}`,
            boxShadow: '0 6px 0 rgba(0,0,0,0.06)',
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          variant: 'standard',
          InputLabelProps: { shrink: true },
        },
        styleOverrides: {
          root: {
            '& .MuiInput-underline:before': { borderBottomColor: RULE, borderBottomWidth: 1 },
            '& .MuiInput-underline:hover:not(.Mui-disabled):before': { borderBottomColor: INK },
            '& .MuiInput-underline:after': { borderBottomColor: INK, borderBottomWidth: 2 },
            '& .MuiInputLabel-root': { color: INK_SOFT },
            '& .MuiInputLabel-root.Mui-focused': { color: INK },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            background: 'transparent',
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: RULE,
              borderRadius: 0,
            },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: INK },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: INK,
              borderWidth: 1,
            },
          },
        },
      },
      MuiCheckbox: {
        styleOverrides: { root: { color: INK_SOFT, '&.Mui-checked': { color: INK } } },
      },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: 0, border: `1px solid ${SEAL}55` },
          standardError: { background: '#fbeae8', color: SEAL },
        },
      },
    },
  },
};
