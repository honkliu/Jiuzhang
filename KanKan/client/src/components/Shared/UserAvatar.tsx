import React, { useEffect, useMemo, useState } from 'react';
import { Avatar, AvatarProps, Box } from '@mui/material';
import { ImageHoverPreview } from './ImageHoverPreview';

export interface UserAvatarProps extends Omit<AvatarProps, 'children'> {
  src?: string;
  gender?: string;
  fallbackText?: string;
  closePreviewOnClick?: boolean;
  previewMode?: 'hover' | 'doubleClick' | 'tap';
}

const normalizeGender = (value?: string): 'male' | 'female' | 'unknown' => {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized === 'male') return 'male';
  if (normalized === 'female') return 'female';
  return 'unknown';
};

const BoxAny = Box as any;

const CartoonMaleIcon: React.FC = () => (
  <svg viewBox="0 0 64 64" width="22" height="22" aria-hidden focusable="false">
    <circle cx="32" cy="32" r="30" fill="#E3F2FD" />
    <circle cx="32" cy="29" r="14" fill="#FFD7B5" />
    <path
      d="M18 28c1-10 8-16 14-16 8 0 14 6 14 16 0 0-4-6-14-6s-14 6-14 6z"
      fill="#263238"
    />
    <circle cx="27" cy="29" r="2" fill="#263238" />
    <circle cx="37" cy="29" r="2" fill="#263238" />
    <path d="M28 36c3 3 5 3 8 0" stroke="#8D4B3E" strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d="M18 54c3-10 10-14 14-14s11 4 14 14" fill="#42A5F5" opacity="0.95" />
    <path d="M29 40l3 4 3-4" fill="#1976D2" />
  </svg>
);

const CartoonFemaleIcon: React.FC = () => (
  <svg viewBox="0 0 64 64" width="22" height="22" aria-hidden focusable="false">
    <circle cx="32" cy="32" r="30" fill="#FCE4EC" />
    <circle cx="32" cy="29" r="14" fill="#FFD7B5" />
    <path
      d="M18 30c0-12 8-20 14-20s14 8 14 20c0 0-3-10-14-10S18 30 18 30z"
      fill="#4E342E"
    />
    <path
      d="M18 31c2 9 6 18 14 18s12-9 14-18c-2 4-6 6-14 6s-12-2-14-6z"
      fill="#4E342E"
      opacity="0.25"
    />
    <circle cx="27" cy="29" r="2" fill="#263238" />
    <circle cx="37" cy="29" r="2" fill="#263238" />
    <path d="M28 36c3 3 5 3 8 0" stroke="#8D4B3E" strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d="M18 54c3-10 10-14 14-14s11 4 14 14" fill="#EC407A" opacity="0.92" />
    <path d="M24 22l4-4 4 4 4-4 4 4" stroke="#D81B60" strokeWidth="2" fill="none" strokeLinecap="round" />
  </svg>
);

const getDefaultAvatarCandidates = (gender: 'male' | 'female' | 'unknown'): string[] => {
  if (gender === 'male') return ['/zodiac/m1.png', '/zodiac/m1.jpg'];
  if (gender === 'female') return ['/zodiac/f1.png', '/zodiac/f1.jpg'];
  return [];
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  src,
  gender,
  fallbackText,
  closePreviewOnClick,
  previewMode = 'hover',
  sx,
  ...props
}) => {
  const normalized = normalizeGender(gender);

  const candidates = useMemo(() => {
    if (src) return [src];
    return getDefaultAvatarCandidates(normalized);
  }, [src, normalized]);

  const [candidateIndex, setCandidateIndex] = useState(0);
  useEffect(() => {
    setCandidateIndex(0);
  }, [src, normalized]);

  const effectiveSrc = candidates[candidateIndex];
  const hasSrc = Boolean(effectiveSrc);

  const child = normalized === 'male'
    ? <CartoonMaleIcon />
    : normalized === 'female'
      ? <CartoonFemaleIcon />
      : (fallbackText ? fallbackText[0]?.toUpperCase() : <BoxAny component="span" sx={{ fontWeight: 700 }}>?</BoxAny>);

  const derivedSx = {
    bgcolor: !hasSrc && normalized === 'male' ? 'rgba(66, 165, 245, 0.20)'
      : !hasSrc && normalized === 'female' ? 'rgba(236, 64, 122, 0.18)'
      : undefined,
    color: !hasSrc ? 'text.primary' : undefined,
    border: !hasSrc ? '1px solid rgba(15, 23, 42, 0.10)' : undefined,
    ...sx,
  };

  return (
    <ImageHoverPreview
      src={effectiveSrc}
      alt={fallbackText || 'Avatar'}
      closeOnTriggerClickWhenOpen={Boolean(closePreviewOnClick)}
      openOnHover={previewMode === 'hover'}
      openOnLongPress={previewMode === 'hover'}
      openOnDoubleClick={previewMode === 'doubleClick'}
      openOnTap={previewMode === 'tap'}
    >
      {(previewProps) => (
        <BoxAny
          {...previewProps}
          sx={{ display: 'inline-flex' }}
        >
          <Avatar
            src={effectiveSrc || undefined}
            sx={{
              ...derivedSx,
              '& img': {
                WebkitTouchCallout: 'none',
                WebkitUserSelect: 'none',
                userSelect: 'none',
              },
            }}
            imgProps={{
              onError: () => {
                if (candidateIndex < candidates.length - 1) {
                  setCandidateIndex((i) => Math.min(i + 1, candidates.length - 1));
                }
              },
              draggable: false,
              onDragStart: (event) => event.preventDefault(),
              onContextMenu: (event) => event.preventDefault(),
            }}
            {...props}
          >
            {child}
          </Avatar>
        </BoxAny>
      )}
    </ImageHoverPreview>
  );
};
