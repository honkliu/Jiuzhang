import React, { useState, useEffect, useCallback } from 'react';
import {
  Box as MuiBox, Typography, Paper, Container, Button, Chip,
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
import { useLanguage, type Language } from '@/i18n/LanguageContext';

// Work around TS2590 (“union type too complex”) from MUI Box typings in some TS versions.
const Box = MuiBox as any;
const BoxAny = Box;

interface PhotoAlbumPageProps {
  embedded?: boolean;
  title?: string;
  onOpenReceipt?: (receipt: ReceiptDto) => void;
  onReceiptsChanged?: () => void;
  loadPhotosOverride?: () => Promise<PhotoDto[]>;
  deletePhotoOverride?: (id: string) => Promise<void>;
  showUpload?: boolean;
  showExtraction?: boolean;
  showReceiptGrouping?: boolean;
  showStats?: boolean;
  showDelete?: boolean;
  viewModes?: ViewMode[];
  emptyTitle?: string;
  emptyDescription?: string;
  organizeGeneratedImages?: boolean;
}

type ViewMode = 'grid' | 'uploaded' | 'captured' | 'receiptDate';
type PhotoGroup = { id: string; label: string; photos: PhotoDto[] };
type PhotoCollectionLightboxState = {
  images: string[];
  initialIndex: number;
  groups: LightboxGroup[];
  initialGroupIndex: number;
  initialGeneratedUrl?: string | null;
} | null;

const getImagePath = (url: string) => {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url.split(/[?#]/)[0];
  }
};

const getImmediateGeneratedParentPath = (url: string) => {
  const path = getImagePath(url);
  const slashIndex = path.lastIndexOf('/');
  const directory = slashIndex >= 0 ? path.slice(0, slashIndex + 1) : '';
  const fileName = slashIndex >= 0 ? path.slice(slashIndex + 1) : path;
  const dotIndex = fileName.lastIndexOf('.');
  const stem = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex >= 0 ? fileName.slice(dotIndex) : '';
  const parentStem = stem.replace(/_\d+$/, '');

  if (parentStem === stem) {
    return null;
  }

  return `${directory}${parentStem}${extension}`;
};

const buildPhotoPathMap = (items: PhotoDto[]) => {
  const photoByPath = new Map<string, PhotoDto>();
  for (const photo of items) {
    const imageUrl = photoService.getImageUrl(photo);
    if (imageUrl) {
      photoByPath.set(getImagePath(imageUrl), photo);
    }
  }

  return photoByPath;
};

const getFirstLayerPhotos = (items: PhotoDto[], allItems: PhotoDto[] = items) => {
  const photoByPath = buildPhotoPathMap(allItems);
  return items.filter((photo) => {
    const imageUrl = photoService.getImageUrl(photo);
    const parentPath = imageUrl ? getImmediateGeneratedParentPath(imageUrl) : null;
    return !parentPath || !photoByPath.has(parentPath);
  });
};

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

const toDateLabel = (key: string, language: Language) => {
  const [year, month, day] = key.split('-').map(Number);
  return language === 'zh'
    ? `${year}年${month}月${day}日`
    : new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
};

const buildStandardGroups = (
  items: PhotoDto[],
  accessor: (photo: PhotoDto) => string | undefined,
  undatedLabel: string,
  language: Language,
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
      label: key === 'undated' ? undatedLabel : toDateLabel(key, language),
      photos: groupPhotos,
    }));
};

const buildReceiptDateGroups = (
  items: PhotoDto[],
  receipts: ReceiptDto[],
  language: Language,
  receiptDatePendingLabel: string,
  receiptGroupSummaryTemplate: string,
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
        label: toDateLabel(key, language),
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
        label: receiptDatePendingLabel,
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
      summary: receiptGroupSummaryTemplate
        .replace('{photos}', String(group.photos.length))
        .replace('{receipts}', String(group.receipts.length)),
    }));

  return { groups: sortedGroups, ungroupedPhotos };
};

