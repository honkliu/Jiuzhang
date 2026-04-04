import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Paper,
  Select,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import {
  DeleteOutline as DeleteOutlineIcon,
  DragIndicator as DragIndicatorIcon,
} from '@mui/icons-material';
import IconButton from '@mui/material/IconButton';
import apiClient from '@/utils/api';
import type { PageElementDto } from '@/services/family.service';

const BoxAny = Box as any;

export const PAGE_WIDTH = 816;
export const PAGE_HEIGHT = 1056;
const MIN_BLOCK_WIDTH = 72;
const MIN_BLOCK_HEIGHT = 40;
const MAX_Z_INDEX = 2147483647;

type DragState = {
  blockId: string;
  mode: 'move' | 'resize';
  originX: number;
  originY: number;
  originWidth: number;
  originHeight: number;
  startX: number;
  startY: number;
} | null;

type InsertPoint = { x: number; y: number };
type ImageNaturalSize = { width: number; height: number };

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
    fontSize: clamp(block.fontSize ?? 16, 12, 48),
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
  return clamp(Math.ceil(lines * fontSize * 1.7 + 24), 52, PAGE_HEIGHT);
}

function getRenderedImageRect(block: PageElementDto, naturalSize?: ImageNaturalSize) {
  if (!naturalSize || naturalSize.width <= 0 || naturalSize.height <= 0) {
    return { left: block.x, top: block.y, width: block.width, height: block.height };
  }
  const scale = Math.min(block.width / naturalSize.width, block.height / naturalSize.height);
  const rw = naturalSize.width * scale, rh = naturalSize.height * scale;
  return { left: block.x + (block.width - rw) / 2, top: block.y + (block.height - rh) / 2, width: rw, height: rh };
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
}

