import React from 'react';
import {
  Box, Typography, Paper, Chip,
} from '@mui/material';
import { type PhotoDto } from '@/services/photo.service';
import PhotoCard from './PhotoCard';

export interface ReceiptDateGroupReceipt {
  id: string;
  type: string;
  category?: string;
  merchantName?: string;
  hospitalName?: string;
  totalAmount?: number;
  currency?: string;
  receiptDate?: string;
  photos: PhotoDto[];
}

export interface ReceiptDateGroup {
  id: string;
  label: string;
  summary: string;
  photos: PhotoDto[];
  receipts: ReceiptDateGroupReceipt[];
}

interface PhotoReceiptGroupedViewProps {
  groups: ReceiptDateGroup[];
  ungroupedPhotos?: PhotoDto[];
  onPhotoClick: (photo: PhotoDto, contextPhotos: PhotoDto[]) => void;
  onDelete?: (id: string) => void;
  onExtract?: (photo: PhotoDto) => void;
  onOpenReceipt?: (photo: PhotoDto) => void;
  selectedPhotoIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

const PhotoReceiptGroupedView: React.FC<PhotoReceiptGroupedViewProps> = ({
  groups, ungroupedPhotos = [], onPhotoClick, onDelete, onExtract, onOpenReceipt, selectedPhotoIds = new Set(), onToggleSelect,
}) => {
  const groupCardBorderRadius = '10px';
  const groupHeaderVerticalPadding = 0.8;
  const groupDateFontSize = '0.82rem';

  return (
    <Box>
      {groups.map((group) => (
        <Paper key={group.id} sx={{ mb: '3px', borderRadius: groupCardBorderRadius, overflow: 'hidden' }}>
          <Box
            sx={{
              px: 3, py: groupHeaderVerticalPadding, display: 'flex', alignItems: 'center', gap: 1.5,
              bgcolor: '#ffffff',
              borderBottom: '1px solid rgba(0,0,0,0.08)',
            }}
          >
            <Typography sx={{ fontSize: groupDateFontSize, fontWeight: 600, lineHeight: 1.2 }}>
              {group.label}
            </Typography>
          </Box>

          <Box sx={{ p: '5px', display: 'grid', columnGap: '8px', rowGap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))' }}>
            {group.photos.map((photo) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                onClick={() => onPhotoClick(photo, group.photos)}
                onExtract={handleExtractPhoto => onExtract?.(handleExtractPhoto)}
                onOpenReceipt={onOpenReceipt}
                isSelected={selectedPhotoIds.has(photo.id)}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </Box>
        </Paper>
      ))}

      {ungroupedPhotos.length > 0 && (
        <Paper sx={{ mb: '3px', borderRadius: groupCardBorderRadius, overflow: 'hidden' }}>
          <Box
            sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1.5,
              bgcolor: 'rgba(158,158,158,0.08)' }}
          >
            <Chip size="small" label="📷 无票据关联" variant="outlined" />
            <Typography variant="body2" fontWeight={600} color="text.secondary">
              {ungroupedPhotos.length} 张照片未关联票据
            </Typography>
          </Box>
          <Box sx={{ p: '5px', display: 'grid', columnGap: '8px', rowGap: 2,
            gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))' }}>
            {ungroupedPhotos.map((photo) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                onClick={() => onPhotoClick(photo, ungroupedPhotos)}
                onExtract={onExtract}
                onOpenReceipt={onOpenReceipt}
                isSelected={selectedPhotoIds.has(photo.id)}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </Box>
        </Paper>
      )}
    </Box>
  );
};

export default PhotoReceiptGroupedView;
export { PhotoReceiptGroupedView };
