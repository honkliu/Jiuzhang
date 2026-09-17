import React from 'react';
import {
  Alert,
  Box,
  Button,
  Popover,
  Typography,
  CircularProgress,
  ButtonBase,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { avatarService, type EmotionThumbnailResult } from '@/services/avatar.service';
import { ImageHoverPreview } from '@/components/Shared/ImageHoverPreview';
import { useLanguage } from '@/i18n/LanguageContext';

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

const useMoodPickerData = (open: boolean, avatarImageId?: string | null) => {
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<EmotionThumbnailResult[]>([]);
  const [error, setError] = React.useState(false);
  const [retryCount, setRetryCount] = React.useState(0);
  const cacheRef = React.useRef<Map<string, EmotionThumbnailResult[]>>(new Map());

  React.useEffect(() => {
    let active = true;
    let requestId = 0;

    const load = async () => {
      if (!open || !avatarImageId) {
        setItems([]);
        setLoading(false);
        setError(false);
        return;
      }

      const currentRequest = ++requestId;
      const cached = cacheRef.current.get(avatarImageId);
      setItems(cached ?? []);

      setLoading(true);
      setError(false);
      try {
        const generated = await avatarService.getEmotionThumbnails(avatarImageId);
        if (!active || currentRequest !== requestId) return;
        const sorted = sortGenerated(generated);
        cacheRef.current.set(avatarImageId, sorted);
        setItems(sorted);
      } catch {
        if (active && currentRequest === requestId) setError(true);
      } finally {
        if (active && currentRequest === requestId) setLoading(false);
      }
    };

    load();

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ sourceAvatarId?: string }>).detail;
      if (!open || !detail?.sourceAvatarId || detail.sourceAvatarId !== avatarImageId) return;
      load();
    };

    window.addEventListener('emotion-thumbnails-updated', handler as EventListener);
    return () => {
      active = false;
      window.removeEventListener('emotion-thumbnails-updated', handler as EventListener);
    };
  }, [open, avatarImageId, retryCount]);

  const retry = () => {
    if (loading) return;
    setLoading(true);
    setRetryCount((count) => count + 1);
  };

  return { loading, items, error, retry };
};

export interface GeneratedAvatarPickerProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  avatarImageId?: string | null;
  currentAvatarUrl?: string | null;
  onSelect: (avatarImageId: string, avatarUrl: string, sourceAvatarImageId?: string | null) => void;
}

export const GeneratedAvatarPicker: React.FC<GeneratedAvatarPickerProps> = ({
  anchorEl,
  open,
  onClose,
  avatarImageId,
  currentAvatarUrl,
  onSelect,
}) => {
  const { language, t } = useLanguage();
  const { loading, items, error, retry } = useMoodPickerData(open, avatarImageId);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isHoverCapable = useMediaQuery('(hover: hover) and (pointer: fine)');
  const tileW = isMobile ? 64 : 56;
  const popoverW = isMobile ? tileW * 3 + 32 + 16 : 216;  // 3 tiles + gap + padding

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
    if (loading) return;
    onSelect(item.id, item.fullUrl, avatarImageId || item.id);
    onClose();
  };

  const previewBehavior = {
    openOnHover: isHoverCapable,
    openOnLongPress: !isHoverCapable,
    openOnTap: false,
    openOnClick: false,
    openOnDoubleClick: false,
    closeOnClickWhenOpen: true,
    closeOnTriggerClickWhenOpen: false,
  } as const;

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={() => { if (!loading) onClose(); }}
      disableScrollLock
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      PaperProps={{
        sx: {
          backgroundColor: 'background.paper',
          backgroundImage: 'none',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
          backdropFilter: 'none',
          opacity: 1,
          px: 1.25,
          py: 1,
          width: popoverW,
          maxWidth: '90vw',
          display: 'flex',
          cursor: 'pointer',
          flexDirection: 'column',
          alignItems: 'center',
        },
      }}
    >
      <Typography
        variant="body2"
        fontWeight={700}
        sx={{
          mb: 0.5,
          lineHeight: 1.2,
          letterSpacing: language === 'zh' ? 0 : '0.02em',
          alignSelf: 'center',
          textAlign: 'center',
          color: 'text.secondary',
        }}
      >
        {language === 'zh' ? '小心情' : 'A Little Moody'}
      </Typography>

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 1, width: '100%', boxSizing: 'border-box', flexWrap: 'wrap' }}
          action={<Button color="inherit" disabled={loading} onClick={retry}>{t('common.retry')}</Button>}
        >
          {t('avatar.moods.loadFailed')}
        </Alert>
      )}
      {loading ? (
        <BoxAny sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={20} />
        </BoxAny>
      ) : error && items.length === 0 ? null : items.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          {t('avatar.moods.empty')}
        </Typography>
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
                    borderRadius: '4px',
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    boxSizing: 'border-box',
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
                maxSize={400}
                {...previewBehavior}
              >
                {(previewProps) => (
                  <ButtonBase
                    {...previewProps}
                    onClick={() => {
                      handleSelect(item);
                    }}
                    sx={{
                      width: tileW,
                      height: tileW,
                      borderRadius: '4px',
                      overflow: 'hidden',
                      boxSizing: 'border-box',
                      p: '2px',
                      border: '1px solid',
                      borderColor: isSelected ? 'primary.main' : 'divider',
                      bgcolor: 'background.paper',
                      outline: isSelected ? '2px solid' : 'none',
                      outlineColor: 'primary.main',
                      outlineOffset: '-2px',
                      transition: 'border-color 120ms ease, background-color 120ms ease',
                      '&:hover': {
                        borderColor: 'primary.main',
                        bgcolor: 'action.hover',
                      },
                      '&:focus-visible': {
                        boxShadow: '0 0 0 2px rgba(7, 193, 96, 0.24)',
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
                        borderRadius: '2px',
                        WebkitTouchCallout: 'none',
                        WebkitUserSelect: 'none',
                        userSelect: 'none',
                        WebkitUserDrag: 'none',
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
