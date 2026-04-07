import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
} from '@mui/material';
import {
  DeleteOutline as DeleteOutlineIcon,
  DragIndicator as DragIndicatorIcon,
  AddPhotoAlternate as AddImageIcon,
} from '@mui/icons-material';
import IconButton from '@mui/material/IconButton';
import type { PageElementDto } from '@/services/family.service';
import { RichTextBlockWithRegistry } from './RichTextBlock';

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

type DragState = {
  blockId: string;
  mode: 'move' | 'resize-br' | 'resize-tr';
  originX: number;
  originY: number;
  originWidth: number;
  originHeight: number;
  startX: number;
  startY: number;
} | null;

type InsertPoint = { x: number; y: number };

export type PendingImageUpload = { file: File; objectUrl: string };

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

function createTextBlock(zIndex: number, left = 72, top = 72): PageElementDto {
  return { id: `pelem_${crypto.randomUUID()}`, type: 'text', x: left, y: top, width: 360, height: 52, zIndex, text: '', fontSize: 16, textAlign: 'left' };
}

function createImageBlock(zIndex: number, imageUrl: string, left = 92, top = 92): PageElementDto {
  return { id: `pelem_${crypto.randomUUID()}`, type: 'image', x: left, y: top, width: 320, height: 260, zIndex, imageUrl, fontSize: 16, textAlign: 'left' };
}

