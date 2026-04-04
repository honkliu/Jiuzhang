import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, CircularProgress, Alert, Select, MenuItem,
  FormControl, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, useMediaQuery, useTheme, Paper, InputBase,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  DeleteOutline as DeleteOutlineIcon,
} from '@mui/icons-material';
import { AppHeader } from '@/components/Shared/AppHeader';
import { Notebook } from './Notebook';
import { notebookService, type NotebookDto, type NotebookVisibilityDto } from '@/services/notebook.service';
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

// ── Visibility rule helpers (same pattern as FamilyPage) ──

interface VisibilityRuleRow {
  key: string;
  subject: string;
  permission: 'view' | 'edit';
  locked?: boolean;
}

function createRule(subject = '', permission: 'view' | 'edit' = 'view'): VisibilityRuleRow {
  return { key: `rule-${Date.now()}_${Math.round(Math.random() * 100000)}`, subject, permission };
}

function buildRules(vis: NotebookVisibilityDto, ownerEmail?: string): VisibilityRuleRow[] {
  const rows: VisibilityRuleRow[] = [];
  if (ownerEmail) {
    rows.push({ key: 'owner-baseline', subject: ownerEmail, permission: 'edit', locked: true });
  }
  vis.userEditors.forEach(s => rows.push(createRule(s, 'edit')));
  vis.userViewers.forEach(s => rows.push(createRule(s, 'view')));
  vis.domainEditors.forEach(s => rows.push(createRule(s, 'edit')));
  vis.domainViewers.forEach(s => rows.push(createRule(s, 'view')));
  return rows;
}

function rulesToRequest(rows: VisibilityRuleRow[]) {
  const uv = new Set<string>(), ue = new Set<string>(), dv = new Set<string>(), de = new Set<string>();
  rows.forEach(r => {
    if (r.locked) return;
    const s = r.subject.trim();
    if (!s) return;
    const isUser = s.includes('@');
    if (isUser) { if (r.permission === 'edit') { ue.add(s); uv.delete(s); } else if (!ue.has(s)) uv.add(s); }
    else { if (r.permission === 'edit') { de.add(s); dv.delete(s); } else if (!de.has(s)) dv.add(s); }
  });
  return { userViewers: [...uv], userEditors: [...ue], domainViewers: [...dv], domainEditors: [...de] };
}

function inferType(subject: string) { return subject.includes('@') ? '用户' : '域'; }
function formatPerm(p: 'view' | 'edit') { return p === 'edit' ? '编辑' : '浏览'; }
function togglePerm(p: 'view' | 'edit'): 'view' | 'edit' { return p === 'edit' ? 'view' : 'edit'; }