export const FamilyPageCanvas: React.FC<FamilyPageCanvasProps> = ({
  pageId, pageNumber, blocks, canEdit, zoom, onBlocksChange, pendingImages, onPendingImagesChange,
}) => {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [pendingFocusBlockId, setPendingFocusBlockId] = useState<string | null>(null);
  const [imageNaturalSizes, setImageNaturalSizes] = useState<Record<string, ImageNaturalSize>>({});
  const lastPointerPointRef = useRef<InsertPoint | null>(null);

  useEffect(() => {
    setSelectedBlockId(current => blocks.some(b => b.id === current) ? current : null);
    setPendingFocusBlockId(null);
  }, [pageId]);

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

  const updateBlock = (blockId: string, updater: (b: PageElementDto) => PageElementDto) => {
    onBlocksChange(blocks.map(b => b.id === blockId ? updater(b) : b));
  };

  const bringToFront = (blockId: string) => {
    const nextZ = getNextZIndex(blocks);
    onBlocksChange(blocks.map(b => b.id === blockId ? { ...b, zIndex: nextZ } : b));
  };

  const getPagePoint = (clientX: number, clientY: number): InsertPoint | null => {
    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
  };

  const addPendingImageAtPoint = (file: File, point?: InsertPoint | null) => {
    const objectUrl = URL.createObjectURL(file);
    const block = createImageBlock(getNextZIndex(blocks), objectUrl,
      clamp((point?.x ?? 252) - 160, 24, PAGE_WIDTH - 320),
      clamp((point?.y ?? 222) - 52, 24, PAGE_HEIGHT - 260));
    onBlocksChange([...blocks, block]);
    setSelectedBlockId(block.id);
    onPendingImagesChange(current => ({ ...current, [block.id]: { file, objectUrl } }));
  };

  // Exposed for Notebook to call
  (FamilyPageCanvas as any).__addPendingImageAtPoint = addPendingImageAtPoint;

  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    if ((event.target as HTMLElement)?.closest('[data-block-root="true"]')) return;
    const point = getPagePoint(event.clientX, event.clientY);
    if (!point) return;
    lastPointerPointRef.current = point;
    const block = createTextBlock(getNextZIndex(blocks),
      clamp(point.x - 150, 24, PAGE_WIDTH - 320), clamp(point.y - 36, 24, PAGE_HEIGHT - 180));
    onBlocksChange([...blocks, block]);
    setSelectedBlockId(block.id);
    setPendingFocusBlockId(block.id);
  };

  const startPointerInteraction = (event: React.MouseEvent<HTMLElement>, block: PageElementDto, mode: 'move' | 'resize') => {
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
      updateBlock(ds.blockId, cur => ds.mode === 'move'
        ? { ...cur, x: clamp(ds.originX + dx, 0, PAGE_WIDTH - cur.width), y: clamp(ds.originY + dy, 0, PAGE_HEIGHT - cur.height) }
        : { ...cur, width: clamp(ds.originWidth + dx, MIN_BLOCK_WIDTH, PAGE_WIDTH - cur.x), height: clamp(ds.originHeight + dy, MIN_BLOCK_HEIGHT, PAGE_HEIGHT - cur.y) });
    };
    const handleUp = () => { dragStateRef.current = null; window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const handleDeleteBlock = () => {
    if (!selectedBlockId) return;
    onPendingImagesChange(current => {
      const entry = current[selectedBlockId];
      if (!entry) return current;
      URL.revokeObjectURL(entry.objectUrl);
      const next = { ...current }; delete next[selectedBlockId]; return next;
    });
    onBlocksChange(blocks.filter(b => b.id !== selectedBlockId));
    setSelectedBlockId(null);
  };

  return (
    <BoxAny sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: { xs: 1, md: 2 }, background: 'linear-gradient(180deg, #ecf3fb 0%, #f8fafc 100%)' }}>
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
            backgroundColor: '#fffdf7',
            backgroundImage: `linear-gradient(rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)`,
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            boxShadow: '0 20px 60px rgba(15,23,42,0.14)',
            border: '1px solid rgba(15,23,42,0.08)',
            cursor: canEdit ? 'text' : 'default',
          }}
        >
          <BoxAny sx={{ position: 'absolute', inset: 0, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
            <BoxAny sx={{ position: 'absolute', top: 20, left: 28, right: 28, display: 'flex', justifyContent: 'space-between', color: 'rgba(100,116,139,0.5)', pointerEvents: 'none' }}>
              <Typography variant="caption">第 {pageNumber} 页</Typography>
            </BoxAny>

            {blocks.length === 0 && (
              <BoxAny sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', px: 8 }}>
                <Paper elevation={0} sx={{ px: 3, py: 2, borderRadius: '16px', bgcolor: 'rgba(255,255,255,0.88)', backgroundImage: 'none' }}>
                  <Typography sx={{ fontWeight: 700, mb: 0.5 }}>开始书写</Typography>
                  <Typography color="text.secondary">
                    {canEdit ? '单击页面任意空白处开始输入。拖入或粘贴图片。' : '只读模式'}
                  </Typography>
                </Paper>
              </BoxAny>
            )}

            {blocks.map(block => {
              const isSelected = selectedBlockId === block.id;
              if (block.type === 'image') {
                const rect = getRenderedImageRect(block, imageNaturalSizes[block.id]);
                return block.imageUrl ? (
                  <BoxAny key={block.id} data-block-root="true"
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); if (canEdit) { setSelectedBlockId(block.id); bringToFront(block.id); } }}
                    onMouseDown={canEdit ? (e: React.MouseEvent<HTMLElement>) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      startPointerInteraction(e, block, r.right - e.clientX <= 24 && r.bottom - e.clientY <= 24 ? 'resize' : 'move');
                    } : undefined}
                    sx={{ position: 'absolute', left: rect.left, top: rect.top, width: rect.width, height: rect.height, zIndex: block.zIndex, userSelect: 'none', cursor: canEdit ? 'move' : 'default', outline: isSelected ? '2px solid rgba(37,99,235,0.5)' : 'none', outlineOffset: 2 }}
                  >
                    <BoxAny component="img" src={block.imageUrl} alt="" draggable={false}
                      onDragStart={(e: React.DragEvent) => e.preventDefault()}
                      sx={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block', pointerEvents: 'none' }}
                      onLoad={(e: React.SyntheticEvent<HTMLImageElement>) => { const t = e.currentTarget; if (t.naturalWidth && t.naturalHeight) setImageNaturalSizes(c => ({ ...c, [block.id]: { width: t.naturalWidth, height: t.naturalHeight } })); }}
                    />
                    {/* Resize handle at bottom-right */}
                    {canEdit && isSelected && (
                      <BoxAny
                        onMouseDown={(e: React.MouseEvent<HTMLElement>) => { e.stopPropagation(); startPointerInteraction(e, block, 'resize'); }}
                        sx={{ position: 'absolute', right: -4, bottom: -4, width: 12, height: 12, cursor: 'nwse-resize', background: '#2563eb', borderRadius: '2px', border: '1px solid #fff' }}
                      />
                    )}
                    {/* Floating toolbar */}
                    {canEdit && isSelected && (
                      <Paper elevation={3} sx={{ position: 'absolute', top: -34, left: 0, display: 'flex', alignItems: 'center', gap: 0.25, px: 0.5, py: 0.25, borderRadius: '999px', backgroundColor: 'rgba(255,255,255,0.96)' }}>
                        <IconButton size="small" onMouseDown={e => startPointerInteraction(e, block, 'move')}><DragIndicatorIcon fontSize="small" /></IconButton>
                        <IconButton size="small" onClick={handleDeleteBlock}><DeleteOutlineIcon fontSize="small" /></IconButton>
                      </Paper>
                    )}
                  </BoxAny>
                ) : null;
              }
              return (
                <Paper key={block.id} data-block-root="true" elevation={0}
                  onClick={(e) => { e.stopPropagation(); if (canEdit) { setSelectedBlockId(block.id); bringToFront(block.id); } }}
                  sx={{ position: 'absolute', left: block.x, top: block.y, width: block.width, height: block.height, zIndex: block.zIndex, overflow: 'visible', borderRadius: '8px', border: isSelected ? '1px solid rgba(37,99,235,0.45)' : '1px solid transparent', backgroundColor: 'transparent', backgroundImage: 'none', display: 'flex', flexDirection: 'column', boxShadow: 'none' }}
                >
                  {canEdit ? (
                    <TextField autoFocus={pendingFocusBlockId === block.id} value={block.text ?? ''}
                      onChange={e => updateBlock(block.id, cur => ({ ...cur, text: e.target.value, height: estimateTextHeight(e.target.value, cur.width, cur.fontSize ?? 16) }))}
                      onFocus={() => { setSelectedBlockId(block.id); if (pendingFocusBlockId === block.id) setPendingFocusBlockId(null); }}
                      multiline fullWidth variant="standard" InputProps={{ disableUnderline: true }}
                      sx={{ flex: '1 1 auto', '& .MuiInputBase-root': { height: '100%', alignItems: 'stretch' }, '& textarea': { height: '100% !important', minHeight: '52px !important', overflow: 'hidden !important', fontSize: block.fontSize ?? 16, textAlign: block.textAlign ?? 'left', lineHeight: 1.65, padding: '4px 6px', boxSizing: 'border-box', backgroundColor: 'transparent' } }}
                    />
                  ) : (
                    <BoxAny sx={{ px: 0.75, py: 0.5, fontSize: block.fontSize ?? 16, textAlign: block.textAlign ?? 'left', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: '1 1 auto' }}>
                      {block.text}
                    </BoxAny>
                  )}
                  {canEdit && isSelected && (
                    <Paper elevation={3} sx={{ position: 'absolute', top: -38, left: 0, display: 'flex', alignItems: 'center', gap: 0.25, px: 0.5, py: 0.25, borderRadius: '999px', backgroundColor: 'rgba(255,255,255,0.96)' }}>
                      <IconButton size="small" onMouseDown={e => startPointerInteraction(e, block, 'move')}><DragIndicatorIcon fontSize="small" /></IconButton>
                      <Select
                        size="small"
                        value={block.fontSize ?? 16}
                        onChange={e => { e.stopPropagation(); updateBlock(block.id, cur => ({ ...cur, fontSize: Number(e.target.value), height: estimateTextHeight(cur.text ?? '', cur.width, Number(e.target.value)) })); }}
                        onClick={e => e.stopPropagation()}
                        variant="standard"
                        disableUnderline
                        sx={{ fontSize: 11, minWidth: 36, '& .MuiSelect-select': { py: 0, px: 0.5 } }}
                      >
                        {[12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48].map(s => (
                          <MenuItem key={s} value={s} sx={{ fontSize: 11 }}>{s}</MenuItem>
                        ))}
                      </Select>
                      <IconButton size="small" onClick={handleDeleteBlock}><DeleteOutlineIcon fontSize="small" /></IconButton>
                    </Paper>
                  )}
                </Paper>
              );
            })}
          </BoxAny>
        </BoxAny>
      </BoxAny>
    </BoxAny>
  );
};
