import React from 'react';
import { Paper, MenuItem, ClickAwayListener } from '@mui/material';

interface Props {
  x: number;
  y: number;
  onClose: () => void;
  onView: () => void;
  onHighlightAncestors: () => void;
}

export const FamilyNodeContextMenu: React.FC<Props> = ({ x, y, onClose, onView, onHighlightAncestors }) => {
  return (
    <ClickAwayListener onClickAway={onClose}>
      <Paper
        elevation={6}
        sx={{
          position: 'fixed',
          left: x,
          top: y,
          zIndex: 2000,
          minWidth: 180,
          py: 0.5,
          background: '#395162',
          color: '#fff',
          borderRadius: 1.5,
        }}
      >
        <MenuItem
          onClick={() => { onView(); onClose(); }}
          sx={{ color: '#fff', fontSize: 13, py: 0.75, '&:hover': { bgcolor: 'rgba(42,173,90,0.35)' } }}
        >
          👁 查看详情
        </MenuItem>
        <MenuItem
          onClick={() => { onHighlightAncestors(); onClose(); }}
          sx={{ color: '#fff', fontSize: 13, py: 0.75, '&:hover': { bgcolor: 'rgba(42,173,90,0.35)' } }}
        >
          🔍 查看祖先路径
        </MenuItem>
      </Paper>
    </ClickAwayListener>
  );
};
