import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Container, Button, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Pagination, Checkbox, CircularProgress, Table, TableBody, TableCell, TableContainer, TableRow,
} from '@mui/material';
import {
  CloudUpload, Apps, Restore,
  AutoAwesome as ExtractIcon,
} from '@mui/icons-material';
import { photoService, type PhotoDto } from '@/services/photo.service';
import { receiptService, type ReceiptDto } from '@/services/receipt.service';
import PhotoUploader from './PhotoUploader';
import PhotoCard from './PhotoCard';
import { BatchExtractDialog } from '../Receipts/BatchExtractDialog';
import PhotoReceiptGroupedView, { type ReceiptDateGroup } from './PhotoReceiptGroupedView';
import { ImageLightbox, type LightboxGroup } from '../Shared/ImageLightbox';

interface PhotoAlbumPageProps {
  embedded?: boolean;
  title?: string;
  onOpenReceipt?: (receipt: ReceiptDto) => void;
  onReceiptsChanged?: () => void;
}

type ViewMode = 'grid' | 'uploaded' | 'captured' | 'receiptDate';
type PhotoGroup = { id: string; label: string; photos: PhotoDto[] };
type PhotoCollectionLightboxState = {
  images: string[];
  initialIndex: number;
  groups: LightboxGroup[];
  initialGroupIndex: number;
} | null;

const sortPhotosDesc = (items: PhotoDto[], accessor: (photo: PhotoDto) => string | undefined) => {
  return [...items].sort((left, right) => {
    const leftValue = accessor(left);
    const rightValue = accessor(right);
    const leftTime = leftValue ? new Date(leftValue).getTime() : 0;
    const rightTime = rightValue ? new Date(rightValue).getTime() : 0;
    return rightTime - leftTime;
  });
};

const toDateKey = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const toDateLabel = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return `${year}年${month}月${day}日`;
};

const buildStandardGroups = (
  items: PhotoDto[],
  accessor: (photo: PhotoDto) => string | undefined,
  undatedLabel: string,
): PhotoGroup[] => {
  const groups = new Map<string, PhotoDto[]>();

  for (const photo of sortPhotosDesc(items, accessor)) {
    const rawValue = accessor(photo);
    const key = rawValue ? toDateKey(rawValue) : null;
    const groupKey = key ?? 'undated';
    const bucket = groups.get(groupKey) ?? [];
    bucket.push(photo);
    groups.set(groupKey, bucket);
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => {
      if (left === 'undated') return 1;
      if (right === 'undated') return -1;
      return right.localeCompare(left);
    })
    .map(([key, groupPhotos]) => ({
      id: key,
      label: key === 'undated' ? undatedLabel : toDateLabel(key),
      photos: groupPhotos,
    }));
};

