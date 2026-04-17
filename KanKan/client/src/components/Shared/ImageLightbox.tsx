import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, ButtonBase, CircularProgress, Dialog, DialogContent, IconButton, Modal, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import TuneIcon from '@mui/icons-material/Tune';
import RemoveIcon from '@mui/icons-material/Remove';
import AddIcon from '@mui/icons-material/Add';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { imageGenerationService } from '@/services/imageGeneration.service';
import { avatarService } from '@/services/avatar.service';
import { useLanguage } from '@/i18n/LanguageContext';
import { AvatarQuickPicker } from '@/components/Avatar/AvatarQuickPicker';
import { PromptComposer, type SelectedPrompt } from '@/components/Avatar/PromptComposer';
import { ImageHoverPreview } from '@/components/Shared/ImageHoverPreview';

const BoxAny = Box as any;

interface LightboxGroup {
  sourceUrl: string;
  messageId: string;
  canEdit: boolean;
}

interface ScopedSelectableImage {
  key: string;
  url: string;
  label: string;
  kind: 'source' | 'edit' | 'standing';
}

interface ImageLightboxProps {
  images: string[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
  groups?: LightboxGroup[];
  initialGroupIndex?: number;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  images,
  initialIndex,
  open,
  onClose,
  groups,
  initialGroupIndex,
}) => {
  const { t, language } = useLanguage();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isHoverCapable = useMediaQuery('(hover: hover) and (pointer: fine)');
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [activeGroupIndex, setActiveGroupIndex] = useState(initialGroupIndex ?? 0);
  const [prompt, setPrompt] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [selectedReferenceImageUrl, setSelectedReferenceImageUrl] = useState<string | null>(null);
  const [selectedPrompts, setSelectedPrompts] = useState<SelectedPrompt[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedByGroup, setGeneratedByGroup] = useState<Record<string, string[]>>({});
  const [standingImageUrls, setStandingImageUrls] = useState<string[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [showPromptTools, setShowPromptTools] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fitZoom, setFitZoom] = useState(1);
  const [isImageReady, setIsImageReady] = useState(false);
  const [renderedImage, setRenderedImage] = useState('');
  const [isUiHidden, setIsUiHidden] = useState(false);
  const [thumbnailMode, setThumbnailMode] = useState<'sources' | 'edits'>('sources');
  const [selectedEditIndexByGroup, setSelectedEditIndexByGroup] = useState<Record<string, number | null>>({});
  const [showSourceInEdits, setShowSourceInEdits] = useState(true);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [canScrollThumbnailsLeft, setCanScrollThumbnailsLeft] = useState(false);
  const [canScrollThumbnailsRight, setCanScrollThumbnailsRight] = useState(false);
  const dragStateRef = useRef({
    isDragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
  });
  const touchStateRef = useRef({
    mode: 'none' as 'none' | 'pan' | 'pinch',
    moved: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    startDistance: 0,
    startZoom: 1,
    startCenterX: 0,
    startCenterY: 0,
  });
  const suppressTapToggleRef = useRef(false);
  const hasInitializedZoomRef = useRef(false);
  const wasOpenRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const thumbnailRefs = useRef<(HTMLDivElement | null)[]>([]);
  const thumbnailStripRef = useRef<HTMLDivElement | null>(null);
  const suppressSelectedImageClearUntilRef = useRef(0);
  const isIos = /iP(ad|hone|od)/i.test(navigator.userAgent);

  const hasGroups = Boolean(groups && groups.length > 0);
  const activeGroup = hasGroups ? groups![Math.min(activeGroupIndex, groups!.length - 1)] : null;
  const sourceImages = useMemo(() => (hasGroups ? groups!.map((group) => group.sourceUrl) : images), [groups, hasGroups, images]);
  const getImageDisplayName = useCallback((url: string) => {
    const fileName = url.split('?')[0].split('/').filter(Boolean).pop() ?? url;
    const decoded = decodeURIComponent(fileName);
    return decoded.replace(/\.[^.]+$/, '');
  }, []);

  const scopedSelectableImages = useMemo(() => {
    if (!groups?.length) {
      return [] as ScopedSelectableImage[];
    }

    const seen = new Set<string>();
    const results: ScopedSelectableImage[] = [];
    const append = (url: string, kind: 'source' | 'edit' | 'standing', scopeKey: string) => {
      if (!url || seen.has(url)) {
        return;
      }

      seen.add(url);
      results.push({
        key: `${scopeKey}:${kind}:${url}`,
        url,
        label: getImageDisplayName(url),
        kind,
      });
    };

    for (const group of groups) {
      append(group.sourceUrl, 'source', group.messageId);
      for (const url of generatedByGroup[group.messageId] || []) {
        append(url, 'edit', group.messageId);
      }
    }

    for (const url of standingImageUrls) {
      append(url, 'standing', 'standing');
    }

    return results;
  }, [generatedByGroup, getImageDisplayName, groups, standingImageUrls]);

  const activeGeneratedUrls = useMemo(() => {
    if (!activeGroup) return [];
    return generatedByGroup[activeGroup.messageId] || [];
  }, [activeGroup, generatedByGroup]);

  const activeImages = useMemo(() => {
    if (!hasGroups) return images;
    return thumbnailMode === 'edits' ? activeGeneratedUrls : sourceImages;
  }, [activeGeneratedUrls, hasGroups, images, sourceImages, thumbnailMode]);

  const navigableImageCount = useMemo(() => {
    if (!hasGroups) return activeImages.length;
    if (thumbnailMode === 'edits') {
      return activeGroup ? activeGeneratedUrls.length + 1 : activeGeneratedUrls.length;
    }
    return sourceImages.length;
  }, [activeGeneratedUrls.length, activeGroup, activeImages.length, hasGroups, sourceImages.length, thumbnailMode]);

  const canToggleToEdits = hasGroups && activeGeneratedUrls.length > 0;
  const currentEditIndex = activeGroup ? (selectedEditIndexByGroup[activeGroup.messageId] ?? null) : null;
  const selectedThumbnailIndex = hasGroups
    ? (thumbnailMode === 'sources'
      ? activeGroupIndex
      : ((showSourceInEdits || currentEditIndex === null) ? 0 : currentEditIndex))
    : currentIndex;
  const thumbnailBottomInset = 'env(safe-area-inset-bottom)';
  const thumbnailCornerRadius = '2px';
  const groupedThumbnailSize = isMobile ? 40 : 48;
  const plainThumbnailSize = isMobile ? 46 : 54;
  const thumbnailStripButtonSize = 28;
  const thumbnailStripControlIconSize = 14;
  const normalizeZoom = (nextZoom: number, fallbackZoom = fitZoom) => {
    if (!Number.isFinite(nextZoom) || nextZoom <= 0) {
      return Number(fallbackZoom.toFixed(2));
    }

    return Number(nextZoom.toFixed(2));
  };
  const zoomPercent = Math.round(zoom * 100);
  const actionControlHeight = isMobile ? 35 : 37;
  const pickerPreviewBehavior = {
    openOnHover: isHoverCapable,
    openOnLongPress: !isHoverCapable,
    openOnTap: false,
  };

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }

    if (wasOpenRef.current) {
      return;
    }

    wasOpenRef.current = true;
    hasInitializedZoomRef.current = false;
    setZoom(1);
    setCurrentIndex(initialIndex);
    setActiveGroupIndex(initialGroupIndex ?? 0);
    // zoom will be set when the image loads to reflect fit-to-view vs natural size
    setIsUiHidden(false);
    setThumbnailMode('sources');
    setPanOffset({ x: 0, y: 0 });
    if (hasGroups) {
      setCurrentIndex(0);
    }
    setIsImageReady(false);
    setRenderedImage('');
    setShowSourceInEdits(true);
    setImagePickerOpen(false);
    setSelectedReferenceImageUrl(null);
  }, [open, initialIndex, initialGroupIndex, hasGroups]);

  useEffect(() => {
    if (!open || !hasGroups || !groups) return;
    const pending = groups.filter((group) => generatedByGroup[group.messageId] === undefined);
    if (pending.length === 0) return;

    let cancelled = false;
    const fetchAll = async () => {
      await Promise.all(pending.map(async (group) => {
        try {
          const result = await imageGenerationService.getResults(group.messageId, 'chat_image');
          const urls = Array.isArray(result.results) ? (result.results as string[]) : [];
          if (!cancelled) {
            setGeneratedByGroup((prev) => ({ ...prev, [group.messageId]: urls }));
          }
        } catch {
          if (!cancelled) {
            setGeneratedByGroup((prev) => ({ ...prev, [group.messageId]: prev[group.messageId] ?? [] }));
          }
        }
      }));
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [open, hasGroups, groups, generatedByGroup]);

  useEffect(() => {
    if (!open || !hasGroups || standingImageUrls.length > 0) return;

    let cancelled = false;
    avatarService.getStandingFiles()
      .then((items) => {
        if (cancelled) return;
        setStandingImageUrls(items.map((item) => item.imageUrl).filter(Boolean));
      })
      .catch(() => {
        if (!cancelled) {
          setStandingImageUrls([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, hasGroups, standingImageUrls.length]);

  const updateThumbnailScrollState = useCallback(() => {
    const strip = thumbnailStripRef.current;
    if (!strip) {
      setCanScrollThumbnailsLeft(false);
      setCanScrollThumbnailsRight(false);
      return;
    }

    const maxScrollLeft = Math.max(0, strip.scrollWidth - strip.clientWidth);
    setCanScrollThumbnailsLeft(strip.scrollLeft > 2);
    setCanScrollThumbnailsRight(strip.scrollLeft < maxScrollLeft - 2);
  }, []);

  const scrollThumbnailStripBy = useCallback((direction: -1 | 1) => {
    const strip = thumbnailStripRef.current;
    if (!strip) return;

    const delta = Math.max(120, Math.floor(strip.clientWidth * 0.55)) * direction;
    strip.scrollTo({ left: strip.scrollLeft + delta, behavior: 'smooth' });
    requestAnimationFrame(updateThumbnailScrollState);
  }, [updateThumbnailScrollState]);

  useEffect(() => {
    const strip = thumbnailStripRef.current;
    const thumbnail = thumbnailRefs.current[selectedThumbnailIndex];
    if (!strip || !thumbnail) return;

    const targetLeft = thumbnail.offsetLeft - (strip.clientWidth - thumbnail.clientWidth) / 2;
    const maxScrollLeft = Math.max(0, strip.scrollWidth - strip.clientWidth);
    const nextScrollLeft = Math.max(0, Math.min(targetLeft, maxScrollLeft));

    strip.scrollTo({ left: nextScrollLeft, behavior: 'smooth' });
    requestAnimationFrame(updateThumbnailScrollState);
  }, [selectedThumbnailIndex, thumbnailMode, hasGroups, updateThumbnailScrollState]);

  useEffect(() => {
    if (!open) return;

    const strip = thumbnailStripRef.current;
    if (!strip) return;

    const handleScroll = () => updateThumbnailScrollState();
    handleScroll();
    strip.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      strip.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [open, thumbnailMode, hasGroups, updateThumbnailScrollState]);

  useEffect(() => {
    if (!hasGroups || thumbnailMode !== 'edits') return;
    setPanOffset({ x: 0, y: 0 });
  }, [currentIndex, hasGroups, thumbnailMode]);

  const handleZoomReset = () => {
    setZoom(fitZoom);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleZoomStep = (delta: number) => {
    setZoom((prev) => normalizeZoom(prev + delta, prev));
  };

  const handleWheelZoom = (event: React.WheelEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const delta = event.deltaY;
    if (delta === 0) return;

    const wheelStep = 0.01;
    setZoom((prev) => {
      const next = delta < 0 ? prev + wheelStep : prev - wheelStep;
      return normalizeZoom(next, prev);
    });
  };

  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const deltaX = touches[0].clientX - touches[1].clientX;
    const deltaY = touches[0].clientY - touches[1].clientY;
    return Math.hypot(deltaX, deltaY);
  };

  const getTouchCenter = (touches: React.TouchList) => {
    if (touches.length === 0) return { x: 0, y: 0 };
    if (touches.length === 1) {
      return { x: touches[0].clientX, y: touches[0].clientY };
    }
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  };

  const computeFitZoom = (naturalWidth?: number, naturalHeight?: number) => {
    const iw = naturalWidth || imgRef.current?.naturalWidth || 1;
    const ih = naturalHeight || imgRef.current?.naturalHeight || 1;
    if (!containerRef.current) return 1;
    const cw = containerRef.current.clientWidth || 1;
    const ch = containerRef.current.clientHeight || 1;
    const fit = Math.min(cw / iw, ch / ih);
    return Math.min(1, Number(fit.toFixed(4)));
  };

  const stopOverlayPropagation = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  const stopOverlayTouchPropagation = (event: React.TouchEvent) => {
    event.stopPropagation();
  };

  // Always render at natural size; `zoom` 1.0 means 100% actual image size
  const effectiveMaxSize = 'none';

  const isDraggable = useMemo(() => {
    if (!imgRef.current || !containerRef.current) return false;
    const iw = imgRef.current.naturalWidth * zoom;
    const ih = imgRef.current.naturalHeight * zoom;
    // draggable only when the scaled natural image is larger than the container
    return iw > containerRef.current.clientWidth || ih > containerRef.current.clientHeight;
  }, [zoom]);

  const handleDragStart = (event: React.MouseEvent) => {
    if (!isDraggable) return;
    dragStateRef.current = {
      isDragging: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: panOffset.x,
      offsetY: panOffset.y,
    };
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragMove = (event: React.MouseEvent) => {
    if (!dragStateRef.current.isDragging) return;
    const deltaX = event.clientX - dragStateRef.current.startX;
    const deltaY = event.clientY - dragStateRef.current.startY;
    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      dragStateRef.current.moved = true;
    }
    setPanOffset({
      x: dragStateRef.current.offsetX + deltaX,
      y: dragStateRef.current.offsetY + deltaY,
    });
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragEnd = (event?: React.MouseEvent) => {
    if (!dragStateRef.current.isDragging) return;
    dragStateRef.current.isDragging = false;
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    if (event.touches.length >= 2) {
      const center = getTouchCenter(event.touches);
      touchStateRef.current = {
        mode: 'pinch',
        moved: false,
        startX: center.x,
        startY: center.y,
        offsetX: panOffset.x,
        offsetY: panOffset.y,
        startDistance: getTouchDistance(event.touches),
        startZoom: zoom,
        startCenterX: center.x,
        startCenterY: center.y,
      };
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.touches.length === 1) {
      touchStateRef.current = {
        mode: 'pan',
        moved: false,
        startX: event.touches[0].clientX,
        startY: event.touches[0].clientY,
        offsetX: panOffset.x,
        offsetY: panOffset.y,
        startDistance: 0,
        startZoom: zoom,
        startCenterX: event.touches[0].clientX,
        startCenterY: event.touches[0].clientY,
      };
    }
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    if (touchStateRef.current.mode === 'pinch' && event.touches.length >= 2) {
      const distance = getTouchDistance(event.touches);
      const center = getTouchCenter(event.touches);
      const pinchScale = touchStateRef.current.startDistance > 0
        ? distance / touchStateRef.current.startDistance
        : 1;
      const nextZoom = normalizeZoom(touchStateRef.current.startZoom * pinchScale, touchStateRef.current.startZoom);
      const deltaX = center.x - touchStateRef.current.startCenterX;
      const deltaY = center.y - touchStateRef.current.startCenterY;

      if (Math.abs(nextZoom - zoom) > 0.005 || Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        touchStateRef.current.moved = true;
        suppressTapToggleRef.current = true;
      }

      setZoom(nextZoom);
      setPanOffset({
        x: touchStateRef.current.offsetX + deltaX,
        y: touchStateRef.current.offsetY + deltaY,
      });
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (touchStateRef.current.mode === 'pan' && event.touches.length === 1) {
      const deltaX = event.touches[0].clientX - touchStateRef.current.startX;
      const deltaY = event.touches[0].clientY - touchStateRef.current.startY;
      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        touchStateRef.current.moved = true;
        suppressTapToggleRef.current = true;
      }
      setPanOffset({
        x: touchStateRef.current.offsetX + deltaX,
        y: touchStateRef.current.offsetY + deltaY,
      });
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    if (event.touches.length >= 2) {
      const center = getTouchCenter(event.touches);
      touchStateRef.current = {
        mode: 'pinch',
        moved: touchStateRef.current.moved,
        startX: center.x,
        startY: center.y,
        offsetX: panOffset.x,
        offsetY: panOffset.y,
        startDistance: getTouchDistance(event.touches),
        startZoom: zoom,
        startCenterX: center.x,
        startCenterY: center.y,
      };
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.touches.length === 1) {
      touchStateRef.current = {
        mode: 'pan',
        moved: touchStateRef.current.moved,
        startX: event.touches[0].clientX,
        startY: event.touches[0].clientY,
        offsetX: panOffset.x,
        offsetY: panOffset.y,
        startDistance: 0,
        startZoom: zoom,
        startCenterX: event.touches[0].clientX,
        startCenterY: event.touches[0].clientY,
      };
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    touchStateRef.current.mode = 'none';
  };

  const handleQuickPromptSelect = (sp: SelectedPrompt) => {
    const keyParts = sp.key.split('-');
    if (keyParts.length < 3 || keyParts[0] !== 'q') {
      setSelectedPrompts((prev) => [...prev, sp]);
      return;
    }

    const categoryId = keyParts.slice(1, -1).join('-');
    setSelectedPrompts((prev) => {
      const filtered = prev.filter((p) => {
        if (!p.key.startsWith('q-')) return true;
        const parts = p.key.split('-');
        if (parts.length < 3 || parts[0] !== 'q') return true;
        const existingCategory = parts.slice(1, -1).join('-');
        return existingCategory !== categoryId;
      });
      return [...filtered, sp];
    });
  };

  const prev = useCallback(() => {
    if (!hasGroups) {
      setCurrentIndex((i) => (i > 0 ? i - 1 : images.length - 1));
      return;
    }

    if (thumbnailMode === 'sources') {
      setActiveGroupIndex((i) => (i > 0 ? i - 1 : sourceImages.length - 1));
      setCurrentIndex(0);
      setShowSourceInEdits(true);
      return;
    }

    if (!activeGroup) return;
    const total = activeGeneratedUrls.length + 1;
    const combinedIndex = showSourceInEdits ? 0 : (currentEditIndex ?? 0);
    const nextCombinedIndex = combinedIndex > 0 ? combinedIndex - 1 : total - 1;
    setSelectedEditIndexByGroup((prevState) => ({
      ...prevState,
      [activeGroup.messageId]: nextCombinedIndex,
    }));
    setShowSourceInEdits(nextCombinedIndex === 0);
  }, [activeGeneratedUrls.length, activeGroup, currentEditIndex, hasGroups, images.length, showSourceInEdits, sourceImages.length, thumbnailMode]);

  const next = useCallback(() => {
    if (!hasGroups) {
      setCurrentIndex((i) => (i < images.length - 1 ? i + 1 : 0));
      return;
    }

    if (thumbnailMode === 'sources') {
      setActiveGroupIndex((i) => (i < sourceImages.length - 1 ? i + 1 : 0));
      setCurrentIndex(0);
      setShowSourceInEdits(true);
      return;
    }

    if (!activeGroup) return;
    const total = activeGeneratedUrls.length + 1;
    const combinedIndex = showSourceInEdits ? 0 : (currentEditIndex ?? 0);
    const nextCombinedIndex = combinedIndex < total - 1 ? combinedIndex + 1 : 0;
    setSelectedEditIndexByGroup((prevState) => ({
      ...prevState,
      [activeGroup.messageId]: nextCombinedIndex,
    }));
    setShowSourceInEdits(nextCombinedIndex === 0);
  }, [activeGeneratedUrls.length, activeGroup, currentEditIndex, hasGroups, images.length, showSourceInEdits, sourceImages.length, thumbnailMode]);

  const showChrome = () => setIsUiHidden(false);
  const hideChrome = () => setIsUiHidden(true);
  const toggleChrome = () => setIsUiHidden((prev) => !prev);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, prev, next, onClose]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!open) {
      setIsPseudoFullscreen(false);
      return;
    }

    if (!isPseudoFullscreen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
    };
  }, [open, isPseudoFullscreen]);

  const displayedImage = hasGroups
    ? (thumbnailMode === 'edits'
      ? ((showSourceInEdits || currentEditIndex === null || currentEditIndex === 0)
        ? (activeGroup?.sourceUrl || '')
        : (activeGeneratedUrls[currentEditIndex - 1] || activeGroup?.sourceUrl || ''))
        : (activeGroup?.sourceUrl || ''))
    : activeImages[currentIndex];

  useEffect(() => {
    if (!open || !displayedImage) return;
    let cancelled = false;
    const nextImage = new Image();

    setIsImageReady(false);
    nextImage.decoding = 'async';

    const commitImage = () => {
      if (cancelled) return;
      const fit = computeFitZoom(nextImage.naturalWidth || 1, nextImage.naturalHeight || 1);
      setFitZoom(fit);
      setZoom(fit);
      setPanOffset({ x: 0, y: 0 });
      setRenderedImage(displayedImage);
      requestAnimationFrame(() => {
        if (!cancelled) {
          setIsImageReady(true);
        }
      });
    };

    nextImage.onload = commitImage;
    nextImage.onerror = () => {
      if (cancelled) return;
      setRenderedImage(displayedImage);
      setPanOffset({ x: 0, y: 0 });
      setIsImageReady(true);
    };
    nextImage.src = displayedImage;

    if (nextImage.complete) {
      commitImage();
    }

    return () => {
      cancelled = true;
      nextImage.onload = null;
      nextImage.onerror = null;
    };
  }, [displayedImage, open]);

  useEffect(() => {
    if (!open) return;

    const updateFitZoom = () => {
      const nextFitZoom = computeFitZoom();
      setFitZoom(nextFitZoom);
      setZoom(nextFitZoom);
      setPanOffset({ x: 0, y: 0 });
    };

    window.addEventListener('resize', updateFitZoom);
    return () => window.removeEventListener('resize', updateFitZoom);
  }, [open]);

  if (!activeImages.length && !(hasGroups && thumbnailMode === 'sources')) return null;

  const handleSelectGroup = (index: number) => {
    if (!groups) return;
    setActiveGroupIndex(index);
    setCurrentIndex(0);
    setThumbnailMode('sources');
    setShowSourceInEdits(true);
    showChrome();
  };

  const handleSelectGenerated = (_url: string, index: number) => {
    if (!activeGroup) return;
    setSelectedEditIndexByGroup((prev) => ({ ...prev, [activeGroup.messageId]: index }));
    setThumbnailMode('edits');
    setShowSourceInEdits(index === 0);
    showChrome();
  };

  const handleToggleLayer = () => {
    if (!hasGroups) return;

    if (thumbnailMode === 'edits') {
      setThumbnailMode('sources');
      setCurrentIndex(0);
      setShowSourceInEdits(true);
      showChrome();
      return;
    }

    if (!canToggleToEdits) return;

    if (activeGroup) {
      setSelectedEditIndexByGroup((prev) => ({
        ...prev,
        [activeGroup.messageId]: prev[activeGroup.messageId] ?? 0,
      }));
    }
    setThumbnailMode('edits');
    setShowSourceInEdits(true);
    showChrome();
  };

  const handleNavigatePrev = (event: React.MouseEvent) => {
    event.stopPropagation();
    hideChrome();
    prev();
  };

  const handleNavigateNext = (event: React.MouseEvent) => {
    event.stopPropagation();
    hideChrome();
    next();
  };

  const handleToggleFullscreen = async () => {
    if (isIos || !containerRef.current || !containerRef.current.requestFullscreen) {
      setIsPseudoFullscreen((prev) => !prev);
      return;
    }

    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  const handleClose = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
    setIsPseudoFullscreen(false);
    onClose();
  };

  const buildPromptText = () => {
    const parts: string[] = [];
    const typed = prompt.trim();
    if (typed) parts.push(typed);
    for (const sp of selectedPrompts) {
      parts.push(language === 'zh' ? sp.zh : sp.en);
    }
    return parts.join(', ');
  };

  const handlePicEdit = async () => {
    if (!activeGroup || !activeGroup.canEdit || !displayedImage) return;
    const trimmed = buildPromptText();
    if (!trimmed) return;

    try {
      setIsGenerating(true);
      const response = await imageGenerationService.generate({
        sourceType: 'chat_image',
        generationType: 'custom',
        messageId: activeGroup.messageId,
        mediaUrl: displayedImage,
        secondaryMediaUrl: selectedReferenceImageUrl ?? undefined,
        customPrompts: [trimmed],
        extraPrompt: trimmed,
      });

      await imageGenerationService.pollJobUntilComplete(response.jobId);
      const result = await imageGenerationService.getResults(activeGroup.messageId, 'chat_image');
      const urls = Array.isArray(result.results) ? (result.results as string[]) : [];
      setGeneratedByGroup((prev) => ({ ...prev, [activeGroup.messageId]: urls }));
      if (urls.length > 0) {
        setSelectedEditIndexByGroup((prev) => ({ ...prev, [activeGroup.messageId]: urls.length }));
        setThumbnailMode('edits');
        setShowSourceInEdits(false);
      }

      setSelectedReferenceImageUrl(null);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (thumbnailMode === 'edits' && activeGeneratedUrls.length === 0) {
      setThumbnailMode('sources');
      setCurrentIndex(0);
      setShowSourceInEdits(true);
    }
  }, [activeGeneratedUrls.length, thumbnailMode]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
    >
      <BoxAny
        ref={containerRef}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          width: '100vw',
          maxWidth: 'none',
          height: '100dvh',
          bgcolor: 'rgba(10, 10, 10, 0.97)',
          borderRadius: 0,
          overflow: 'hidden',
          outline: 'none',
          position: 'relative',
        }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {!isUiHidden && (
          <BoxAny
            sx={{
              position: 'absolute',
              top: 'max(8px, env(safe-area-inset-top))',
              right: 'calc(max(8px, env(safe-area-inset-right)) + 84px)',
              zIndex: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 0.375,
              px: 0.375,
              py: 0.25,
              borderRadius: 999,
              bgcolor: 'rgba(0,0,0,0.34)',
              backdropFilter: 'blur(10px)',
            }}
            onClick={stopOverlayPropagation}
            onMouseDown={stopOverlayPropagation}
            onTouchStart={stopOverlayTouchPropagation}
            onTouchMove={stopOverlayTouchPropagation}
            onTouchEnd={stopOverlayTouchPropagation}
          >
            <IconButton
              size="small"
              onClick={() => handleZoomStep(-0.01)}
              sx={{ color: 'rgba(255,255,255,0.88)', bgcolor: 'rgba(255,255,255,0.08)', width: 28, height: 28 }}
            >
              <RemoveIcon sx={{ fontSize: 17 }} />
            </IconButton>
            <Button
              size="small"
              onClick={handleZoomReset}
              sx={{
                minWidth: 0,
                width: 40,
                px: 0.5,
                py: 0.4,
                color: 'rgba(255,255,255,0.92)',
                bgcolor: Math.abs(zoom - fitZoom) > 0.01 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
                borderRadius: 999,
                fontSize: '0.72rem',
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
                textAlign: 'center',
              }}
            >
              {zoomPercent}
            </Button>
            <IconButton
              size="small"
              onClick={() => handleZoomStep(0.01)}
              sx={{ color: 'rgba(255,255,255,0.88)', bgcolor: 'rgba(255,255,255,0.08)', width: 28, height: 28 }}
            >
              <AddIcon sx={{ fontSize: 17 }} />
            </IconButton>
            <IconButton
              size="small"
              onClick={handleToggleFullscreen}
              sx={{ color: 'rgba(255,255,255,0.88)', bgcolor: 'rgba(255,255,255,0.08)', width: 28, height: 28 }}
            >
              {(isFullscreen || isPseudoFullscreen) ? <FullscreenExitIcon sx={{ fontSize: 17 }} /> : <FullscreenIcon sx={{ fontSize: 17 }} />}
            </IconButton>
          </BoxAny>
        )}

        <BoxAny
          sx={{
            position: 'absolute',
            top: 'max(8px, env(safe-area-inset-top))',
            right: 'max(8px, env(safe-area-inset-right))',
            zIndex: 5,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}
          onClick={stopOverlayPropagation}
          onMouseDown={stopOverlayPropagation}
          onTouchStart={stopOverlayTouchPropagation}
          onTouchMove={stopOverlayTouchPropagation}
          onTouchEnd={stopOverlayTouchPropagation}
        >
          {hasGroups && (
            <IconButton
              size="small"
              onClick={handleToggleLayer}
              disabled={!canToggleToEdits && thumbnailMode !== 'edits'}
              sx={{
                width: 32,
                height: 32,
                color: 'white',
                bgcolor: 'rgba(211, 47, 47, 0.95)',
                border: '1px solid rgba(255,255,255,0.18)',
                opacity: !canToggleToEdits && thumbnailMode !== 'edits' ? 0.55 : 1,
                '&:hover': {
                  bgcolor: 'rgba(198, 40, 40, 1)',
                },
              }}
            >
              <KeyboardArrowDownIcon
                sx={{
                  fontSize: 19,
                  transform: thumbnailMode === 'edits' ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s ease',
                }}
              />
            </IconButton>
          )}

          <IconButton
            onClick={handleClose}
            size="small"
            sx={{
              width: 32,
              height: 32,
              color: 'rgba(255,255,255,0.9)',
              bgcolor: 'rgba(0,0,0,0.3)',
            }}
          >
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </BoxAny>

        {/* Main image area */}
        <BoxAny
          sx={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            cursor: isDraggable
              ? (dragStateRef.current.isDragging ? 'grabbing' : 'grab')
              : 'pointer',
            touchAction: zoom > fitZoom + 0.01 ? 'none' : 'manipulation',
          }}
          onWheel={handleWheelZoom}
          onClick={(event: React.MouseEvent) => {
            if (suppressTapToggleRef.current) {
              suppressTapToggleRef.current = false;
              event.stopPropagation();
              return;
            }
            if (dragStateRef.current.moved) {
              dragStateRef.current.moved = false;
              event.stopPropagation();
              return;
            }
            toggleChrome();
          }}
          onMouseDown={handleDragStart}
          onMouseMove={handleDragMove}
          onMouseUp={handleDragEnd}
          onMouseLeave={handleDragEnd}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <BoxAny
            component="img"
            key={renderedImage || displayedImage}
            ref={imgRef}
            src={renderedImage || displayedImage}
            alt={`Image ${currentIndex + 1}`}
            onLoad={() => setIsImageReady(true)}
            onError={() => setIsImageReady(true)}
            onClick={(e: React.MouseEvent) => {
              if (suppressTapToggleRef.current) {
                suppressTapToggleRef.current = false;
                e.stopPropagation();
                return;
              }
              e.stopPropagation();
              toggleChrome();
            }}
            sx={{
              maxWidth: effectiveMaxSize,
              maxHeight: effectiveMaxSize,
              objectFit: 'contain',
              borderRadius: 1,
              userSelect: 'none',
              cursor: 'default',
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              opacity: isImageReady ? 1 : 0,
              transition: isImageReady ? 'opacity 0.12s ease-out' : 'none',
            }}
          />

          {/* Left arrow */}
          {navigableImageCount > 1 && (
            <IconButton
              onClick={handleNavigatePrev}
              sx={{
                position: 'absolute',
                top: '50%',
                left: 'max(8px, env(safe-area-inset-left))',
                transform: 'translateY(-50%)',
                zIndex: 3,
                color: 'white',
                bgcolor: 'rgba(0,0,0,0.4)',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
              }}
            >
              <ArrowBackIosNewIcon />
            </IconButton>
          )}

          {/* Right arrow */}
          {navigableImageCount > 1 && (
            <IconButton
              onClick={handleNavigateNext}
              sx={{
                position: 'absolute',
                top: '50%',
                right: 'max(8px, env(safe-area-inset-right))',
                transform: 'translateY(-50%)',
                zIndex: 3,
                color: 'white',
                bgcolor: 'rgba(0,0,0,0.4)',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
              }}
            >
              <ArrowForwardIosIcon />
            </IconButton>
          )}

          {!isUiHidden && (
            <BoxAny
              onClick={stopOverlayPropagation}
              onMouseDown={stopOverlayPropagation}
              onTouchStart={stopOverlayTouchPropagation}
              onTouchMove={stopOverlayTouchPropagation}
              onTouchEnd={stopOverlayTouchPropagation}
              sx={{
                position: 'absolute',
                left: 'env(safe-area-inset-left)',
                right: 'env(safe-area-inset-right)',
                bottom: thumbnailBottomInset,
                maxWidth: isMobile ? 'none' : 860,
                mx: 'auto',
                p: isMobile ? 0.75 : 1,
                borderRadius: 0,
                bgcolor: 'rgba(0,0,0,0.72)',
                backdropFilter: 'blur(10px)',
                display: 'flex',
                flexDirection: 'column',
                gap: 0.75,
                zIndex: 4,
                touchAction: 'auto',
                maxHeight: isMobile ? '32dvh' : '26dvh',
                overflowY: 'auto',
              }}
            >
              {hasGroups && activeGroup?.canEdit && (
                <>
                  <BoxAny sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5 }}>
                    <TextField
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      placeholder={t('image.editPromptPlaceholder')}
                      size="small"
                      fullWidth
                      multiline
                      maxRows={6}
                      disabled={isGenerating}
                      sx={{
                        '& .MuiInputBase-input': { color: 'rgba(255,255,255,0.95)' },
                        '& .MuiInputBase-input::placeholder': {
                          color: 'rgba(255,255,255,0.55)',
                          opacity: 1,
                        },
                        '& .MuiOutlinedInput-root': {
                          backgroundColor: 'rgba(255,255,255,0.08)',
                          minHeight: isMobile ? 40 : 42,
                          borderRadius: '8px',
                        },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.25)' },
                        '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': {
                          borderColor: 'rgba(255,255,255,0.45)',
                        },
                      }}
                    />
                    <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
                      {selectedReferenceImageUrl && (
                        <ImageHoverPreview
                          src={selectedReferenceImageUrl}
                          alt={t('image.selectedImage')}
                          maxSize={420}
                          openOnHover={isHoverCapable}
                          openOnLongPress={!isHoverCapable}
                          openOnTap={false}
                          onOpenChange={(open) => {
                            if (open && !isHoverCapable) {
                              suppressSelectedImageClearUntilRef.current = Date.now() + 500;
                            }
                          }}
                        >
                          {(previewProps) => (
                            <Button
                              {...previewProps}
                              onClick={(event) => {
                                previewProps.onClick?.(event);
                                if (event.defaultPrevented) {
                                  return;
                                }

                                if (Date.now() < suppressSelectedImageClearUntilRef.current) {
                                  return;
                                }

                                setSelectedReferenceImageUrl(null);
                              }}
                              title={t('image.clearSelectedImage')}
                              sx={{
                                minWidth: 0,
                                width: actionControlHeight,
                                height: actionControlHeight,
                                p: 0,
                                borderRadius: '2px',
                                overflow: 'hidden',
                                border: '1px solid rgba(255,255,255,0.2)',
                                bgcolor: 'rgba(255,255,255,0.06)',
                                flexShrink: 0,
                              }}
                            >
                              <BoxAny
                                component="img"
                                src={selectedReferenceImageUrl}
                                alt={t('image.selectedImage')}
                                sx={{
                                  display: 'block',
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover',
                                }}
                              />
                            </Button>
                          )}
                        </ImageHoverPreview>
                      )}
                      <IconButton
                        size="small"
                        title={t('promptComposer.browsePrompts')}
                        onClick={() => setComposerOpen(true)}
                        sx={{ color: 'rgba(255,255,255,0.85)', width: actionControlHeight, height: actionControlHeight }}
                      >
                        <LibraryBooksIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        title={t('promptComposer.browsePrompts')}
                        onClick={() => setShowPromptTools((prev) => !prev)}
                        sx={{ color: showPromptTools ? 'white' : 'rgba(255,255,255,0.85)', width: actionControlHeight, height: actionControlHeight }}
                      >
                        <TuneIcon fontSize="small" />
                      </IconButton>
                      <Button
                        variant={selectedReferenceImageUrl ? 'outlined' : 'text'}
                        onClick={() => setImagePickerOpen(true)}
                        disabled={isGenerating || scopedSelectableImages.length === 0}
                        sx={{
                          minWidth: isMobile ? 50 : 56,
                          minHeight: actionControlHeight,
                          px: isMobile ? 0.75 : 1,
                          flexShrink: 0,
                          color: 'rgba(255,255,255,0.92)',
                          borderColor: 'rgba(255,255,255,0.3)',
                          lineHeight: 1,
                        }}
                      >
                        {t('image.selectImageAction')}
                      </Button>
                      <Button
                        variant="contained"
                        onClick={handlePicEdit}
                        disabled={isGenerating || (!prompt.trim() && selectedPrompts.length === 0)}
                        sx={{ minWidth: isMobile ? 50 : 56, minHeight: actionControlHeight, px: isMobile ? 0.9 : 1.1, flexShrink: 0, lineHeight: 1 }}
                      >
                        {isGenerating ? <CircularProgress size={18} sx={{ color: 'white' }} /> : t('image.editAction')}
                      </Button>
                    </BoxAny>
                  </BoxAny>

                  {showPromptTools && (
                    <BoxAny
                      sx={{
                        px: 0.5,
                        py: 0.25,
                        borderRadius: 1,
                        bgcolor: 'rgba(255,255,255,0.06)',
                        '& .MuiChip-root': {
                          color: 'rgba(255,255,255,0.9)',
                          borderColor: 'rgba(255,255,255,0.35)',
                          backgroundColor: 'rgba(255,255,255,0.08)',
                        },
                        '& .MuiChip-root.MuiChip-filled': {
                          backgroundColor: 'rgba(255,255,255,0.18)',
                        },
                      }}
                    >
                      <AvatarQuickPicker
                        selectedKeys={new Set(selectedPrompts.map((p) => p.key))}
                        onSelect={handleQuickPromptSelect}
                        onDeselect={(key) => setSelectedPrompts((prev) => prev.filter((p) => p.key !== key))}
                      />
                    </BoxAny>
                  )}

                  {selectedPrompts.length > 0 && (
                    <BoxAny sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selectedPrompts.map((sp) => (
                        <Button
                          key={sp.key}
                          size="small"
                          variant="outlined"
                          onClick={() => setSelectedPrompts((prev) => prev.filter((p) => p.key !== sp.key))}
                          sx={{
                            color: 'rgba(255,255,255,0.8)',
                            borderColor: 'rgba(255,255,255,0.25)',
                            fontSize: '0.7rem',
                            textTransform: 'none',
                          }}
                        >
                          {language === 'zh' ? sp.zh : sp.en}
                        </Button>
                      ))}
                    </BoxAny>
                  )}
                </>
              )}

              {hasGroups && (
                <BoxAny
                  sx={{
                    display: 'flex',
                    flexDirection: 'row',
                    gap: 0.5,
                    alignItems: 'center',
                    minHeight: 0,
                  }}
                >
                  <BoxAny
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      gap: 0.5,
                      width: 'auto',
                    }}
                  >
                    <IconButton
                      onClick={handleToggleLayer}
                      disabled={!canToggleToEdits && thumbnailMode !== 'edits'}
                      sx={{
                        flexShrink: 0,
                        width: thumbnailStripButtonSize,
                        height: thumbnailStripButtonSize,
                        color: 'white',
                        bgcolor: 'rgba(211, 47, 47, 0.95)',
                        border: '1px solid rgba(255,255,255,0.18)',
                        opacity: !canToggleToEdits && thumbnailMode !== 'edits' ? 0.55 : 1,
                        '&:hover': { bgcolor: 'rgba(198, 40, 40, 1)' },
                      }}
                    >
                      <KeyboardArrowDownIcon
                        sx={{
                          fontSize: thumbnailStripControlIconSize,
                          transform: thumbnailMode === 'edits' ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.15s ease',
                        }}
                      />
                    </IconButton>
                    <IconButton
                      onClick={() => scrollThumbnailStripBy(-1)}
                      disabled={!canScrollThumbnailsLeft}
                      sx={{
                        flexShrink: 0,
                        width: thumbnailStripButtonSize,
                        height: thumbnailStripButtonSize,
                        color: 'white',
                        bgcolor: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.14)',
                        opacity: canScrollThumbnailsLeft ? 1 : 0.35,
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.18)' },
                      }}
                    >
                      <ArrowBackIosNewIcon sx={{ fontSize: thumbnailStripControlIconSize }} />
                    </IconButton>
                  </BoxAny>

                  <BoxAny
                    ref={thumbnailStripRef}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: isMobile ? 0.5 : 0.75,
                      px: isMobile ? 0 : 0.25,
                      py: isMobile ? 0 : 0.25,
                      overflowX: 'auto',
                      flex: 1,
                      minWidth: 0,
                      WebkitOverflowScrolling: 'touch',
                      touchAction: 'pan-x',
                      scrollSnapType: isMobile ? 'x proximity' : 'none',
                      scrollbarWidth: 'none',
                      msOverflowStyle: 'none',
                      '&::-webkit-scrollbar': {
                        display: 'none',
                      },
                    }}
                  >
                    {thumbnailMode === 'sources'
                      ? groups!.map((group, i) => {
                          const count = generatedByGroup[group.messageId]?.length || 0;
                          const isActive = i === activeGroupIndex;
                          return (
                            <BoxAny
                              key={group.messageId}
                              ref={(el: HTMLDivElement | null) => { thumbnailRefs.current[i] = el; }}
                              onClick={() => handleSelectGroup(i)}
                              sx={{
                                position: 'relative',
                                flexShrink: 0,
                                width: groupedThumbnailSize,
                                height: groupedThumbnailSize,
                                borderRadius: thumbnailCornerRadius,
                                overflow: 'hidden',
                                cursor: 'pointer',
                                scrollSnapAlign: isMobile ? 'center' : 'none',
                                border: isActive
                                  ? '2px solid rgba(255,255,255,0.9)'
                                  : '2px solid transparent',
                                opacity: isActive ? 1 : 0.7,
                                transition: 'opacity 0.15s, border-color 0.15s',
                              }}
                            >
                              <BoxAny
                                component="img"
                                src={group.sourceUrl}
                                alt="Source"
                                sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                              {count > 0 && (
                                <BoxAny
                                  sx={{
                                    position: 'absolute',
                                    right: 3,
                                    top: 3,
                                    bgcolor: 'rgba(0,0,0,0.72)',
                                    color: 'white',
                                    fontSize: '0.6rem',
                                    px: 0.4,
                                    borderRadius: 0.5,
                                  }}
                                >
                                  {count}
                                </BoxAny>
                              )}
                            </BoxAny>
                          );
                        })
                      : (
                        <>
                          <BoxAny
                            onClick={() => {
                              setThumbnailMode('edits');
                              setShowSourceInEdits(true);
                            }}
                            sx={{
                              position: 'relative',
                              flexShrink: 0,
                              width: groupedThumbnailSize,
                              height: groupedThumbnailSize,
                              borderRadius: thumbnailCornerRadius,
                              overflow: 'hidden',
                              cursor: 'pointer',
                              scrollSnapAlign: isMobile ? 'center' : 'none',
                              border: showSourceInEdits
                                ? '2px solid rgba(255,255,255,0.9)'
                                : '2px solid transparent',
                              opacity: showSourceInEdits ? 1 : 0.7,
                              transition: 'opacity 0.15s, border-color 0.15s',
                            }}
                          >
                            <BoxAny
                              component="img"
                              src={activeGroup?.sourceUrl}
                              alt="Source"
                              sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          </BoxAny>

                          {activeGeneratedUrls.length === 0
                            ? (
                              <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>
                                {t('image.noEditsYet')}
                              </Typography>
                            )
                            : activeGeneratedUrls.map((url, index) => {
                                const isActive = !showSourceInEdits && currentEditIndex === index + 1;
                                return (
                                  <BoxAny
                                    key={url}
                                    onClick={() => handleSelectGenerated(url, index + 1)}
                                    sx={{
                                      flexShrink: 0,
                                      width: groupedThumbnailSize,
                                      height: groupedThumbnailSize,
                                      borderRadius: thumbnailCornerRadius,
                                      overflow: 'hidden',
                                      cursor: 'pointer',
                                      scrollSnapAlign: isMobile ? 'center' : 'none',
                                      border: isActive
                                        ? '2px solid rgba(255,255,255,0.9)'
                                        : '2px solid transparent',
                                      opacity: isActive ? 1 : 0.7,
                                      transition: 'opacity 0.15s, border-color 0.15s',
                                    }}
                                  >
                                    <BoxAny
                                      component="img"
                                      src={url}
                                      alt="Edit"
                                      sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                  </BoxAny>
                                );
                              })}
                        </>
                      )}
                  </BoxAny>

                  <IconButton
                    onClick={() => scrollThumbnailStripBy(1)}
                    disabled={!canScrollThumbnailsRight}
                    sx={{
                      flexShrink: 0,
                      width: thumbnailStripButtonSize,
                      height: thumbnailStripButtonSize,
                      color: 'white',
                      bgcolor: 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.14)',
                      opacity: canScrollThumbnailsRight ? 1 : 0.35,
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.18)' },
                    }}
                  >
                    <ArrowForwardIosIcon sx={{ fontSize: thumbnailStripControlIconSize }} />
                  </IconButton>
                </BoxAny>
              )}
            </BoxAny>
          )}

        </BoxAny>

        {hasGroups && activeGroup?.canEdit && (
          <PromptComposer
            open={composerOpen}
            onClose={() => setComposerOpen(false)}
            onApply={(prompts) => {
              setSelectedPrompts((prev) => {
                const existing = new Set(prev.map((p) => p.key));
                const added = prompts.filter((p) => !existing.has(p.key));
                return [...prev, ...added];
              });
              setComposerOpen(false);
            }}
          />
        )}

        {hasGroups && activeGroup?.canEdit && (
          <Dialog
            open={imagePickerOpen}
            onClose={() => setImagePickerOpen(false)}
            fullWidth
            maxWidth="md"
            PaperProps={{
              sx: {
                bgcolor: 'background.paper',
                backgroundImage: 'none',
                opacity: 1,
                borderRadius: '10px',
              },
            }}
          >
            <DialogContent
              sx={{
                p: 1,
                bgcolor: 'background.paper',
                backgroundImage: 'none',
              }}
            >
              <BoxAny
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
                  gap: 1,
                }}
              >
                {scopedSelectableImages.map((item) => {
                  const isSelected = selectedReferenceImageUrl === item.url;
                  return (
                    <ImageHoverPreview
                      key={item.key}
                      src={item.url}
                      alt={item.label}
                      maxSize={420}
                      {...pickerPreviewBehavior}
                    >
                      {(previewProps) => (
                        <ButtonBase
                          {...previewProps}
                          onClick={() => {
                            setSelectedReferenceImageUrl(item.url);
                            setImagePickerOpen(false);
                          }}
                          sx={{
                            display: 'block',
                            width: '100%',
                            borderRadius: '5px',
                            border: isSelected ? '2px solid' : '1px solid',
                            borderColor: isSelected ? 'primary.main' : 'divider',
                            cursor: 'pointer',
                            overflow: 'hidden',
                            lineHeight: 0,
                            backgroundColor: 'rgba(2, 6, 23, 0.02)',
                            boxShadow: isSelected ? '0 10px 24px rgba(25, 118, 210, 0.20)' : 'none',
                            transition: 'transform 120ms ease, box-shadow 120ms ease',
                            '&:hover': {
                              transform: 'translateY(-1px)',
                              boxShadow: '0 10px 24px rgba(2, 6, 23, 0.10)',
                            },
                            '&:focus-visible': {
                              boxShadow: '0 0 0 3px rgba(25, 118, 210, 0.25)',
                              outline: 'none',
                            },
                          }}
                        >
                          <BoxAny
                            component="img"
                            src={item.url}
                            alt={item.label}
                            loading="eager"
                            decoding="sync"
                            sx={{ display: 'block', width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 'inherit' }}
                          />
                        </ButtonBase>
                      )}
                    </ImageHoverPreview>
                  );
                })}
              </BoxAny>
            </DialogContent>
          </Dialog>
        )}

        {!hasGroups && images.length > 1 && (
          <BoxAny
            onClick={stopOverlayPropagation}
            onTouchStart={stopOverlayTouchPropagation}
            onTouchMove={stopOverlayTouchPropagation}
            onTouchEnd={stopOverlayTouchPropagation}
            sx={{
              position: 'absolute',
              left: 'env(safe-area-inset-left)',
              right: 'env(safe-area-inset-right)',
              bottom: thumbnailBottomInset,
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: isMobile ? 0.5 : 1,
              px: isMobile ? 0.75 : 1.5,
              py: isMobile ? 0.5 : 0.75,
              bgcolor: 'rgba(0,0,0,0.55)',
              borderRadius: 0,
              backdropFilter: 'blur(10px)',
              zIndex: 4,
            }}
          >
            <IconButton
              onClick={() => scrollThumbnailStripBy(-1)}
              disabled={!canScrollThumbnailsLeft}
              sx={{
                flexShrink: 0,
                width: thumbnailStripButtonSize,
                height: thumbnailStripButtonSize,
                color: 'white',
                bgcolor: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.14)',
                opacity: canScrollThumbnailsLeft ? 1 : 0.35,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.18)' },
              }}
            >
              <ArrowBackIosNewIcon sx={{ fontSize: thumbnailStripControlIconSize }} />
            </IconButton>

            <BoxAny
              ref={thumbnailStripRef}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: isMobile ? 0.5 : 1,
                overflowX: 'auto',
                flex: 1,
                minWidth: 0,
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-x',
                scrollSnapType: isMobile ? 'x proximity' : 'none',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                '&::-webkit-scrollbar': {
                  display: 'none',
                },
              }}
            >
              {images.map((url, i) => (
                <BoxAny
                  key={url}
                  ref={(el: HTMLDivElement | null) => { thumbnailRefs.current[i] = el; }}
                  onClick={() => setCurrentIndex(i)}
                  sx={{
                    flexShrink: 0,
                    width: plainThumbnailSize,
                    height: plainThumbnailSize,
                    borderRadius: thumbnailCornerRadius,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    scrollSnapAlign: isMobile ? 'center' : 'none',
                    border: i === currentIndex
                      ? '2px solid rgba(255,255,255,0.9)'
                      : '2px solid transparent',
                    opacity: i === currentIndex ? 1 : 0.55,
                    transition: 'opacity 0.15s, border-color 0.15s',
                    '&:hover': { opacity: 1 },
                  }}
                >
                  <BoxAny
                    component="img"
                    src={url}
                    alt={`Thumbnail ${i + 1}`}
                    sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </BoxAny>
              ))}
            </BoxAny>

            <IconButton
              onClick={() => scrollThumbnailStripBy(1)}
              disabled={!canScrollThumbnailsRight}
              sx={{
                flexShrink: 0,
                width: thumbnailStripButtonSize,
                height: thumbnailStripButtonSize,
                color: 'white',
                bgcolor: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.14)',
                opacity: canScrollThumbnailsRight ? 1 : 0.35,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.18)' },
              }}
            >
              <ArrowForwardIosIcon sx={{ fontSize: thumbnailStripControlIconSize }} />
            </IconButton>
          </BoxAny>
        )}
      </BoxAny>
    </Modal>
  );
};
