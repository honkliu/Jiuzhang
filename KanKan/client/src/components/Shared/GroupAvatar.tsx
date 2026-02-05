import React from 'react';
import { Box, SxProps, Theme } from '@mui/material';
import { UserAvatar } from './UserAvatar';

export interface GroupAvatarMember {
  avatarUrl?: string;
  gender?: string;
  displayName?: string;
}

export interface GroupAvatarProps {
  members: GroupAvatarMember[];
  size?: number;
  sx?: SxProps<Theme>;
}

const getGrid = (count: number): { cols: number; rows: number } => {
  if (count <= 2) return { cols: 2, rows: 1 };
  if (count <= 4) return { cols: 2, rows: 2 };
  return { cols: 3, rows: 3 };
};

export const GroupAvatar: React.FC<GroupAvatarProps> = ({ members, size = 48, sx }) => {
  const items = (members || []).filter(Boolean).slice(0, 9);
  const count = items.length;

  if (count <= 1) {
    const m = items[0];
    return (
      <UserAvatar
        src={m?.avatarUrl}
        gender={m?.gender}
        fallbackText={m?.displayName}
        variant="rounded"
        sx={{ width: size, height: size, ...(sx as any) }}
      />
    );
  }

  const { cols, rows } = getGrid(count);
  const cellCount = cols * rows;

  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '10px',
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        bgcolor: 'rgba(2, 6, 23, 0.02)',
        border: '1px solid rgba(15, 23, 42, 0.10)',
        boxSizing: 'border-box',
        ...(sx as any),
      }}
    >
      {Array.from({ length: cellCount }).map((_, idx) => {
        const m = items[idx];
        if (!m) {
          return <Box key={`blank_${idx}`} sx={{ bgcolor: 'transparent' }} />;
        }

        return (
          <UserAvatar
            key={`${m.displayName || 'member'}_${idx}`}
            src={m.avatarUrl}
            gender={m.gender}
            fallbackText={m.displayName}
            variant="square"
            sx={{
              width: '100%',
              height: '100%',
              borderRadius: 0,
              border: 'none',
              bgcolor: 'transparent',
              overflow: 'hidden',
              '& .MuiAvatar-img': { borderRadius: 0 },
            }}
          />
        );
      })}
    </Box>
  );
};
