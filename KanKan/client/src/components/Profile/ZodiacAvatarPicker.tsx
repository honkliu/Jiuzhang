import React from 'react';
import { Box, Typography } from '@mui/material';
import { useLanguage } from '@/i18n/LanguageContext';

// Work around TS2590 (“union type too complex”) from MUI Box typings in some TS versions.
const BoxAny = Box as any;

export type ZodiacAvatarId =
  | 'm1'
  | 'm2'
  | 'm3'
  | 'm4'
  | 'm5'
  | 'm6'
  | 'f1'
  | 'f2'
  | 'f3'
  | 'f4'
  | 'f5'
  | 'f6';

const zodiacOptions: Array<{ id: ZodiacAvatarId; baseName: string }> = [
  { id: 'm1', baseName: 'm1' },
  { id: 'm2', baseName: 'm2' },
  { id: 'm3', baseName: 'm3' },
  { id: 'm4', baseName: 'm4' },
  { id: 'm5', baseName: 'm5' },
  { id: 'm6', baseName: 'm6' },
  { id: 'f1', baseName: 'f1' },
  { id: 'f2', baseName: 'f2' },
  { id: 'f3', baseName: 'f3' },
  { id: 'f4', baseName: 'f4' },
  { id: 'f5', baseName: 'f5' },
  { id: 'f6', baseName: 'f6' },
];

const buildCandidates = (baseName: string) => {
  const png = `/zodiac/${baseName}.png`;
  const jpg = `/zodiac/${baseName}.jpg`;
  return { primary: png, fallback: jpg };
};

interface AvatarOptionTileProps {
  id: ZodiacAvatarId;
  primary: string;
  fallback: string;
  value?: string;
  disabled?: boolean;
  onSelect: (resolvedUrl: string, id: ZodiacAvatarId) => void;
}

const AvatarOptionTile: React.FC<AvatarOptionTileProps> = ({
  id,
  primary,
  fallback,
  value,
  disabled,
  onSelect,
}) => {
  const selected = value === primary || value === fallback;

  const [currentSrc, setCurrentSrc] = React.useState<string>(value === fallback ? fallback : primary);

  React.useEffect(() => {
    setCurrentSrc(value === fallback ? fallback : primary);
  }, [value, primary, fallback]);

  return (
    <BoxAny
      role="button"
      aria-label={id}
      tabIndex={disabled ? -1 : 0}
      onClick={() => {
        if (disabled) return;
        onSelect(currentSrc, id);
      }}
      onKeyDown={(e: any) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(currentSrc, id);
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
        src={currentSrc}
        alt={id}
        onError={() => {
          if (currentSrc !== fallback) setCurrentSrc(fallback);
        }}
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
  onChange: (avatarUrl: string, id: ZodiacAvatarId) => void;
}

export const ZodiacAvatarPicker: React.FC<ZodiacAvatarPickerProps> = ({
  disabled,
  value,
  onChange,
}) => {
  const { t } = useLanguage();
  // We serve zodiac images from the API's static files folder: /zodiac/*.png
  // This keeps URLs stable (unlike Vite hashed asset paths).
  return (
    <BoxAny>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {t('profile.zodiacTitle')}
      </Typography>

      <BoxAny
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 56px)',
          gap: 1,
          alignItems: 'center',
          justifyContent: 'flex-start',
        }}
      >
        {zodiacOptions.map((opt) => {
          const { primary, fallback } = buildCandidates(opt.baseName);
          return (
            <AvatarOptionTile
              key={opt.id}
              id={opt.id}
              primary={primary}
              fallback={fallback}
              value={value}
              disabled={disabled}
              onSelect={onChange}
            />
          );
        })}
      </BoxAny>
    </BoxAny>
  );
};
