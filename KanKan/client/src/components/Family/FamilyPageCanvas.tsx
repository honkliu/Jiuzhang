import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Box,
  Paper,
} from '@mui/material';
import {
  DeleteOutline as DeleteOutlineIcon,
  DragIndicator as DragIndicatorIcon,
  AddPhotoAlternate as AddImageIcon,
  AutoAwesome as MagicIcon,
  SwapHoriz as CycleImageIcon,
} from '@mui/icons-material';
import IconButton from '@mui/material/IconButton';
import type { PageElementDto } from '@/services/family.service';
import { editorRegistry, RichTextBlockWithRegistry } from './RichTextBlock';
import { ImageLightbox } from '@/components/Shared/ImageLightbox';
import { imageGenerationService } from '@/services/imageGeneration.service';

const BoxAny = Box as any;

// 5 page styles: 网格, 白纸, 宣纸, 竹简, 古籍
export const PAGE_STYLES = [
  { name: '网格', icon: '⊞' },
  { name: '白纸', icon: '☐' },
  { name: '宣纸', icon: '宣' },
  { name: '竹简', icon: '竹' },
  { name: '古籍', icon: '古' },
];

function getPageStyleSx(style: number, zoom: number) {
  switch (style) {
    case 0: // 网格 — dotted grid on warm paper
      return {
        backgroundColor: '#fffdf7',
        backgroundImage: `linear-gradient(rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)`,
        backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
      };
    case 1: // 白纸 — clean white
      return {
        backgroundColor: '#ffffff',
        backgroundImage: 'none',
      };
    case 2: // 宣纸 — warm cream with subtle fiber texture
      return {
        backgroundColor: '#f5f0e8',
        backgroundImage: `
          radial-gradient(ellipse at 20% 50%, rgba(139,119,90,0.03) 0%, transparent 50%),
          radial-gradient(ellipse at 80% 20%, rgba(139,119,90,0.04) 0%, transparent 40%),
          radial-gradient(ellipse at 50% 80%, rgba(160,140,110,0.03) 0%, transparent 45%),
          url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")
        `,
      };
    case 3: // 竹简 — warm earthy bamboo tone
      return {
        backgroundColor: '#e8dcc8',
        backgroundImage: `linear-gradient(180deg, rgba(101,78,50,0.04) 0%, rgba(101,78,50,0.08) 100%)`,
      };
    case 4: // 古籍 — aged parchment, like 古线装书
      return {
        backgroundColor: '#f2ead8',
        backgroundImage: `linear-gradient(180deg, rgba(140,100,60,0.05) 0%, rgba(140,100,60,0.1) 100%)`,
      };
    default:
      return { backgroundColor: '#fffdf7', backgroundImage: 'none' };
  }
}

export const PAGE_WIDTH = 816;
export const PAGE_HEIGHT = 1056;
const MIN_BLOCK_WIDTH = 40;
const MIN_BLOCK_HEIGHT = 24;
const MAX_Z_INDEX = 2147483647;
const DEFAULT_IMAGE_INSERT_MAX_WIDTH = 320;
const DEFAULT_IMAGE_INSERT_MAX_HEIGHT = 260;

type DragState = {
  blockId: string;
  mode: 'move' | 'resize-br' | 'resize-tr';
  originX: number;
  originY: number;
  originWidth: number;
  originHeight: number;
  originAspectRatio: number;
  startX: number;
  startY: number;
} | null;

type InsertPoint = { x: number; y: number };

export type PendingImageUpload = { file: File; objectUrl: string };

