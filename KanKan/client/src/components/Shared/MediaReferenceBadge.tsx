import React from 'react';
import { Box } from '@mui/material';

const STORAGE_KEY = 'kankan.mediaReferenceNumbers.visible';
const CHANGE_EVENT = 'kankan-media-reference-visibility';

export function readMediaReferenceVisibility() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_KEY) === 'true';
}

export function setMediaReferenceVisibility(visible: boolean) {
  window.localStorage.setItem(STORAGE_KEY, String(visible));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: visible }));
}

export function useMediaReferenceVisibility() {
  const [visible, setVisible] = React.useState(readMediaReferenceVisibility);

  React.useEffect(() => {
    const handleChange = (event: Event) => {
      setVisible((event as CustomEvent<boolean>).detail);
    };
    window.addEventListener(CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(CHANGE_EVENT, handleChange);
  }, []);

  return visible;
}

export const MediaReferenceBadge: React.FC<{ number?: number }> = ({ number }) => {
  const visible = useMediaReferenceVisibility();
  if (!visible || !number) return null;

  return (
    <Box
      component="span"
      sx={{
        position: 'absolute',
        top: 4,
        right: 4,
        zIndex: 4,
        px: 0.6,
        py: 0.1,
        borderRadius: 0.75,
        bgcolor: 'rgba(15, 23, 42, 0.78)',
        color: 'common.white',
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1.4,
        pointerEvents: 'none',
      }}
    >
      #{number}
    </Box>
  );
};