const buildReceiptDateGroups = (
  items: PhotoDto[],
  receipts: ReceiptDto[],
): { groups: ReceiptDateGroup[]; ungroupedPhotos: PhotoDto[] } => {
  const receiptsById = new Map(receipts.map(receipt => [receipt.id, receipt]));
  const groups = new Map<string, ReceiptDateGroup>();
  const ungroupedPhotos: PhotoDto[] = [];

  for (const photo of sortPhotosDesc(items, current => current.uploadedAt)) {
    const associatedIds = photo.associatedReceiptIds ?? [];
    if (associatedIds.length === 0) {
      ungroupedPhotos.push(photo);
      continue;
    }

    const groupedKeys = new Set<string>();
    const datedReceipts = associatedIds
      .map(receiptId => receiptsById.get(receiptId))
      .filter((receipt): receipt is ReceiptDto => Boolean(receipt && receipt.receiptDate));

    for (const receipt of datedReceipts) {
      const key = toDateKey(receipt.receiptDate!);
      if (!key || groupedKeys.has(key)) {
        continue;
      }

      groupedKeys.add(key);
      const existing = groups.get(key) ?? {
        id: key,
        label: toDateLabel(key),
        summary: '',
        photos: [],
        receipts: [],
      };

      existing.photos.push(photo);
      const existingReceipt = existing.receipts.find(item => item.id === receipt.id);
      if (!existingReceipt) {
        existing.receipts.push({
          id: receipt.id,
          type: receipt.type,
          category: receipt.category,
          merchantName: receipt.merchantName,
          hospitalName: receipt.hospitalName,
          totalAmount: receipt.totalAmount,
          currency: receipt.currency,
          receiptDate: receipt.receiptDate,
          photos: [photo],
        });
      } else if (!existingReceipt.photos.some(item => item.id === photo.id)) {
        existingReceipt.photos.push(photo);
      }
      groups.set(key, existing);
    }

    if (groupedKeys.size === 0) {
      const undatedKey = 'receipt-undated';
      const existing = groups.get(undatedKey) ?? {
        id: undatedKey,
        label: '票据时间待确认',
        summary: '',
        photos: [],
        receipts: [],
      };
      existing.photos.push(photo);
      for (const receiptId of associatedIds) {
        const receipt = receiptsById.get(receiptId);
        if (!receipt || existing.receipts.some(item => item.id === receipt.id)) {
          continue;
        }
        existing.receipts.push({
          id: receipt.id,
          type: receipt.type,
          category: receipt.category,
          merchantName: receipt.merchantName,
          hospitalName: receipt.hospitalName,
          totalAmount: receipt.totalAmount,
          currency: receipt.currency,
          receiptDate: receipt.receiptDate,
          photos: [photo],
        });
      }
      groups.set(undatedKey, existing);
    }
  }

  const sortedGroups = Array.from(groups.values())
    .sort((left, right) => {
      if (left.id === 'receipt-undated') return 1;
      if (right.id === 'receipt-undated') return -1;
      return right.id.localeCompare(left.id);
    })
    .map(group => ({
      ...group,
      summary: `${group.photos.length} 张照片，${group.receipts.length} 张票据`,
    }));

  return { groups: sortedGroups, ungroupedPhotos };
};

