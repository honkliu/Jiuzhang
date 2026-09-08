import { alpha, type Theme, type ThemeOptions } from '@mui/material/styles';

const APP_FONT_STACK = [
  '"Noto Sans SC"',
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  '"PingFang SC"',
  '"Source Han Sans SC"',
  '"Microsoft YaHei"',
  'sans-serif',
].join(',');

export const createSkinFoundation = (theme: Theme): ThemeOptions => {
  const primary = theme.palette.primary.main;
  const primaryDark = theme.palette.primary.dark;
  const surface = theme.palette.background.paper;
  const canvas = theme.palette.background.default;
  const divider = theme.palette.divider;
  const text = theme.palette.text.primary;
  const textSecondary = theme.palette.text.secondary;
  const selected = alpha(primary, theme.palette.mode === 'dark' ? 0.18 : 0.1);
  const hover = alpha(primary, theme.palette.mode === 'dark' ? 0.1 : 0.06);
  const overlayShadow = theme.palette.mode === 'dark'
    ? '0 8px 28px rgba(0, 0, 0, 0.42)'
    : '0 8px 24px rgba(0, 0, 0, 0.12)';

  return {
    shape: { borderRadius: 4 },
    typography: {
      fontFamily: APP_FONT_STACK,
      fontSize: 14,
      h1: { fontFamily: APP_FONT_STACK, fontWeight: 600, letterSpacing: 0, textTransform: 'none' },
      h2: { fontFamily: APP_FONT_STACK, fontWeight: 600, letterSpacing: 0, textTransform: 'none' },
      h3: { fontFamily: APP_FONT_STACK, fontWeight: 600, letterSpacing: 0, textTransform: 'none' },
      h4: { fontFamily: APP_FONT_STACK, fontWeight: 600, letterSpacing: 0, textTransform: 'none' },
      h5: { fontFamily: APP_FONT_STACK, fontWeight: 600, letterSpacing: 0, textTransform: 'none' },
      h6: { fontFamily: APP_FONT_STACK, fontWeight: 500, letterSpacing: 0, textTransform: 'none' },
      subtitle1: { fontFamily: APP_FONT_STACK, fontWeight: 500, letterSpacing: 0, textTransform: 'none' },
      subtitle2: { fontFamily: APP_FONT_STACK, fontWeight: 500, letterSpacing: 0, textTransform: 'none' },
      body1: { fontFamily: APP_FONT_STACK, fontSize: '0.9375rem', lineHeight: 1.65 },
      body2: { fontFamily: APP_FONT_STACK, fontSize: '0.875rem', lineHeight: 1.6 },
      caption: { fontFamily: APP_FONT_STACK, fontSize: '0.75rem', lineHeight: 1.5 },
      button: { fontFamily: APP_FONT_STACK, fontWeight: 500, fontSize: '0.875rem', letterSpacing: 0, textTransform: 'none' },
      overline: { fontFamily: APP_FONT_STACK, letterSpacing: 0 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { background: canvas, color: text, fontFamily: APP_FONT_STACK },
        },
      },
      MuiAvatar: {
        styleOverrides: {
          root: {
            borderRadius: 4,
            border: `1px solid ${divider}`,
            background: theme.palette.action.hover,
            backgroundImage: 'none',
            boxShadow: 'none',
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            minHeight: 36,
            padding: '6px 14px',
            borderRadius: 4,
            borderWidth: 1,
            boxShadow: 'none',
            fontWeight: 500,
            letterSpacing: 0,
            textTransform: 'none',
            '&:hover': { boxShadow: 'none' },
          },
          sizeSmall: {
            height: 32,
            minHeight: 32,
            padding: '3px 12px',
            boxSizing: 'border-box',
            fontSize: '0.8125rem',
          },
          sizeMedium: {
            height: 36,
            minHeight: 36,
            padding: '5px 14px',
            boxSizing: 'border-box',
          },
          sizeLarge: {
            height: 40,
            minHeight: 40,
            padding: '6px 18px',
            boxSizing: 'border-box',
            fontSize: '0.9375rem',
          },
          contained: {
            background: primary,
            color: theme.palette.primary.contrastText,
            border: '1px solid transparent',
            boxShadow: 'none',
            '&:hover': { background: primaryDark, boxShadow: 'none' },
          },
          containedPrimary: {
            background: primary,
            color: theme.palette.primary.contrastText,
            '&:hover': { background: primaryDark },
          },
          containedError: {
            background: theme.palette.error.main,
            color: theme.palette.error.contrastText,
            '&:hover': { background: theme.palette.error.dark },
          },
          outlined: {
            background: surface,
            color: text,
            borderColor: divider,
            borderWidth: 1,
            '&:hover': { background: hover, borderColor: primary, borderWidth: 1 },
          },
          outlinedPrimary: {
            background: surface,
            color: text,
            borderColor: divider,
            '&:hover': { background: hover, color: primary, borderColor: primary },
          },
          outlinedError: {
            background: surface,
            color: theme.palette.error.main,
            borderColor: alpha(theme.palette.error.main, 0.45),
            '&:hover': {
              background: alpha(theme.palette.error.main, 0.06),
              borderColor: theme.palette.error.main,
            },
          },
          text: {
            color: primary,
            '&:hover': { background: hover },
          },
          textError: {
            color: theme.palette.error.main,
            '&:hover': { background: alpha(theme.palette.error.main, 0.06) },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 4,
            border: 'none',
            background: 'transparent',
            boxShadow: 'none',
            color: textSecondary,
            '&:hover': { background: hover, color: primary },
          },
          sizeSmall: {
            width: 32,
            height: 32,
            padding: 4,
          },
          sizeMedium: {
            width: 36,
            height: 36,
            padding: 6,
          },
          sizeLarge: {
            width: 40,
            height: 40,
            padding: 8,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            margin: 0,
            border: 'none',
            borderRadius: 0,
            backgroundColor: 'transparent',
            boxShadow: 'none',
            color: text,
            '&:hover': { backgroundColor: hover, color: text },
            '&.Mui-selected': { backgroundColor: selected, color: text },
            '&.Mui-selected:hover': { backgroundColor: alpha(primary, 0.14), color: text },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: surface,
            backgroundImage: 'none',
            color: text,
            border: 'none',
            borderBottom: `1px solid ${divider}`,
            boxShadow: 'none',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            background: surface,
            backgroundImage: 'none',
            border: 'none',
            borderRadius: 4,
            boxShadow: 'none',
          },
          outlined: {
            border: `1px solid ${divider}`,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            background: surface,
            backgroundImage: 'none',
            border: `1px solid ${divider}`,
            borderRadius: 4,
            boxShadow: 'none',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            background: surface,
            backgroundImage: 'none',
            border: 'none',
            borderRadius: 8,
            boxShadow: overlayShadow,
          },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: {
            background: surface,
            backgroundImage: 'none',
            border: `1px solid ${divider}`,
            borderRadius: 8,
            boxShadow: overlayShadow,
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            background: surface,
            backgroundImage: 'none',
            border: `1px solid ${divider}`,
            borderRadius: 8,
            boxShadow: overlayShadow,
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          variant: 'outlined',
          InputLabelProps: { shrink: true },
        },
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': { background: surface, borderRadius: 4 },
            '& .MuiInputLabel-root': { color: textSecondary },
            '& .MuiInputLabel-root.Mui-focused': { color: primary },
            '& .MuiInputLabel-root.MuiInputLabel-shrink': {
              backgroundColor: surface,
              padding: '0 4px',
            },
            '& .MuiInputBase-input': { color: text },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            background: surface,
            borderRadius: 4,
            color: text,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: divider, borderWidth: 1 },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: primary },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: primary, borderWidth: 1 },
          },
          input: { color: text },
        },
      },
      MuiCheckbox: {
        styleOverrides: {
          root: { color: textSecondary, '&.Mui-checked': { color: primary } },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            minHeight: 36,
            borderColor: divider,
            borderRadius: 4,
            color: textSecondary,
            textTransform: 'none',
            '&:hover': { background: hover },
            '&.Mui-selected': { background: selected, color: primary },
            '&.Mui-selected:hover': { background: alpha(primary, 0.14) },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 4 },
          outlined: { borderColor: divider },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: { height: 2, backgroundColor: primary },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: { minHeight: 36, letterSpacing: 0, textTransform: 'none' },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: 4, boxShadow: 'none' },
        },
      },
      MuiDivider: {
        styleOverrides: { root: { borderColor: divider } },
      },
      MuiTableCell: {
        styleOverrides: { root: { borderBottomColor: divider } },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { borderRadius: 4, fontSize: '0.75rem' },
        },
      },
    },
  };
};
