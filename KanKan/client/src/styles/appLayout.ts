export const APP_HEADER_HEIGHT = 56;

export const APP_HEADER_OFFSET = `calc(${APP_HEADER_HEIGHT}px + env(safe-area-inset-top))`;

export const appPageShellSx = {
  minHeight: '100dvh',
  bgcolor: 'background.default',
  pt: APP_HEADER_OFFSET,
} as const;

export const appPageContainerSx = {
  pt: `calc(${APP_HEADER_HEIGHT}px + env(safe-area-inset-top) + 16px)`,
  pb: { xs: 3, sm: 4 },
  px: { xs: 1.5, sm: 2 },
} as const;

export const appPageContentSx = {
  py: { xs: 1.5, sm: 2 },
  px: { xs: 1.5, sm: 2 },
} as const;

export const appSurfaceSx = {
  bgcolor: 'background.paper',
  backgroundImage: 'none',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  boxShadow: 'none',
} as const;
