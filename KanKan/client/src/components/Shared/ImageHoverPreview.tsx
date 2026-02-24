import React from 'react';
import { Box, Popover, useMediaQuery, useTheme } from '@mui/material';

export interface ImageHoverPreviewProps {
  src?: string | null;
  alt?: string;
  maxSize?: number;
  interactive?: boolean;
  disabled?: boolean;
  openOnHover?: boolean;
  openOnLongPress?: boolean;
  openOnDoubleClick?: boolean;
  dismissOnHoverOut?: boolean;
  closeOnClickWhenOpen?: boolean;
  closeOnTriggerClickWhenOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onPreviewClick?: () => void;
  children: (props: {
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => void;
    onMouseLeave: () => void;
    onFocus: (event: React.FocusEvent<HTMLElement>) => void;
    onBlur: () => void;
    onClick?: (event: React.MouseEvent<HTMLElement>) => void;
    onDoubleClick?: (event: React.MouseEvent<HTMLElement>) => void;
    onTouchStart?: (event: React.TouchEvent<HTMLElement>) => void;
    onTouchEnd?: (event: React.TouchEvent<HTMLElement>) => void;
    'aria-describedby'?: string;
  }) => React.ReactNode;
}

let activeLockedPreviewId: string | null = null;

let activePreviewOwnerId: string | null = null;

