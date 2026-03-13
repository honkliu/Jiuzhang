import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Slider } from '@mui/material';
import { useLanguage } from '@/i18n/LanguageContext';

const BoxAny = Box as any;

interface ImageCropDialogProps {
  open: boolean;
  imageSrc: string;
  onConfirm: (croppedFile: File) => void;
  onCancel: () => void;
}

const OUTPUT_SIZE = 1024;

export const ImageCropDialog: React.FC<ImageCropDialogProps> = ({
  open,
  imageSrc,
  onConfirm,
  onCancel,
}) => {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgNatural, setImgNatural] = useState({ w: 1, h: 1 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ active: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 });
  const touchRef = useRef({ mode: 'none' as 'none' | 'pan' | 'pinch', startX: 0, startY: 0, offsetX: 0, offsetY: 0, startDist: 0, startZoom: 1 });

  // Compute the base scale: the smallest scale that makes the image fill the square
  const getContainerSize = useCallback(() => {
    if (!containerRef.current) return 300;
    return Math.min(containerRef.current.clientWidth, containerRef.current.clientHeight);
  }, []);

  const baseScale = useCallback(() => {
    const size = getContainerSize();
    const minDim = Math.min(imgNatural.w, imgNatural.h);
    return size / minDim;
  }, [getContainerSize, imgNatural]);

  // Clamp offset so image always covers the crop square
  const clampOffset = useCallback((ox: number, oy: number, z: number) => {
    const size = getContainerSize();
    const scale = baseScale() * z;
    const scaledW = imgNatural.w * scale;
    const scaledH = imgNatural.h * scale;
    const maxX = Math.max(0, (scaledW - size) / 2);
    const maxY = Math.max(0, (scaledH - size) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, ox)), y: Math.max(-maxY, Math.min(maxY, oy)) };
  }, [baseScale, getContainerSize, imgNatural]);

  // Reset when dialog opens or image changes
  useEffect(() => {
    if (open) {
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    }
  }, [open, imageSrc]);

  const handleImageLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const handleZoomChange = (_: Event, value: number | number[]) => {
    const z = value as number;
    setZoom(z);
    setOffset((prev) => clampOffset(prev.x, prev.y, z));
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    setZoom((prev) => {
      const next = Math.max(1, Math.min(5, prev + delta));
      setOffset((prevOff) => clampOffset(prevOff.x, prevOff.y, next));
      return next;
    });
  };

  // Mouse drag
  const handleMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, offsetX: offset.x, offsetY: offset.y };
    e.preventDefault();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clampOffset(dragRef.current.offsetX + dx, dragRef.current.offsetY + dy, zoom));
  };

  const handleMouseUp = () => { dragRef.current.active = false; };

  // Touch pan + pinch
  const getTouchDist = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length >= 2) {
      touchRef.current = { mode: 'pinch', startX: 0, startY: 0, offsetX: offset.x, offsetY: offset.y, startDist: getTouchDist(e.touches), startZoom: zoom };
      e.preventDefault();
    } else if (e.touches.length === 1) {
      touchRef.current = { mode: 'pan', startX: e.touches[0].clientX, startY: e.touches[0].clientY, offsetX: offset.x, offsetY: offset.y, startDist: 0, startZoom: zoom };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchRef.current.mode === 'pinch' && e.touches.length >= 2) {
      const dist = getTouchDist(e.touches);
      const scale = touchRef.current.startDist > 0 ? dist / touchRef.current.startDist : 1;
      const nextZoom = Math.max(1, Math.min(5, touchRef.current.startZoom * scale));
      setZoom(nextZoom);
      setOffset(clampOffset(touchRef.current.offsetX, touchRef.current.offsetY, nextZoom));
      e.preventDefault();
    } else if (touchRef.current.mode === 'pan' && e.touches.length === 1) {
      const dx = e.touches[0].clientX - touchRef.current.startX;
      const dy = e.touches[0].clientY - touchRef.current.startY;
      setOffset(clampOffset(touchRef.current.offsetX + dx, touchRef.current.offsetY + dy, zoom));
      e.preventDefault();
    }
  };

  const handleTouchEnd = () => { touchRef.current.mode = 'none'; };

  // Crop via canvas
  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img) return;

    const size = getContainerSize();
    const scale = baseScale() * zoom;

    // Where is the image positioned relative to the container center?
    // Image center = container center + offset
    // Crop square is centered in container
    // Top-left of crop in image coords:
    const cropX = (imgNatural.w / 2) - (offset.x / scale) - (size / (2 * scale));
    const cropY = (imgNatural.h / 2) - (offset.y / scale) - (size / (2 * scale));
    const cropSize = size / scale;

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(img, cropX, cropY, cropSize, cropSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], 'avatar-cropped.jpg', { type: 'image/jpeg' });
      onConfirm(file);
    }, 'image/jpeg', 0.92);
  };

  const size = getContainerSize();
  const scale = baseScale() * zoom;
  const imgStyle: React.CSSProperties = {
    position: 'absolute',
    width: imgNatural.w * scale,
    height: imgNatural.h * scale,
    left: '50%',
    top: '50%',
    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
    pointerEvents: 'none',
    userSelect: 'none',
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{t('profile.cropAvatar')}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, pt: 1 }}>
        <BoxAny
          ref={containerRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          sx={{
            position: 'relative',
            width: '100%',
            maxWidth: 400,
            aspectRatio: '1 / 1',
            overflow: 'hidden',
            cursor: 'grab',
            bgcolor: '#000',
            borderRadius: 1,
            touchAction: 'none',
            '&:active': { cursor: 'grabbing' },
          }}
        >
          <BoxAny
            component="img"
            ref={imgRef}
            src={imageSrc}
            alt="Crop preview"
            crossOrigin="anonymous"
            onLoad={handleImageLoad}
            sx={imgStyle}
          />
          {/* Dark overlay with circular cutout */}
          <BoxAny
            sx={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              boxShadow: `0 0 0 ${size}px rgba(0, 0, 0, 0.55)`,
              borderRadius: '50%',
            }}
          />
          {/* Circle guide border */}
          <BoxAny
            sx={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '2px solid rgba(255, 255, 255, 0.6)',
              pointerEvents: 'none',
            }}
          />
        </BoxAny>
        <BoxAny sx={{ width: '100%', maxWidth: 400, px: 1 }}>
          <Slider
            value={zoom}
            min={1}
            max={5}
            step={0.01}
            onChange={handleZoomChange}
            size="small"
          />
        </BoxAny>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{t('common.cancel')}</Button>
        <Button variant="contained" onClick={handleConfirm}>{t('common.confirm')}</Button>
      </DialogActions>
    </Dialog>
  );
};
