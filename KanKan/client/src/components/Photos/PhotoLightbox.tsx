import React from 'react';
import {
  Dialog, DialogContent, Box, IconButton, Typography,
  Chip, Paper, Stack,
} from '@mui/material';
import { Close, ArrowBack, ArrowForward, LocationOn, CameraAlt, CalendarToday } from '@mui/icons-material';
import { photoService, type PhotoDto } from '@/services/photo.service';

interface PhotoLightboxProps {
  open: boolean;
  photo: PhotoDto | null;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
}

const PhotoLightbox: React.FC<PhotoLightboxProps> = ({ open, photo, onClose, onNext, onPrev }) => {
  if (!photo) return null;

  const downloadUrl = photoService.getDownloadUrl(photo.id);
  const capturedDate = photo.capturedDate ? new Date(photo.capturedDate) : new Date(photo.uploadedAt);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
      PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}>
      <DialogContent sx={{ p: 0 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, bgcolor: 'rgba(0,0,0,0.8)' }}>
          <Typography variant="subtitle1" sx={{ color: 'white', fontWeight: 500 }}>{photo.fileName}</Typography>
          <Box>
            {onPrev && <IconButton onClick={onPrev} sx={{ color: 'white', mr: 1 }}><ArrowBack /></IconButton>}
            {onNext && <IconButton onClick={onNext} sx={{ color: 'white', mr: 1 }}><ArrowForward /></IconButton>}
            <IconButton onClick={onClose} sx={{ color: 'white' }}><Close /></IconButton>
          </Box>
        </Box>
        {/* Image */}
        <Box sx={{ position: 'relative', bgcolor: 'black', display: 'flex', justifyContent: 'center' }}>
          <img src={downloadUrl} alt={photo.fileName}
            style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
        </Box>
        {/* Info Panel */}
        <Paper sx={{ p: 2, borderTop: '1px solid rgba(0,0,0,0.1)' }}>
          <Typography variant="subtitle2" gutterBottom fontWeight={600}>照片信息</Typography>
          <Stack spacing={1.5}>
            {photo.cameraModel && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <CameraAlt sx={{ fontSize: 18, color: 'text.secondary' }} />
                <Typography variant="body2">{photo.cameraModel}</Typography>
              </Box>
            )}
            {photo.locationName && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <LocationOn sx={{ fontSize: 18, color: 'text.secondary' }} />
                <Typography variant="body2">{photo.locationName}</Typography>
              </Box>
            )}
            {photo.latitude != null && photo.longitude != null && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                📍 {photo.latitude.toFixed(4)}, {photo.longitude.toFixed(4)}
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <CalendarToday sx={{ fontSize: 18, color: 'text.secondary' }} />
              <Typography variant="body2">
                {capturedDate.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </Typography>
            </Box>
            {photo.width && photo.height && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                尺寸: {photo.width} × {photo.height}
              </Typography>
            )}
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              大小: {(photo.fileSize / 1024).toFixed(1)} KB
            </Typography>
            {photo.associatedReceiptIds.length > 0 && (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>关联票据:</Typography>
                {photo.associatedReceiptIds.map(id => (
                  <Chip key={id} label={id.slice(0, 8)} size="small" color="primary" variant="outlined" />
                ))}
              </Box>
            )}
            {photo.notes && (
              <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                💬 {photo.notes}
              </Typography>
            )}
            {photo.tags.length > 0 && (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {photo.tags.map(tag => (
                  <Chip key={tag} label={tag} size="small" />
                ))}
              </Box>
            )}
          </Stack>
        </Paper>
      </DialogContent>
    </Dialog>
  );
};

export default PhotoLightbox;
