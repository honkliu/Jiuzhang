import React, { useState } from 'react';
import {
  Card, CardMedia, CardContent, CardActions,
  Typography, IconButton, Box, Menu, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Chip, Checkbox,
} from '@mui/material';
import { MoreVert, Edit, Delete, LocationOn, CameraAlt } from '@mui/icons-material';
import { photoService, type PhotoDto } from '@/services/photo.service';

interface PhotoCardProps {
  photo: PhotoDto;
  onClick: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

const PhotoCard: React.FC<PhotoCardProps> = ({ photo, onClick, onDelete, onEdit, isSelected = false, onToggleSelect }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState({
    notes: photo.notes || '',
    tags: photo.tags.join(', '),
    tagsList: [...photo.tags],
  });

  const downloadUrl = photoService.getDownloadUrl(photo.id);

  const handleEditSave = async () => {
    try {
      await photoService.update(photo.id, {
        notes: editData.notes,
        tags: editData.tagsList,
      });
      if (onEdit) onEdit();
      setEditOpen(false);
    } catch (e) {
      console.error('Failed to update:', e);
    }
  };

  return (
    <>
      <Card
        sx={{
          height: '100%', display: 'flex', flexDirection: 'column',
          cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s',
          border: isSelected ? '2px solid #2196f3' : '2px solid transparent',
          '&:hover': { transform: 'translateY(-2px)', boxShadow: 6 },
          position: 'relative',
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
        <CardMedia component="img" image={downloadUrl} alt={photo.fileName}
          sx={{ height: 180, objectFit: 'cover', bgcolor: 'rgba(0,0,0,0.05)' }} />
        <CardContent sx={{ flex: 1, p: 1.5, pb: 1 }}>
          <Typography variant="body2" noWrap fontWeight={500}>{photo.fileName}</Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
            {photo.locationName && (
              <Chip size="small" icon={<LocationOn sx={{ fontSize: 14 }} />} label={photo.locationName} variant="outlined" />
            )}
            {photo.cameraModel && (
              <Chip size="small" icon={<CameraAlt sx={{ fontSize: 14 }} />} label={photo.cameraModel?.split(' ').slice(-1)[0] || ''} variant="outlined" />
            )}
            {photo.associatedReceiptIds.length > 0 && (
              <Chip size="small" icon={<span style={{ fontSize: 12 }}>🧾</span>} label={`${photo.associatedReceiptIds.length}票据`} color="primary" variant="outlined" />
            )}
          </Box>
          {photo.notes && (
            <Typography variant="caption" sx={{ mt: 0.5, display: 'block', color: 'text.secondary' }} noWrap>
              {photo.notes}
            </Typography>
          )}
        </CardContent>
        <CardActions sx={{ px: 1, pb: 1 }}>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setAnchorEl(e.currentTarget); }}>
            <MoreVert fontSize="small" />
          </IconButton>
        </CardActions>
      </Card>

      {/* Context Menu */}
      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}>
        <MenuItem onClick={() => { setAnchorEl(null); setEditOpen(true); }}>
          <Edit fontSize="small" sx={{ mr: 1 }} />编辑
        </MenuItem>
        <MenuItem onClick={() => { setAnchorEl(null); onDelete?.(); }}>
          <Delete fontSize="small" sx={{ mr: 1 }} />删除
        </MenuItem>
      </Menu>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>编辑照片信息</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField fullWidth label="备注" value={editData.notes}
            onChange={(e) => setEditData(d => ({ ...d, notes: e.target.value }))}
            multiline rows={3} sx={{ mb: 2 }} />
          <TextField fullWidth label="标签（逗号分隔）" value={editData.tags}
            onChange={(e) => setEditData(d => ({ ...d, tags: e.target.value, tagsList: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleEditSave}>保存</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default PhotoCard;
