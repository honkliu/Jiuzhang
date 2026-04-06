import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, IconButton, Menu, MenuItem, Button,
  CircularProgress, Divider, InputBase, Stack, Tooltip, Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  AddPhotoAlternate as AddPhotoAlternateIcon,
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
import { FamilyPageCanvas, normalizeBlocks, type PendingImageUpload } from '@/components/Family/FamilyPageCanvas';
import { RichTextToolbar, SharedRichTextToolbar, editorRegistry } from '@/components/Family/RichTextBlock';

const BoxAny = Box as any;

function clamp(v: number, min: number, max: number) { return Math.min(Math.max(v, min), max); }

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
  // ── UI ──
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1.0);
  const [activeTextBlockId, setActiveTextBlockId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  const sortedSections = useMemo(() => [...sections].sort((a, b) => a.sortOrder - b.sortOrder), [sections]);
  const sortedPages = useMemo(() => [...pageSummaries].sort((a, b) => a.pageNumber - b.pageNumber), [pageSummaries]);

  const hasChanges = useMemo(() => {
    if (!activePage) return false;
    return JSON.stringify(normalizeBlocks(draftBlocks)) !== JSON.stringify(normalizeBlocks(activePage.elements));
  }, [draftBlocks, activePage]);

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
      const finalBlocks = normalizeBlocks(draftBlocks).map(b =>
        b.type === 'image' && uploadedUrls[b.id] ? { ...b, imageUrl: uploadedUrls[b.id], text: undefined } : b
      );
      if (Object.keys(uploadedUrls).length > 0) setDraftBlocks(finalBlocks);
      const updated = await notebookService.updatePage(notebookId, activePageId, { elements: finalBlocks });
      setActivePage(updated);
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

  // ── Image file picker ──
  const handleChooseImage = useCallback(() => fileInputRef.current?.click(), []);
  const handleImageFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    const block: PageElementDto = {
      id: `pelem_${crypto.randomUUID()}`, type: 'image',
      x: 92, y: 92, width: 320, height: 260,
      zIndex: draftBlocks.length + 1, imageUrl: objectUrl, fontSize: 16, textAlign: 'left',
    };
    setDraftBlocks(prev => [...prev, block]);
    setPendingImages(prev => ({ ...prev, [block.id]: { file, objectUrl } }));
  }, [draftBlocks]);

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
      {/* ── Toolbar row: sections (left) | pages + actions (right) ── */}
      <BoxAny sx={{
        display: 'flex', alignItems: 'stretch',
        borderBottom: '1px solid rgba(15,23,42,0.10)',
        background: '#f1f5f9',
        minHeight: 36, maxHeight: 36,
        flexWrap: 'nowrap', overflowX: 'auto', overflowY: 'hidden',
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
                onClick={() => { if (editingTabId && editingTabId !== section.id) commitTabRename(); setActiveSectionId(section.id); }}
                onDoubleClick={() => { if (canEdit) { setEditingTabId(section.id); setEditingTabName(section.name); } }}
                onContextMenu={(e: React.MouseEvent<HTMLElement>) => { if (canEdit) { e.preventDefault(); setSectionContextMenu({ sectionId: section.id, anchorEl: e.currentTarget }); } }}
                sx={{
                  px: 1.5, py: 0,
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
                px: 1.25, display: 'flex', alignItems: 'center', cursor: 'pointer',
                color: '#64748b', '&:hover': { color: '#2563eb', background: 'rgba(37,99,235,0.08)' },
                fontSize: 20, fontWeight: 400, userSelect: 'none', minHeight: 36,
              }}
            >
              +
            </BoxAny>
          )}
        </Stack>

        {/* ── Middle: Rich text toolbar (only when a text block is focused) ── */}
        {canEdit && activeTextBlockId && (
          <BoxAny sx={{ display: 'flex', alignItems: 'center', px: 0.5, overflowX: 'auto', flexShrink: 1, minWidth: 0 }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <SharedRichTextToolbar activeBlockId={activeTextBlockId} />
          </BoxAny>
        )}

        {/* ── Right: Page tabs + actions (pushed right) ── */}
        <Stack direction="row" spacing={0} alignItems="stretch" sx={{ ml: 'auto', flexShrink: 0 }}>
          {/* Page tabs */}
          {sortedPages.map(page => {
            const isActive = page.id === activePageId;
            return (
              <BoxAny
                key={page.id}
                onClick={() => setActivePageId(page.id)}
                onContextMenu={(e: React.MouseEvent<HTMLElement>) => { if (canEdit) { e.preventDefault(); setPageContextMenu({ pageId: page.id, anchorEl: e.currentTarget }); } }}
                sx={{
                  px: 1.25, py: 0,
                  fontSize: 12, fontWeight: isActive ? 700 : 400,
                  cursor: 'pointer',
                  background: isActive ? '#bfdbfe' : '#e2e8f0',
                  color: isActive ? '#1e3a8a' : '#64748b',
                  borderLeft: '1px solid rgba(15,23,42,0.06)',
                  borderBottom: isActive ? '2px solid #1e40af' : '2px solid transparent',
                  borderTopLeftRadius: 4, borderTopRightRadius: 4,
                  '&:hover': { background: '#bfdbfe' },
                  display: 'flex', alignItems: 'center', minHeight: 36, minWidth: 32, justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
              >
                {page.pageNumber}
              </BoxAny>
            );
          })}
          {canEdit && activeSectionId && (
            <BoxAny
              onClick={handleAddPage}
              sx={{
                px: 1, display: 'flex', alignItems: 'center', cursor: 'pointer',
                color: '#64748b', '&:hover': { color: '#2563eb', background: 'rgba(37,99,235,0.08)' },
                fontSize: 18, fontWeight: 400, userSelect: 'none', minHeight: 36,
              }}
            >
              +
            </BoxAny>
          )}

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Actions: save, image, zoom */}
          <Stack direction="row" spacing={0.25} alignItems="center" sx={{ px: 0.5 }}>
            {canEdit && activePage && (
              <>
                <Tooltip title="插入图片"><span>
                  <IconButton size="small" onClick={handleChooseImage} disabled={saving} sx={{ width: 26, height: 26, color: '#16a34a', '&:hover': { color: '#15803d', backgroundColor: 'rgba(22,163,74,0.08)' } }}>
                    <AddPhotoAlternateIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </span></Tooltip>
                {hasChanges && (
                  <Button size="small" variant="contained" onClick={handleSave} disabled={saving}
                    sx={{ fontSize: 10, textTransform: 'none', minHeight: 22, minWidth: 0, px: 0.75, py: 0 }}>
                    {saving ? '…' : '保存'}
                  </Button>
                )}
                {hasChanges && !saving && <Typography variant="caption" color="warning.main" sx={{ fontSize: 9 }}>●</Typography>}
              </>
            )}
            <Tooltip title="缩小"><span>
              <IconButton size="small" onClick={() => setZoom(z => clamp(+(z - 0.01).toFixed(2), 0.3, 2.0))} sx={{ width: 22, height: 22 }}>
                <ZoomOutIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </span></Tooltip>
            <Typography variant="caption" sx={{ fontSize: 9, minWidth: 28, textAlign: 'center' }}>{Math.round(zoom * 100)}%</Typography>
            <Tooltip title="放大"><span>
              <IconButton size="small" onClick={() => setZoom(z => clamp(+(z + 0.01).toFixed(2), 0.3, 2.0))} sx={{ width: 22, height: 22 }}>
                <ZoomInIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </span></Tooltip>
            <Tooltip title="适应宽度"><span>
              <IconButton size="small" onClick={handleFitToWidth} sx={{ width: 22, height: 22 }}>
                <FitScreenIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </span></Tooltip>
          </Stack>
        </Stack>
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
          onBlocksChange={setDraftBlocks}
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

      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleImageFile} />

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