export const ImageHoverPreview: React.FC<ImageHoverPreviewProps> = ({
  src,
  alt,
  maxSize = 512,
  interactive = true,
  disabled = false,
  openOnHover = true,
  openOnLongPress = true,
  openOnDoubleClick = false,
  dismissOnHoverOut = true,
  closeOnClickWhenOpen = false,
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
  const lastTapRef = React.useRef<number>(0);
  const suppressNextClickRef = React.useRef(false);
  const popoverPaperRef = React.useRef<HTMLDivElement | null>(null);
  const popoverId = React.useId();

  const mobileMaxSize = Math.min(maxSize, window.innerWidth * 0.85);
  const effectiveMaxSize = isTouchDevice ? mobileMaxSize : maxSize;

  const handleOpen = (event: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>) => {
    if (!src || disabled || isTouchDevice) return;
    if (activePreviewOwnerId && activePreviewOwnerId !== popoverId) return;
    activePreviewOwnerId = popoverId;
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

  const closePreview = (force: boolean = false) => {
    if (openTimerRef.current) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    if (force) {
      setAnchorEl(null);
      setIsPreviewHover(false);
      isPreviewHoverRef.current = false;
      if (activePreviewOwnerId === popoverId) {
        activePreviewOwnerId = null;
      }
      onOpenChange?.(false);
      closeTimerRef.current = null;
      return;
    }
    closeTimerRef.current = window.setTimeout(() => {
      if (!force && interactive && isPreviewHoverRef.current) {
        closeTimerRef.current = null;
        return;
      }
      setAnchorEl(null);
      setIsPreviewHover(false);
      isPreviewHoverRef.current = false;
      if (activePreviewOwnerId === popoverId) {
        activePreviewOwnerId = null;
      }
      onOpenChange?.(false);
      closeTimerRef.current = null;
    }, 0);
  };

  const handleClose = () => {
    closePreview(false);
  };

  const handleCancelPendingOpen = () => {
    if (openTimerRef.current) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (!src || disabled || isTouchDevice || !openOnDoubleClick) return;
    if (activePreviewOwnerId && activePreviewOwnerId !== popoverId) return;
    activePreviewOwnerId = popoverId;
    if (openTimerRef.current) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    const currentTarget = event.currentTarget as HTMLElement;
    setAnchorEl(currentTarget);
    onOpenChange?.(true);
  };

  // Touch: long press to preview
  const handleTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    if (!src || disabled || !isTouchDevice || !openOnLongPress) return;
    if (activePreviewOwnerId && activePreviewOwnerId !== popoverId) return;
    activePreviewOwnerId = popoverId;
    touchMovedRef.current = false;
    const currentTarget = event.currentTarget as HTMLElement;
    longPressTimerRef.current = window.setTimeout(() => {
      setAnchorEl(currentTarget);
      onOpenChange?.(true);
      longPressTimerRef.current = null;
    }, 400);
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (openOnDoubleClick && isTouchDevice) {
      const now = Date.now();
      const delta = now - lastTapRef.current;
      lastTapRef.current = now;
      if (delta > 0 && delta < 320) {
        if (activePreviewOwnerId && activePreviewOwnerId !== popoverId) return;
        activePreviewOwnerId = popoverId;
        const currentTarget = event.currentTarget as HTMLElement;
        setAnchorEl(currentTarget);
        onOpenChange?.(true);
        suppressNextClickRef.current = true;
        return;
      }
    }
    if (anchorEl && isTouchDevice) {
      setAnchorEl(null);
      setIsPreviewHover(false);
      onOpenChange?.(false);
    }
  };

  const open = Boolean(anchorEl && src) || (interactive && isPreviewHover);
  const id = open ? popoverId : undefined;

  const shouldCloseOnTriggerClick = closeOnClickWhenOpen || closeOnTriggerClickWhenOpen;

  const handleTriggerClick = (event: React.MouseEvent<HTMLElement>) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (!shouldCloseOnTriggerClick || !open) return;
    event.preventDefault();
    event.stopPropagation();
    closePreview(true);
  };

  const noopMouse = (_event?: React.SyntheticEvent<HTMLElement>) => {};

  React.useEffect(() => {
    return () => {
      if (activePreviewOwnerId === popoverId) {
        activePreviewOwnerId = null;
      }
    };
  }, [popoverId]);

  React.useEffect(() => {
    if (!open) return;

    const handleDocumentPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (anchorEl && anchorEl.contains(target)) return;
      if (popoverPaperRef.current && popoverPaperRef.current.contains(target)) return;
      closePreview(true);
    };

    document.addEventListener('mousedown', handleDocumentPointerDown, true);
    document.addEventListener('touchstart', handleDocumentPointerDown, true);
    return () => {
      document.removeEventListener('mousedown', handleDocumentPointerDown, true);
      document.removeEventListener('touchstart', handleDocumentPointerDown, true);
    };
  }, [open, anchorEl]);

  return (
    <>
      {children({
        onMouseEnter: !isTouchDevice && openOnHover ? handleOpen : noopMouse,
        onMouseLeave: !isTouchDevice && openOnHover
          ? (dismissOnHoverOut ? handleClose : handleCancelPendingOpen)
          : noopMouse,
        onFocus: !isTouchDevice && openOnHover ? handleOpen : (noopMouse as any),
        onBlur: !isTouchDevice && openOnHover
          ? (dismissOnHoverOut ? handleClose : handleCancelPendingOpen)
          : (noopMouse as any),
        onClick: shouldCloseOnTriggerClick ? handleTriggerClick : undefined,
        onDoubleClick: !isTouchDevice && openOnDoubleClick ? handleDoubleClick : undefined,
        onTouchStart: isTouchDevice && openOnLongPress ? handleTouchStart : undefined,
        onTouchEnd: isTouchDevice && (openOnLongPress || openOnDoubleClick) ? handleTouchEnd : undefined,
        'aria-describedby': id,
      })}
      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={() => closePreview(true)}
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
          ref: popoverPaperRef,
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
          onMouseLeave: interactive && !isTouchDevice && dismissOnHoverOut
            ? () => {
                setIsPreviewHover(false);
                isPreviewHoverRef.current = false;
                handleClose();
              }
            : undefined,
          onClick: interactive && !isTouchDevice
            ? () => {
                onPreviewClick?.();
                if (closeOnClickWhenOpen) {
                  closePreview(true);
                  return;
                }
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
