import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, IconButton, Menu, MenuItem, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress, Divider, InputBase, Stack, Tooltip, Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  ChevronLeft as PrevIcon,
  ChevronRight as NextIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  FitScreen as FitScreenIcon,
} from '@mui/icons-material';
import {
  notebookService,
  type NotebookSectionDto, type NotebookPageSummaryDto, type NotebookPageDto,
} from '@/services/notebook.service';
import type { PageElementDto } from '@/services/family.service';
import apiClient from '@/utils/api';
import { FamilyPageCanvas, PAGE_STYLES, normalizeBlocks, type PendingImageUpload } from '@/components/Family/FamilyPageCanvas';
import { RichTextToolbar, SharedRichTextToolbar, editorRegistry } from '@/components/Family/RichTextBlock';

const BoxAny = Box as any;

function clamp(v: number, min: number, max: number) { return Math.min(Math.max(v, min), max); }

function extensionFromMimeType(mimeType: string) {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  return 'jpg';
}

async function uploadInlineNotebookImage(src: string) {
  const response = await fetch(src);
  const blob = await response.blob();
  const extension = extensionFromMimeType(blob.type || 'image/jpeg');
  const formData = new FormData();
  formData.append('file', blob, `notebook-inline-image.${extension}`);
  const res = await apiClient.post<{ url: string }>('/media/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  return res.data.url;
}

async function persistEmbeddedNotebookImages(html: string | undefined) {
  if (!html || typeof window === 'undefined') return html ?? '';
  const container = window.document.createElement('div');
  container.innerHTML = html;
  const images = Array.from(container.querySelectorAll('img'));
  let changed = false;

  for (const image of images) {
    const src = image.getAttribute('src') || '';
    if (!src.startsWith('blob:') && !src.startsWith('data:image/')) continue;
    const uploadedUrl = await uploadInlineNotebookImage(src);
    image.setAttribute('src', uploadedUrl);
    changed = true;
  }

  return changed ? container.innerHTML : html;
}

interface NotebookProps {
  notebookId: string;
  canEdit: boolean;
}

export const Notebook: React.FC<NotebookProps> = ({ notebookId, canEdit }) => {
  // ── Sections ──
  const [sections, setSections] = useState<NotebookSectionDto[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState('');
  const [sectionContextMenu, setSectionContextMenu] = useState<{ sectionId: string; anchorEl: HTMLElement } | null>(null);
  // ── Pages ──
  const [pageSummaries, setPageSummaries] = useState<NotebookPageSummaryDto[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<NotebookPageDto | null>(null);
  const [pageContextMenu, setPageContextMenu] = useState<{ pageId: string; anchorEl: HTMLElement } | null>(null);
  // ── Canvas state (lifted) ──
  const [draftBlocks, setDraftBlocks] = useState<PageElementDto[]>([]);
  const [pendingImages, setPendingImages] = useState<Record<string, PendingImageUpload>>({});
  const [dirty, setDirty] = useState(false);
  // ── UI ──
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1.0);
  const [pageStyle, setPageStyle] = useState(0);
  const [activeTextBlockId, setActiveTextBlockId] = useState<string | null>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  const sortedSections = useMemo(() => [...sections].sort((a, b) => a.sortOrder - b.sortOrder), [sections]);
  const sortedPages = useMemo(() => [...pageSummaries].sort((a, b) => a.pageNumber - b.pageNumber), [pageSummaries]);

  const hasChanges = dirty;

  // Confirm before switching away from unsaved changes
  const hasChangesRef = useRef(false);
  hasChangesRef.current = hasChanges;
  const [unsavedDialog, setUnsavedDialog] = useState<{ action: () => void } | null>(null);

  const confirmIfUnsaved = useCallback((action: () => void) => {
    if (hasChangesRef.current) {
      setUnsavedDialog({ action });
    } else {
      action();
    }
  }, []);

  // Warn on browser close/navigate with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasChangesRef.current) { e.preventDefault(); }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ── Load sections ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSections([]);
    setActiveSectionId(null);
    notebookService.listSections(notebookId).then(result => {
      if (cancelled) return;
      setSections(result);
      setLoading(false);
      if (result.length > 0) {
        const sorted = [...result].sort((a, b) => a.sortOrder - b.sortOrder);
        setActiveSectionId(sorted[0].id);
      }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [notebookId]);

  // ── Load pages when section changes ──
  useEffect(() => {
    if (!activeSectionId) { setPageSummaries([]); setActivePageId(null); setActivePage(null); return; }
    let cancelled = false;
    notebookService.listPages(notebookId, activeSectionId).then(result => {
      if (cancelled) return;
      setPageSummaries(result);
      if (result.length > 0) {
        const sorted = [...result].sort((a, b) => a.pageNumber - b.pageNumber);
        setActivePageId(sorted[0].id);
      } else { setActivePageId(null); setActivePage(null); }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [notebookId, activeSectionId]);

  // ── Load page content ──
  useEffect(() => {
    if (!activePageId) { setActivePage(null); setDraftBlocks([]); return; }
    let cancelled = false;
    notebookService.getPage(notebookId, activePageId).then(result => {
      if (cancelled) return;
      setActivePage(result);
      setDraftBlocks(normalizeBlocks(result.elements));
      setDirty(false);
      setPendingImages(current => { Object.values(current).forEach(e => URL.revokeObjectURL(e.objectUrl)); return {}; });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [notebookId, activePageId]);

  // ── Section handlers ──
  const handleAddSection = useCallback(async () => {
    try {
      const newSection = await notebookService.createSection(notebookId, { name: '新章节' });
      setSections(prev => [...prev, newSection]);
      setActiveSectionId(newSection.id);
      setEditingTabId(newSection.id);
      setEditingTabName(newSection.name);
    } catch {}
  }, [notebookId]);

  const commitTabRename = useCallback(async () => {
    if (!editingTabId) return;
    const name = editingTabName.trim();
    if (name) {
      try {
        const updated = await notebookService.updateSection(notebookId, editingTabId, { name });
        setSections(prev => prev.map(s => s.id === editingTabId ? updated : s));
      } catch {}
    }
    setEditingTabId(null);
  }, [notebookId, editingTabId, editingTabName]);

  const handleDeleteSection = useCallback(async (sectionId: string) => {
    try {
      await notebookService.deleteSection(notebookId, sectionId);
      setSections(prev => {
        const next = prev.filter(s => s.id !== sectionId);
        if (activeSectionId === sectionId && next.length > 0) {
          setActiveSectionId(next.sort((a, b) => a.sortOrder - b.sortOrder)[0].id);
        } else if (next.length === 0) { setActiveSectionId(null); }
        return next;
      });
    } catch {}
    setSectionContextMenu(null);
  }, [notebookId, activeSectionId]);

  // ── Page handlers ──
  const handleAddPage = useCallback(async () => {
    if (!activeSectionId) return;
    try {
      const newPage = await notebookService.createPage(notebookId, activeSectionId);
      setPageSummaries(prev => [...prev, { id: newPage.id, pageNumber: newPage.pageNumber }]);
      setActivePageId(newPage.id);
    } catch {}
  }, [notebookId, activeSectionId]);

  const handleDeletePage = useCallback(async (pageId: string) => {
    try {
      await notebookService.deletePage(notebookId, pageId);
      setPageSummaries(prev => {
        const next = prev.filter(p => p.id !== pageId);
        if (activePageId === pageId && next.length > 0) {
          setActivePageId(next.sort((a, b) => a.pageNumber - b.pageNumber)[0].id);
        } else if (next.length === 0) { setActivePageId(null); setActivePage(null); }
        return next;
      });
    } catch {}
    setPageContextMenu(null);
  }, [notebookId, activePageId]);

  // ── Save ──
  const handleSave = useCallback(async () => {
    if (!activePageId || !hasChanges) return;
    setSaving(true);
    try {
      const uploadedUrls: Record<string, string> = {};
      for (const [blockId, pending] of Object.entries(pendingImages)) {
        const formData = new FormData();
        formData.append('file', pending.file);
        const res = await apiClient.post<{ url: string }>('/media/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        uploadedUrls[blockId] = res.data.url;
      }
      // Clean up empty text blocks before saving
      const isEmptyText = (b: PageElementDto) => b.type === 'text' && (!b.text || b.text === '' || b.text === '<p></p>');
      const cleanedBlocks = draftBlocks.filter(b => !isEmptyText(b));
      const normalizedBlocks = normalizeBlocks(cleanedBlocks);
      const finalBlocks = await Promise.all(normalizedBlocks.map(async (b) => {
        if (b.type === 'image' && uploadedUrls[b.id]) {
          return { ...b, imageUrl: uploadedUrls[b.id], text: undefined };
        }
        if (b.type === 'text') {
          return { ...b, text: await persistEmbeddedNotebookImages(b.text) };
        }
        return b;
      }));
      setDraftBlocks(finalBlocks);
      const updated = await notebookService.updatePage(notebookId, activePageId, { elements: finalBlocks });
      setActivePage(updated);
      setDirty(false);
      setPendingImages(current => {
        Object.keys(uploadedUrls).forEach(id => { const e = current[id]; if (e) URL.revokeObjectURL(e.objectUrl); });
        const next = { ...current }; Object.keys(uploadedUrls).forEach(id => delete next[id]); return next;
      });
    } catch {}
    setSaving(false);
  }, [notebookId, activePageId, hasChanges, draftBlocks, pendingImages]);

  // ── Zoom fit to width ──
  const handleFitToWidth = useCallback(() => {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper) { setZoom(1.0); return; }
    const available = wrapper.clientWidth - 48; // padding
    const fit = clamp(+(available / 816).toFixed(2), 0.3, 2.0);
    setZoom(fit);
  }, []);

  // ── Render ──

  // ── Render ──

  if (loading) {
    return (
      <BoxAny sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={28} />
      </BoxAny>
    );
  }

  return (
    <BoxAny sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* ── Toolbar ── */}
      <BoxAny sx={{
        borderBottom: '1px solid rgba(15,23,42,0.10)',
        background: '#f1f5f9',
      }}>
        {/* Main row: sections | formatting (inline on wide) | pages + actions */}
        <BoxAny sx={{
          display: 'flex', alignItems: 'center', minHeight: 36,
          flexWrap: 'nowrap', overflowX: 'auto',
          scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
        }}>
        {/* ── Left: Section tabs ── */}
        <Stack direction="row" spacing={0} alignItems="stretch" sx={{ flexShrink: 0 }}>
          {sortedSections.map((section, idx) => {
            const isActive = section.id === activeSectionId;
            const colors = ['#dbeafe', '#fce7f3', '#d1fae5', '#fef9c3', '#e0e7ff', '#fde68a', '#ccfbf1', '#f3e8ff'];
            const activeColors = ['#93c5fd', '#f9a8d4', '#6ee7b7', '#fde047', '#a5b4fc', '#fcd34d', '#5eead4', '#d8b4fe'];
            const ci = idx % colors.length;
            return (
              <BoxAny
                key={section.id}
                onClick={() => { if (editingTabId && editingTabId !== section.id) commitTabRename(); confirmIfUnsaved(() => setActiveSectionId(section.id)); }}
                onDoubleClick={() => { if (canEdit) { setEditingTabId(section.id); setEditingTabName(section.name); } }}
                onContextMenu={(e: React.MouseEvent<HTMLElement>) => { if (canEdit) { e.preventDefault(); setSectionContextMenu({ sectionId: section.id, anchorEl: e.currentTarget }); } }}
                sx={{
                  px: 0.75, py: 0,
                  fontSize: 12.5, fontWeight: isActive ? 700 : 400,
                  cursor: 'pointer',
                  background: isActive ? activeColors[ci] : colors[ci],
                  color: isActive ? '#1e293b' : '#475569',
                  borderRight: '1px solid rgba(15,23,42,0.10)',
                  borderBottom: isActive ? '2px solid #1e40af' : '2px solid transparent',
                  borderTopLeftRadius: 6, borderTopRightRadius: 6,
                  '&:hover': { background: activeColors[ci] },
                  whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', minHeight: 36,
                  transition: 'background 0.15s',
                }}
              >
                {editingTabId === section.id ? (
                  <InputBase
                    autoFocus
                    value={editingTabName}
                    onChange={e => setEditingTabName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitTabRename(); } if (e.key === 'Escape') setEditingTabId(null); }}
                    onClick={e => e.stopPropagation()}
                    sx={{ fontSize: 12.5, fontWeight: 500, width: Math.max(48, editingTabName.length * 9 + 16), '& input': { py: 0, textAlign: 'center' } }}
                  />
                ) : section.name}
              </BoxAny>
            );
          })}
          {canEdit && (
            <BoxAny
              onClick={handleAddSection}
              sx={{
                px: 0.5, display: 'flex', alignItems: 'center', cursor: 'pointer',
                color: '#64748b', '&:hover': { color: '#2563eb', background: 'rgba(37,99,235,0.08)' },
                fontSize: 12.5, fontWeight: 400, userSelect: 'none', minHeight: 36,
              }}
            >
              +
            </BoxAny>
          )}
        </Stack>


        {/* Inline formatting toolbar — hidden on narrow screens */}
        {canEdit && activeTextBlockId && (
          <BoxAny sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', px: 0.5, flexShrink: 1, minWidth: 0, overflow: 'hidden' }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <SharedRichTextToolbar activeBlockId={activeTextBlockId} />
          </BoxAny>
        )}

        {/* ── Right: Page nav + actions (pushed right) ── */}
        <Stack direction="row" spacing={0} alignItems="center" sx={{ ml: 'auto', flexShrink: 0 }}>
          {/* Page < N > + navigation */}
          {(() => {
            const activeIdx = sortedPages.findIndex(p => p.id === activePageId);
            const currentNum = activeIdx >= 0 ? sortedPages[activeIdx].pageNumber : 0;
            const hasPrev = activeIdx > 0;
            const hasNext = activeIdx < sortedPages.length - 1;
            const navSx = { px: 0.5, fontSize: 12.5, lineHeight: '36px', height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none', cursor: 'pointer' };
            return (
              <>
                {sortedPages.length > 0 && (
                  <>
                    <BoxAny onClick={() => { if (hasPrev) confirmIfUnsaved(() => setActivePageId(sortedPages[activeIdx - 1].id)); }}
                      sx={{ ...navSx, color: hasPrev ? '#475569' : '#cbd5e1', cursor: hasPrev ? 'pointer' : 'default', '&:hover': hasPrev ? { color: '#1e40af' } : {} }}>
                      <PrevIcon sx={{ fontSize: 18 }} />
                    </BoxAny>
                    <BoxAny onContextMenu={(e: React.MouseEvent<HTMLElement>) => { if (canEdit && activePageId) { e.preventDefault(); setPageContextMenu({ pageId: activePageId, anchorEl: e.currentTarget }); } }}
                      sx={{ ...navSx, fontWeight: 600, color: '#fff', cursor: 'default', px: 0.75, bgcolor: '#3b82f6', borderRadius: '4px', mx: 0.25 }}>
                      {currentNum}
                    </BoxAny>
                    <BoxAny onClick={() => { if (hasNext) confirmIfUnsaved(() => setActivePageId(sortedPages[activeIdx + 1].id)); }}
                      sx={{ ...navSx, color: hasNext ? '#475569' : '#cbd5e1', cursor: hasNext ? 'pointer' : 'default', '&:hover': hasNext ? { color: '#1e40af' } : {} }}>
                      <NextIcon sx={{ fontSize: 18 }} />
                    </BoxAny>
                  </>
                )}
                {canEdit && activeSectionId && (
                  <BoxAny onClick={handleAddPage}
                    sx={{ ...navSx, color: '#64748b', '&:hover': { color: '#2563eb', background: 'rgba(37,99,235,0.08)' } }}>
                    +
                  </BoxAny>
                )}
                <Tooltip title={PAGE_STYLES[pageStyle].name}><span>
                  <BoxAny onClick={() => setPageStyle(s => (s + 1) % PAGE_STYLES.length)}
                    sx={{ px: 0.5, fontSize: 12, cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', height: 36, userSelect: 'none', '&:hover': { color: '#1e40af' } }}>
                    {PAGE_STYLES[pageStyle].icon}
                  </BoxAny>
                </span></Tooltip>
              </>
            );
          })()}

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Actions: save, zoom */}
          <Stack direction="row" spacing={0.25} alignItems="center" sx={{ px: 0.5 }}>
            {canEdit && activePage && (
              <>
                {hasChanges && (
                  <Button size="small" variant="contained" onClick={handleSave} disabled={saving}
                    sx={{ fontSize: 10, textTransform: 'none', minHeight: 22, minWidth: 0, px: 0.75, py: 0 }}>
                    {saving ? '…' : '保存'}
                  </Button>
                )}
              </>
            )}
            <Tooltip title="缩小"><span>
              <IconButton size="small" onClick={() => setZoom(z => clamp(+(z - 0.01).toFixed(2), 0.3, 2.0))} sx={{ p: 0.25 }}>
                <ZoomOutIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </span></Tooltip>
            <Typography variant="caption" sx={{ fontSize: 10, mx: -0.25 }}>{Math.round(zoom * 100)}</Typography>
            <Tooltip title="放大"><span>
              <IconButton size="small" onClick={() => setZoom(z => clamp(+(z + 0.01).toFixed(2), 0.3, 2.0))} sx={{ p: 0.25 }}>
                <ZoomInIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </span></Tooltip>
            <Tooltip title="适应宽度"><span>
              <IconButton size="small" onClick={handleFitToWidth} sx={{ p: 0.25 }}>
                <FitScreenIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </span></Tooltip>
          </Stack>
        </Stack>
      </BoxAny>

      {/* Row 2: Rich text toolbar — only on narrow screens when editing text */}
      {canEdit && activeTextBlockId && (
        <BoxAny sx={{
          display: { xs: 'flex', md: 'none' }, alignItems: 'center', px: 0.5, minHeight: 28,
          borderBottom: '1px solid rgba(15,23,42,0.06)',
          background: '#f8fafc',
          overflowX: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
        }}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <SharedRichTextToolbar activeBlockId={activeTextBlockId} />
        </BoxAny>
      )}
      </BoxAny>

      {/* ── Canvas ── */}
      <BoxAny ref={canvasWrapperRef} sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {activePage ? (
        <FamilyPageCanvas
          pageId={activePage.id}
          pageNumber={activePage.pageNumber}
          blocks={draftBlocks}
          canEdit={canEdit}
          zoom={zoom}
          pageStyle={pageStyle}
          onBlocksChange={(blocks) => {
            setDraftBlocks(blocks);
            // Only mark dirty if blocks meaningfully differ from saved
            const isEmptyText = (b: PageElementDto) => b.type === 'text' && (!b.text || b.text === '' || b.text === '<p></p>');
            const strip = (html: string | undefined) => (html || '').replace(/\s+/g, ' ').trim();
            const meaningfulNew = blocks.filter(b => !isEmptyText(b));
            const meaningfulSaved = activePage ? activePage.elements.filter(b => !isEmptyText(b)) : [];
            if (meaningfulNew.length !== meaningfulSaved.length) { setDirty(true); return; }
            const changed = meaningfulNew.some((b, i) => {
              const s = meaningfulSaved[i];
              if (!s) return true;
              if (b.type !== s.type || b.x !== s.x || b.y !== s.y || b.width !== s.width || b.height !== s.height) return true;
              if (b.type === 'text' && strip(b.text) !== strip(s.text)) return true;
              if (b.type === 'image' && b.imageUrl !== s.imageUrl) return true;
              return false;
            });
            setDirty(changed);
          }}
          pendingImages={pendingImages}
          onPendingImagesChange={setPendingImages}
          onActiveTextBlockChange={setActiveTextBlockId}
        />
      ) : sections.length === 0 ? (
        <BoxAny sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography color="text.secondary">
            {canEdit ? '点击 + 创建第一个章节' : '暂无笔记内容'}
          </Typography>
        </BoxAny>
      ) : (
        <BoxAny sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography color="text.secondary">选择一个章节</Typography>
        </BoxAny>
      )}
      </BoxAny>


      {/* Unsaved changes confirmation dialog */}
      <Dialog open={Boolean(unsavedDialog)} onClose={() => setUnsavedDialog(null)}
        PaperProps={{ sx: { borderRadius: '12px', backgroundColor: '#fff', backgroundImage: 'none', minWidth: 320 } }}>
        <DialogTitle sx={{ fontSize: 15, fontWeight: 600, pb: 0.5 }}>未保存的更改</DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          <Typography variant="body2" color="text.secondary">当前页面有未保存的更改，离开后将丢失。</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button onClick={() => setUnsavedDialog(null)} size="small" sx={{ textTransform: 'none' }}>继续编辑</Button>
          <Button onClick={() => { const action = unsavedDialog?.action; setUnsavedDialog(null); action?.(); }} size="small" variant="contained" color="error" sx={{ textTransform: 'none' }}>放弃更改</Button>
        </DialogActions>
      </Dialog>

      {/* Context menus */}
      <Menu open={Boolean(sectionContextMenu)} onClose={() => setSectionContextMenu(null)} anchorEl={sectionContextMenu?.anchorEl}>
        <MenuItem onClick={() => { if (sectionContextMenu) { setEditingTabId(sectionContextMenu.sectionId); setEditingTabName(sections.find(s => s.id === sectionContextMenu.sectionId)?.name ?? ''); } setSectionContextMenu(null); }} sx={{ fontSize: 12 }}>重命名</MenuItem>
        <MenuItem onClick={() => sectionContextMenu && handleDeleteSection(sectionContextMenu.sectionId)} sx={{ fontSize: 12, color: '#b91c1c' }}>删除</MenuItem>
      </Menu>
      <Menu open={Boolean(pageContextMenu)} onClose={() => setPageContextMenu(null)} anchorEl={pageContextMenu?.anchorEl}>
        <MenuItem onClick={() => pageContextMenu && handleDeletePage(pageContextMenu.pageId)} sx={{ fontSize: 12, color: '#b91c1c' }} disabled={sortedPages.length <= 1}>删除此页</MenuItem>
      </Menu>
    </BoxAny>
  );
};
