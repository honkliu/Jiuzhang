import React from 'react';
import {
  IconButton, Box,
  Button, Checkbox,
} from '@mui/material';
import { Delete, AutoAwesome as ExtractIcon } from '@mui/icons-material';
import { photoService, type PhotoDto } from '@/services/photo.service';

interface PhotoCardProps {
  photo: PhotoDto;
  onClick: () => void;
  onDelete?: () => void;
  onExtract?: (photo: PhotoDto) => void;
  onOpenReceipt?: (photo: PhotoDto) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

const PhotoCard: React.FC<PhotoCardProps> = ({ photo, onClick, onDelete, onExtract, onOpenReceipt, isSelected = false, onToggleSelect }) => {
  const imageUrl = photoService.getImageUrl(photo);
  const photoLabel = photoService.getDisplayLabel(photo);
  const hasReceipt = photo.associatedReceiptIds.length > 0;

  return (
    <>
      <Box
        sx={{
          position: 'relative',
          cursor: 'pointer',
          borderRadius: '8px',
          overflow: 'hidden',
          border: isSelected ? '2px solid #2196f3' : '2px solid transparent',
          transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
          '&:hover': { transform: 'translateY(-1px)', boxShadow: 4 },
        }}
        onClick={onClick}
      >
        {onToggleSelect && (
          <Box sx={{
            position: 'absolute', top: 8, left: 8, zIndex: 2,
            bgcolor: 'rgba(255,255,255,0.85)', borderRadius: 1, p: 0.2,
          }}>
            <Checkbox size="small" checked={isSelected}
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); onToggleSelect(photo.id); }}
              sx={{ '&.Mui-checked': { color: '#2196f3' } }} />
          </Box>
        )}
        <Box
          component="img"
          src={imageUrl}
          alt={photoLabel}
          loading="lazy"
          decoding="async"
          sx={{
            display: 'block',
            width: '100%',
            height: 118,
            objectFit: 'cover',
            bgcolor: 'rgba(15,23,42,0.06)',
          }}
        />
        <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 2, display: 'flex', gap: 0.5 }}>
          <IconButton
            size="small"
            sx={{
              width: 20,
              height: 20,
              p: 0.15,
              bgcolor: 'rgba(255,255,255,0.92)',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
          >
            <Delete sx={{ fontSize: 13 }} />
          </IconButton>
        </Box>
        <Box sx={{ position: 'absolute', left: 8, right: 8, bottom: 8, zIndex: 2, display: 'flex', gap: 0.75 }}>
          <Button
            size="small"
            variant="contained"
            startIcon={<ExtractIcon sx={{ fontSize: 15 }} />}
            onClick={(e) => {
              e.stopPropagation();
              onExtract?.(photo);
            }}
            sx={{
              height: 20,
              minHeight: 20,
              maxHeight: 20,
              minWidth: 0,
              px: '6px',
              py: '2px',
              borderRadius: '999px',
              textTransform: 'none',
              boxShadow: 'none',
              fontSize: '0.72rem',
              lineHeight: 1,
              '& .MuiButton-startIcon': { mr: 0.25 },
            }}
          >
            提取
          </Button>
          {hasReceipt && (
            <Button
              size="small"
              variant="outlined"
              onClick={(e) => {
                e.stopPropagation();
                onOpenReceipt?.(photo);
              }}
              sx={{
                height: 20,
                minHeight: 20,
                maxHeight: 20,
                minWidth: 0,
                px: '6px',
                py: '2px',
                borderRadius: '999px',
                textTransform: 'none',
                fontSize: '0.72rem',
                lineHeight: 1,
                bgcolor: 'rgba(255,255,255,0.92)',
                borderColor: 'rgba(25,118,210,0.35)',
              }}
            >
              票据
            </Button>
          )}
        </Box>
      </Box>
    </>
  );
};

export default PhotoCard;