const tableSurfaceSx = { borderRadius: '8px', overflow: 'hidden', backgroundColor: '#ffffff', backgroundImage: 'none' };
const inlineInputSx = { px: 0.75, py: 0.35, width: '100%', fontSize: 13, '& input': { padding: 0, fontSize: 13 } };
const toggleBtnSx = { minWidth: 48, fontSize: 11, textTransform: 'none', px: 0.5, minHeight: 26 };

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

  // Settings dialog (visibility + export/import/delete)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadingVis, setLoadingVis] = useState(false);
  const [savingVis, setSavingVis] = useState(false);
  const [visError, setVisError] = useState<string | null>(null);
  const [visRules, setVisRules] = useState<VisibilityRuleRow[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const importRef = useRef<HTMLInputElement>(null);

  const selectedNotebook = notebooks.find(n => n.id === selectedId) ?? null;
  const canManage = Boolean(selectedNotebook?.canManage);

  useEffect(() => { writeState({ selectedNotebookId: selectedId }); }, [selectedId]);

  const loadNotebooks = useCallback(async (selectId?: string | null) => {
    setLoading(true); setError(null);
    try {
      const result = await notebookService.list();
      setNotebooks(result);
      if (selectId !== undefined) {
        setSelectedId(selectId && result.some(n => n.id === selectId) ? selectId : (result[0]?.id ?? null));
      } else if (selectedId && !result.some(n => n.id === selectedId)) {
        setSelectedId(result[0]?.id ?? null);
      }
    } catch (err: any) { setError(err?.message || '加载失败'); }
    setLoading(false);
  }, [selectedId]);

  useEffect(() => { loadNotebooks(persistedRef.current?.selectedNotebookId); }, []); // eslint-disable-line

  // Create
  const handleCreate = useCallback(async () => {
    const name = createName.trim();
    if (!name) { setCreateError('请输入名称'); return; }
    setCreating(true); setCreateError(null);
    try {
      const nb = await notebookService.create({ name });
      await loadNotebooks(nb.id);
      setCreateOpen(false); setCreateName('');
    } catch (err: any) { setCreateError(err?.message || '创建失败'); }
    setCreating(false);
  }, [createName, loadNotebooks]);

  // Settings: open → load visibility
  const handleOpenSettings = useCallback(async () => {
    if (!selectedId) return;
    setSettingsOpen(true); setLoadingVis(true); setVisError(null);
    try {
      const vis = await notebookService.getVisibility(selectedId);
      setVisRules(buildRules(vis, selectedNotebook?.ownerDisplayName));
    } catch (err: any) { setVisError(err?.message || '加载权限失败'); }
    setLoadingVis(false);
  }, [selectedId, selectedNotebook?.ownerDisplayName]);

  const handleSaveVis = useCallback(async () => {
    if (!selectedId || !canManage) return;
    setSavingVis(true); setVisError(null);
    try {
      const req = rulesToRequest(visRules);
      const vis = await notebookService.updateVisibility(selectedId, req);
      setVisRules(buildRules(vis, selectedNotebook?.ownerDisplayName));
      setSettingsOpen(false);
    } catch (err: any) { setVisError(err?.message || '保存失败'); }
    setSavingVis(false);
  }, [selectedId, canManage, visRules, selectedNotebook?.ownerDisplayName]);

  const handleDelete = useCallback(async () => {
    if (!selectedId) return;
    setDeleting(true);
    try { await notebookService.delete(selectedId); setSettingsOpen(false); await loadNotebooks(null); } catch {}
    setDeleting(false);
  }, [selectedId, loadNotebooks]);

  const handleExport = useCallback(async () => {
    if (!selectedId) return;
    setExporting(true);
    try {
      const { blob, fileName } = await notebookService.exportArchive(selectedId);
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url);
    } catch {}
    setExporting(false);
  }, [selectedId]);

  const handleImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || !selectedId) return;
    try {
      const result = await notebookService.importArchive(selectedId, file);
      console.log('Import result:', result);
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      console.error('Import failed:', err);
      alert(err?.response?.data?.message || err?.message || '导入失败');
    }
  }, [selectedId]);

  return (
    <BoxAny sx={{ display: 'flex', flexDirection: 'column', height: '100vh', pt: '61px' }}>
      <AppHeader />

      <BoxAny sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {loading && (
          <BoxAny sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress /></BoxAny>
        )}
        {error && (
          <BoxAny sx={{ flex: 1, p: 3 }}><Alert severity="error">{error}</Alert></BoxAny>
        )}
        {!loading && !error && notebooks.length === 0 && (
          <BoxAny sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography color="text.secondary">暂无笔记本，点击下方"新建"创建。</Typography>
          </BoxAny>
        )}
        {!loading && !error && selectedNotebook && (
          <Notebook key={`${selectedNotebook.id}-${refreshKey}`} notebookId={selectedNotebook.id} canEdit={selectedNotebook.canEdit} />
        )}
      </BoxAny>

      {/* Bottom bar */}
      <BoxAny sx={{
        borderTop: '1px solid rgba(15,23,42,0.08)', background: 'rgba(255,255,255,0.95)',
        px: 2, py: 1, display: 'flex', justifyContent: 'flex-end',
        ...(isMobile ? { position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20, px: 1, py: 1, minHeight: 52, overflow: 'visible' } : {}),
      }}>
        <BoxAny sx={{
          display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end',
          ...(isMobile ? { width: '100%', flexWrap: 'nowrap', gap: 0.5, justifyContent: 'flex-start', overflowX: 'auto' } : {}),
        }}>
          <Button size="small" variant="outlined"
            onClick={() => { setCreateName(''); setCreateError(null); setCreateOpen(true); }}
            sx={{
              minHeight: 30, minWidth: 0,
              borderColor: 'rgba(15, 23, 42, 0.23)', color: 'text.primary',
              ...(isMobile ? { flexShrink: 0 } : {}),
              px: 0.5, fontSize: 14, lineHeight: 1.35, textTransform: 'none',
              '&:hover': { borderColor: 'rgba(15, 23, 42, 0.35)', backgroundColor: 'rgba(15, 23, 42, 0.03)' },
            }}>
            新建
          </Button>
          {selectedNotebook && (
            <Button size="small" variant="outlined"
              onClick={() => importRef.current?.click()}
              sx={{
                minHeight: 30, minWidth: 0,
                borderColor: 'rgba(15, 23, 42, 0.23)', color: 'text.primary',
                ...(isMobile ? { flexShrink: 0 } : {}),
                px: 0.5, fontSize: 14, lineHeight: 1.35, textTransform: 'none',
                '&:hover': { borderColor: 'rgba(15, 23, 42, 0.35)', backgroundColor: 'rgba(15, 23, 42, 0.03)' },
              }}>
              导入
            </Button>
          )}
          {selectedNotebook && (
            <Button size="small" variant="outlined" onClick={handleExport} disabled={exporting}
              sx={{
                minHeight: 30, minWidth: 0,
                borderColor: 'rgba(15, 23, 42, 0.23)', color: 'text.primary',
                ...(isMobile ? { flexShrink: 0 } : {}),
                px: 0.5, fontSize: 14, lineHeight: 1.35, textTransform: 'none',
                '&:hover': { borderColor: 'rgba(15, 23, 42, 0.35)', backgroundColor: 'rgba(15, 23, 42, 0.03)' },
              }}>
              {exporting ? '导出中…' : '导出'}
            </Button>
          )}
          {selectedNotebook?.canManage && (
            <Button size="small" variant="outlined" onClick={handleDelete} disabled={deleting}
              sx={{
                minHeight: 30, minWidth: 0,
                borderColor: 'rgba(220, 38, 38, 0.35)', color: '#b91c1c',
                ...(isMobile ? { flexShrink: 0 } : {}),
                px: 0.5, fontSize: 14, lineHeight: 1.35, textTransform: 'none',
                '&:hover': { borderColor: 'rgba(185, 28, 28, 0.55)', backgroundColor: 'rgba(220, 38, 38, 0.04)' },
              }}>
              {deleting ? '删除中…' : '删除'}
            </Button>
          )}
          {selectedNotebook && (
            <Button size="small" variant="outlined" onClick={handleOpenSettings}
              sx={{
                minHeight: 30, minWidth: 0,
                borderColor: 'rgba(15, 23, 42, 0.23)', color: 'text.primary',
                ...(isMobile ? { flexShrink: 0 } : {}),
                px: 0.5, fontSize: 14, lineHeight: 1.35, textTransform: 'none',
                '&:hover': { borderColor: 'rgba(15, 23, 42, 0.35)', backgroundColor: 'rgba(15, 23, 42, 0.03)' },
              }}>
              设置
            </Button>
          )}
          {notebooks.length > 0 && (
            <FormControl
              size="small"
              sx={isMobile ? { minWidth: 88, flexShrink: 0 } : { minWidth: 140 }}
              disabled={notebooks.length === 0}
            >
              <Select
                IconComponent={ExpandMoreIcon}
                value={selectedId ?? ''}
                onChange={e => setSelectedId(e.target.value || null)}
                sx={{
                  minHeight: 30,
                  '& .MuiSelect-select': {
                    fontSize: 14, lineHeight: 1.35,
                    py: 0.35, pl: 0.75, pr: 2.5,
                  },
                  '& .MuiSelect-icon': {
                    fontSize: '1.25rem', color: 'text.primary',
                  },
                }}
                MenuProps={{
                  disableScrollLock: true,
                  PaperProps: {
                    sx: {
                      backgroundColor: '#f5f7fb', backgroundImage: 'none',
                      border: '1px solid rgba(15, 23, 42, 0.08)',
                      boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
                      backdropFilter: 'none', opacity: 1,
                    },
                  },
                }}
              >
                {notebooks.map(nb => (
                  <MenuItem key={nb.id} value={nb.id} sx={{ fontSize: 14, lineHeight: 1.35, minHeight: 36 }}>
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
          <TextField autoFocus label="名称" value={createName} onChange={e => setCreateName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }} fullWidth size="small" sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions sx={{ backgroundColor: '#fff' }}>
          <Button onClick={() => setCreateOpen(false)} disabled={creating}>取消</Button>
          <Button onClick={handleCreate} variant="contained" disabled={creating || !createName.trim()}>
            {creating ? '创建中…' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Settings dialog — matches family tree 设置 pattern */}
      <Dialog open={settingsOpen} onClose={() => { if (!savingVis) setSettingsOpen(false); }} maxWidth={false}
        sx={{ '& .MuiDialog-container': { alignItems: { xs: 'flex-end', sm: 'center' } } }}
        PaperProps={{ sx: {
          width: { xs: '100%', sm: 'min(560px, calc(100vw - 64px))' },
          maxWidth: { xs: '100%', sm: 'min(560px, calc(100vw - 64px))' },
          m: { xs: 0, sm: '32px' },
          borderRadius: { xs: '12px 12px 0 0', sm: '8px' },
          backgroundColor: '#ffffff', backgroundImage: 'none',
        } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, backgroundColor: '#ffffff' }}>
          <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
            <BoxAny component="span" sx={{ flexShrink: 0 }}>设置</BoxAny>
            {selectedNotebook && (
              <BoxAny component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedNotebook.name}
              </BoxAny>
            )}
          </BoxAny>
        </DialogTitle>
        <DialogContent sx={{ backgroundColor: '#ffffff', px: 2.25, pt: 2, pb: 1 }}>
          <BoxAny sx={{ display: 'grid', gap: 1.25, pt: 0.5 }}>
            {visError && <Alert severity="error">{visError}</Alert>}
            {loadingVis ? (
              <BoxAny sx={{ py: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress size={28} /></BoxAny>
            ) : (
              <Paper variant="outlined" sx={tableSurfaceSx}>
                {/* Header row */}
                <BoxAny sx={{
                  display: 'grid',
                  gridTemplateColumns: canManage ? 'minmax(0, 1fr) 64px 56px 28px' : 'minmax(0, 1fr) 64px 56px',
                  columnGap: 1, px: 1.25, py: 0.75, alignItems: 'center',
                  backgroundColor: '#f3f4f6',
                  borderBottom: visRules.length > 0 ? '1px solid #e5e7eb' : 'none',
                }}>
                  <BoxAny sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>对象</Typography>
                    {canManage && (
                      <Button size="small" onClick={() => setVisRules(r => [...r, createRule()])}
                        sx={{ ml: 'auto', flexShrink: 0, minWidth: 30, px: 0.5, fontSize: 18, lineHeight: 1, fontWeight: 500 }}>+</Button>
                    )}
                  </BoxAny>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, textAlign: 'center' }}>类型</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, textAlign: 'center' }}>权限</Typography>
                  {canManage ? <BoxAny /> : null}
                </BoxAny>

                {/* Rules */}
                <BoxAny sx={{ px: 1.25, py: 0.35 }}>
                  {visRules.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, fontStyle: 'italic', py: 0.75 }}>暂无记录</Typography>
                  ) : visRules.map((rule, index) => {
                    const subjectType = rule.locked ? '所有者' : inferType(rule.subject.trim());
                    const showDelete = canManage && !rule.locked;
                    return (
                      <BoxAny key={rule.key} sx={{
                        display: 'grid',
                        gridTemplateColumns: canManage ? 'minmax(0, 1fr) 64px 56px 28px' : 'minmax(0, 1fr) 64px 56px',
                        columnGap: 1, py: 0.65, alignItems: 'center',
                        borderBottom: index === visRules.length - 1 ? 'none' : '1px solid #e5e7eb',
                      }}>
                        <BoxAny sx={{ minWidth: 0 }}>
                          {canManage && !rule.locked ? (
                            <InputBase value={rule.subject}
                              onChange={e => setVisRules(r => r.map(x => x.key === rule.key ? { ...x, subject: e.target.value } : x))}
                              fullWidth sx={{ ...inlineInputSx, fontFamily: rule.subject.includes('@') ? 'monospace' : 'inherit' }} />
                          ) : (
                            <Typography sx={{ fontSize: 13, px: 0.75, py: 0.35, wordBreak: 'break-word', fontFamily: rule.subject.includes('@') ? 'monospace' : 'inherit' }}>{rule.subject}</Typography>
                          )}
                        </BoxAny>
                        <Typography sx={{ fontSize: 12, textAlign: 'center', color: 'text.secondary' }}>{subjectType}</Typography>
                        <Button size="small" variant="text" disabled={!canManage || rule.locked}
                          onClick={() => setVisRules(r => r.map(x => x.key === rule.key ? { ...x, permission: togglePerm(x.permission) } : x))}
                          sx={toggleBtnSx}>{formatPerm(rule.permission)}</Button>
                        {canManage ? (
                          showDelete ? (
                            <BoxAny sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                              <BoxAny component="button" onClick={() => setVisRules(r => r.filter(x => x.key !== rule.key))}
                                sx={{ width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', '&:hover': { backgroundColor: 'rgba(220,38,38,0.08)' } }}>
                                <DeleteOutlineIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
                              </BoxAny>
                            </BoxAny>
                          ) : <BoxAny sx={{ width: 24, height: 24 }} />
                        ) : null}
                      </BoxAny>
                    );
                  })}
                </BoxAny>
              </Paper>
            )}
          </BoxAny>
        </DialogContent>
        <DialogActions sx={{ backgroundColor: '#ffffff', px: 3, pt: 0.25, pb: 2 }}>
          <Button onClick={() => setSettingsOpen(false)} disabled={savingVis} sx={{ borderRadius: '8px', '&:hover': { backgroundColor: '#f3f4f6' } }}>取消</Button>
          {canManage && (
            <Button onClick={handleSaveVis} variant="contained" disabled={loadingVis || savingVis} sx={{ borderRadius: '8px', boxShadow: 'none' }}>
              保存
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <input ref={importRef} type="file" accept=".zip,application/zip" hidden onChange={handleImport} />
    </BoxAny>
  );
};
