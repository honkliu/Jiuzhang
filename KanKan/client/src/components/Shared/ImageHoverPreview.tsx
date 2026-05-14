import React from 'react';
import { Box, Popover, useMediaQuery, useTheme } from '@mui/material';

export interface ImageHoverPreviewProps {
  src?: string | null;
  alt?: string;
  maxSize?: number;
  openDelayMs?: number;
  interactive?: boolean;
  disabled?: boolean;
  openOnHover?: boolean;
  openOnLongPress?: boolean;
  openOnTap?: boolean;
  openOnClick?: boolean;
  openOnDoubleClick?: boolean;
  dismissOnHoverOut?: boolean;
  closeOnClickWhenOpen?: boolean;
  closeOnTriggerClickWhenOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onPreviewClick?: () => void;
  children: (props: {
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => void;
    onMouseLeave: () => void;
    onPointerEnter?: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerLeave?: (event: React.PointerEvent<HTMLElement>) => void;
    onFocus: (event: React.FocusEvent<HTMLElement>) => void;
    onBlur: () => void;
    onClick?: (event: React.MouseEvent<HTMLElement>) => void;
    onDoubleClick?: (event: React.MouseEvent<HTMLElement>) => void;
    onTouchStart?: (event: React.TouchEvent<HTMLElement>) => void;
    onTouchEnd?: (event: React.TouchEvent<HTMLElement>) => void;
    'aria-describedby'?: string;
  }) => React.ReactNode;
}

type PreviewCloser = () => void;
type PreviewInputMode = 'mouse' | 'touch' | null;
const previewRegistry = new Map<string, PreviewCloser>();

const registerPreview = (id: string, close: PreviewCloser) => {
  previewRegistry.set(id, close);
  return () => {
    previewRegistry.delete(id);
  };
};

const closeOtherPreviews = (id: string) => {
  previewRegistry.forEach((close, key) => {
    if (key !== id) {
      close();
    }
  });
};