type PageLightboxEntry = {
  sourceUrl: string;
  messageId: string;
  canEdit: boolean;
  blockId: string;
  kind: 'block' | 'embedded';
  embeddedIndex?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeZIndex(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return clamp(Math.round(value as number), 0, MAX_Z_INDEX);
}

export function normalizeBlocks(blocks: PageElementDto[]): PageElementDto[] {
  return blocks.map((block, index) => ({
    ...block,
    type: block.type === 'image' ? 'image' : 'text',
    x: clamp(block.x ?? 0, 0, PAGE_WIDTH),
    y: clamp(block.y ?? 0, 0, PAGE_HEIGHT),
    width: clamp(block.width ?? 300, MIN_BLOCK_WIDTH, PAGE_WIDTH),
    height: clamp(block.height ?? 180, MIN_BLOCK_HEIGHT, PAGE_HEIGHT),
    zIndex: normalizeZIndex(block.zIndex, index),
    text: block.type === 'image' ? undefined : (block.text ?? ''),
    fontSize: clamp(block.fontSize ?? 16, 8, 72),
    textAlign: block.textAlign === 'center' || block.textAlign === 'right' ? block.textAlign : 'left',
  }));
}

function getNextZIndex(blocks: PageElementDto[]) {
  const highest = blocks.reduce((max, block) => Math.max(max, normalizeZIndex(block.zIndex, 0)), 0);
  return highest >= MAX_Z_INDEX ? MAX_Z_INDEX : highest + 1;
}

function resizeImageBlockWithAspectRatio(
  block: PageElementDto,
  dragState: NonNullable<DragState>,
  dx: number,
  dy: number,
) {
  const aspectRatio = dragState.originAspectRatio > 0 ? dragState.originAspectRatio : 1;
  const widthScaleDelta = dragState.originWidth > 0 ? dx / dragState.originWidth : 0;

  if (dragState.mode === 'resize-br') {
    const heightScaleDelta = dragState.originHeight > 0 ? dy / dragState.originHeight : 0;
    const scaleDelta = Math.abs(widthScaleDelta) >= Math.abs(heightScaleDelta) ? widthScaleDelta : heightScaleDelta;
    const minWidth = Math.max(MIN_BLOCK_WIDTH, MIN_BLOCK_HEIGHT * aspectRatio);
    const maxWidth = Math.min(PAGE_WIDTH - block.x, (PAGE_HEIGHT - block.y) * aspectRatio);
    const width = clamp(dragState.originWidth * (1 + scaleDelta), minWidth, maxWidth);
    return { ...block, width, height: width / aspectRatio };
  }

  const heightScaleDelta = dragState.originHeight > 0 ? (-dy) / dragState.originHeight : 0;
  const scaleDelta = Math.abs(widthScaleDelta) >= Math.abs(heightScaleDelta) ? widthScaleDelta : heightScaleDelta;
  const minWidth = Math.max(MIN_BLOCK_WIDTH, MIN_BLOCK_HEIGHT * aspectRatio);
  const maxWidth = Math.min(PAGE_WIDTH - block.x, (dragState.originY + dragState.originHeight) * aspectRatio);
  const width = clamp(dragState.originWidth * (1 + scaleDelta), minWidth, maxWidth);
  const height = width / aspectRatio;
  const y = dragState.originY + dragState.originHeight - height;
  return { ...block, width, height, y };
}

function fitImageWithinBounds(width: number, height: number) {
  if (!(width > 0) || !(height > 0)) {
    return { width: DEFAULT_IMAGE_INSERT_MAX_WIDTH, height: DEFAULT_IMAGE_INSERT_MAX_HEIGHT };
  }

  const scale = Math.min(
    DEFAULT_IMAGE_INSERT_MAX_WIDTH / width,
    DEFAULT_IMAGE_INSERT_MAX_HEIGHT / height,
    1,
  );

  return {
    width: Math.max(MIN_BLOCK_WIDTH, Math.round(width * scale)),
    height: Math.max(MIN_BLOCK_HEIGHT, Math.round(height * scale)),
  };
}

function getImageSizeFromUrl(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('Failed to load image dimensions'));
    image.src = url;
  });
}

function createTextBlock(zIndex: number, left = 72, top = 72): PageElementDto {
  return { id: `pelem_${crypto.randomUUID()}`, type: 'text', x: left, y: top, width: 360, height: 52, zIndex, text: '', fontSize: 16, textAlign: 'left' };
}

function createImageBlock(zIndex: number, imageUrl: string, width = DEFAULT_IMAGE_INSERT_MAX_WIDTH, height = DEFAULT_IMAGE_INSERT_MAX_HEIGHT, left = 92, top = 92): PageElementDto {
  return { id: `pelem_${crypto.randomUUID()}`, type: 'image', x: left, y: top, width, height, zIndex, imageUrl, fontSize: 16, textAlign: 'left' };
}

