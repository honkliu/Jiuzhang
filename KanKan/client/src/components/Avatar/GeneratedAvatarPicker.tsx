import React from 'react';
import {
  Box,
  Popover,
  Typography,
  CircularProgress,
  ButtonBase,
} from '@mui/material';
import { avatarService, type EmotionThumbnailResult } from '@/services/avatar.service';

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
    onClose();
  };

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      PaperProps={{
        sx: {
          p: 2,
          width: 216,
          maxWidth: '90vw',
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
            gridTemplateColumns: 'repeat(3, 56px)',
            gap: 1,
          }}
        >
          {tiles.map((item, idx) => {
            if (!item) {
              return (
                <BoxAny
                  key={`blank_${idx}`}
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: '10px',
                    bgcolor: '#fff',
                    border: '1px solid rgba(15, 23, 42, 0.12)',
                  }}
                />
              );
            }

            const isSelected = selectedId === item.id;

            return (
              <ButtonBase
                key={item.id}
                onClick={() => handleSelect(item)}
                sx={{
                  width: 56,
                  height: 56,
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
            );
          })}
        </BoxAny>
      )}
    </Popover>
  );
};