export const ImageHoverPreview: React.FC<ImageHoverPreviewProps> = ({
  src,
  alt,
  maxSize,
  openDelayMs = 350,
  interactive = true,
  disabled = false,
  openOnHover = true,
  openOnLongPress = true,
  openOnTap = false,
  openOnClick = false,
  openOnDoubleClick = false,
  dismissOnHoverOut = true,
  closeOnClickWhenOpen = false,
  closeOnTriggerClickWhenOpen = false,
  onOpenChange,
  onPreviewClick,
  children,
}) => {
  const theme = useTheme();
  const isHoverCapable = useMediaQuery('(hover: hover) and (pointer: fine)');
  const isTouchDevice = !isHoverCapable;

  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const [isPreviewHover, setIsPreviewHover] = React.useState(false);
  const [openInputMode, setOpenInputMode] = React.useState<PreviewInputMode>(null);
  const isPreviewHoverRef = React.useRef(false);
  const closeTimerRef = React.useRef<number | null>(null);
  const openTimerRef = React.useRef<number | null>(null);
  const longPressTimerRef = React.useRef<number | null>(null);
  const longPressOpenedRef = React.useRef(false);
  const suppressTapOpenRef = React.useRef(false);
  const suppressNextClickRef = React.useRef(false);
  const popoverPaperRef = React.useRef<HTMLDivElement | null>(null);
  const popoverId = React.useId();

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const viewportCap = 0.8;
  const absoluteCap = 800;
  const maxWidth = typeof maxSize === 'number'
    ? Math.min(maxSize, viewportWidth * viewportCap, absoluteCap)
    : Math.min(viewportWidth * viewportCap, absoluteCap);
  const maxHeight = typeof maxSize === 'number'
    ? Math.min(maxSize, viewportHeight * viewportCap, absoluteCap)
    : Math.min(viewportHeight * viewportCap, absoluteCap);
  const previewPaddingPx = 8;
  const imageMaxWidth = Math.max(0, maxWidth - previewPaddingPx);
  const imageMaxHeight = Math.max(0, maxHeight - previewPaddingPx);
  const useTouchPreviewLayout = openInputMode === 'touch';

  const handleOpen = (
    event: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement> | React.PointerEvent<HTMLElement>,
    inputMode: Exclude<PreviewInputMode, null> = 'mouse'
  ) => {
    if (!src || disabled) return;
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
      closeOtherPreviews(popoverId);
      setAnchorEl(currentTarget);
      setOpenInputMode(inputMode);
      onOpenChange?.(true);
      openTimerRef.current = null;
    }, openDelayMs);
  };

  const closePreview = React.useCallback((force: boolean = false) => {
    if (openTimerRef.current) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    if (force) {
      setAnchorEl(null);
      setOpenInputMode(null);
      setIsPreviewHover(false);
      isPreviewHoverRef.current = false;
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
      setOpenInputMode(null);
      setIsPreviewHover(false);
      isPreviewHoverRef.current = false;
      onOpenChange?.(false);
      closeTimerRef.current = null;
    }, 0);
  }, [interactive, onOpenChange]);

  const handleClose = () => {
    closePreview(false);
  };

  const handleCancelPendingOpen = () => {
    if (openTimerRef.current) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (anchorEl && !isPreviewHoverRef.current && !useTouchPreviewLayout) {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
      closeTimerRef.current = window.setTimeout(() => {
        if (!isPreviewHoverRef.current) {
          closePreview(true);
        }
      }, 200);
      return;
    }
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (!src || disabled || !openOnDoubleClick) return;
    if (openTimerRef.current) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    const currentTarget = event.currentTarget as HTMLElement;
    closeOtherPreviews(popoverId);
    setAnchorEl(currentTarget);
    setOpenInputMode('mouse');
    onOpenChange?.(true);
  };

  const handlePointerOpen = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    handleOpen(event, 'mouse');
  };

  const handlePointerClose = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    if (dismissOnHoverOut) {
      handleClose();
      return;
    }
    handleCancelPendingOpen();
  };

  // Touch: long press to preview
  const handleTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    if (!src || disabled) return;
    if (openOnLongPress) {
      event.preventDefault();
    }
    if (openOnTap && anchorEl) {
      suppressTapOpenRef.current = true;
    }
    if (!openOnLongPress) return;
    longPressOpenedRef.current = false;
    const currentTarget = event.currentTarget as HTMLElement;
    longPressTimerRef.current = window.setTimeout(() => {
      closeOtherPreviews(popoverId);
      longPressOpenedRef.current = true;
      suppressNextClickRef.current = true;
      setAnchorEl(currentTarget);
      setOpenInputMode('touch');
      onOpenChange?.(true);
      longPressTimerRef.current = null;
    }, 400);
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (suppressTapOpenRef.current) {
      suppressTapOpenRef.current = false;
      return;
    }
    if (longPressOpenedRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (openOnTap && isTouchDevice) {
      closeOtherPreviews(popoverId);
      const currentTarget = event.currentTarget as HTMLElement;
      setAnchorEl(currentTarget);
      setOpenInputMode('touch');
      onOpenChange?.(true);
      suppressNextClickRef.current = true;
    }
  };

  const open = Boolean(anchorEl && src) || (interactive && isPreviewHover);
  const id = open ? popoverId : undefined;

  const shouldCloseOnTriggerClick = closeOnClickWhenOpen || closeOnTriggerClickWhenOpen;
  const canOpenWithHybridPointer = isTouchDevice && (openOnHover || openOnLongPress || openOnTap);

  const handleClickOpen = (event: React.MouseEvent<HTMLElement>) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!src || disabled || !openOnClick) return;
    if (open) {
      if (shouldCloseOnTriggerClick) {
        event.preventDefault();
        event.stopPropagation();
        closePreview(true);
      }
      return;
    }
    closeOtherPreviews(popoverId);
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
    setOpenInputMode('mouse');
    onOpenChange?.(true);
  };

  const handleTriggerClick = (event: React.MouseEvent<HTMLElement>) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!shouldCloseOnTriggerClick || !open) return;
    event.preventDefault();
    event.stopPropagation();
    closePreview(true);
  };

  const stopTouchPropagation = (event: React.TouchEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const noopMouse = (_event?: React.SyntheticEvent<HTMLElement>) => {};

  React.useEffect(() => registerPreview(popoverId, () => closePreview(true)), [popoverId, closePreview]);

  React.useEffect(() => {
    if (!src || disabled) {
      closePreview(true);
    }
  }, [src, disabled, closePreview]);

  React.useEffect(() => {
    if (!open) return;

    const handleDocumentPointerDown = (event: MouseEvent | TouchEvent) => {
      if (useTouchPreviewLayout) {
        closePreview(true);
        return;
      }
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
  }, [open, anchorEl, closePreview, useTouchPreviewLayout]);

  return (
    <>
      {open && useTouchPreviewLayout && (
        <Box
          // @ts-expect-error - TS2590 union type complexity
          onClick={() => closePreview(true)}
          onTouchStart={stopTouchPropagation}
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: theme.zIndex.modal,
            bgcolor: 'transparent',
            touchAction: 'none',
          }}
        />
      )}
      {children({
        onMouseEnter: !isTouchDevice && openOnHover ? handleOpen : noopMouse,
        onMouseLeave: !isTouchDevice && openOnHover
          ? (dismissOnHoverOut ? handleClose : handleCancelPendingOpen)
          : noopMouse,
        onPointerEnter: canOpenWithHybridPointer ? handlePointerOpen : undefined,
        onPointerLeave: canOpenWithHybridPointer ? handlePointerClose : undefined,
        onFocus: !isTouchDevice && openOnHover ? handleOpen : (noopMouse as any),
        onBlur: !isTouchDevice && openOnHover
          ? (dismissOnHoverOut ? handleClose : handleCancelPendingOpen)
          : (noopMouse as any),
        onClick: openOnClick || shouldCloseOnTriggerClick
          ? (openOnClick ? handleClickOpen : handleTriggerClick)
          : undefined,
        onDoubleClick: openOnDoubleClick ? handleDoubleClick : undefined,
        onTouchStart: isTouchDevice && (openOnLongPress || openOnTap) ? handleTouchStart : undefined,
        onTouchEnd: isTouchDevice && (openOnLongPress || openOnDoubleClick || openOnTap) ? handleTouchEnd : undefined,
        'aria-describedby': id,
      })}
      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={() => closePreview(true)}
        disableScrollLock
        disableAutoFocus
        disableEnforceFocus
        disableRestoreFocus
        keepMounted
        sx={{ pointerEvents: useTouchPreviewLayout ? 'auto' : 'none', zIndex: theme.zIndex.modal + 1 }}
        anchorOrigin={useTouchPreviewLayout
          ? { vertical: 'top', horizontal: 'center' }
          : { vertical: 'center', horizontal: 'right' }
        }
        transformOrigin={useTouchPreviewLayout
          ? { vertical: 'bottom', horizontal: 'center' }
          : { vertical: 'center', horizontal: 'left' }
        }
        PaperProps={{
          ref: popoverPaperRef,
          sx: {
            maxWidth,
            maxHeight,
            borderRadius: 1,
            pointerEvents: interactive && !useTouchPreviewLayout ? 'auto' : 'none',
            overflow: 'hidden',
          },
          onMouseEnter: interactive && !useTouchPreviewLayout
            ? () => {
                if (closeTimerRef.current) {
                  window.clearTimeout(closeTimerRef.current);
                  closeTimerRef.current = null;
                }
                setIsPreviewHover(true);
                isPreviewHoverRef.current = true;
              }
            : undefined,
          onMouseLeave: interactive && !useTouchPreviewLayout && dismissOnHoverOut
            ? () => {
                setIsPreviewHover(false);
                isPreviewHoverRef.current = false;
                handleClose();
              }
            : undefined,
          onClick: interactive && !useTouchPreviewLayout
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
          onTouchStart: useTouchPreviewLayout ? stopTouchPropagation : undefined,
          onTouchEnd: useTouchPreviewLayout ? stopTouchPropagation : undefined,
        }}
      >
        <Box
          onTouchStart={useTouchPreviewLayout ? stopTouchPropagation : undefined}
          onTouchEnd={useTouchPreviewLayout ? stopTouchPropagation : undefined}
          sx={{
            p: 0.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
            maxWidth,
            maxHeight,
          }}
        >
          <Box
            component="img"
            src={src || undefined}
            alt={alt || 'Image preview'}
            onContextMenu={(event: React.MouseEvent<HTMLImageElement>) => {
              event.preventDefault();
            }}
            sx={{
              display: 'block',
              maxWidth: imageMaxWidth,
              maxHeight: imageMaxHeight,
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              WebkitTouchCallout: 'none',
              WebkitUserSelect: 'none',
              userSelect: 'none',
              WebkitUserDrag: 'none',
            }}
          />
        </Box>
      </Popover>
    </>
  );
};
