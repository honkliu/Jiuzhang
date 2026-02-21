import React from 'react';
import { Box, Popover } from '@mui/material';

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
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const [isPreviewHover, setIsPreviewHover] = React.useState(false);
  const isPreviewHoverRef = React.useRef(false);
  const closeTimerRef = React.useRef<number | null>(null);
  const openTimerRef = React.useRef<number | null>(null);
  const popoverId = React.useId();

  const handleOpen = (event: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>) => {
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
      setAnchorEl(currentTarget);
      onOpenChange?.(true);
      openTimerRef.current = null;
    }, 500);
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
    }, 120);
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
        onFocus: handleOpen,
        onBlur: handleClose,
        onClick: closeOnTriggerClickWhenOpen ? handleTriggerClick : undefined,
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
        anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
        transformOrigin={{ vertical: 'center', horizontal: 'left' }}
        PaperProps={{
          sx: {
            p: 0.5,
            maxWidth: maxSize,
            maxHeight: maxSize,
            borderRadius: 1,
            pointerEvents: interactive ? 'auto' : 'none',
            overflow: 'hidden',
          },
          onMouseEnter: interactive
            ? () => {
                if (closeTimerRef.current) {
                  window.clearTimeout(closeTimerRef.current);
                  closeTimerRef.current = null;
                }
                setIsPreviewHover(true);
                isPreviewHoverRef.current = true;
              }
            : undefined,
          onMouseLeave: interactive
            ? () => {
                setIsPreviewHover(false);
                isPreviewHoverRef.current = false;
                handleClose();
              }
            : undefined,
          onClick: interactive
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
            maxWidth: maxSize,
            maxHeight: maxSize,
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
          }}
        />
      </Popover>
    </>
  );
};
