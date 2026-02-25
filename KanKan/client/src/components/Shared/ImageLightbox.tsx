import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, CircularProgress, IconButton, Modal, TextField, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import { imageGenerationService } from '@/services/imageGeneration.service';
import { useLanguage } from '@/i18n/LanguageContext';

const BoxAny = Box as any;

interface LightboxGroup {
  sourceUrl: string;
  messageId: string;
  canEdit: boolean;
}

interface ImageLightboxProps {
  images: string[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
  groups?: LightboxGroup[];
  initialGroupIndex?: number;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  images,
  initialIndex,
  open,
  onClose,
  groups,
  initialGroupIndex,
}) => {
  const { t } = useLanguage();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [activeGroupIndex, setActiveGroupIndex] = useState(initialGroupIndex ?? 0);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedByGroup, setGeneratedByGroup] = useState<Record<string, string[]>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const thumbnailRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isIos = /iP(ad|hone|od)/i.test(navigator.userAgent);

  const hasGroups = Boolean(groups && groups.length > 0);
  const activeGroup = hasGroups ? groups![Math.min(activeGroupIndex, groups!.length - 1)] : null;

  const activeGeneratedUrls = useMemo(() => {
    if (!activeGroup) return [];
    return generatedByGroup[activeGroup.messageId] || [];
  }, [activeGroup, generatedByGroup]);

  const activeImages = useMemo(() => {
    if (!activeGroup) return images;
    return [activeGroup.sourceUrl, ...activeGeneratedUrls];
  }, [activeGroup, activeGeneratedUrls, images]);

  useEffect(() => {
    if (!open) return;
    setCurrentIndex(initialIndex);
    setActiveGroupIndex(initialGroupIndex ?? 0);
    if (!hasGroups) {
      setSelectedImageUrl(images[initialIndex] || '');
      return;
    }

    const nextGroup = groups![Math.min(initialGroupIndex ?? 0, groups!.length - 1)];
    setCurrentIndex(0);
    setSelectedImageUrl(nextGroup?.sourceUrl || '');
  }, [open, initialIndex, initialGroupIndex, images, groups, hasGroups]);

  useEffect(() => {
    if (!open || !hasGroups || !groups) return;
    const pending = groups.filter((group) => generatedByGroup[group.messageId] === undefined);
    if (pending.length === 0) return;

    let cancelled = false;
    const fetchAll = async () => {
      await Promise.all(pending.map(async (group) => {
        try {
          const result = await imageGenerationService.getResults(group.messageId, 'chat_image');
          const urls = Array.isArray(result.results) ? (result.results as string[]) : [];
          if (!cancelled) {
            setGeneratedByGroup((prev) => ({ ...prev, [group.messageId]: urls }));
          }
        } catch {
          if (!cancelled) {
            setGeneratedByGroup((prev) => ({ ...prev, [group.messageId]: prev[group.messageId] ?? [] }));
          }
        }
      }));
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [open, hasGroups, groups, generatedByGroup]);

  // Scroll selected thumbnail into view
  useEffect(() => {
    const index = hasGroups ? activeGroupIndex : currentIndex;
    thumbnailRefs.current[index]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [currentIndex, activeGroupIndex, hasGroups]);

  useEffect(() => {
    if (!hasGroups) return;
    setSelectedImageUrl(activeImages[currentIndex] || '');
  }, [activeImages, currentIndex, hasGroups]);

  const prev = useCallback(() => {
    setCurrentIndex((i) => (i > 0 ? i - 1 : activeImages.length - 1));
  }, [activeImages.length]);

  const next = useCallback(() => {
    setCurrentIndex((i) => (i < activeImages.length - 1 ? i + 1 : 0));
  }, [activeImages.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, prev, next, onClose]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!open) {
      setIsPseudoFullscreen(false);
      return;
    }

    if (!isPseudoFullscreen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
    };
  }, [open, isPseudoFullscreen]);

  if (!activeImages.length) return null;

  const displayedImage = hasGroups ? (selectedImageUrl || activeImages[currentIndex]) : activeImages[currentIndex];

  const handleSelectGroup = (index: number) => {
    if (!groups) return;
    const nextGroup = groups[index];
    setActiveGroupIndex(index);
    setCurrentIndex(0);
    setSelectedImageUrl(nextGroup.sourceUrl);
  };

  const handleSelectGenerated = (url: string, index: number) => {
    setSelectedImageUrl(url);
    setCurrentIndex(index);
  };

  const handleToggleFullscreen = async () => {
    if (isIos || !containerRef.current || !containerRef.current.requestFullscreen) {
      setIsPseudoFullscreen((prev) => !prev);
      return;
    }

    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  const handleClose = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
    setIsPseudoFullscreen(false);
    onClose();
  };

  const handlePicEdit = async () => {
    if (!activeGroup || !activeGroup.canEdit || !displayedImage) return;
    const trimmed = prompt.trim();
    if (!trimmed) return;

    try {
      setIsGenerating(true);
      const response = await imageGenerationService.generate({
        sourceType: 'chat_image',
        generationType: 'custom',
        messageId: activeGroup.messageId,
        mediaUrl: displayedImage,
        customPrompts: [trimmed],
      });

      await imageGenerationService.pollJobUntilComplete(response.jobId);
      const result = await imageGenerationService.getResults(activeGroup.messageId, 'chat_image');
      const urls = Array.isArray(result.results) ? (result.results as string[]) : [];
      setGeneratedByGroup((prev) => ({ ...prev, [activeGroup.messageId]: urls }));
      if (urls.length > 0) {
        const latest = urls[urls.length - 1];
        setSelectedImageUrl(latest);
        setCurrentIndex(urls.length);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
    >
      <BoxAny
        ref={containerRef}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          width: isPseudoFullscreen ? '100vw' : '90vw',
          maxWidth: isPseudoFullscreen ? 'none' : 1100,
          height: isPseudoFullscreen ? '100vh' : '90vh',
          bgcolor: 'rgba(10, 10, 10, 0.97)',
          borderRadius: isPseudoFullscreen ? 0 : 2,
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
          <IconButton onClick={handleToggleFullscreen} sx={{ color: 'rgba(255,255,255,0.8)' }}>
            {(isFullscreen || isPseudoFullscreen) ? <FullscreenExitIcon /> : <FullscreenIcon />}
          </IconButton>
          <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>
            {currentIndex + 1} / {activeImages.length}
            {hasGroups ? `  -  ${activeGroupIndex + 1} / ${groups!.length}` : ''}
          </Typography>
          <IconButton onClick={handleClose} sx={{ color: 'rgba(255,255,255,0.8)' }}>
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
            src={displayedImage}
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
          {activeImages.length > 1 && (
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
          {activeImages.length > 1 && (
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

        {hasGroups ? (
          <>
            {activeGroup?.canEdit && (
              <BoxAny
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 2,
                  py: 1,
                  bgcolor: 'rgba(0,0,0,0.55)',
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <TextField
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={t('image.editPromptPlaceholder')}
                  size="small"
                  fullWidth
                  disabled={isGenerating}
                  sx={{
                    '& .MuiInputBase-input': { color: 'rgba(255,255,255,0.9)' },
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.25)' },
                    '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'rgba(255,255,255,0.45)',
                    },
                  }}
                />
                <Button
                  variant="contained"
                  onClick={handlePicEdit}
                  disabled={isGenerating || !prompt.trim()}
                  sx={{ minWidth: 120 }}
                >
                  {isGenerating ? <CircularProgress size={18} sx={{ color: 'white' }} /> : t('image.editAction')}
                </Button>
              </BoxAny>
            )}

            {/* Source image list */}
            <BoxAny
              sx={{
                flexShrink: 0,
                height: 86,
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
              {groups!.map((group, i) => {
                const count = generatedByGroup[group.messageId]?.length || 0;
                const isActive = i === activeGroupIndex;
                return (
                  <BoxAny
                    key={group.messageId}
                    ref={(el: HTMLDivElement | null) => { thumbnailRefs.current[i] = el; }}
                    onClick={() => handleSelectGroup(i)}
                    sx={{
                      position: 'relative',
                      flexShrink: 0,
                      width: 64,
                      height: 64,
                      borderRadius: 1,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      border: isActive
                        ? '2px solid rgba(255,255,255,0.9)'
                        : '2px solid transparent',
                      opacity: isActive ? 1 : 0.6,
                      transition: 'opacity 0.15s, border-color 0.15s',
                      '&:hover': { opacity: 1 },
                    }}
                  >
                    <BoxAny
                      component="img"
                      src={group.sourceUrl}
                      alt="Source"
                      sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    {count > 0 && (
                      <BoxAny
                        sx={{
                          position: 'absolute',
                          right: 4,
                          top: 4,
                          bgcolor: 'rgba(0,0,0,0.7)',
                          color: 'white',
                          fontSize: '0.7rem',
                          px: 0.5,
                          borderRadius: 0.5,
                        }}
                      >
                        {count}
                      </BoxAny>
                    )}
                  </BoxAny>
                );
              })}
            </BoxAny>

            {/* Generated image list */}
            <BoxAny
              sx={{
                flexShrink: 0,
                height: 80,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 2,
                overflowX: 'auto',
                bgcolor: 'rgba(0,0,0,0.35)',
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(255,255,255,0.2) transparent',
              }}
            >
              {activeGeneratedUrls.length === 0 ? (
                <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
                  {t('image.noEditsYet')}
                </Typography>
              ) : (
                activeGeneratedUrls.map((url, index) => {
                  const isActive = selectedImageUrl === url;
                  return (
                    <BoxAny
                      key={url}
                      onClick={() => handleSelectGenerated(url, index + 1)}
                      sx={{
                        flexShrink: 0,
                        width: 56,
                        height: 56,
                        borderRadius: 1,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        border: isActive
                          ? '2px solid rgba(255,255,255,0.9)'
                          : '2px solid transparent',
                        opacity: isActive ? 1 : 0.6,
                        transition: 'opacity 0.15s, border-color 0.15s',
                        '&:hover': { opacity: 1 },
                      }}
                    >
                      <BoxAny
                        component="img"
                        src={url}
                        alt="Edit"
                        sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </BoxAny>
                  );
                })
              )}
            </BoxAny>
          </>
        ) : (
          images.length > 1 && (
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
          )
        )}
      </BoxAny>
    </Modal>
  );
};