function deriveOriginalImageUrlFromGeneratedName(url: string) {
  if (!url) {
    return url;
  }

  const match = url.match(/^(.*\/)?([^/?#]+?)(_(\d+))(\.[^.?#]+)(\?[^#]*)?(#.*)?$/);
  if (!match) {
    return url;
  }

  const [, directory = '', baseName, , , extension = '', query = '', hash = ''] = match;

  return `${directory}${baseName}${extension}${query}${hash}`;
}

function toGeneratedLookupId(sourceUrl: string, fallbackId: string) {
  const originalUrl = deriveOriginalImageUrlFromGeneratedName(sourceUrl);
  const path = (() => {
    try {
      return new URL(originalUrl, window.location.origin).pathname;
    } catch {
      return originalUrl.split(/[?#]/)[0];
    }
  })();

  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!/^(uploads|photos|standing)\//i.test(normalized)) {
    return fallbackId;
  }

  const utf8 = unescape(encodeURIComponent(normalized));
  return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export interface FamilyPageCanvasProps {
  pageId: string;
  pageNumber: number;
  blocks: PageElementDto[];
  canEdit: boolean;
  zoom: number;
  onBlocksChange: (blocks: PageElementDto[]) => void;
  pendingImages: Record<string, PendingImageUpload>;
  onPendingImagesChange: (updater: (current: Record<string, PendingImageUpload>) => Record<string, PendingImageUpload>) => void;
  onActiveTextBlockChange?: (blockId: string | null) => void;
  pageStyle?: number;
}

export const FamilyPageCanvas: React.FC<FamilyPageCanvasProps> = ({
  pageId, pageNumber, blocks, canEdit, zoom, onBlocksChange, pendingImages, onPendingImagesChange, onActiveTextBlockChange, pageStyle = 0,
}) => {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragStateRef = useRef<DragState>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [pendingFocusBlockId, setPendingFocusBlockId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{
    images: string[];
    index: number;
    groups?: Array<{ sourceUrl: string; messageId: string; canEdit: boolean }>;
    groupIndex?: number;
  } | null>(null);
  const lastPointerPointRef = useRef<InsertPoint | null>(null);

  const pageLightboxEntries = useMemo<PageLightboxEntry[]>(() => {
    const extractEmbeddedImages = (html: string | undefined) => {
      if (!html || typeof window === 'undefined') {
        return [] as string[];
      }

      const container = window.document.createElement('div');
      container.innerHTML = html;
      return Array.from(container.querySelectorAll('img'))
        .map((img) => img.getAttribute('src') || '')
        .filter((url) => !!url && !url.startsWith('blob:'));
    };

    const entries: PageLightboxEntry[] = [];
    blocks.forEach((block) => {
      if (block.type === 'image' && block.imageUrl && !pendingImages[block.id] && !block.imageUrl.startsWith('blob:')) {
        entries.push({
          sourceUrl: block.imageUrl,
          messageId: `page_image:${pageId}:${block.id}`,
          canEdit,
          blockId: block.id,
          kind: 'block',
        });
        return;
      }

      if (block.type !== 'text') {
        return;
      }

      extractEmbeddedImages(block.text).forEach((url, index) => {
        entries.push({
          sourceUrl: url,
          messageId: `page_rich_image:${pageId}:${block.id}:${index}`,
          canEdit,
          blockId: block.id,
          kind: 'embedded',
          embeddedIndex: index,
        });
      });
    });

    return entries;
  }, [blocks, canEdit, pageId, pendingImages]);

  const lightboxImages = useMemo(
    () => pageLightboxEntries.map((entry) => entry.sourceUrl),
    [pageLightboxEntries]
  );

  const lightboxIndexByBlockId = useMemo(() => {
    const map: Record<string, number> = {};
    pageLightboxEntries.forEach((entry, index) => {
      if (entry.kind === 'block') {
        map[entry.blockId] = index;
      }
    });
    return map;
  }, [pageLightboxEntries]);

  const lightboxIndexByEmbeddedImageKey = useMemo(() => {
    const map: Record<string, number> = {};
    pageLightboxEntries.forEach((entry, index) => {
      if (entry.kind === 'embedded' && entry.embeddedIndex !== undefined) {
        map[`${entry.blockId}:${entry.embeddedIndex}`] = index;
      }
    });
    return map;
  }, [pageLightboxEntries]);

  const resolveLightboxPayload = useCallback(async () => {
    const resolvedEntries = await Promise.all(pageLightboxEntries.map(async (entry) => {
      try {
        const lookupId = toGeneratedLookupId(entry.sourceUrl, entry.messageId);
        const result = await imageGenerationService.getResults(lookupId, 'chat_image');
        const generatedUrls = Array.isArray(result.results) ? (result.results as string[]) : [];
        const sourceUrl = generatedUrls.includes(entry.sourceUrl)
          ? deriveOriginalImageUrlFromGeneratedName(entry.sourceUrl)
          : entry.sourceUrl;
        return { ...entry, sourceUrl };
      } catch {
        return entry;
      }
    }));

    return {
      images: resolvedEntries.map((entry) => entry.sourceUrl),
      groups: resolvedEntries.map(({ sourceUrl, messageId, canEdit: entryCanEdit }) => ({
        sourceUrl,
        messageId,
        canEdit: entryCanEdit,
      })),
    };
  }, [pageLightboxEntries]);

  useEffect(() => {
    setSelectedBlockId(current => blocks.some(b => b.id === current) ? current : null);
    setPendingFocusBlockId(null);
  }, [pageId]);

  // Notify parent of active text block changes
  useEffect(() => {
    if (!onActiveTextBlockChange) return;
    const block = selectedBlockId ? blocksRef.current.find(b => b.id === selectedBlockId) : null;
    onActiveTextBlockChange(block?.type === 'text' ? selectedBlockId : null);
  }, [selectedBlockId, onActiveTextBlockChange]);

  // Keyboard
  useEffect(() => {
    if (!canEdit) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedBlockId) {
        const t = event.target as HTMLElement | null;
        if (t?.tagName === 'TEXTAREA' || t?.tagName === 'INPUT' || t?.isContentEditable) return;
        event.preventDefault();
        onBlocksChange(blocks.filter(b => b.id !== selectedBlockId));
        setSelectedBlockId(null);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && selectedBlockId) {
        event.preventDefault();
        const block = blocks.find(b => b.id === selectedBlockId);
        if (!block) return;
        const dup: PageElementDto = {
          ...block, id: `pelem_${crypto.randomUUID()}`,
          x: clamp(block.x + 24, 0, PAGE_WIDTH - block.width),
          y: clamp(block.y + 24, 0, PAGE_HEIGHT - block.height),
          zIndex: getNextZIndex(blocks),
        };
        onBlocksChange([...blocks, dup]);
        setSelectedBlockId(dup.id);
        if (dup.type === 'text') setPendingFocusBlockId(dup.id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canEdit, selectedBlockId, blocks, onBlocksChange]);

  // Paste image
  useEffect(() => {
    if (!canEdit) return;
    const handlePaste = (event: ClipboardEvent) => {
      const imageItem = Array.from(event.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'));
      const file = imageItem?.getAsFile();
      if (!file) return;
      event.preventDefault();
      void addPendingImageAtPoint(file, lastPointerPointRef.current);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, blocks]);

  // Click outside page to dismiss selection (fix #5)
  useEffect(() => {
    if (!canEdit) return;
    const handleClickOutside = (event: MouseEvent) => {
      const wrapper = wrapperRef.current;
      const page = pageRef.current;
      if (!wrapper || !page) return;
      // If click is inside the wrapper (scroll area) but outside the page
      if (wrapper.contains(event.target as Node) && !page.contains(event.target as Node)) {
        // Remove empty text blocks and deselect
        onBlocksChange(blocks.filter(b => b.type !== 'text' || (b.text ?? '').trim().length > 0));
        setSelectedBlockId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [canEdit, blocks, onBlocksChange]);

  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  const updateBlock = useCallback((blockId: string, updater: (b: PageElementDto) => PageElementDto) => {
    onBlocksChange(blocksRef.current.map(b => b.id === blockId ? updater(b) : b));
  }, [onBlocksChange]);

  const getNextImageInSequence = useCallback((currentUrl: string, sourceUrl: string, generatedUrls: string[]) => {
    const sequence = [sourceUrl, ...generatedUrls].filter((url, index, arr) => !!url && arr.indexOf(url) === index);
    if (sequence.length <= 1) {
      return null;
    }

    const currentIndex = sequence.findIndex((url) => url === currentUrl);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    return sequence[(safeIndex + 1) % sequence.length] || null;
  }, []);

  const cycleStandaloneImage = useCallback(async (blockId: string) => {
    const entry = pageLightboxEntries.find((candidate) => candidate.kind === 'block' && candidate.blockId === blockId);
    const block = blocksRef.current.find((candidate) => candidate.id === blockId && candidate.type === 'image');
    if (!entry || !block?.imageUrl) {
      return;
    }

    try {
      const lookupId = toGeneratedLookupId(block.imageUrl, entry.messageId);
      const result = await imageGenerationService.getResults(lookupId, 'chat_image');
      const generatedUrls = Array.isArray(result.results) ? (result.results as string[]) : [];
      const originalSourceUrl = generatedUrls.includes(block.imageUrl)
        ? deriveOriginalImageUrlFromGeneratedName(block.imageUrl)
        : block.imageUrl;
      const nextUrl = getNextImageInSequence(block.imageUrl, originalSourceUrl, generatedUrls);
      if (!nextUrl || nextUrl === block.imageUrl) {
        return;
      }

      updateBlock(blockId, (current) => current.type === 'image' ? { ...current, imageUrl: nextUrl } : current);
    } catch {
      // Keep the current image when no generated results are available.
    }
  }, [getNextImageInSequence, pageLightboxEntries, updateBlock]);

  const cycleEmbeddedImage = useCallback(async (blockId: string, embeddedIndex: number) => {
    const entry = pageLightboxEntries.find((candidate) => candidate.kind === 'embedded' && candidate.blockId === blockId && candidate.embeddedIndex === embeddedIndex);
    const block = blocksRef.current.find((candidate) => candidate.id === blockId && candidate.type === 'text');
    if (!entry || !block?.text || typeof window === 'undefined') {
      return;
    }

    const container = window.document.createElement('div');
    container.innerHTML = block.text;
    const images = Array.from(container.querySelectorAll('img'));
    const target = images[embeddedIndex];
    const currentUrl = target?.getAttribute('src') || '';
    if (!target || !currentUrl) {
      return;
    }

    try {
      const lookupId = toGeneratedLookupId(currentUrl, entry.messageId);
      const result = await imageGenerationService.getResults(lookupId, 'chat_image');
      const generatedUrls = Array.isArray(result.results) ? (result.results as string[]) : [];
      const originalSourceUrl = generatedUrls.includes(currentUrl)
        ? deriveOriginalImageUrlFromGeneratedName(currentUrl)
        : currentUrl;
      const nextUrl = getNextImageInSequence(currentUrl, originalSourceUrl, generatedUrls);
      if (!nextUrl || nextUrl === currentUrl) {
        return;
      }

      target.setAttribute('src', nextUrl);
      const editor = editorRegistry.get(blockId);
      if (editor) {
        editor.commands.setContent(container.innerHTML, false);
      }
      updateBlock(blockId, (current) => current.type === 'text' ? { ...current, text: container.innerHTML } : current);
    } catch {
      // Keep the current image when no generated results are available.
    }
  }, [getNextImageInSequence, pageLightboxEntries, updateBlock]);

  const bringToFront = useCallback((blockId: string) => {
    const nextZ = getNextZIndex(blocksRef.current);
    onBlocksChange(blocksRef.current.map(b => b.id === blockId ? { ...b, zIndex: nextZ } : b));
  }, [onBlocksChange]);

  const getPagePoint = (clientX: number, clientY: number): InsertPoint | null => {
    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
  };

  const addPendingImageAtPoint = async (file: File, point?: InsertPoint | null) => {
    const objectUrl = URL.createObjectURL(file);
    try {
      const naturalSize = await getImageSizeFromUrl(objectUrl);
      const fittedSize = fitImageWithinBounds(naturalSize.width, naturalSize.height);
      const block = createImageBlock(
        getNextZIndex(blocksRef.current),
        objectUrl,
        fittedSize.width,
        fittedSize.height,
        clamp((point?.x ?? 252) - fittedSize.width / 2, 0, PAGE_WIDTH - fittedSize.width),
        clamp((point?.y ?? 222) - fittedSize.height / 5, 0, PAGE_HEIGHT - fittedSize.height),
      );
      onBlocksChange([...blocksRef.current, block]);
      setSelectedBlockId(block.id);
      onPendingImagesChange(current => ({ ...current, [block.id]: { file, objectUrl } }));
    } catch {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    if ((event.target as HTMLElement)?.closest('[data-block-root="true"]')) return;
    const point = getPagePoint(event.clientX, event.clientY);
    if (!point) return;
    lastPointerPointRef.current = point;
    // Remove empty text blocks before creating new one
    const cleaned = blocks.filter(b => b.type !== 'text' || (b.text ?? '').trim().length > 0);
    const block = createTextBlock(getNextZIndex(cleaned),
      clamp(point.x - 150, 0, PAGE_WIDTH - 320), clamp(point.y - 20, 0, PAGE_HEIGHT - 52));
    onBlocksChange([...cleaned, block]);
    setSelectedBlockId(block.id);
    setPendingFocusBlockId(block.id);
  };

  // Drag / Resize
  const startPointerInteraction = useCallback((event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>, block: PageElementDto, mode: 'move' | 'resize-br' | 'resize-tr') => {
    if (!canEdit) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedBlockId(block.id);
    bringToFront(block.id);
    dragStateRef.current = {
      blockId: block.id,
      mode,
      originX: block.x,
      originY: block.y,
      originWidth: block.width,
      originHeight: block.height,
      originAspectRatio: block.height > 0 ? block.width / block.height : 1,
      startX: event.clientX,
      startY: event.clientY,
    };

    if ('currentTarget' in event && 'setPointerCapture' in event.currentTarget && 'pointerId' in event) {
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
    }

    const handleMove = (e: PointerEvent | MouseEvent) => {
      const ds = dragStateRef.current;
      if (!ds) return;
      const dx = (e.clientX - ds.startX) / zoom, dy = (e.clientY - ds.startY) / zoom;
      onBlocksChange(blocksRef.current.map(b => {
        if (b.id !== ds.blockId) return b;
        if (ds.mode === 'move') {
          return { ...b, x: clamp(ds.originX + dx, 0, PAGE_WIDTH - b.width), y: clamp(ds.originY + dy, 0, PAGE_HEIGHT - b.height) };
        }
        if (b.type === 'image') {
          return resizeImageBlockWithAspectRatio(b, ds, dx, dy);
        }
        if (ds.mode === 'resize-br') {
          // Bottom-right: grow width right, grow height down
          return { ...b, width: clamp(ds.originWidth + dx, MIN_BLOCK_WIDTH, PAGE_WIDTH - b.x), height: clamp(ds.originHeight + dy, MIN_BLOCK_HEIGHT, PAGE_HEIGHT - b.y) };
        }
        // resize-tr: grow width right, shrink from top
        const newHeight = clamp(ds.originHeight - dy, MIN_BLOCK_HEIGHT, ds.originY + ds.originHeight);
        const newY = ds.originY + ds.originHeight - newHeight;
        return { ...b, width: clamp(ds.originWidth + dx, MIN_BLOCK_WIDTH, PAGE_WIDTH - b.x), y: newY, height: newHeight };
      }));
    };
    const handleUp = () => {
      dragStateRef.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [canEdit, blocks, onBlocksChange, bringToFront, zoom]);

  const handleDeleteBlock = useCallback(() => {
    if (!selectedBlockId) return;
    onPendingImagesChange(current => {
      const entry = current[selectedBlockId];
      if (!entry) return current;
      URL.revokeObjectURL(entry.objectUrl);
      const next = { ...current }; delete next[selectedBlockId]; return next;
    });
    onBlocksChange(blocksRef.current.filter(b => b.id !== selectedBlockId));
    setSelectedBlockId(null);
  }, [selectedBlockId, onBlocksChange, onPendingImagesChange]);

  const openImageLightbox = useCallback(async (blockId: string) => {
    const index = lightboxIndexByBlockId[blockId];
    if (index === undefined || !lightboxImages[index]) {
      return;
    }

    const resolved = await resolveLightboxPayload();
    if (!resolved.images[index]) {
      return;
    }

    setLightbox({
      images: resolved.images,
      index,
      groups: resolved.groups,
      groupIndex: index,
    });
  }, [lightboxImages, lightboxIndexByBlockId, resolveLightboxPayload]);

  const openEmbeddedImageLightbox = useCallback(async (blockId: string, embeddedIndex: number) => {
    const index = lightboxIndexByEmbeddedImageKey[`${blockId}:${embeddedIndex}`];
    if (index === undefined || !lightboxImages[index]) {
      return;
    }

    const resolved = await resolveLightboxPayload();
    if (!resolved.images[index]) {
      return;
    }

    setLightbox({
      images: resolved.images,
      index,
      groups: resolved.groups,
      groupIndex: index,
    });
  }, [lightboxImages, lightboxIndexByEmbeddedImageKey, resolveLightboxPayload]);

  const getEmbeddedImageIndexFromEvent = useCallback((event: React.SyntheticEvent<HTMLElement>) => {
    const target = (event.target as HTMLElement | null)?.closest('img');
    const currentTarget = event.currentTarget as HTMLElement | null;
    if (!target || !currentTarget) {
      return null;
    }

    const contentRoot = currentTarget.querySelector('[data-richtext-content="true"]') as HTMLElement | null;
    const searchRoot = contentRoot || currentTarget;
    const images = Array.from(searchRoot.querySelectorAll('img'));
    const imageIndex = images.findIndex((img) => img === target);
    return imageIndex >= 0 ? imageIndex : null;
  }, []);

  const handleReadOnlyTextImageClick = useCallback((event: React.MouseEvent<HTMLElement>, blockId: string) => {
    const imageIndex = getEmbeddedImageIndexFromEvent(event);
    if (imageIndex === null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    openEmbeddedImageLightbox(blockId, imageIndex);
  }, [getEmbeddedImageIndexFromEvent, openEmbeddedImageLightbox]);

  // Resize handle component
  const ResizeHandles = ({ block }: { block: PageElementDto }) => (
    canEdit && selectedBlockId === block.id ? (
      <>
        {/* Top-right */}
        <BoxAny
          onPointerDown={(e: React.PointerEvent<HTMLElement>) => { e.stopPropagation(); e.preventDefault(); startPointerInteraction(e, block, 'resize-tr'); }}
          sx={{ position: 'absolute', right: -3, top: -3, width: 18, height: 18, cursor: 'nesw-resize', background: '#2563eb', borderRadius: '3px', border: '2px solid #fff', zIndex: 9999, boxShadow: '0 1px 3px rgba(0,0,0,0.2)', touchAction: 'none' }}
        />
        {/* Bottom-right */}
        <BoxAny
          onPointerDown={(e: React.PointerEvent<HTMLElement>) => { e.stopPropagation(); e.preventDefault(); startPointerInteraction(e, block, 'resize-br'); }}
          sx={{ position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, cursor: 'nwse-resize', background: '#2563eb', borderRadius: '3px', border: '2px solid #fff', zIndex: 9999, boxShadow: '0 1px 3px rgba(0,0,0,0.2)', touchAction: 'none' }}
        />
      </>
    ) : null
  );

  // Floating toolbar
  // Render toolbar inline — drag + image + delete
  const renderBlockToolbar = (block: PageElementDto) => (
    canEdit && selectedBlockId === block.id ? (
      <Paper elevation={3} sx={{ position: 'absolute', top: -32, left: 0, display: 'flex', alignItems: 'center', gap: 0.25, px: 0.5, py: 0.25, borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.97)', zIndex: 9999 }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
      >
        <IconButton size="small" onPointerDown={e => { e.stopPropagation(); startPointerInteraction(e, block, 'move'); }} sx={{ touchAction: 'none' }}><DragIndicatorIcon fontSize="small" /></IconButton>
        {block.type === 'image' && lightboxIndexByBlockId[block.id] !== undefined && (
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); openImageLightbox(block.id); }} sx={{ color: '#2563eb' }}>
            <MagicIcon sx={{ fontSize: 18 }} />
          </IconButton>
        )}
        {block.type === 'image' && lightboxIndexByBlockId[block.id] !== undefined && (
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); void cycleStandaloneImage(block.id); }} sx={{ color: '#2563eb' }}>
            <CycleImageIcon sx={{ fontSize: 18 }} />
          </IconButton>
        )}
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} sx={{ color: '#16a34a' }}><AddImageIcon sx={{ fontSize: 18 }} /></IconButton>
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleDeleteBlock(); }}><DeleteOutlineIcon fontSize="small" /></IconButton>
      </Paper>
    ) : null
  );

  return (
    <BoxAny ref={wrapperRef} sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: { xs: 1, md: 2 }, background: 'linear-gradient(180deg, #ecf3fb 0%, #f8fafc 100%)', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
      <BoxAny sx={{ minWidth: PAGE_WIDTH * zoom + 24, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', pb: 4 }}>
        <BoxAny
          ref={pageRef}
          onClick={handleCanvasClick}
          onMouseMove={(e: React.MouseEvent) => { const p = getPagePoint(e.clientX, e.clientY); if (p) lastPointerPointRef.current = p; }}
          onDragOver={(e: React.DragEvent) => {
            if (!canEdit) return;
            // Let Tiptap handle drags inside text blocks
            if ((e.target as HTMLElement)?.closest('.tiptap')) return;
            if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
          }}
          onDrop={(e: React.DragEvent) => {
            if (!canEdit) return;
            // Let Tiptap handle drops inside text blocks
            if ((e.target as HTMLElement)?.closest('.tiptap')) return;
            if (!e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
            if (!file) return;
            const point = getPagePoint(e.clientX, e.clientY);
            if (point) void addPendingImageAtPoint(file, point);
          }}
          sx={{
            width: PAGE_WIDTH * zoom, height: PAGE_HEIGHT * zoom,
            position: 'relative', overflow: 'hidden', borderRadius: '12px',
            ...getPageStyleSx(pageStyle, zoom),
            boxShadow: '0 20px 60px rgba(15,23,42,0.14)',
            border: '1px solid rgba(15,23,42,0.08)',
            cursor: canEdit ? 'text' : 'default',
          }}
        >
          <BoxAny sx={{ position: 'absolute', inset: 0, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
            {/* Page number watermark */}
            <BoxAny sx={{ position: 'absolute', top: 12, left: 20, color: 'rgba(100,116,139,0.4)', pointerEvents: 'none', fontSize: 10 }}>
              第 {pageNumber} 页
            </BoxAny>

            {blocks.map(block => {
              const isSelected = selectedBlockId === block.id;

              if (block.type === 'image') {
                return block.imageUrl ? (
                  <BoxAny key={block.id} data-block-root="true"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      if (!canEdit) {
                        openImageLightbox(block.id);
                        return;
                      }
                      setSelectedBlockId(block.id);
                      bringToFront(block.id);
                    }}
                    onDoubleClick={canEdit && lightboxIndexByBlockId[block.id] !== undefined
                      ? (e: React.MouseEvent) => {
                          e.stopPropagation();
                          openImageLightbox(block.id);
                        }
                      : undefined}
                    onPointerDown={canEdit ? (e: React.PointerEvent<HTMLElement>) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      const nearRight = r.right - e.clientX <= 24;
                      const nearTop = e.clientY - r.top <= 24;
                      const nearBottom = r.bottom - e.clientY <= 24;
                      const mode = nearRight && nearBottom ? 'resize-br' : nearRight && nearTop ? 'resize-tr' : 'move';
                      startPointerInteraction(e, block, mode);
                    } : undefined}
                    sx={{ position: 'absolute', left: block.x, top: block.y, width: block.width, height: block.height, zIndex: block.zIndex, userSelect: 'none', cursor: canEdit ? 'move' : 'default', outline: isSelected ? '2px solid rgba(37,99,235,0.5)' : 'none', outlineOffset: 1, overflow: 'visible', touchAction: 'none' }}
                  >
                    <BoxAny component="img" src={block.imageUrl} alt="" draggable={false}
                      onDragStart={(e: React.DragEvent) => e.preventDefault()}
                      sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', pointerEvents: 'none' }}
                    />
                    <ResizeHandles block={block} />
                    {renderBlockToolbar(block)}
                  </BoxAny>
                ) : null;
              }

              // Text block — with resize handle like images
              return (
                <BoxAny key={block.id} data-block-root="true"
                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); if (canEdit) { setSelectedBlockId(block.id); bringToFront(block.id); } }}
                  sx={{ position: 'absolute', left: block.x, top: block.y, width: block.width, height: block.height, zIndex: block.zIndex, overflow: 'visible', borderRadius: '4px', border: isSelected ? '1px solid rgba(37,99,235,0.45)' : '1px solid transparent', backgroundColor: 'transparent', display: 'flex', flexDirection: 'column' }}
                >
                  {canEdit ? (
                    <BoxAny
                      data-richtext-content="true"
                      sx={{ flex: '1 1 auto', minHeight: 0, '& .tiptap img': { cursor: 'default' } }}
                    >
                      <RichTextBlockWithRegistry
                        blockId={block.id}
                        html={block.text ?? ''}
                        autoFocus={pendingFocusBlockId === block.id}
                        onChange={html => {
                          updateBlock(block.id, cur => ({ ...cur, text: html }));
                          if (pendingFocusBlockId === block.id) setPendingFocusBlockId(null);
                        }}
                        onFocus={() => { setSelectedBlockId(block.id); if (pendingFocusBlockId === block.id) setPendingFocusBlockId(null); }}
                        fontSize={block.fontSize}
                        onImageLightboxRequest={(imageIndex) => openEmbeddedImageLightbox(block.id, imageIndex)}
                        onImageCycleRequest={(imageIndex) => { void cycleEmbeddedImage(block.id, imageIndex); }}
                      />
                    </BoxAny>
                  ) : (
                    <BoxAny data-richtext-content="true"
                      onClickCapture={(e: React.MouseEvent<HTMLElement>) => handleReadOnlyTextImageClick(e, block.id)}
                      sx={{
                        px: 0.5, py: 0.25, fontSize: block.fontSize ?? 16, textAlign: block.textAlign ?? 'left',
                        lineHeight: 1.5, wordBreak: 'break-word', flex: '1 1 auto',
                        '& p': { margin: 0 },
                        '& h1': { margin: 0, fontSize: '2em', fontWeight: 700, lineHeight: 1.3 },
                        '& h2': { margin: 0, fontSize: '1.5em', fontWeight: 700, lineHeight: 1.35 },
                        '& h3': { margin: 0, fontSize: '1.25em', fontWeight: 600, lineHeight: 1.4 },
                        '& ul, & ol': { margin: 0, paddingLeft: '1.6em' },
                        '& li': { margin: 0, '& > p': { margin: 0 } },
                        '& img': { cursor: 'zoom-in' },
                      }}
                      dangerouslySetInnerHTML={{ __html: block.text ?? '' }}
                    />
                  )}
                  <ResizeHandles block={block} />
                  {renderBlockToolbar(block)}
                </BoxAny>
              );
            })}
          </BoxAny>
        </BoxAny>
      </BoxAny>
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(e) => {
        const file = e.target.files?.[0]; e.target.value = '';
        if (!file) return;
        void addPendingImageAtPoint(file, lastPointerPointRef.current);
      }} />
      {lightbox ? (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          groups={lightbox.groups}
          initialGroupIndex={lightbox.groupIndex}
          open
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </BoxAny>
  );
};