function estimateTextHeight(text: string, width: number, fontSize: number) {
  const safeWidth = Math.max(width, 220);
  const charsPerLine = Math.max(Math.floor((safeWidth - 28) / Math.max(fontSize * 0.62, 8)), 8);
  const lines = Math.max(text.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(Math.max(line.length, 1) / charsPerLine)), 0), 1);
  return clamp(Math.ceil(lines * fontSize * 1.5 + 16), MIN_BLOCK_HEIGHT, PAGE_HEIGHT);
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
  const lastPointerPointRef = useRef<InsertPoint | null>(null);

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
      addPendingImageAtPoint(file, lastPointerPointRef.current);
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

  const bringToFront = useCallback((blockId: string) => {
    const nextZ = getNextZIndex(blocksRef.current);
    onBlocksChange(blocksRef.current.map(b => b.id === blockId ? { ...b, zIndex: nextZ } : b));
  }, [onBlocksChange]);

  const getPagePoint = (clientX: number, clientY: number): InsertPoint | null => {
    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
  };

  const addPendingImageAtPoint = (file: File, point?: InsertPoint | null) => {
    const objectUrl = URL.createObjectURL(file);
    const block = createImageBlock(getNextZIndex(blocks), objectUrl,
      clamp((point?.x ?? 252) - 160, 0, PAGE_WIDTH - 320),
      clamp((point?.y ?? 222) - 52, 0, PAGE_HEIGHT - 260));
    onBlocksChange([...blocks, block]);
    setSelectedBlockId(block.id);
    onPendingImagesChange(current => ({ ...current, [block.id]: { file, objectUrl } }));
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
  const startPointerInteraction = useCallback((event: React.MouseEvent<HTMLElement>, block: PageElementDto, mode: 'move' | 'resize-br' | 'resize-tr') => {
    if (!canEdit) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedBlockId(block.id);
    bringToFront(block.id);
    dragStateRef.current = { blockId: block.id, mode, originX: block.x, originY: block.y, originWidth: block.width, originHeight: block.height, startX: event.clientX, startY: event.clientY };

    const handleMove = (e: MouseEvent) => {
      const ds = dragStateRef.current;
      if (!ds) return;
      const dx = (e.clientX - ds.startX) / zoom, dy = (e.clientY - ds.startY) / zoom;
      onBlocksChange(blocksRef.current.map(b => {
        if (b.id !== ds.blockId) return b;
        if (ds.mode === 'move') {
          return { ...b, x: clamp(ds.originX + dx, 0, PAGE_WIDTH - b.width), y: clamp(ds.originY + dy, 0, PAGE_HEIGHT - b.height) };
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
    const handleUp = () => { dragStateRef.current = null; window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
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

  // Resize handle component
  const ResizeHandles = ({ block }: { block: PageElementDto }) => (
    canEdit && selectedBlockId === block.id ? (
      <>
        {/* Top-right */}
        <BoxAny
          onMouseDown={(e: React.MouseEvent<HTMLElement>) => { e.stopPropagation(); e.preventDefault(); startPointerInteraction(e, block, 'resize-tr'); }}
          sx={{ position: 'absolute', right: -3, top: -3, width: 14, height: 14, cursor: 'nesw-resize', background: '#2563eb', borderRadius: '2px', border: '2px solid #fff', zIndex: 9999, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
        />
        {/* Bottom-right */}
        <BoxAny
          onMouseDown={(e: React.MouseEvent<HTMLElement>) => { e.stopPropagation(); e.preventDefault(); startPointerInteraction(e, block, 'resize-br'); }}
          sx={{ position: 'absolute', right: -3, bottom: -3, width: 14, height: 14, cursor: 'nwse-resize', background: '#2563eb', borderRadius: '2px', border: '2px solid #fff', zIndex: 9999, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
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
        onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <IconButton size="small" onMouseDown={e => { e.stopPropagation(); startPointerInteraction(e, block, 'move'); }}><DragIndicatorIcon fontSize="small" /></IconButton>
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
          onDragOver={(e: React.DragEvent) => { if (!canEdit) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
          onDrop={(e: React.DragEvent) => {
            if (!canEdit) return; e.preventDefault();
            const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
            if (!file) return;
            const point = getPagePoint(e.clientX, e.clientY);
            if (point) addPendingImageAtPoint(file, point);
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
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); if (canEdit) { setSelectedBlockId(block.id); bringToFront(block.id); } }}
                    onMouseDown={canEdit ? (e: React.MouseEvent<HTMLElement>) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      const nearRight = r.right - e.clientX <= 24;
                      const nearTop = e.clientY - r.top <= 24;
                      const nearBottom = r.bottom - e.clientY <= 24;
                      const mode = nearRight && nearBottom ? 'resize-br' : nearRight && nearTop ? 'resize-tr' : 'move';
                      startPointerInteraction(e, block, mode);
                    } : undefined}
                    sx={{ position: 'absolute', left: block.x, top: block.y, width: block.width, height: block.height, zIndex: block.zIndex, userSelect: 'none', cursor: canEdit ? 'move' : 'default', outline: isSelected ? '2px solid rgba(37,99,235,0.5)' : 'none', outlineOffset: 1, overflow: 'visible' }}
                  >
                    <BoxAny component="img" src={block.imageUrl} alt="" draggable={false}
                      onDragStart={(e: React.DragEvent) => e.preventDefault()}
                      sx={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block', pointerEvents: 'none' }}
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
                    />
                  ) : (
                    <BoxAny sx={{
                        px: 0.5, py: 0.25, fontSize: block.fontSize ?? 16, textAlign: block.textAlign ?? 'left',
                        lineHeight: 1.5, wordBreak: 'break-word', flex: '1 1 auto',
                        '& p': { margin: 0 },
                        '& h1': { margin: 0, fontSize: '2em', fontWeight: 700, lineHeight: 1.3 },
                        '& h2': { margin: 0, fontSize: '1.5em', fontWeight: 700, lineHeight: 1.35 },
                        '& h3': { margin: 0, fontSize: '1.25em', fontWeight: 600, lineHeight: 1.4 },
                        '& ul, & ol': { margin: 0, paddingLeft: '1.6em' },
                        '& li': { margin: 0, '& > p': { margin: 0 } },
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
        addPendingImageAtPoint(file, lastPointerPointRef.current);
      }} />
    </BoxAny>
  );
};
