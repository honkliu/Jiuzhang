import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, CircularProgress, Alert, Select, MenuItem,
  FormControl, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, useMediaQuery, useTheme, IconButton,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { AppHeader } from '@/components/Shared/AppHeader';
import { Notebook } from './Notebook';
import { notebookService, type NotebookDto } from '@/services/notebook.service';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';

const BoxAny = Box as any;

const STATE_KEY = 'kankan.notebookPageState';

function readState(): { selectedNotebookId: string | null } | null {
  try {
    const raw = window.sessionStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { selectedNotebookId: typeof parsed.selectedNotebookId === 'string' ? parsed.selectedNotebookId : null };
  } catch { return null; }
}

function writeState(state: { selectedNotebookId: string | null }) {
  window.sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
}

export const NotebookPage: React.FC = () => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const persistedRef = useRef(readState());

  const [notebooks, setNotebooks] = useState<NotebookDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(persistedRef.current?.selectedNotebookId ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Settings dialog
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const selectedNotebook = notebooks.find(n => n.id === selectedId) ?? null;

  // Persist state
  useEffect(() => {
    writeState({ selectedNotebookId: selectedId });
  }, [selectedId]);

  // Load notebooks
  const loadNotebooks = useCallback(async (selectId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const result = await notebookService.list();
      setNotebooks(result);
      if (selectId !== undefined) {
        setSelectedId(selectId && result.some(n => n.id === selectId) ? selectId : (result[0]?.id ?? null));
      } else if (selectedId && !result.some(n => n.id === selectedId)) {
        setSelectedId(result[0]?.id ?? null);
      }
    } catch (err: any) {
      setError(err?.message || '加载笔记本失败');
    }
    setLoading(false);
  }, [selectedId]);

  useEffect(() => {
    loadNotebooks(persistedRef.current?.selectedNotebookId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Create
  const handleCreate = useCallback(async () => {
    const name = createName.trim();
    if (!name) { setCreateError('请输入名称'); return; }
    setCreating(true);
    setCreateError(null);
    try {
      const nb = await notebookService.create({ name });
      await loadNotebooks(nb.id);
      setCreateOpen(false);
      setCreateName('');
    } catch (err: any) {
      setCreateError(err?.message || '创建失败');
    }
    setCreating(false);
  }, [createName, loadNotebooks]);

  // Delete
  const handleDelete = useCallback(async () => {
    if (!selectedId) return;
    setDeleting(true);
    try {
      await notebookService.delete(selectedId);
      setSettingsOpen(false);
      await loadNotebooks(null);
    } catch {}
    setDeleting(false);
  }, [selectedId, loadNotebooks]);

  // Export
  const handleExport = useCallback(async () => {
    if (!selectedId) return;
    setExporting(true);
    try {
      const { blob, fileName } = await notebookService.exportArchive(selectedId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
    setExporting(false);
  }, [selectedId]);

  // Import
  const handleImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const nb = await notebookService.importArchive({ file });
      await loadNotebooks(nb.id);
    } catch {}
  }, [loadNotebooks]);

  return (
    <BoxAny sx={{ display: 'flex', flexDirection: 'column', height: '100vh', pt: '61px' }}>
      <AppHeader />

      {/* Main content */}
      <BoxAny sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {loading && (
          <BoxAny sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress />
          </BoxAny>
        )}
        {error && (
          <BoxAny sx={{ flex: 1, p: 3 }}>
            <Alert severity="error">{error}</Alert>
          </BoxAny>
        )}
        {!loading && !error && notebooks.length === 0 && (
          <BoxAny sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography color="text.secondary">暂无笔记本，点击下方"新建"创建。</Typography>
          </BoxAny>
        )}
        {!loading && !error && selectedNotebook && (
          <Notebook
            notebookId={selectedNotebook.id}
            canEdit={selectedNotebook.canEdit}
          />
        )}
      </BoxAny>

      {/* Bottom control bar */}
      <BoxAny sx={{
        borderTop: '1px solid rgba(15,23,42,0.08)',
        background: 'rgba(255,255,255,0.95)',
        px: 2, py: 1,
        display: 'flex', justifyContent: 'flex-end',
        ...(isMobile ? {
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20, px: 1, py: 1,
          minHeight: 52, overflow: 'visible',
        } : {}),
      }}>
        <BoxAny sx={{
          display: 'flex', alignItems: 'center', gap: 1,
          flexWrap: 'wrap', justifyContent: 'flex-end',
          ...(isMobile ? { width: '100%', flexWrap: 'nowrap', gap: 0.5, justifyContent: 'flex-start', overflowX: 'auto' } : {}),
        }}>
          <Button
            size="small" variant="outlined"
            onClick={() => { setCreateName(''); setCreateError(null); setCreateOpen(true); }}
            sx={{ minHeight: 30, px: 0.5, fontSize: 14, lineHeight: 1.35, textTransform: 'none', borderColor: 'rgba(15,23,42,0.23)', color: 'text.primary', '&:hover': { borderColor: 'rgba(15,23,42,0.35)', backgroundColor: 'rgba(15,23,42,0.03)' } }}
          >
            新建
          </Button>
          {selectedNotebook && (
            <Button
              size="small" variant="outlined"
              onClick={() => setSettingsOpen(true)}
              sx={{ minHeight: 30, px: 0.5, fontSize: 14, lineHeight: 1.35, textTransform: 'none', borderColor: 'rgba(15,23,42,0.23)', color: 'text.primary', '&:hover': { borderColor: 'rgba(15,23,42,0.35)', backgroundColor: 'rgba(15,23,42,0.03)' } }}
            >
              设置
            </Button>
          )}
          {notebooks.length > 0 && (
            <FormControl size="small" sx={isMobile ? { minWidth: 100, flexShrink: 0 } : { minWidth: 160 }} disabled={notebooks.length === 0}>
              <Select
                IconComponent={ExpandMoreIcon}
                value={selectedId ?? ''}
                onChange={e => setSelectedId(e.target.value || null)}
                sx={{
                  height: 30, fontSize: 14, lineHeight: 1.35,
                  backgroundColor: '#fff', backgroundImage: 'none', borderRadius: 1,
                  '& fieldset': { borderColor: 'rgba(15,23,42,0.23)' },
                  '&:hover fieldset': { borderColor: 'rgba(15,23,42,0.35)' },
                }}
              >
                {notebooks.map(nb => (
                  <MenuItem key={nb.id} value={nb.id} sx={{ fontSize: 14, lineHeight: 1.35, minHeight: 30, py: 0.5 }}>
                    {nb.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </BoxAny>
      </BoxAny>

      {/* Create dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { backgroundColor: '#fff', backgroundImage: 'none' } }}>
        <DialogTitle sx={{ fontSize: 16, backgroundColor: '#fff' }}>新建笔记本</DialogTitle>
        <DialogContent sx={{ backgroundColor: '#fff' }}>
          {createError && <Alert severity="error" sx={{ mb: 1 }}>{createError}</Alert>}
          <TextField
            autoFocus label="名称" value={createName}
            onChange={e => setCreateName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            fullWidth size="small" sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ backgroundColor: '#fff' }}>
          <Button onClick={() => setCreateOpen(false)} disabled={creating}>取消</Button>
          <Button onClick={handleCreate} variant="contained" disabled={creating || !createName.trim()}>
            {creating ? '创建中…' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Settings dialog */}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { backgroundColor: '#fff', backgroundImage: 'none' } }}>
        <DialogTitle sx={{ fontSize: 16, backgroundColor: '#fff' }}>
          {selectedNotebook?.name ?? '笔记本设置'}
        </DialogTitle>
        <DialogContent sx={{ backgroundColor: '#fff', display: 'flex', flexDirection: 'column', gap: 1, pt: 2 }}>
          <Button size="small" variant="outlined" onClick={handleExport} disabled={exporting}>
            {exporting ? '导出中…' : '导出笔记本'}
          </Button>
          <Button size="small" variant="outlined" onClick={() => importRef.current?.click()}>
            导入笔记本
          </Button>
          <input ref={importRef} type="file" accept=".zip,application/zip" hidden onChange={handleImport} />
          {selectedNotebook?.canManage && (
            <Button size="small" variant="outlined" color="error" onClick={handleDelete} disabled={deleting}>
              {deleting ? '删除中…' : '删除笔记本'}
            </Button>
          )}
        </DialogContent>
        <DialogActions sx={{ backgroundColor: '#fff' }}>
          <Button onClick={() => setSettingsOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </BoxAny>
  );
};
