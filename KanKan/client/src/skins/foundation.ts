import { alpha, darken, getContrastRatio, lighten, type Theme, type ThemeOptions } from '@mui/material/styles';

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
  const surface = theme.palette.background.paper;
  const canvas = theme.palette.background.default;
  const divider = theme.palette.divider;
  const text = theme.palette.text.primary;
  const textSecondary = theme.palette.text.secondary;
  const selected = alpha(primary, theme.palette.mode === 'dark' ? 0.18 : 0.1);
  const selectedHover = alpha(primary, theme.palette.mode === 'dark' ? 0.28 : 0.18);
  const selectedPressed = alpha(primary, theme.palette.mode === 'dark' ? 0.36 : 0.24);
  const isDark = theme.palette.mode === 'dark';
  const hover = isDark ? lighten(surface, 0.12) : darken(surface, 0.08);
  const pressed = isDark ? lighten(surface, 0.2) : darken(surface, 0.14);
  const focusVisible = { outline: `2px solid ${text}`, outlineOffset: 2 };
  const readableAccent = (accent: string) => {
    let color = accent;
    for (let step = 0; step < 20; step += 1) {
      if ([surface, hover, pressed].every((background) => getContrastRatio(color, background) >= 4.5)) {
        return color;
      }
      color = isDark ? lighten(color, 0.1) : darken(color, 0.1);
    }
    return text;
  };
  const createButtonColors = (main: string) => {
    const foreground = getContrastRatio(main, '#ffffff') >= 4.5 ? '#ffffff' : '#000000';
    const shade = foreground === '#ffffff' ? darken : lighten;
    return {
      main,
      foreground,
      hover: shade(main, 0.18),
      pressed: shade(main, 0.3),
      accent: readableAccent(main),
    };
  };
  const buttonColors = {
    primary: createButtonColors(primary),
    secondary: createButtonColors(theme.palette.secondary.main),
    error: createButtonColors(theme.palette.error.main),
    warning: createButtonColors(theme.palette.warning.main),
    info: createButtonColors(theme.palette.info.main),
    success: createButtonColors(theme.palette.success.main),
    inherit: createButtonColors(text),
  };
  const secondaryLabel = readableAccent(textSecondary);
  const richTextLabelColors = Object.fromEntries(
    ['text', 'icon', 'icon-sub', 'dropdown-arrows'].flatMap((part) =>
      ['default', 'hover', 'active', 'disabled'].map((state) => [
        `--tt-button-${state}-${part}-color`,
        state === 'disabled' ? theme.palette.action.disabled : text,
      ]).concat(
        ['emphasized', 'subdued'].map((appearance) => [
          `--tt-button-active-${part}-color-${appearance}`, text,
        ]),
      ),
    ),
  );
  const richTextPrimaryLabels = Object.fromEntries(
    ['text', 'icon', 'icon-sub', 'dropdown-arrows'].flatMap((part) =>
      ['default', 'hover'].map((state) => [
        `--tt-button-${state}-${part}-color`, buttonColors.primary.foreground,
      ]),
    ),
  );
  const overlayShadow = theme.palette.mode === 'dark'
    ? '0 8px 28px rgba(0, 0, 0, 0.42)'
    : '0 8px 24px rgba(0, 0, 0, 0.12)';

  return {
    shape: { borderRadius: 4 },
    palette: {
      primary: { contrastText: buttonColors.primary.foreground },
      secondary: { contrastText: buttonColors.secondary.foreground },
      error: { contrastText: buttonColors.error.foreground },
      warning: { contrastText: buttonColors.warning.foreground },
      info: { contrastText: buttonColors.info.foreground },
      success: { contrastText: buttonColors.success.foreground },
      action: { hover, selected, focus: pressed },
    },
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
          // Tiptap uses native controls and body portals, not MUI component overrides.
          // Specificity also overrides its independent .dark / data-style palette rules.
          ':root body .tiptap-button, :root body .tiptap-button[data-style]': {
            ...richTextLabelColors,
            '--tt-button-default-bg-color': surface,
            '--tt-button-hover-bg-color': hover,
            '--tt-button-active-bg-color': selected,
            '--tt-button-active-bg-color-emphasized': selected,
            '--tt-button-active-bg-color-subdued': selected,
            '--tt-button-active-hover-bg-color': selectedHover,
            '--tt-button-active-hover-bg-color-emphasized': selectedHover,
            '--tt-button-active-hover-bg-color-subdued': selectedHover,
            '--tt-button-disabled-bg-color': 'transparent',
            borderRadius: 4,
            '&:active:not(:disabled)': { backgroundColor: pressed },
            '&:focus-visible, &[data-focus-visible="true"]': focusVisible,
            '&:disabled .tiptap-button-icon-sub, &:disabled .tiptap-button-dropdown-arrows, &:disabled .tiptap-button-dropdown-small': {
              color: theme.palette.action.disabled,
            },
          },
          ':root body .tiptap-button[data-style="primary"]': {
            ...richTextPrimaryLabels,
            '--tt-button-default-bg-color': buttonColors.primary.main,
            '--tt-button-hover-bg-color': buttonColors.primary.hover,
            '&:active:not(:disabled)': {
              backgroundColor: buttonColors.primary.pressed,
              color: buttonColors.primary.foreground,
              '& .tiptap-button-icon, & .tiptap-button-icon-sub, & .tiptap-button-dropdown-arrows, & .tiptap-button-dropdown-small': {
                color: buttonColors.primary.foreground,
              },
            },
          },
          ':root body .tiptap-toolbar': {
            '--tt-toolbar-bg-color': surface,
            '--tt-toolbar-border-color': divider,
            color: text,
          },
          ':root body .tiptap-dropdown-menu-content, :root body .tiptap-dropdown-menu-sub-content': {
            '--tt-dropdown-menu-bg-color': surface,
            '--tt-dropdown-menu-text-color': text,
            '--tt-dropdown-menu-label-color': text,
            border: `1px solid ${divider}`,
            borderRadius: 8,
            boxShadow: overlayShadow,
          },
          ':root body .tiptap-popover': {
            '--tt-popover-bg-color': surface,
            '--tt-popover-border-color': divider,
            '--tt-popover-text-color': text,
            color: text,
          },
          ':root body .tiptap-card': {
            '--tiptap-card-bg-color': surface,
            '--tiptap-card-border-color': divider,
            '--tiptap-card-group-label-color': text,
            color: text,
            borderRadius: 8,
            boxShadow: overlayShadow,
          },
          ':root body .tiptap-input': {
            '--tt-input-placeholder': textSecondary,
            '--tt-input-border': divider,
            '--tt-input-border-focus': text,
            color: text,
            backgroundColor: surface,
          },
          ':root body .tiptap-separator': { '--tt-link-border-color': divider },
          ':root body .tiptap-tooltip': {
            '--tt-tooltip-bg': text,
            '--tt-tooltip-text': surface,
            '--tt-kbd': surface,
          },
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
            '&.Mui-focusVisible': focusVisible,
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
          // Callbacks replace legacy skin objects instead of merging incompatible hover colors.
          contained: ({ ownerState }) => {
            const colors = buttonColors[ownerState.color ?? 'primary'];
            return {
              background: colors.main,
              color: colors.foreground,
              border: '1px solid transparent',
              boxShadow: 'none',
              '&:hover': {
                background: colors.hover,
                boxShadow: `inset 0 0 0 1px ${alpha(colors.foreground, 0.5)}`,
              },
              '&:active': { background: colors.pressed },
              '&.Mui-disabled': {
                background: theme.palette.action.disabledBackground,
                color: theme.palette.action.disabled,
                boxShadow: 'none',
              },
            };
          },
          outlined: ({ ownerState }) => ({
            background: surface,
            color: ownerState.color === 'inherit' ? 'inherit' : buttonColors[ownerState.color ?? 'primary'].accent,
            borderColor: divider,
            borderWidth: 1,
            '&:hover': {
              background: hover,
              borderColor: 'currentColor',
              borderWidth: 1,
            },
            '&:active': { background: pressed },
            '&.Mui-disabled': { background: 'transparent', color: theme.palette.action.disabled, borderColor: theme.palette.action.disabledBackground },
          }),
          text: ({ ownerState }) => ({
            color: ownerState.color === 'inherit' ? 'inherit' : buttonColors[ownerState.color ?? 'primary'].accent,
            '&:hover': { background: hover },
            '&:active': { background: pressed },
            '&.Mui-disabled': { background: 'transparent', color: theme.palette.action.disabled },
          }),
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: ({ ownerState }) => ({
            flexShrink: 0,
            minWidth: 32,
            minHeight: 32,
            borderRadius: 4,
            border: 'none',
            background: 'transparent',
            boxShadow: 'none',
            color: ownerState.color === 'inherit' ? 'inherit'
              : ownerState.color && ownerState.color !== 'default' ? buttonColors[ownerState.color].accent
              : secondaryLabel,
            '&:hover': { background: hover },
            '&:active': { boxShadow: 'inset 0 0 0 2px currentColor' },
            '&.Mui-focusVisible': focusVisible,
            '&.Mui-disabled': { background: 'transparent', color: theme.palette.action.disabled, boxShadow: 'none' },
          }),
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
          root: () => ({
            margin: 0,
            border: 'none',
            borderRadius: 0,
            background: 'transparent',
            boxShadow: 'none',
            color: text,
            '&:hover': { background: hover, color: text },
            '&:active': { background: pressed, color: text },
            '&.Mui-focusVisible': { ...focusVisible, outlineOffset: -2, background: hover },
            '&.Mui-selected': { background: selected, color: text },
            '&.Mui-selected:hover': { background: selectedHover, color: text },
            '&.Mui-selected:active': { background: selectedPressed, color: text },
          }),
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
          root: () => ({
            minHeight: 36,
            borderColor: divider,
            borderRadius: 4,
            color: secondaryLabel,
            textTransform: 'none',
            '&:hover': { background: hover, color: text },
            '&:active': { background: pressed, color: text },
            '&.Mui-focusVisible': focusVisible,
            '&.Mui-selected': { background: selected, color: text },
            '&.Mui-selected:hover': { background: selectedHover, color: text },
            '&.Mui-selected:active': { background: selectedPressed, color: text },
            '&.Mui-disabled': { color: theme.palette.action.disabled, background: 'transparent' },
          }),
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
