import type { Skin } from './types';

const MONO_STACK = [
  '"JetBrains Mono"',
  '"IBM Plex Mono"',
  '"Fira Code"',
  '"Cascadia Code"',
  'Consolas',
  'Menlo',
  'Monaco',
  '"Courier New"',
  'monospace',
].join(',');

const SANS_STACK = [
  '"Inter"',
  '"Helvetica Neue"',
  '"Noto Sans SC"',
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  '"PingFang SC"',
  'Arial',
  'sans-serif',
].join(',');

const BLACK = '#000000';
const WHITE = '#ffffff';
const HOT = '#ff5500';
const GREY_BG = '#f4f4f4';
const GREY_MID = '#555555';

export const mono: Skin = {
  id: 'mono',
  label: 'Brutalist Mono',
  labelZh: '极简黑白',
  description: 'Bauhaus brutalism: pure black on white, mono, no radius, one hot accent.',
  bodyBackground: GREY_BG,
  linkColor: HOT,
  logoStyle: 'square',
  theme: {
    shape: { borderRadius: 0 },
    palette: {
      mode: 'light',
      primary: { main: BLACK, contrastText: WHITE },
      secondary: { main: HOT, contrastText: WHITE },
      background: { default: GREY_BG, paper: WHITE },
      text: { primary: BLACK, secondary: GREY_MID },
      divider: BLACK,
      error: { main: HOT },
      action: { hover: 'rgba(0,0,0,0.06)', selected: 'rgba(255,85,0,0.08)' },
    },
    typography: {
      fontFamily: SANS_STACK,
      h1: { fontFamily: MONO_STACK, fontWeight: 800, letterSpacing: '-0.02em', textTransform: 'uppercase' },
      h2: { fontFamily: MONO_STACK, fontWeight: 800, letterSpacing: '-0.01em', textTransform: 'uppercase' },
      h3: { fontFamily: MONO_STACK, fontWeight: 700, textTransform: 'uppercase' },
      h4: { fontFamily: MONO_STACK, fontWeight: 700, textTransform: 'uppercase' },
      h5: { fontFamily: MONO_STACK, fontWeight: 700, textTransform: 'uppercase' },
      h6: { fontFamily: MONO_STACK, fontWeight: 700, textTransform: 'uppercase' },
      subtitle1: { fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' },
      button: { fontWeight: 700, letterSpacing: '0.1em' },
      overline: { fontFamily: MONO_STACK, letterSpacing: '0.2em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: { body: { background: GREY_BG, color: BLACK } },
      },
      MuiAvatar: {
        styleOverrides: {
          root: {
            borderRadius: 0,
            border: `2px solid ${BLACK}`,
            background: WHITE,
            boxShadow: 'none',
            backgroundImage: 'none',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'uppercase',
            borderRadius: 0,
            boxShadow: 'none',
            letterSpacing: '0.1em',
            fontWeight: 700,
            padding: '8px 18px',
          },
          contained: {
            background: BLACK,
            color: WHITE,
            border: `2px solid ${BLACK}`,
            '&:hover': { background: WHITE, color: BLACK, boxShadow: 'none' },
          },
          outlined: {
            borderWidth: 2,
            borderColor: BLACK,
            color: BLACK,
            background: WHITE,
            '&:hover': { background: BLACK, color: WHITE, borderColor: BLACK },
          },
          text: {
            color: BLACK,
            '&:hover': { background: BLACK, color: WHITE },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 0,
            background: 'transparent',
            border: 'none',
            boxShadow: 'none',
            color: BLACK,
            '&:hover': { background: BLACK, color: WHITE },
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 0,
            margin: 0,
            borderBottom: `1px solid ${BLACK}`,
            background: WHITE,
            boxShadow: 'none',
            '&:hover': { background: BLACK, color: WHITE },
            '&.Mui-selected': { background: BLACK, color: WHITE },
            '&.Mui-selected:hover': { background: BLACK, color: WHITE },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: WHITE,
            color: BLACK,
            borderBottom: `2px solid ${BLACK}`,
            boxShadow: 'none',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            background: WHITE,
            border: `2px solid ${BLACK}`,
            boxShadow: `4px 4px 0 ${BLACK}`,
            borderRadius: 0,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            background: WHITE,
            border: `2px solid ${BLACK}`,
            boxShadow: `4px 4px 0 ${BLACK}`,
            borderRadius: 0,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            background: WHITE,
            border: `2px solid ${BLACK}`,
            boxShadow: `8px 8px 0 ${BLACK}`,
            borderRadius: 0,
          },
        },
      },
      MuiTextField: {
        defaultProps: { InputLabelProps: { shrink: true } },
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': { background: WHITE, borderRadius: 0 },
            '& .MuiInputLabel-root': {
              color: BLACK,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontSize: '0.75rem',
              fontWeight: 700,
            },
            '& .MuiInputLabel-root.Mui-focused': { color: HOT },
            '& .MuiInputLabel-root.MuiInputLabel-shrink': {
              backgroundColor: WHITE,
              padding: '0 4px',
            },
            // Belt-and-suspenders: every actual text node inside the field
            // gets explicit black, and the webkit autofill override stops
            // Chrome from painting the value invisibly (white-on-white).
            '& .MuiInputBase-input': {
              color: BLACK,
              caretColor: BLACK,
              WebkitTextFillColor: BLACK,
            },
            '& .MuiInputBase-input::placeholder': {
              color: GREY_MID,
              opacity: 0.8,
            },
            '& .MuiInputBase-input:-webkit-autofill': {
              WebkitTextFillColor: BLACK,
              WebkitBoxShadow: `0 0 0 100px ${WHITE} inset`,
              caretColor: BLACK,
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            background: WHITE,
            borderRadius: 0,
            color: BLACK,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: BLACK, borderWidth: 2 },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: HOT },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: HOT, borderWidth: 2 },
          },
          input: {
            color: BLACK,
            WebkitTextFillColor: BLACK,
          },
        },
      },
      MuiCheckbox: {
        styleOverrides: { root: { color: BLACK, '&.Mui-checked': { color: HOT } } },
      },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: 0, border: `2px solid ${BLACK}` },
          standardError: { background: HOT, color: WHITE, borderColor: BLACK },
        },
      },
    },
  },
};
