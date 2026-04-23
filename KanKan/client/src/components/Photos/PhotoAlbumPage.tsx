import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Container, Button,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Tabs, Tab, Pagination, Checkbox,
  Badge,
} from '@mui/material';
import {
  CloudUpload, GridOn, Apps, ViewList, Restore,
  AutoAwesome as ExtractIcon,
} from '@mui/icons-material';
import { photoService, type PhotoDto } from '@/services/photo.service';
import PhotoUploader from './PhotoUploader';
import PhotoCard from './PhotoCard';
import PhotoLightbox from './PhotoLightbox';
import { BatchExtractDialog } from '../Receipts/BatchExtractDialog';
import PhotoReceiptGroupedView from './PhotoReceiptGroupedView';

type ViewMode = 'grid' | 'grouped' | 'receiptGrouped';

const PhotoAlbumPage: React.FC = () => {
  const [photos, setPhotos] = useState<PhotoDto[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const [grouped, setGrouped] = useState<Record<string, PhotoDto[]>>({});
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ open: boolean; photo: PhotoDto | null }>({ open: false, photo: null });
  const [dateFilter, setDateFilter] = useState<'all' | 'month' | 'week'>('all');
  const [page, setPage] = useState(1);
  const itemsPerPage = 24;

  // Batch selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Batch extract dialog state
  const [batchExtractOpen, setBatchExtractOpen] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<PhotoDto[]>([]);

  useEffect(() => {
    loadPhotos();
  }, []);

  const loadPhotos = useCallback(async () => {
    try {
      setLoading(true);
      let fetched: PhotoDto[];
      if (dateFilter === 'month') {
        const end = new Date();
        const start = new Date();
        start.setMonth(start.getMonth() - 1);
        fetched = await photoService.getByUploadDate(start.toISOString(), end.toISOString());
      } else if (dateFilter === 'week') {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 7);
        fetched = await photoService.getByUploadDate(start.toISOString(), end.toISOString());
      } else {
        fetched = await photoService.list();
      }
      setPhotos(fetched);
      groupPhotos(fetched);
    } catch (e) {
      console.error('Failed to load photos:', e);
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  const groupPhotos = (items: PhotoDto[]) => {
    const groups: Record<string, PhotoDto[]> = {};
    for (const p of items) {
      const year = p.capturedDate ? new Date(p.capturedDate).getFullYear() : new Date().getFullYear();
      const month = p.capturedDate ? new Date(p.capturedDate).getMonth() : new Date().getMonth();
      const key = `group_${year}-${String(month + 1).padStart(2, '0')}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }
    setGrouped(groups);
  };

  const handleUploadComplete = () => {
    setUploadOpen(false);
    loadPhotos();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除这张照片吗？')) return;
    try {
      await photoService.remove(id);
      loadPhotos();
    } catch (e) {
      console.error('Failed to delete:', e);
    }
  };

  const handleEdit = () => {
    loadPhotos();
  };

  // Flat display list (computed here so callbacks can reference it)
  const displayPhotos = viewMode === 'grouped' || viewMode === 'receiptGrouped'
    ? Object.values(grouped).flat()
    : photos;

  // Whether any photo has associated receipts
  const hasReceiptGrouped = displayPhotos.some(p =>
    p.associatedReceiptIds != null && p.associatedReceiptIds.length > 0
  );

  // Selection helpers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedIds.size === displayPhotos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayPhotos.map(p => p.id)));
    }
  }, [displayPhotos.length, selectedIds.size]);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(photos.map(p => p.id)));
  }, [photos]);

  // Batch extract
  const openBatchExtract = () => {
    const selected = photos.filter(p => selectedIds.has(p.id));
    setSelectedPhotos(selected);
    setBatchExtractOpen(true);
  };

  const handleBatchExtractSaved = () => {
    setBatchExtractOpen(false);
    setSelectedIds(new Set());
    loadPhotos();
  };

  const pagedPhotos = displayPhotos.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  const gridCols = 'repeat(auto-fill, minmax(240px, 1fr))';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'rgba(244, 247, 251, 0.5)', py: 4 }}>
      <Container maxWidth="lg">
        {/* Header */}
        <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
            <Typography variant="h4" fontWeight={700}>📷 照片相册</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                startIcon={<CloudUpload />}
                onClick={() => setUploadOpen(true)}
              >
                上传照片
              </Button>
              {selectMode && (
                <Button
                  variant="outlined"
                  startIcon={<ExtractIcon />}
                  onClick={openBatchExtract}
                  disabled={selectedIds.size === 0}
                  color="primary"
                >
                  批量提取 ({selectedIds.size})
                </Button>
              )}
              {selectMode && (
                <Button
                  variant="outlined"
                  startIcon={<Restore />}
                  onClick={() => { setSelectedIds(new Set()); }}
                  disabled={selectedIds.size === 0}
                >
                  清除选择
                </Button>
              )}
            </Box>
          </Box>
        </Paper>

        {/* Filter bar */}
        <Paper sx={{ p: 2, mb: 3, borderRadius: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Tabs value={dateFilter} onChange={(_, v) => setDateFilter(v)}>
              <Tab label="全部" value="all" />
              <Tab label="本月" value="month" />
              <Tab label="本周" value="week" />
            </Tabs>
            <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center' }}>
              {/* Selection controls */}
              {selectMode && displayPhotos.length > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Checkbox size="small" checked={selectedIds.size === displayPhotos.length && displayPhotos.length > 0}
                    onChange={toggleAll}
                    indeterminate={selectedIds.size > 0 && selectedIds.size < displayPhotos.length} />
                  <Typography variant="caption" color="text.secondary">
                    {selectedIds.size}/{displayPhotos.length} 已选
                  </Typography>
                </Box>
              )}
              <Button size="small" variant={selectMode ? 'contained' : 'outlined'}
                startIcon={selectMode ? <Apps fontSize="small" /> : <Apps fontSize="small" />}
                onClick={() => { setSelectMode(true); setSelectedIds(new Set()); }}
                disabled={selectMode}>
                多选
              </Button>
              <Button size="small" variant={selectMode ? 'outlined' : 'outlined'}
                startIcon={<Apps fontSize="small" />}
                onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
                disabled={!selectMode}>
                退出
              </Button>
              {/* View mode toggle (only when not in select mode) */}
              {!selectMode && (
                <>
                  <Button size="small" variant={viewMode === 'grid' ? 'contained' : 'outlined'}
                    startIcon={<GridOn fontSize="small" />}
                    onClick={() => setViewMode('grid')}>网格</Button>
                  <Button size="small" variant={viewMode === 'grouped' ? 'contained' : 'outlined'}
                    startIcon={<ViewList fontSize="small" />}
                    onClick={() => setViewMode('grouped')}>分组</Button>
                  {hasReceiptGrouped && (
                    <Button size="small" variant={viewMode === 'receiptGrouped' ? 'contained' : 'outlined'}
                      startIcon={<Badge badgeContent="🧾" color="primary">
                        <Apps fontSize="small" />
                      </Badge>}
                      onClick={() => setViewMode('receiptGrouped')}>票据</Button>
                  )}
                </>
              )}
            </Box>
          </Box>
        </Paper>

        {/* Content */}
        {loading ? (
          <Typography sx={{ textAlign: 'center', py: 8 }}>加载中...</Typography>
        ) : viewMode === 'receiptGrouped' ? (
          <PhotoReceiptGroupedView
            photos={displayPhotos}
            onPhotoClick={(photo) => setLightbox({ open: true, photo })}
            onDelete={(id) => handleDelete(id)}
            onEdit={handleEdit}
            selectedPhotoIds={selectedIds}
            onToggleSelect={selectMode ? toggleSelect : undefined}
          />
        ) : viewMode === 'grouped' ? (
          Object.entries(grouped).map(([groupKey, items]) => {
            const [_, year, month] = groupKey.split('_');
            const date = new Date(parseInt(year), parseInt(month) - 1);
            return (
              <Paper key={groupKey} sx={{ mb: 3, borderRadius: 3 }}>
                <Box sx={{ px: 3, py: 2, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                  <Typography variant="h6">{date.getFullYear()}年{date.getMonth() + 1}月</Typography>
                </Box>
                <Box sx={{ p: 2, display: 'grid', gap: 2, gridTemplateColumns: gridCols }}>
                  {items.map((photo) => (
                    <PhotoCard
                      key={photo.id}
                      photo={photo}
                      onClick={() => setLightbox({ open: true, photo })}
                      onDelete={() => handleDelete(photo.id)}
                      onEdit={handleEdit}
                      isSelected={selectMode && selectedIds.has(photo.id)}
                      onToggleSelect={selectMode ? toggleSelect : undefined}
                    />
                  ))}
                </Box>
              </Paper>
            );
          })
        ) : (
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: gridCols }}>
            {pagedPhotos.map((photo) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                onClick={() => setLightbox({ open: true, photo })}
                onDelete={() => handleDelete(photo.id)}
                onEdit={handleEdit}
                isSelected={selectMode && selectedIds.has(photo.id)}
                onToggleSelect={selectMode ? toggleSelect : undefined}
              />
            ))}
          </Box>
        )}

        {/* Pagination */}
        {(viewMode !== 'receiptGrouped') && displayPhotos.length > itemsPerPage && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
            <Pagination
              count={Math.ceil(displayPhotos.length / itemsPerPage)}
              page={page}
              onChange={(_, p) => setPage(p)}
              color="primary"
            />
          </Box>
        )}

        {/* Empty state */}
        {!loading && displayPhotos.length === 0 && (
          <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
            <Typography variant="h5" sx={{ mb: 2 }}>📷 还没有照片</Typography>
            <Typography variant="body1" sx={{ mb: 3, color: 'text.secondary' }}>
              上传你的照片，开始管理你的照片库
            </Typography>
            <Button variant="contained" startIcon={<CloudUpload />} onClick={() => setUploadOpen(true)}>
              上传第一张照片
            </Button>
          </Paper>
        )}
      </Container>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onClose={() => setUploadOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>上传照片</DialogTitle>
        <DialogContent>
          <PhotoUploader onComplete={handleUploadComplete} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>

      {/* Lightbox */}
      <PhotoLightbox
        open={lightbox.open}
        photo={lightbox.photo}
        onClose={() => setLightbox({ open: false, photo: null })}
        onNext={() => {
          if (!lightbox.photo) return;
          const idx = displayPhotos.findIndex(p => p.id === lightbox.photo!.id);
          if (idx >= 0 && idx < displayPhotos.length - 1) {
            setLightbox({ open: true, photo: displayPhotos[idx + 1] });
          }
        }}
        onPrev={() => {
          if (!lightbox.photo) return;
          const idx = displayPhotos.findIndex(p => p.id === lightbox.photo!.id);
          if (idx > 0) {
            setLightbox({ open: true, photo: displayPhotos[idx - 1] });
          }
        }}
      />

      {/* Batch Extract Dialog */}
      <BatchExtractDialog
        open={batchExtractOpen}
        selectedPhotoIds={Array.from(selectedIds)}
        selectedPhotos={selectedPhotos}
        onClose={() => { setBatchExtractOpen(false); setSelectedIds(new Set()); }}
        onSaved={handleBatchExtractSaved}
      />
    </Box>
  );
};

export default PhotoAlbumPage;
