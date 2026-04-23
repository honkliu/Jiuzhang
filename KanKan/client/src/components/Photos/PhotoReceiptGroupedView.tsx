import React, { useState } from 'react';
import {
  Box, Typography, Paper, Chip, Collapse, IconButton,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { photoService, type PhotoDto } from '@/services/photo.service';

interface PhotoReceiptGroupedViewProps {
  photos: PhotoDto[];
  onPhotoClick: (photo: PhotoDto) => void;
  onDelete?: (id: string) => void;
  onEdit?: (photo: PhotoDto) => void;
  selectedPhotoIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

interface GroupedReceipt {
  receiptId: string;
  type: string;
  merchantName?: string;
  hospitalName?: string;
  totalAmount?: number;
  currency?: string;
  receiptDate?: string;
  photos: PhotoDto[];
}

interface NoReceiptGroup {
  photos: PhotoDto[];
}

const PhotoReceiptGroupedView: React.FC<PhotoReceiptGroupedViewProps> = ({
  photos, onPhotoClick, onDelete, onEdit, selectedPhotoIds = new Set(), onToggleSelect,
}) => {
  const [expandedReceipts, setExpandedReceipts] = useState<Set<string>>(new Set());

  // Group photos by their associated receipts
  const groupedByReceipt: GroupedReceipt[] = [];
  const noReceiptGroup: NoReceiptGroup = { photos: [] };
  const seenReceipts = new Set<string>();

  for (const photo of photos) {
    if (!photo.associatedReceiptIds || photo.associatedReceiptIds.length === 0) {
      noReceiptGroup.photos.push(photo);
    } else {
      for (const receiptId of photo.associatedReceiptIds) {
        if (!seenReceipts.has(receiptId)) {
          seenReceipts.add(receiptId);
          groupedByReceipt.push({
            receiptId,
            type: 'Shopping',
            photos: [photo],
          });
        } else {
          const group = groupedByReceipt.find(g => g.receiptId === receiptId);
          if (group) group.photos.push(photo);
        }
      }
    }
  }

  const toggleReceipt = (receiptId: string) => {
    setExpandedReceipts(prev => {
      const next = new Set(prev);
      if (next.has(receiptId)) next.delete(receiptId);
      else next.add(receiptId);
      return next;
    });
  };

  return (
    <Box>
      {/* Grouped receipts */}
      {groupedByReceipt.map((group) => (
        <Paper key={group.receiptId} sx={{ mb: 2, borderRadius: 3, overflow: 'hidden' }}>
          {/* Receipt header */}
          <Box
            sx={{
              px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1.5,
              bgcolor: 'rgba(7,193,96,0.06)', cursor: 'pointer',
              '&:hover': { bgcolor: 'rgba(7,193,96,0.12)' },
            }}
            onClick={() => toggleReceipt(group.receiptId)}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip size="small" label="🧾 票据" color="primary" />
              <Typography variant="body2" fontWeight={600}>
                {group.merchantName || group.hospitalName || `票据 ${group.receiptId.slice(0, 8)}`}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {group.photos.length} 张照片
              </Typography>
            </Box>
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton size="small" sx={{ color: 'text.secondary' }}>
                {expandedReceipts.has(group.receiptId) ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Box>
          </Box>

          {/* Expanded photos */}
          <Collapse in={expandedReceipts.has(group.receiptId)}>
            <Box sx={{ p: 2, display: 'grid', gap: 2,
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {group.photos.map((photo) => (
                <PhotoReceiptCard
                  key={photo.id}
                  photo={photo}
                  onClick={() => onPhotoClick(photo)}
                  onToggleSelect={onToggleSelect}
                />
              ))}
            </Box>
          </Collapse>
        </Paper>
      ))}

      {/* No Receipt group */}
      {noReceiptGroup.photos.length > 0 && (
        <Paper sx={{ mb: 3, borderRadius: 3, overflow: 'hidden' }}>
          <Box
            sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1.5,
              bgcolor: 'rgba(158,158,158,0.08)' }}
          >
            <Chip size="small" label="📷 无票据关联" variant="outlined" />
            <Typography variant="body2" fontWeight={600} color="text.secondary">
              {noReceiptGroup.photos.length} 张照片未关联票据
            </Typography>
          </Box>
          <Box sx={{ p: 2, display: 'grid', gap: 2,
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {noReceiptGroup.photos.map((photo) => (
              <PhotoReceiptCard
                key={photo.id}
                photo={photo}
                onClick={() => onPhotoClick(photo)}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </Box>
        </Paper>
      )}
    </Box>
  );
};

interface PhotoReceiptCardProps {
  photo: PhotoDto;
  onClick: () => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

const PhotoReceiptCard: React.FC<PhotoReceiptCardProps> = ({
  photo, onClick, isSelected = false, onToggleSelect,
}) => {
  const downloadUrl = photoService.getDownloadUrl(photo.id);

  return (
    <Box>
      <Box
        sx={{
          position: 'relative', borderRadius: 2, overflow: 'hidden', cursor: 'pointer',
          border: isSelected ? '2px solid #2196f3' : '2px solid transparent',
          transition: 'transform 0.2s, box-shadow 0.2s',
          '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
        }}
        onClick={onClick}
      >
        {/* Checkbox */}
        {onToggleSelect && (
          <Box sx={{
            position: 'absolute', top: 8, left: 8, zIndex: 2,
            bgcolor: 'rgba(255,255,255,0.85)', borderRadius: 1,
          }}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e: React.MouseEvent | React.ChangeEvent<HTMLInputElement>) => {
                if ((e as React.ChangeEvent<HTMLInputElement>).target?.checked) {
                  onToggleSelect(photo.id);
                } else {
                  onToggleSelect(photo.id);
                }
              }}
              style={{ cursor: 'pointer', width: 18, height: 18 }}
            />
          </Box>
        )}

        <img
          src={downloadUrl}
          alt={photo.fileName}
          style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
        />
        <Box sx={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          bgcolor: 'rgba(0,0,0,0.6)', p: 0.5,
        }}>
          <Typography variant="caption" sx={{ color: 'white', display: 'block',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {photo.fileName}
          </Typography>
        </Box>
      </Box>

      {photo.associatedReceiptIds.length > 0 && (
        <Chip size="small" label={`🧾 ${photo.associatedReceiptIds.length}票据`}
          color="primary" variant="outlined" sx={{ mt: 0.5 }} />
      )}
    </Box>
  );
};

export default PhotoReceiptGroupedView;
export { PhotoReceiptGroupedView };
