import React from 'react';
import {
  Box,
  Popover,
  Typography,
  CircularProgress,
  ButtonBase,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { avatarService, type EmotionThumbnailResult } from '@/services/avatar.service';
import { ImageHoverPreview } from '@/components/Shared/ImageHoverPreview';

// Work around TS2590 ("union type too complex") from MUI Box typings in some TS versions.
const BoxAny = Box as any;

const EMOTION_ORDER = ['angry', 'smile', 'sad', 'happy', 'crying', 'thinking', 'surprised', 'neutral', 'excited'];

type GeneratedAvatarItem = {
  id: string;
  fullUrl: string;
  thumbnailUrl: string;
  isRaw: boolean;
};

const buildAvatarUrl = (avatarImageId: string, size?: 'thumbnail') => {
  const base = `/api/avatar/image/${avatarImageId}`;
  return size ? `${base}?size=thumbnail` : base;
};

const buildThumbnailUrl = (imageUrl: string) => {
  if (!imageUrl) return imageUrl;
  return imageUrl.includes('?') ? `${imageUrl}&size=thumbnail` : `${imageUrl}?size=thumbnail`;
};

const extractAvatarImageId = (url?: string | null): string | null => {
  if (!url) return null;
  try {
    const parsed = new URL(url, window.location.origin);
    const match = parsed.pathname.match(/\/api\/avatar\/image\/([^/]+)/i);
    return match?.[1] ?? null;
  } catch {
    const match = url.match(/\/api\/avatar\/image\/([^/?#]+)/i);
    return match?.[1] ?? null;
  }
};

const sortGenerated = (items: EmotionThumbnailResult[]) => {
  return [...items].sort((a, b) => {
    const aKey = (a.emotion || '').toLowerCase();
    const bKey = (b.emotion || '').toLowerCase();
    const aIdx = EMOTION_ORDER.indexOf(aKey);
    const bIdx = EMOTION_ORDER.indexOf(bKey);
    if (aIdx === -1 && bIdx === -1) return 0;
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });
};

export interface GeneratedAvatarPickerProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  avatarImageId?: string | null;
  currentAvatarUrl?: string | null;
  onSelect: (avatarImageId: string, avatarUrl: string) => void;
}

export const GeneratedAvatarPicker: React.FC<GeneratedAvatarPickerProps> = ({
  anchorEl,
  open,
  onClose,
  avatarImageId,
  currentAvatarUrl,
  onSelect,
}) => {
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<EmotionThumbnailResult[]>([]);
  const cacheRef = React.useRef<Map<string, EmotionThumbnailResult[]>>(new Map());
  const [activePreviewId, setActivePreviewId] = React.useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
  const previewCloseTimerRef = React.useRef<number | null>(null);
  const clickTimerRef = React.useRef<number | null>(null);
  const suppressClickRef = React.useRef(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const tileW = isMobile ? 64 : 56;
  const popoverW = isMobile ? tileW * 3 + 32 + 16 : 216;  // 3 tiles + gap + padding

  React.useEffect(() => {
    let active = true;

    const load = async () => {
      if (!open || !avatarImageId) {
        if (active) setItems([]);
        return;
      }

      const cached = cacheRef.current.get(avatarImageId);
      if (cached) {
        setItems(cached);
      }

      setLoading(!cached);
      try {
        const generated = await avatarService.getEmotionThumbnails(avatarImageId);
        if (!active) return;
        const sorted = sortGenerated(generated);
        cacheRef.current.set(avatarImageId, sorted);
        setItems(sorted);
      } catch {
        if (active) setItems([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [open, avatarImageId]);

  const selectedId = extractAvatarImageId(currentAvatarUrl);
  const rawItem: GeneratedAvatarItem | null = avatarImageId
    ? {
        id: avatarImageId,
        fullUrl: buildAvatarUrl(avatarImageId),
        thumbnailUrl: buildAvatarUrl(avatarImageId, 'thumbnail'),
        isRaw: true,
      }
    : null;

  const generatedItems: GeneratedAvatarItem[] = items.map((item) => ({
    id: item.avatarImageId,
    fullUrl: item.imageUrl,
    thumbnailUrl: item.thumbnailDataUrl || buildThumbnailUrl(item.imageUrl),
    isRaw: false,
  }));

  const isMoodSelected = Boolean(selectedId && avatarImageId && selectedId !== avatarImageId);

  const sortedGenerated = (() => {
    if (!selectedId) return generatedItems;
    const selected = generatedItems.find((g) => g.id === selectedId);
    if (!selected) return generatedItems;
    return [selected, ...generatedItems.filter((g) => g.id !== selectedId)];
  })();

  const visibleGenerated = isMoodSelected
    ? sortedGenerated.slice(0, 8)
    : sortedGenerated.slice(0, 9);

  const tiles: Array<GeneratedAvatarItem | null> = isMoodSelected && rawItem
    ? [rawItem, ...visibleGenerated]
    : [...visibleGenerated];

  while (tiles.length < 9) tiles.push(null);

  const handleSelect = (item: GeneratedAvatarItem) => {
    onSelect(item.id, item.fullUrl);
    setActivePreviewId(null);
    setIsPreviewOpen(false);
    onClose();
  };

  const handlePopoverClose = (
    _event: unknown,
    reason?: 'backdropClick' | 'escapeKeyDown'
  ) => {
    if (reason === 'backdropClick') {
      if (isPreviewOpen || activePreviewId) {
        setActivePreviewId(null);
        setIsPreviewOpen(false);
        return;
      }

      onClose();
      return;
    }

    if (reason === 'escapeKeyDown') {
      setActivePreviewId(null);
      setIsPreviewOpen(false);
      onClose();
      return;
    }

    if (isPreviewOpen) {
      setActivePreviewId(null);
      setIsPreviewOpen(false);
      return;
    }

    onClose();
  };

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={handlePopoverClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      PaperProps={{
        sx: {
          p: 2,
          width: popoverW,
          maxWidth: '90vw',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        },
      }}
    >
      <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
        A Little Moody
      </Typography>

      {loading ? (
        <BoxAny sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={20} />
        </BoxAny>
      ) : (
        <BoxAny
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(3, ${tileW}px)`,
            gap: 1,
            width: 'fit-content',
            mx: 'auto',
          }}
        >
          {tiles.map((item, idx) => {
            if (!item) {
              return (
                <BoxAny
                  key={`blank_${idx}`}
                  sx={{
                    width: tileW,
                    height: tileW,
                    borderRadius: '10px',
                    bgcolor: '#fff',
                    border: '1px solid rgba(15, 23, 42, 0.12)',
                  }}
                />
              );
            }

            const isSelected = selectedId === item.id;

            return (
              <ImageHoverPreview
                key={item.id}
                src={item.fullUrl}
                alt={item.isRaw ? 'Raw avatar preview' : 'Generated avatar preview'}
                disabled={Boolean(activePreviewId && activePreviewId !== item.id)}
                openOnDoubleClick={false}
                openOnLongPress
                closeOnClickWhenOpen
                closeOnTriggerClickWhenOpen
                onOpenChange={(open) => {
                  if (open) {
                    setActivePreviewId(item.id);
                    setIsPreviewOpen(true);
                  } else {
                    setIsPreviewOpen(false);
                    if (previewCloseTimerRef.current) {
                      window.clearTimeout(previewCloseTimerRef.current);
                    }
                    previewCloseTimerRef.current = window.setTimeout(() => {
                      setActivePreviewId((prev) => (prev === item.id ? null : prev));
                      previewCloseTimerRef.current = null;
                    }, 150);
                  }
                }}
              >
                {(previewProps) => (
                  <ButtonBase
                    {...previewProps}
                    onClick={(event) => {
                      previewProps.onClick?.(event);
                      if (event.defaultPrevented) return;
                      if (suppressClickRef.current) {
                        suppressClickRef.current = false;
                        return;
                      }
                      if (clickTimerRef.current) {
                        window.clearTimeout(clickTimerRef.current);
                      }
                      clickTimerRef.current = window.setTimeout(() => {
                        handleSelect(item);
                        clickTimerRef.current = null;
                      }, 300);
                    }}
                    onDoubleClick={(event) => {
                      if (clickTimerRef.current) {
                        window.clearTimeout(clickTimerRef.current);
                        clickTimerRef.current = null;
                      }
                      suppressClickRef.current = true;
                      event.preventDefault();
                      event.stopPropagation();
                      previewProps.onDoubleClick?.(event);
                    }}
                    sx={{
                      width: tileW,
                      height: tileW,
                      borderRadius: '10px',
                      overflow: 'hidden',
                      border: isSelected
                        ? '2px solid rgba(25, 118, 210, 0.95)'
                        : '1px solid rgba(15, 23, 42, 0.12)',
                      boxShadow: isSelected ? '0 10px 24px rgba(25, 118, 210, 0.20)' : 'none',
                      transition: 'transform 120ms ease, box-shadow 120ms ease',
                      '&:hover': {
                        transform: 'translateY(-1px)',
                        boxShadow: '0 10px 24px rgba(2, 6, 23, 0.10)',
                      },
                      '&:focus-visible': {
                        boxShadow: '0 0 0 3px rgba(25, 118, 210, 0.25)',
                        outline: 'none',
                      },
                    }}
                  >
                    <BoxAny
                      component="img"
                      src={item.thumbnailUrl || item.fullUrl}
                      alt={item.isRaw ? 'Raw avatar' : 'Generated avatar'}
                      loading="eager"
                      decoding="sync"
                      sx={{
                        width: '100%',
                        height: '100%',
                        display: 'block',
                        objectFit: 'cover',
                      }}
                    />
                  </ButtonBase>
                )}
              </ImageHoverPreview>
            );
          })}
        </BoxAny>
      )}
    </Popover>
  );
};
