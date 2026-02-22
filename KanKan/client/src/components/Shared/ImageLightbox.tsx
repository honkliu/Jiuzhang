import React, { useEffect, useCallback, useRef } from 'react';
import { Box, IconButton, Modal, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';

const BoxAny = Box as any;

interface ImageLightboxProps {
  images: string[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  images,
  initialIndex,
  open,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = React.useState(initialIndex);
  const thumbnailRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, open]);

  // Scroll selected thumbnail into view
  useEffect(() => {
    thumbnailRefs.current[currentIndex]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [currentIndex]);

  const prev = useCallback(() => {
    setCurrentIndex((i) => (i > 0 ? i - 1 : images.length - 1));
  }, [images.length]);

  const next = useCallback(() => {
    setCurrentIndex((i) => (i < images.length - 1 ? i + 1 : 0));
  }, [images.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, prev, next, onClose]);

  if (!images.length) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
    >
      <BoxAny
        sx={{
          display: 'flex',
          flexDirection: 'column',
          width: '90vw',
          maxWidth: 1100,
          height: '90vh',
          bgcolor: 'rgba(10, 10, 10, 0.97)',
          borderRadius: 2,
          overflow: 'hidden',
          outline: 'none',
          position: 'relative',
        }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {/* Header */}
        <BoxAny
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1,
            flexShrink: 0,
          }}
        >
          <BoxAny sx={{ width: 40 }} />
          <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>
            {currentIndex + 1} / {images.length}
          </Typography>
          <IconButton onClick={onClose} sx={{ color: 'rgba(255,255,255,0.8)' }}>
            <CloseIcon />
          </IconButton>
        </BoxAny>

        {/* Main image area */}
        <BoxAny
          sx={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            cursor: 'pointer',
          }}
          onClick={onClose}
        >
          <BoxAny
            component="img"
            src={images[currentIndex]}
            alt={`Image ${currentIndex + 1}`}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            sx={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              borderRadius: 1,
              userSelect: 'none',
              cursor: 'default',
            }}
          />

          {/* Left arrow */}
          {images.length > 1 && (
            <IconButton
              onClick={(e) => { e.stopPropagation(); prev(); }}
              sx={{
                position: 'absolute',
                left: 8,
                color: 'white',
                bgcolor: 'rgba(0,0,0,0.4)',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
              }}
            >
              <ArrowBackIosNewIcon />
            </IconButton>
          )}

          {/* Right arrow */}
          {images.length > 1 && (
            <IconButton
              onClick={(e) => { e.stopPropagation(); next(); }}
              sx={{
                position: 'absolute',
                right: 8,
                color: 'white',
                bgcolor: 'rgba(0,0,0,0.4)',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
              }}
            >
              <ArrowForwardIosIcon />
            </IconButton>
          )}
        </BoxAny>

        {/* Thumbnail strip */}
        {images.length > 1 && (
          <BoxAny
            sx={{
              flexShrink: 0,
              height: 80,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              overflowX: 'auto',
              bgcolor: 'rgba(0,0,0,0.5)',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255,255,255,0.2) transparent',
            }}
          >
            {images.map((url, i) => (
              <BoxAny
                key={i}
                ref={(el: HTMLDivElement | null) => { thumbnailRefs.current[i] = el; }}
                onClick={() => setCurrentIndex(i)}
                sx={{
                  flexShrink: 0,
                  width: 60,
                  height: 60,
                  borderRadius: 1,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  border: i === currentIndex
                    ? '2px solid rgba(255,255,255,0.9)'
                    : '2px solid transparent',
                  opacity: i === currentIndex ? 1 : 0.55,
                  transition: 'opacity 0.15s, border-color 0.15s',
                  '&:hover': { opacity: 1 },
                }}
              >
                <BoxAny
                  component="img"
                  src={url}
                  alt={`Thumbnail ${i + 1}`}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </BoxAny>
            ))}
          </BoxAny>
        )}
      </BoxAny>
    </Modal>
  );
};
