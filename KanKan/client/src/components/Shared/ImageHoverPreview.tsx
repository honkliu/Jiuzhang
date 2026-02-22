import React from 'react';
import { Box, Popover, useMediaQuery, useTheme } from '@mui/material';

export interface ImageHoverPreviewProps {
  src?: string | null;
  alt?: string;
  maxSize?: number;
  interactive?: boolean;
  disabled?: boolean;
  closeOnTriggerClickWhenOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onPreviewClick?: () => void;
  children: (props: {
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => void;
    onMouseLeave: () => void;
    onFocus: (event: React.FocusEvent<HTMLElement>) => void;
    onBlur: () => void;
    onClick?: (event: React.MouseEvent<HTMLElement>) => void;
    onTouchStart?: (event: React.TouchEvent<HTMLElement>) => void;
    onTouchEnd?: (event: React.TouchEvent<HTMLElement>) => void;
    'aria-describedby'?: string;
  }) => React.ReactNode;
}

export const ImageHoverPreview: React.FC<ImageHoverPreviewProps> = ({
  src,
  alt,
  maxSize = 512,
  interactive = true,
  disabled = false,
  closeOnTriggerClickWhenOpen = false,
  onOpenChange,
  onPreviewClick,
  children,
}) => {
  const theme = useTheme();
  const isTouchDevice = useMediaQuery(theme.breakpoints.down('sm'));

  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const [isPreviewHover, setIsPreviewHover] = React.useState(false);
  const isPreviewHoverRef = React.useRef(false);
  const closeTimerRef = React.useRef<number | null>(null);
  const openTimerRef = React.useRef<number | null>(null);
  const longPressTimerRef = React.useRef<number | null>(null);
  const touchMovedRef = React.useRef(false);
  const popoverId = React.useId();

  const mobileMaxSize = Math.min(maxSize, window.innerWidth * 0.85);
  const effectiveMaxSize = isTouchDevice ? mobileMaxSize : maxSize;

  const handleOpen = (event: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>) => {
    if (!src || disabled || isTouchDevice) return;
    if (openTimerRef.current) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    const currentTarget = event.currentTarget as HTMLElement;
    openTimerRef.current = window.setTimeout(() => {
      setAnchorEl(currentTarget);
      onOpenChange?.(true);
      openTimerRef.current = null;
    }, 350);
  };

  const handleClose = () => {
    if (openTimerRef.current) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      if (interactive && isPreviewHoverRef.current) {
        closeTimerRef.current = null;
        return;
      }
      setAnchorEl(null);
      setIsPreviewHover(false);
      onOpenChange?.(false);
      closeTimerRef.current = null;
    }, 100);
  };

  // Touch: long press to preview
  const handleTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    if (!src || disabled || !isTouchDevice) return;
    touchMovedRef.current = false;
    const currentTarget = event.currentTarget as HTMLElement;
    longPressTimerRef.current = window.setTimeout(() => {
      setAnchorEl(currentTarget);
      onOpenChange?.(true);
      longPressTimerRef.current = null;
    }, 400);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (anchorEl && isTouchDevice) {
      setAnchorEl(null);
      setIsPreviewHover(false);
      onOpenChange?.(false);
    }
  };

  const open = Boolean(anchorEl && src) || (interactive && isPreviewHover);
  const id = open ? popoverId : undefined;

  const handleTriggerClick = (event: React.MouseEvent<HTMLElement>) => {
    if (!closeOnTriggerClickWhenOpen || !open) return;
    event.preventDefault();
    event.stopPropagation();
    setAnchorEl(null);
    setIsPreviewHover(false);
    isPreviewHoverRef.current = false;
    onOpenChange?.(false);
  };

  return (
    <>
      {children({
        onMouseEnter: handleOpen,
        onMouseLeave: handleClose,
        onFocus: isTouchDevice ? (() => {}) as any : handleOpen,
        onBlur: isTouchDevice ? (() => {}) as any : handleClose,
        onClick: closeOnTriggerClickWhenOpen ? handleTriggerClick : undefined,
        onTouchStart: isTouchDevice ? handleTouchStart : undefined,
        onTouchEnd: isTouchDevice ? handleTouchEnd : undefined,
        'aria-describedby': id,
      })}
      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        disableAutoFocus
        disableEnforceFocus
        disableRestoreFocus
        keepMounted
        sx={{ pointerEvents: 'none' }}
        anchorOrigin={isTouchDevice
          ? { vertical: 'top', horizontal: 'center' }
          : { vertical: 'center', horizontal: 'right' }
        }
        transformOrigin={isTouchDevice
          ? { vertical: 'bottom', horizontal: 'center' }
          : { vertical: 'center', horizontal: 'left' }
        }
        PaperProps={{
          sx: {
            p: 0.5,
            maxWidth: effectiveMaxSize,
            maxHeight: effectiveMaxSize,
            borderRadius: 1,
            pointerEvents: interactive && !isTouchDevice ? 'auto' : 'none',
            overflow: 'hidden',
          },
          onMouseEnter: interactive && !isTouchDevice
            ? () => {
                if (closeTimerRef.current) {
                  window.clearTimeout(closeTimerRef.current);
                  closeTimerRef.current = null;
                }
                setIsPreviewHover(true);
                isPreviewHoverRef.current = true;
              }
            : undefined,
          onMouseLeave: interactive && !isTouchDevice
            ? () => {
                setIsPreviewHover(false);
                isPreviewHoverRef.current = false;
                handleClose();
              }
            : undefined,
          onClick: interactive && !isTouchDevice
            ? () => {
                onPreviewClick?.();
                setIsPreviewHover(false);
                isPreviewHoverRef.current = false;
                handleClose();
              }
            : undefined,
        }}
      >
        <Box
          component="img"
          src={src || undefined}
          alt={alt || 'Image preview'}
          sx={{
            display: 'block',
            maxWidth: effectiveMaxSize,
            maxHeight: effectiveMaxSize,
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
          }}
        />
      </Popover>
    </>
  );
};
