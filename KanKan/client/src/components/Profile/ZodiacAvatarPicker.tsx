import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Button, useMediaQuery, useTheme } from '@mui/material';
import { useLanguage } from '@/i18n/LanguageContext';
import { avatarService, type SelectableAvatar } from '@/services/avatar.service';
import { ImageHoverPreview } from '@/components/Shared/ImageHoverPreview';

// Work around TS2590 (“union type too complex”) from MUI Box typings in some TS versions.
const BoxAny = Box as any;

interface AvatarOptionTileProps {
  avatar: SelectableAvatar;
  value?: string;
  disabled?: boolean;
  size?: number;
  onSelect: (avatarImageId: string, imageUrl: string) => void;
}

const AvatarOptionTile: React.FC<AvatarOptionTileProps> = ({
  avatar,
  value,
  disabled,
  size = 56,
  onSelect,
}) => {
  const selected = value === avatar.avatarImageId;
  const [imgError, setImgError] = React.useState(false);

  return (
    <ImageHoverPreview src={avatar.fullImageUrl || avatar.imageUrl} alt={avatar.fileName} maxSize={400}>
      {(previewProps) => (
        <BoxAny
          {...previewProps}
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
            width: size,
            height: size,
            borderRadius: '4px',
            overflow: 'hidden',
            boxSizing: 'border-box',
            p: '2px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
            border: '1px solid',
            borderColor: selected ? 'primary.main' : 'divider',
            backgroundColor: 'background.paper',
            outline: selected ? '2px solid' : 'none',
            outlineColor: 'primary.main',
            outlineOffset: '-2px',
            transition: 'border-color 120ms ease, background-color 120ms ease',
            '&:hover': disabled
              ? undefined
              : {
                  borderColor: 'primary.main',
                  backgroundColor: 'action.hover',
                },
            '&:focus-visible': {
              boxShadow: '0 0 0 2px rgba(7, 193, 96, 0.24)',
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
              objectFit: 'cover',
              borderRadius: '2px',
              WebkitTouchCallout: 'none',
              WebkitUserSelect: 'none',
              userSelect: 'none',
              WebkitUserDrag: 'none',
            }}
          />
        </BoxAny>
      )}
    </ImageHoverPreview>
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const tileSize = isMobile ? 52 : 56;
  const gridWidth = tileSize * 4 + 24;
  const gridHeight = tileSize * 3 + 16;
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
    <BoxAny sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: { xs: 'center', sm: 'flex-end' } }}>
      <BoxAny
        sx={{
          width: 'fit-content',
          maxWidth: '100%',
          minHeight: `${gridHeight}px`,
        }}
      >
        <BoxAny
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(4, ${tileSize}px)`,
            gap: 0.5,
            alignItems: 'start',
            justifyContent: 'flex-start',
          }}
        >
          {pagedAvatars.map((avatar) => (
            <AvatarOptionTile
              key={avatar.avatarImageId}
              avatar={avatar}
              value={value}
              disabled={disabled || loading}
              size={tileSize}
              onSelect={onChange}
            />
          ))}
        </BoxAny>
      </BoxAny>

      <BoxAny sx={{ display: 'flex', gap: 1, mt: 1, minHeight: 32, alignItems: 'center', justifyContent: 'flex-end' }}>
        {totalPages > 1 ? (
          <>
            <Button
              size="small"
              variant="outlined"
              disabled={disabled || loading || page <= 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              sx={{ height: 32, minHeight: 32, px: 1.5, whiteSpace: 'nowrap' }}
            >
              {t('common.prev')}
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled={disabled || loading || page >= totalPages - 1}
              onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
              sx={{ height: 32, minHeight: 32, px: 1.5, whiteSpace: 'nowrap' }}
            >
              {t('common.next')}
            </Button>
          </>
        ) : null}
      </BoxAny>
    </BoxAny>
  );
};
