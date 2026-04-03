import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, IconButton, Menu, MenuItem, Button, Chip,
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
  const [zoom, setZoom] = useState(0.92);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        display: 'flex', alignItems: 'center',
        borderBottom: '1px solid rgba(15,23,42,0.08)',
        background: 'rgba(255,255,255,0.97)',
        px: 0.5, minHeight: 38,
        flexWrap: 'nowrap', overflowX: 'auto',
      }}>
        {/* ── Left: Section tabs ── */}
        <Stack direction="row" spacing={0} alignItems="center" sx={{ flexShrink: 0 }}>
          {sortedSections.map(section => {
            const isActive = section.id === activeSectionId;
            return (
              <BoxAny
                key={section.id}
                onClick={() => setActiveSectionId(section.id)}
                onDoubleClick={() => { if (canEdit) { setEditingTabId(section.id); setEditingTabName(section.name); } }}
                onContextMenu={(e: React.MouseEvent<HTMLElement>) => { if (canEdit) { e.preventDefault(); setSectionContextMenu({ sectionId: section.id, anchorEl: e.currentTarget }); } }}
                sx={{
                  px: 1.25, py: 0.5,
                  fontSize: 12.5, fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
                  color: isActive ? '#1e40af' : 'text.secondary',
                  '&:hover': { color: '#1e40af', background: 'rgba(37,99,235,0.04)' },
                  whiteSpace: 'nowrap',
                  minHeight: 36, display: 'flex', alignItems: 'center',
                }}
              >
                {editingTabId === section.id ? (
                  <InputBase
                    autoFocus
                    value={editingTabName}
                    onChange={e => setEditingTabName(e.target.value)}
                    onBlur={commitTabRename}
                    onKeyDown={e => { if (e.key === 'Enter') commitTabRename(); if (e.key === 'Escape') setEditingTabId(null); }}
                    onClick={e => e.stopPropagation()}
                    sx={{ fontSize: 12.5, fontWeight: 500, width: Math.max(48, editingTabName.length * 9 + 16), '& input': { py: 0, textAlign: 'center' } }}
                  />
                ) : section.name}
              </BoxAny>
            );
          })}
          {canEdit && (
            <IconButton size="small" onClick={handleAddSection} sx={{ width: 24, height: 24, ml: 0.25 }}>
              <AddIcon sx={{ fontSize: 16 }} />
            </IconButton>
          )}
        </Stack>

        {/* ── Right: Page tabs + actions (pushed right) ── */}
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 'auto', flexShrink: 0 }}>
          {/* Page chips */}
          <Stack direction="row" spacing={0.25} alignItems="center">
            {sortedPages.map(page => (
              <Chip
                key={page.id}
                label={page.pageNumber}
                size="small"
                variant={page.id === activePageId ? 'filled' : 'outlined'}
                color={page.id === activePageId ? 'primary' : 'default'}
                clickable
                onClick={() => setActivePageId(page.id)}
                onContextMenu={(e) => { if (canEdit) { e.preventDefault(); setPageContextMenu({ pageId: page.id, anchorEl: e.currentTarget as HTMLElement }); } }}
                sx={{ minWidth: 28, height: 22, fontSize: 11, fontWeight: page.id === activePageId ? 600 : 400 }}
              />
            ))}
            {canEdit && activeSectionId && (
              <IconButton size="small" onClick={handleAddPage} sx={{ width: 22, height: 22 }}>
                <AddIcon sx={{ fontSize: 14 }} />
              </IconButton>
            )}
          </Stack>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />

          {/* Actions: save, image, zoom */}
          {canEdit && activePage && (
            <>
              <Button size="small" variant="outlined" startIcon={<AddPhotoAlternateIcon sx={{ fontSize: 14 }} />}
                onClick={handleChooseImage} disabled={saving}
                sx={{ fontSize: 11, textTransform: 'none', minHeight: 24, px: 0.75, py: 0 }}>
                图片
              </Button>
              <Button size="small" variant="contained" onClick={handleSave} disabled={!hasChanges || saving}
                sx={{ fontSize: 11, textTransform: 'none', minHeight: 24, px: 1, py: 0 }}>
                {saving ? '…' : '保存'}
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, whiteSpace: 'nowrap' }}>
                {saving ? '保存中…' : hasChanges ? '未保存' : '✓'}
              </Typography>
            </>
          )}
          <Tooltip title="缩小"><span>
            <IconButton size="small" onClick={() => setZoom(z => clamp(+(z - 0.1).toFixed(2), 0.5, 1.4))} sx={{ width: 24, height: 24 }}>
              <ZoomOutIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </span></Tooltip>
          <Typography variant="caption" sx={{ fontSize: 10, minWidth: 30, textAlign: 'center' }}>{Math.round(zoom * 100)}%</Typography>
          <Tooltip title="放大"><span>
            <IconButton size="small" onClick={() => setZoom(z => clamp(+(z + 0.1).toFixed(2), 0.5, 1.4))} sx={{ width: 24, height: 24 }}>
              <ZoomInIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </span></Tooltip>
          <Tooltip title="适配"><span>
            <IconButton size="small" onClick={() => setZoom(0.92)} sx={{ width: 24, height: 24 }}>
              <FitScreenIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </span></Tooltip>
        </Stack>
      </BoxAny>

      {/* ── Canvas ── */}
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
