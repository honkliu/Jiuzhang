export const APP_HEADER_HEIGHT = 56;
export const APP_PAGE_GAP = 16;

export const APP_HEADER_OFFSET = `calc(${APP_HEADER_HEIGHT}px + env(safe-area-inset-top))`;

export const appPageShellSx = {
  minHeight: '100dvh',
  bgcolor: 'background.default',
  pt: APP_HEADER_OFFSET,
} as const;

export const appPageContainerSx = {
  pt: `calc(${APP_HEADER_OFFSET} + ${APP_PAGE_GAP}px)`,
  pb: { xs: 3, sm: 4 },
  px: { xs: 1.5, sm: 2 },
} as const;

export const appPageContentSx = {
  py: `${APP_PAGE_GAP}px`,
  px: { xs: 1.5, sm: 2 },
} as const;

export const appPageTitleSx = {
  fontSize: '1.25rem',
  fontWeight: 600,
  lineHeight: 1.6,
} as const;

export const appSectionTitleSx = {
  fontSize: '1rem',
  fontWeight: 600,
  lineHeight: 1.5,
} as const;

export const appSurfaceSx = {
  bgcolor: 'background.paper',
  backgroundImage: 'none',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  boxShadow: 'none',
} as const;
