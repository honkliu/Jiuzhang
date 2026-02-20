import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import { useLanguage } from '@/i18n/LanguageContext';
import { avatarService, type SelectableAvatar } from '@/services/avatar.service';

// Work around TS2590 (“union type too complex”) from MUI Box typings in some TS versions.
const BoxAny = Box as any;

interface AvatarOptionTileProps {
  avatar: SelectableAvatar;
  value?: string;
  disabled?: boolean;
  onSelect: (avatarImageId: string, imageUrl: string) => void;
}

const AvatarOptionTile: React.FC<AvatarOptionTileProps> = ({
  avatar,
  value,
  disabled,
  onSelect,
}) => {
  const selected = value === avatar.avatarImageId;
  const [imgError, setImgError] = React.useState(false);

  return (
    <BoxAny
      role="button"
      aria-label={avatar.fileName}
      tabIndex={disabled ? -1 : 0}
      onClick={() => {
        if (disabled) return;
        onSelect(avatar.avatarImageId, avatar.imageUrl);
      }}
      onKeyDown={(e: any) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(avatar.avatarImageId, avatar.imageUrl);
        }
      }}
      sx={{
        width: 56,
        height: 56,
        // IMPORTANT: use explicit px radius (not MUI numeric scaling)
        // so the tile never becomes a circle under a custom theme.
        borderRadius: '10px',
        overflow: 'hidden',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        border: selected
          ? '2px solid rgba(25, 118, 210, 0.95)'
          : '1px solid rgba(15, 23, 42, 0.12)',
        backgroundColor: 'rgba(2, 6, 23, 0.02)',
        boxShadow: selected ? '0 10px 24px rgba(25, 118, 210, 0.20)' : 'none',
        transition: 'transform 120ms ease, box-shadow 120ms ease',
        '&:hover': disabled
          ? undefined
          : {
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
        src={imgError ? avatar.imageUrl : (avatar.thumbnailDataUrl || avatar.imageUrl)}
        alt={avatar.fileName}
        loading="eager"
        decoding="sync"
        onError={() => setImgError(true)}
        sx={{
          width: '100%',
          height: '100%',
          display: 'block',
          // Fill the square consistently so no option appears tall/narrow.
          // Crops if the source image isn't square.
          objectFit: 'cover',
          borderRadius: 'inherit',
        }}
      />
    </BoxAny>
  );
};

export interface ZodiacAvatarPickerProps {
  disabled?: boolean;
  value?: string;
  onChange: (avatarImageId: string, imageUrl: string) => void;
}

export const ZodiacAvatarPicker: React.FC<ZodiacAvatarPickerProps> = ({
  disabled,
  value,
  onChange,
}) => {
  const { t } = useLanguage();
  const [avatars, setAvatars] = useState<SelectableAvatar[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 12;
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    let active = true;

    const loadAvatars = async () => {
      try {
        setLoading(true);
        const response = await avatarService.getSelectableAvatars(page, pageSize);
        if (!active) return;

        // Debug: Check if thumbnailDataUrl exists
        console.log('Avatar response:', {
          count: response.items.length,
          hasThumbnails: response.items.filter(a => a.thumbnailDataUrl).length,
          firstAvatar: response.items[0] ? {
            fileName: response.items[0].fileName,
            hasThumbnail: !!response.items[0].thumbnailDataUrl,
            thumbnailLength: response.items[0].thumbnailDataUrl?.length
          } : null
        });

        setAvatars(response.items);
        setTotalCount(response.totalCount);
        setLoading(false);
      } catch {
        if (!active) return;
        setAvatars([]);
        setTotalCount(0);
        setLoading(false);
      }
    };

    loadAvatars();
    return () => {
      active = false;
    };
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const pagedAvatars = useMemo(() => avatars, [avatars]);

  return (
    <BoxAny>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {t('profile.zodiacTitle')}
      </Typography>

      {loading ? (
        <BoxAny sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={20} />
        </BoxAny>
      ) : null}

      <BoxAny
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 56px)',
          gap: 1,
          alignItems: 'center',
          justifyContent: 'flex-start',
        }}
      >
        {pagedAvatars.map((avatar) => (
          <AvatarOptionTile
            key={avatar.avatarImageId}
            avatar={avatar}
            value={value}
            disabled={disabled}
            onSelect={onChange}
          />
        ))}
      </BoxAny>

      {totalPages > 1 ? (
        <BoxAny sx={{ display: 'flex', gap: 1, mt: 1 }}>
          <Button
            size="small"
            variant="outlined"
            disabled={disabled || page <= 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            Prev
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={disabled || page >= totalPages - 1}
            onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
          >
            Next
          </Button>
        </BoxAny>
      ) : null}
    </BoxAny>
  );
};