const PhotoAlbumPage: React.FC<PhotoAlbumPageProps> = ({ embedded = false, title = '图片集合', onOpenReceipt, onReceiptsChanged }) => {
  const [photos, setPhotos] = useState<PhotoDto[]>([]);
  const [receipts, setReceipts] = useState<ReceiptDto[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [grouped, setGrouped] = useState<PhotoGroup[]>([]);
  const [receiptDateGroups, setReceiptDateGroups] = useState<ReceiptDateGroup[]>([]);
  const [receiptUngroupedPhotos, setReceiptUngroupedPhotos] = useState<PhotoDto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [lightbox, setLightbox] = useState<PhotoCollectionLightboxState>(null);
  const [pendingDeletePhotoId, setPendingDeletePhotoId] = useState<string | null>(null);
  const [dateFilter] = useState<'all' | 'month' | 'week'>('all');
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

  useEffect(() => {
    if (viewMode === 'uploaded') {
      setGrouped(buildStandardGroups(photos, photo => photo.uploadedAt, '未记录上传时间'));
      return;
    }

    if (viewMode === 'captured') {
      setGrouped(buildStandardGroups(photos, photo => photo.capturedDate, '未识别拍照时间'));
      return;
    }

    if (viewMode === 'receiptDate') {
      const receiptGroups = buildReceiptDateGroups(photos, receipts);
      setReceiptDateGroups(receiptGroups.groups);
      setReceiptUngroupedPhotos(receiptGroups.ungroupedPhotos);
      return;
    }

    setGrouped([]);
  }, [photos, receipts, viewMode]);

  const loadPhotos = useCallback(async () => {
    try {
      setPhotosLoading(true);
      setReceiptsLoading(true);
      let fetchedPhotos: PhotoDto[];
      if (dateFilter === 'month') {
        const end = new Date();
        const start = new Date();
        start.setMonth(start.getMonth() - 1);
        fetchedPhotos = await photoService.getByUploadDate(start.toISOString(), end.toISOString());
      } else if (dateFilter === 'week') {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 7);
        fetchedPhotos = await photoService.getByUploadDate(start.toISOString(), end.toISOString());
      } else {
        fetchedPhotos = await photoService.list();
      }

      setPhotos(fetchedPhotos);
    } catch (e) {
      console.error('Failed to load photos:', e);
    } finally {
      setPhotosLoading(false);
    }

    try {
      const fetchedReceipts = await receiptService.list();
      setReceipts(fetchedReceipts);
    } catch (e) {
      console.error('Failed to load receipts for photo grouping:', e);
      setReceipts([]);
    } finally {
      setReceiptsLoading(false);
    }
  }, [dateFilter]);

  const handleUploadComplete = () => {
    setUploadOpen(false);
    loadPhotos();
  };

  const handleDelete = useCallback((id: string) => {
    setPendingDeletePhotoId(id);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDeletePhotoId) return;

    try {
      await photoService.remove(pendingDeletePhotoId);
      setPendingDeletePhotoId(null);
      loadPhotos();
    } catch (e) {
      console.error('Failed to delete:', e);
    }
  }, [loadPhotos, pendingDeletePhotoId]);

  const handleCancelDelete = useCallback(() => {
    setPendingDeletePhotoId(null);
  }, []);

  const handleExtractPhoto = useCallback((photo: PhotoDto) => {
    setSelectedIds(new Set([photo.id]));
    setSelectedPhotos([photo]);
    setBatchExtractOpen(true);
  }, []);

  const handleOpenPhotoReceipt = useCallback((photo: PhotoDto) => {
    if (!onOpenReceipt) return;
    const receiptId = photo.associatedReceiptIds[0];
    if (!receiptId) return;
    const receipt = receipts.find(item => item.id === receiptId);
    if (receipt) {
      onOpenReceipt(receipt);
    }
  }, [onOpenReceipt, receipts]);

  // Flat display list (computed here so callbacks can reference it)
  const displayPhotos = viewMode === 'grid'
    ? photos
    : viewMode === 'receiptDate'
      ? Array.from(new Map(
        [...receiptDateGroups.flatMap(group => group.photos), ...receiptUngroupedPhotos]
          .map(photo => [photo.id, photo]),
      ).values())
      : grouped.flatMap(group => group.photos);

  const closeLightbox = useCallback(() => {
    setLightbox(null);
  }, []);

  const openLightbox = useCallback((photo: PhotoDto) => {
    const contextPhotos = displayPhotos;
    if (contextPhotos.length === 0) {
      return;
    }

    const images = contextPhotos
      .map((contextPhoto) => photoService.getImageUrl(contextPhoto))
      .filter((url): url is string => Boolean(url));
    const groups: LightboxGroup[] = [];
    contextPhotos.forEach((contextPhoto) => {
      const sourceUrl = photoService.getImageUrl(contextPhoto);
      if (!sourceUrl) {
        return;
      }

      groups.push({
        sourceUrl,
        messageId: contextPhoto.id,
        canEdit: true,
      });
    });

    if (images.length === 0 || groups.length === 0) {
      return;
    }

    const selectedImageUrl = photoService.getImageUrl(photo);
    setLightbox({
      images,
      initialIndex: Math.max(0, selectedImageUrl ? images.findIndex((item) => item === selectedImageUrl) : 0),
      groups,
      initialGroupIndex: Math.max(0, groups.findIndex((item) => item.messageId === photo.id)),
    });
  }, [displayPhotos]);

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
    onReceiptsChanged?.();
  };

  const pagedPhotos = displayPhotos.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  const gridCols = 'repeat(auto-fill, minmax(168px, 1fr))';
  const unassociatedPhotoCount = photos.filter(photo => (photo.associatedReceiptIds?.length ?? 0) === 0).length;
  const groupedPhotoCount = photos.length - unassociatedPhotoCount;
  const extractedPhotoCount = photos.filter(photo => (photo.extractedReceiptCount ?? 0) > 0).length;
  const currentDisplayCount = viewMode === 'grid' ? pagedPhotos.length : displayPhotos.length;

  const modeButtons: Array<{ key: ViewMode; label: string }> = [
    { key: 'grid', label: '全部照片' },
    { key: 'captured', label: '按拍照时间' },
    { key: 'receiptDate', label: '按票据时间' },
  ];

  const actionButtonSx = {
    minHeight: embedded ? 28 : 30,
    borderRadius: '999px',
    px: embedded ? 1.1 : 1.25,
    textTransform: 'none',
    fontWeight: 600,
    boxShadow: 'none',
    fontSize: '0.82rem',
  } as const;

  const embeddedControlButtonSx = {
    ...actionButtonSx,
    bgcolor: '#ffffff',
    color: 'text.primary',
    border: '1px solid rgba(15,23,42,0.08)',
    '&:hover': {
      bgcolor: '#ffffff',
      borderColor: 'rgba(15,23,42,0.16)',
    },
  } as const;

  const embeddedActiveControlButtonSx = {
    ...embeddedControlButtonSx,
    color: 'primary.main',
    borderColor: 'rgba(25,118,210,0.28)',
    bgcolor: '#ffffff',
    '&:hover': {
      bgcolor: '#ffffff',
      borderColor: 'rgba(25,118,210,0.4)',
    },
  } as const;

  const solidActionButtonSx = {
    ...actionButtonSx,
    bgcolor: '#ffffff',
    color: 'text.primary',
    border: '1px solid rgba(15,23,42,0.08)',
    '&:hover': {
      bgcolor: '#ffffff',
      borderColor: 'rgba(15,23,42,0.16)',
      boxShadow: 'none',
    },
  } as const;

  const groupedSectionBorderRadius = '10px';
  const groupedSectionHeaderVerticalPadding = 0.8;
  const groupedSectionHeaderFontSize = '0.82rem';
  const dialogPaperSx = {
    bgcolor: '#ffffff',
    backgroundImage: 'none',
  } as const;

  const embeddedHeaderSx = embedded
    ? {
        p: 0,
        mb: 0,
        borderRadius: 0,
        backgroundColor: '#ffffff',
        backgroundImage: 'none',
        boxShadow: 'none',
      }
    : {
        p: { xs: 0.75, sm: 1 },
        mb: 1.5,
        borderRadius: '10px',
        backgroundColor: '#ffffff',
        backgroundImage: 'none',
        boxShadow: 'none',
      };

  const content = (
    <>
        <Paper
          elevation={0}
          sx={embeddedHeaderSx}
        >
          {embedded ? (
            <Box sx={{ pt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.75, flexWrap: 'wrap' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                  {modeButtons.map((button) => (
                    <Button
                      key={button.key}
                      size="small"
                      onClick={() => setViewMode(button.key)}
                      sx={viewMode === button.key ? embeddedActiveControlButtonSx : embeddedControlButtonSx}
                    >
                      {button.label}
                    </Button>
                  ))}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {[
                    ['归档', `${groupedPhotoCount}`],
                    ['待处理', `${unassociatedPhotoCount}`],
                    ['总数', `${photos.length}`],
                  ].map(([label, value]) => (
                    <Box key={label} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.35 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                        {label}
                      </Typography>
                      <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1 }}>
                        {value}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.75, flexWrap: 'wrap' }}>
                {selectMode && displayPhotos.length > 0 && (
                  <Chip
                    label={`${selectedIds.size}/${displayPhotos.length} 已选`}
                    color="primary"
                    variant="outlined"
                    size="small"
                    sx={{ height: 24, borderColor: 'rgba(25,118,210,0.35)', bgcolor: 'rgba(25,118,210,0.04)' }}
                  />
                )}
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<CloudUpload />}
                  onClick={() => setUploadOpen(true)}
                  sx={actionButtonSx}
                >
                  上传图片
                </Button>
                {!selectMode && photos.length > 0 && (
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<ExtractIcon />}
                    onClick={() => {
                      setSelectMode(true);
                      setSelectedIds(new Set());
                    }}
                    sx={solidActionButtonSx}
                  >
                    选择并提取
                  </Button>
                )}
                {selectMode && (
                  <>
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<ExtractIcon />}
                      onClick={openBatchExtract}
                      disabled={selectedIds.size === 0}
                      color="primary"
                      sx={actionButtonSx}
                    >
                      开始提取 {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                    </Button>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={toggleAll}
                      disabled={displayPhotos.length === 0}
                      sx={solidActionButtonSx}
                    >
                      {selectedIds.size === displayPhotos.length && displayPhotos.length > 0 ? '取消全选' : '全选'}
                    </Button>
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<Restore />}
                      onClick={() => { setSelectedIds(new Set()); }}
                      disabled={selectedIds.size === 0}
                      sx={solidActionButtonSx}
                    >
                      清空
                    </Button>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
                      sx={solidActionButtonSx}
                    >
                      完成
                    </Button>
                  </>
                )}
              </Box>
            </Box>
          ) : (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                    {title}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                    {[
                      ['归档', `${groupedPhotoCount}`],
                      ['待处理', `${unassociatedPhotoCount}`],
                      ['总数', `${photos.length}`],
                    ].map(([label, value]) => (
                      <Box
                        key={label}
                        sx={{
                          px: 1,
                          py: 0.5,
                          borderRadius: '999px',
                          border: '1px solid rgba(15,23,42,0.08)',
                          background: '#ffffff',
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 0.5,
                        }}
                      >
                        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                          {label}
                        </Typography>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1 }}>
                          {value}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Box>

              <Box sx={{ mt: 0.9, pt: 0.9, borderTop: '1px solid rgba(15,23,42,0.08)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 0.75 }}>
                  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {modeButtons.map((button) => (
                <Button
                  key={button.key}
                  size="small"
                  variant={viewMode === button.key ? 'contained' : 'outlined'}
                  onClick={() => setViewMode(button.key)}
                  sx={actionButtonSx}
                >
                  {button.label}
                </Button>
              ))}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
                    {selectMode && displayPhotos.length > 0 && (
                      <Chip
                        label={`${selectedIds.size}/${displayPhotos.length} 已选`}
                        color="primary"
                        variant="outlined"
                        size="small"
                        sx={{ height: 24, borderColor: 'rgba(25,118,210,0.35)', bgcolor: 'rgba(25,118,210,0.04)' }}
                      />
                    )}
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<CloudUpload />}
                      onClick={() => setUploadOpen(true)}
                      sx={actionButtonSx}
                    >
                      上传图片
                    </Button>
                    {!selectMode && photos.length > 0 && (
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<ExtractIcon />}
                        onClick={() => {
                          setSelectMode(true);
                          setSelectedIds(new Set());
                        }}
                        sx={solidActionButtonSx}
                      >
                        选择并提取
                      </Button>
                    )}
                    {selectMode && (
                      <>
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<ExtractIcon />}
                          onClick={openBatchExtract}
                          disabled={selectedIds.size === 0}
                          color="primary"
                          sx={actionButtonSx}
                        >
                          开始提取 {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                        </Button>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={toggleAll}
                          disabled={displayPhotos.length === 0}
                          sx={solidActionButtonSx}
                        >
                          {selectedIds.size === displayPhotos.length && displayPhotos.length > 0 ? '取消全选' : '全选'}
                        </Button>
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<Restore />}
                          onClick={() => { setSelectedIds(new Set()); }}
                          disabled={selectedIds.size === 0}
                          sx={solidActionButtonSx}
                        >
                          清空
                        </Button>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
                          sx={solidActionButtonSx}
                        >
                          完成
                        </Button>
                      </>
                    )}
                  </Box>
                </Box>
              </Box>
            </>
          )}
        </Paper>

        {/* Content */}
        {photosLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={28} />
          </Box>
        ) : viewMode === 'receiptDate' ? (
          receiptsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <PhotoReceiptGroupedView
              groups={receiptDateGroups}
              ungroupedPhotos={receiptUngroupedPhotos}
              onPhotoClick={openLightbox}
              onDelete={(id) => handleDelete(id)}
              onExtract={handleExtractPhoto}
              onOpenReceipt={handleOpenPhotoReceipt}
              selectedPhotoIds={selectedIds}
              onToggleSelect={selectMode ? toggleSelect : undefined}
            />
          )
        ) : viewMode !== 'grid' ? (
          grouped.map((group) => {
            return (
              <Paper key={group.id} sx={{ mb: '3px', borderRadius: groupedSectionBorderRadius, overflow: 'hidden' }}>
                <Box sx={{ px: 3, py: groupedSectionHeaderVerticalPadding, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                  <Typography sx={{ fontSize: groupedSectionHeaderFontSize, fontWeight: 600, lineHeight: 1.2 }}>
                    {group.label}
                  </Typography>
                </Box>
                <Box sx={{ p: '5px', display: 'grid', columnGap: '8px', rowGap: 2, gridTemplateColumns: gridCols }}>
                  {group.photos.map((photo) => (
                    <PhotoCard
                      key={photo.id}
                      photo={photo}
                      onClick={() => openLightbox(photo)}
                      onDelete={() => handleDelete(photo.id)}
                      onExtract={handleExtractPhoto}
                      onOpenReceipt={handleOpenPhotoReceipt}
                      isSelected={selectMode && selectedIds.has(photo.id)}
                      onToggleSelect={selectMode ? toggleSelect : undefined}
                    />
                  ))}
                </Box>
              </Paper>
            );
          })
        ) : (
          <Box sx={{ display: 'grid', columnGap: '8px', rowGap: 2, gridTemplateColumns: gridCols }}>
            {pagedPhotos.map((photo) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                onClick={() => openLightbox(photo)}
                onDelete={() => handleDelete(photo.id)}
                onExtract={handleExtractPhoto}
                onOpenReceipt={handleOpenPhotoReceipt}
                isSelected={selectMode && selectedIds.has(photo.id)}
                onToggleSelect={selectMode ? toggleSelect : undefined}
              />
            ))}
          </Box>
        )}

        {/* Pagination */}
        {(viewMode === 'grid') && displayPhotos.length > itemsPerPage && (
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
        {!photosLoading && displayPhotos.length === 0 && (
          <Paper sx={{ p: 6, textAlign: 'center', borderRadius: groupedSectionBorderRadius }}>
            {photos.length === 0 ? (
              <>
                <Typography variant="h5" sx={{ mb: 2 }}>还没有照片</Typography>
                <Typography variant="body1" sx={{ color: 'text.secondary' }}>
                  把票据照片先收进票夹，后面才能做提取、整理和按时间归档
                </Typography>
              </>
            ) : (
              <>
                <Typography variant="h5" sx={{ mb: 2 }}>当前视图暂无照片</Typography>
                <Typography variant="body1" sx={{ color: 'text.secondary' }}>
                  已有照片存在，但当前分组或视图下没有可显示的内容。
                </Typography>
              </>
            )}
          </Paper>
        )}

      {/* Upload Dialog */}
      <Dialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: dialogPaperSx }}
      >
        <DialogTitle>上传照片</DialogTitle>
        <DialogContent>
          <PhotoUploader onComplete={handleUploadComplete} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(pendingDeletePhotoId)}
        onClose={handleCancelDelete}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: dialogPaperSx }}
      >
        <DialogTitle>删除照片</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            确定要删除这张照片吗？删除后无法恢复。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete}>取消</Button>
          <Button color="error" variant="contained" onClick={handleConfirmDelete}>删除</Button>
        </DialogActions>
      </Dialog>

      {/* Lightbox */}
      {lightbox ? (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.initialIndex}
          groups={lightbox.groups}
          initialGroupIndex={lightbox.initialGroupIndex}
          open
          onClose={closeLightbox}
        />
      ) : null}

      {/* Batch Extract Dialog */}
      <BatchExtractDialog
        open={batchExtractOpen}
        selectedPhotoIds={Array.from(selectedIds)}
        selectedPhotos={selectedPhotos}
        onClose={() => { setBatchExtractOpen(false); setSelectedIds(new Set()); loadPhotos(); }}
        onSaved={handleBatchExtractSaved}
      />
    </>
  );

  return embedded ? (
    <Box sx={{ backgroundColor: '#ffffff', borderRadius: '0 0 10px 10px', px: { xs: 0.75, sm: 1 }, pb: 1.25 }}>
      {content}
    </Box>
  ) : (
    <Box sx={{ minHeight: '100vh', bgcolor: 'rgba(244, 247, 251, 0.5)', py: 4 }}>
      <Container maxWidth="lg">
        {content}
      </Container>
    </Box>
  );
};

export default PhotoAlbumPage;