const PhotoAlbumPage: React.FC<PhotoAlbumPageProps> = ({
  embedded = false,
  title,
  onOpenReceipt,
  onReceiptsChanged,
  loadPhotosOverride,
  deletePhotoOverride,
  showUpload = true,
  showExtraction = true,
  showReceiptGrouping = true,
  showStats = true,
  showDelete = true,
  viewModes,
  emptyTitle,
  emptyDescription,
  organizeGeneratedImages = false,
}) => {
  const { t, language } = useLanguage();
  const displayTitle = title ?? t('photos.title');
  const displayEmptyTitle = emptyTitle ?? t('photos.defaultEmptyTitle');
  const displayEmptyDescription = emptyDescription ?? t('photos.defaultEmptyDescription');
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
      setGrouped(buildStandardGroups(photos, photo => photo.uploadedAt, t('photos.undatedUploaded'), language));
      return;
    }

    if (viewMode === 'captured') {
      setGrouped(buildStandardGroups(photos, photo => photo.capturedDate, t('photos.undatedCaptured'), language));
      return;
    }

    if (viewMode === 'receiptDate' && showReceiptGrouping) {
      const receiptGroups = buildReceiptDateGroups(
        photos,
        receipts,
        language,
        t('photos.receiptDatePending'),
        t('photos.receiptGroupSummary'),
      );
      setReceiptDateGroups(receiptGroups.groups);
      setReceiptUngroupedPhotos(receiptGroups.ungroupedPhotos);
      return;
    }

    setGrouped([]);
  }, [photos, receipts, viewMode, showReceiptGrouping, t, language]);

  const loadPhotos = useCallback(async () => {
    try {
      setPhotosLoading(true);
      setReceiptsLoading(true);
      let fetchedPhotos: PhotoDto[];
      if (loadPhotosOverride) {
        fetchedPhotos = await loadPhotosOverride();
      } else if (dateFilter === 'month') {
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

    if (showReceiptGrouping) {
      try {
        const fetchedReceipts = await receiptService.list();
        setReceipts(fetchedReceipts);
      } catch (e) {
        console.error('Failed to load receipts for photo grouping:', e);
        setReceipts([]);
      } finally {
        setReceiptsLoading(false);
      }
    } else {
      setReceipts([]);
      setReceiptsLoading(false);
    }
  }, [dateFilter, loadPhotosOverride, showReceiptGrouping]);

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
      if (deletePhotoOverride) {
        await deletePhotoOverride(pendingDeletePhotoId);
      } else {
        await photoService.remove(pendingDeletePhotoId);
      }
      setPendingDeletePhotoId(null);
      loadPhotos();
    } catch (e) {
      console.error('Failed to delete:', e);
    }
  }, [deletePhotoOverride, loadPhotos, pendingDeletePhotoId]);

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

  // Flat source list keeps all photos so ImageLightbox can build generation trees.
  const sourceDisplayPhotos = viewMode === 'grid'
    ? photos
    : viewMode === 'receiptDate' && showReceiptGrouping
      ? Array.from(new Map(
        [...receiptDateGroups.flatMap(group => group.photos), ...receiptUngroupedPhotos]
          .map(photo => [photo.id, photo]),
      ).values())
      : grouped.flatMap(group => group.photos);
  const displayPhotos = organizeGeneratedImages
    ? getFirstLayerPhotos(sourceDisplayPhotos, photos)
    : sourceDisplayPhotos;
  const visibleGrouped = organizeGeneratedImages
    ? grouped
      .map(group => ({ ...group, photos: getFirstLayerPhotos(group.photos, photos) }))
      .filter(group => group.photos.length > 0)
    : grouped;

  const closeLightbox = useCallback(() => {
    setLightbox(null);
  }, []);

  const openLightbox = useCallback((photo: PhotoDto) => {
    const contextPhotos = sourceDisplayPhotos;
    if (contextPhotos.length === 0) {
      return;
    }

    const photoByPath = new Map<string, PhotoDto>();
    for (const contextPhoto of contextPhotos) {
      const imageUrl = photoService.getImageUrl(contextPhoto);
      if (imageUrl) {
        photoByPath.set(getImagePath(imageUrl), contextPhoto);
      }
    }

    const selectedImageUrl = photoService.getImageUrl(photo);
    const selectedParentPath = selectedImageUrl ? getImmediateGeneratedParentPath(selectedImageUrl) : null;
    const selectedParentPhoto = organizeGeneratedImages && selectedParentPath
      ? photoByPath.get(selectedParentPath)
      : undefined;
    const selectedGroupPhoto = selectedParentPhoto ?? photo;
    const initialGeneratedUrl = selectedParentPhoto ? selectedImageUrl : null;

    const lightboxPhotos = organizeGeneratedImages
      ? contextPhotos.filter((contextPhoto) => {
        const imageUrl = photoService.getImageUrl(contextPhoto);
        const parentPath = imageUrl ? getImmediateGeneratedParentPath(imageUrl) : null;
        return !parentPath || !photoByPath.has(parentPath);
      })
      : contextPhotos;

    const images = lightboxPhotos
      .map((contextPhoto) => photoService.getImageUrl(contextPhoto))
      .filter((url): url is string => Boolean(url));
    const groups: LightboxGroup[] = [];
    lightboxPhotos.forEach((contextPhoto) => {
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

    const selectedGroupUrl = photoService.getImageUrl(selectedGroupPhoto);
    setLightbox({
      images,
      initialIndex: Math.max(0, selectedGroupUrl ? images.findIndex((item) => item === selectedGroupUrl) : 0),
      groups,
      initialGroupIndex: Math.max(0, groups.findIndex((item) => item.messageId === selectedGroupPhoto.id)),
      initialGeneratedUrl,
    });
  }, [sourceDisplayPhotos, organizeGeneratedImages, photos]);

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

  const configuredViewModes = viewModes ?? ['grid', 'captured', ...(showReceiptGrouping ? ['receiptDate' as const] : [])];
  const allModeButtons: Array<{ key: ViewMode; label: string }> = [
    { key: 'grid', label: t('photos.view.all') },
    { key: 'uploaded', label: t('photos.view.uploaded') },
    { key: 'captured', label: t('photos.view.captured') },
    { key: 'receiptDate', label: t('photos.view.receiptDate') },
  ];
  const modeButtons = allModeButtons.filter((button) => configuredViewModes.includes(button.key));

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
                {showStats && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {[
                      [t('photos.stats.archived'), `${groupedPhotoCount}`],
                      [t('photos.stats.pending'), `${unassociatedPhotoCount}`],
                      [t('photos.stats.total'), `${photos.length}`],
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
                )}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.75, flexWrap: 'wrap' }}>
                {selectMode && displayPhotos.length > 0 && (
                  <Chip
                    label={t('photos.selectedCount').replace('{selected}', String(selectedIds.size)).replace('{total}', String(displayPhotos.length))}
                    color="primary"
                    variant="outlined"
                    size="small"
                    sx={{ height: 24, borderColor: 'rgba(25,118,210,0.35)', bgcolor: 'rgba(25,118,210,0.04)' }}
                  />
                )}
                {showUpload && (
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<CloudUpload />}
                    onClick={() => setUploadOpen(true)}
                    sx={actionButtonSx}
                  >
                    {t('photos.upload')}
                  </Button>
                )}
                {showExtraction && !selectMode && photos.length > 0 && (
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
                    {t('photos.selectExtract')}
                  </Button>
                )}
                {showExtraction && selectMode && (
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
                      {t('photos.startExtract').replace('{count}', selectedIds.size > 0 ? `(${selectedIds.size})` : '')}
                    </Button>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={toggleAll}
                      disabled={displayPhotos.length === 0}
                      sx={solidActionButtonSx}
                    >
                      {selectedIds.size === displayPhotos.length && displayPhotos.length > 0 ? t('photos.cancelSelectAll') : t('photos.selectAll')}
                    </Button>
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<Restore />}
                      onClick={() => { setSelectedIds(new Set()); }}
                      disabled={selectedIds.size === 0}
                      sx={solidActionButtonSx}
                    >
                      {t('photos.clearSelection')}
                    </Button>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
                      sx={solidActionButtonSx}
                    >
                      {t('photos.done')}
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
                    {displayTitle}
                  </Typography>
                  {showStats && (
                    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                      {[
                        [t('photos.stats.archived'), `${groupedPhotoCount}`],
                        [t('photos.stats.pending'), `${unassociatedPhotoCount}`],
                        [t('photos.stats.total'), `${photos.length}`],
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
                  )}
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
                        label={t('photos.selectedCount').replace('{selected}', String(selectedIds.size)).replace('{total}', String(displayPhotos.length))}
                        color="primary"
                        variant="outlined"
                        size="small"
                        sx={{ height: 24, borderColor: 'rgba(25,118,210,0.35)', bgcolor: 'rgba(25,118,210,0.04)' }}
                      />
                    )}
                    {showUpload && (
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<CloudUpload />}
                        onClick={() => setUploadOpen(true)}
                        sx={actionButtonSx}
                      >
                        {t('photos.upload')}
                      </Button>
                    )}
                    {showExtraction && !selectMode && photos.length > 0 && (
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
                        {t('photos.selectExtract')}
                      </Button>
                    )}
                    {showExtraction && selectMode && (
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
                          {t('photos.startExtract').replace('{count}', selectedIds.size > 0 ? `(${selectedIds.size})` : '')}
                        </Button>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={toggleAll}
                          disabled={displayPhotos.length === 0}
                          sx={solidActionButtonSx}
                        >
                          {selectedIds.size === displayPhotos.length && displayPhotos.length > 0 ? t('photos.cancelSelectAll') : t('photos.selectAll')}
                        </Button>
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<Restore />}
                          onClick={() => { setSelectedIds(new Set()); }}
                          disabled={selectedIds.size === 0}
                          sx={solidActionButtonSx}
                        >
                          {t('photos.clearSelection')}
                        </Button>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
                          sx={solidActionButtonSx}
                        >
                          {t('photos.done')}
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
        ) : viewMode === 'receiptDate' && showReceiptGrouping ? (
          receiptsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <PhotoReceiptGroupedView
              groups={receiptDateGroups}
              ungroupedPhotos={receiptUngroupedPhotos}
              onPhotoClick={openLightbox}
              onDelete={showDelete ? (id) => handleDelete(id) : undefined}
              onExtract={handleExtractPhoto}
              onOpenReceipt={handleOpenPhotoReceipt}
              selectedPhotoIds={selectedIds}
              onToggleSelect={selectMode ? toggleSelect : undefined}
            />
          )
        ) : viewMode !== 'grid' ? (
          visibleGrouped.map((group) => {
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
                      onDelete={showDelete ? () => handleDelete(photo.id) : undefined}
                      onExtract={showExtraction ? handleExtractPhoto : undefined}
                      onOpenReceipt={showReceiptGrouping ? handleOpenPhotoReceipt : undefined}
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
                onDelete={showDelete ? () => handleDelete(photo.id) : undefined}
                onExtract={showExtraction ? handleExtractPhoto : undefined}
                onOpenReceipt={showReceiptGrouping ? handleOpenPhotoReceipt : undefined}
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
                <Typography variant="h5" sx={{ mb: 2 }}>{displayEmptyTitle}</Typography>
                <Typography variant="body1" sx={{ color: 'text.secondary' }}>
                  {displayEmptyDescription}
                </Typography>
              </>
            ) : (
              <>
                <Typography variant="h5" sx={{ mb: 2 }}>{t('photos.emptyCurrentTitle')}</Typography>
                <Typography variant="body1" sx={{ color: 'text.secondary' }}>
                  {t('photos.emptyCurrentDescription')}
                </Typography>
              </>
            )}
          </Paper>
        )}

      {/* Upload Dialog */}
      {showUpload && (
        <Dialog
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          maxWidth="sm"
          fullWidth
          PaperProps={{ sx: dialogPaperSx }}
        >
          <DialogTitle>{t('photos.uploadDialogTitle')}</DialogTitle>
          <DialogContent>
            <PhotoUploader onComplete={handleUploadComplete} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setUploadOpen(false)}>{t('photos.close')}</Button>
          </DialogActions>
        </Dialog>
      )}

      <Dialog
        open={Boolean(pendingDeletePhotoId)}
        onClose={handleCancelDelete}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: dialogPaperSx }}
      >
        <DialogTitle>{t('photos.deleteTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t('photos.deleteConfirm')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete}>{t('common.cancel')}</Button>
          <Button color="error" variant="contained" onClick={handleConfirmDelete}>{t('photos.delete')}</Button>
        </DialogActions>
      </Dialog>

      {/* Lightbox */}
      {lightbox ? (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.initialIndex}
          groups={lightbox.groups}
          initialGroupIndex={lightbox.initialGroupIndex}
          initialGeneratedUrl={lightbox.initialGeneratedUrl}
          open
          onClose={closeLightbox}
        />
      ) : null}

      {/* Batch Extract Dialog */}
      {showExtraction && (
        <BatchExtractDialog
          open={batchExtractOpen}
          selectedPhotoIds={Array.from(selectedIds)}
          selectedPhotos={selectedPhotos}
          onClose={() => { setBatchExtractOpen(false); setSelectedIds(new Set()); loadPhotos(); }}
          onSaved={handleBatchExtractSaved}
        />
      )}
    </>
  );

  return embedded ? (
    <BoxAny sx={{ backgroundColor: '#ffffff', borderRadius: '0 0 10px 10px', px: { xs: 0.75, sm: 1 }, pb: 1.25 }}>
      {content}
    </BoxAny>
  ) : (
    <BoxAny sx={{ minHeight: '100vh', bgcolor: 'rgba(244, 247, 251, 0.5)', py: 4 }}>
      <Container maxWidth="lg">
        {content}
      </Container>
    </BoxAny>
  );
};

export default PhotoAlbumPage;
