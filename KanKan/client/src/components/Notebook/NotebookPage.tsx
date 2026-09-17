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
import { ConfirmDialog } from '@/components/Shared/ConfirmDialog';
import { useLanguage } from '@/i18n/LanguageContext';
import { Notebook } from './Notebook';
import { notebookService, type NotebookDto, type NotebookVisibilityDto } from '@/services/notebook.service';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';
import { APP_HEADER_OFFSET } from '@/styles/appLayout';

const BoxAny = Box as any;

const STATE_KEY = 'kankan.notebookPageState';

function readState(): { selectedNotebookId: string | null } | null {
  try {
    const raw = window.localStorage.getItem(STATE_KEY) ?? window.sessionStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { selectedNotebookId: typeof parsed.selectedNotebookId === 'string' ? parsed.selectedNotebookId : null };
  } catch { return null; }
}

function writeState(state: { selectedNotebookId: string | null }) {
  window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function selectPreferredNotebookId(
  notebooks: NotebookDto[],
  options: {
    selectedId?: string | null;
    persistedId?: string | null;
    currentUserId?: string | null;
  } = {},
) {
  if (notebooks.length === 0) {
    return null;
  }

  const byId = new Set(notebooks.map((notebook) => notebook.id));
  if (options.selectedId && byId.has(options.selectedId)) {
    return options.selectedId;
  }
  if (options.persistedId && byId.has(options.persistedId)) {
    return options.persistedId;
  }

  const ownedNotebook = options.currentUserId
    ? notebooks.find((notebook) => notebook.ownerId === options.currentUserId)
    : null;
  if (ownedNotebook) {
    return ownedNotebook.id;
  }

  return notebooks[0]?.id ?? null;
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

function inferType(subject: string) { return subject.includes('@') ? 'ui.user' : 'ui.domain'; }
function formatPerm(p: 'view' | 'edit') { return p === 'edit' ? 'ui.edit' : 'ui.view'; }
function togglePerm(p: 'view' | 'edit'): 'view' | 'edit' { return p === 'edit' ? 'view' : 'edit'; }

const tableSurfaceSx = { borderRadius: '4px', overflow: 'hidden', backgroundColor: 'background.paper', backgroundImage: 'none' };
const inlineInputSx = { px: 0.75, py: 0.35, width: '100%', fontSize: 13, '& input': { padding: 0, fontSize: 13 } };
const toggleBtnSx = { minWidth: 48, fontSize: 11, textTransform: 'none', px: 0.5, minHeight: 32 };

export const NotebookPage: React.FC = () => {
  const { t } = useLanguage();
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
  const [deleteTarget, setDeleteTarget] = useState<NotebookDto | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const operationRef = useRef(false);
  const createPendingRef = useRef(false);
  const importTargetRef = useRef<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const importRef = useRef<HTMLInputElement>(null);

  const selectedNotebook = notebooks.find(n => n.id === selectedId) ?? null;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const canManage = Boolean(selectedNotebook?.canManage);
  const busy = creating || loadingVis || savingVis || deleting || exporting || importing;

  useEffect(() => { writeState({ selectedNotebookId: selectedId }); }, [selectedId]);

  useEffect(() => {
    if (notebooks.length === 0) {
      if (selectedId !== null) {
        setSelectedId(null);
      }
      return;
    }

    const preferredId = selectPreferredNotebookId(notebooks, {
      selectedId,
      persistedId: persistedRef.current?.selectedNotebookId ?? null,
      currentUserId: currentUser?.id ?? null,
    });

    if (preferredId !== selectedId) {
      setSelectedId(preferredId);
    }
  }, [currentUser?.id, notebooks, selectedId]);

  const loadNotebooks = useCallback(async (selectId?: string | null) => {
    setLoading(true); setError(null);
    try {
      const result = await notebookService.list();
      setNotebooks(result);
      if (selectId !== undefined || selectedId) {
        setSelectedId(selectPreferredNotebookId(result, {
          selectedId: selectId !== undefined ? selectId : selectedId,
          persistedId: persistedRef.current?.selectedNotebookId ?? null,
          currentUserId: currentUser?.id ?? null,
        }));
      }
    } catch (err) { console.error('Failed to load notebooks:', err); setError(t('ui.loadFailed')); }
    setLoading(false);
  }, [currentUser?.id, selectedId, t]);

  useEffect(() => { loadNotebooks(persistedRef.current?.selectedNotebookId); }, []); // eslint-disable-line

  // Create
  const handleCreate = useCallback(async () => {
    if (createPendingRef.current || operationRef.current) return;
    const name = createName.trim();
    if (!name) { setCreateError(t('ui.nameRequired')); return; }
    createPendingRef.current = true;
    setCreating(true); setCreateError(null);
    try {
      const nb = await notebookService.create({ name });
      await loadNotebooks(nb.id);
      setCreateOpen(false); setCreateName('');
    } catch (err) { console.error('Failed to create notebook:', err); setCreateError(t('ui.createFailed')); }
    finally { createPendingRef.current = false; setCreating(false); }
  }, [createName, loadNotebooks, t]);

  // Settings: open → load visibility
  const handleOpenSettings = useCallback(async () => {
    if (!selectedId || operationRef.current || createPendingRef.current) return;
    operationRef.current = true;
    setSettingsOpen(true); setLoadingVis(true); setVisError(null);
    try {
      const vis = await notebookService.getVisibility(selectedId);
      setVisRules(buildRules(vis, selectedNotebook?.ownerEmail || selectedNotebook?.ownerDisplayName));
    } catch (err) { console.error('Failed to load notebook permissions:', err); setVisError(t('ui.accessLoadFailed')); }
    finally { operationRef.current = false; setLoadingVis(false); }
  }, [selectedId, selectedNotebook?.ownerEmail, selectedNotebook?.ownerDisplayName, t]);

  const handleSaveVis = useCallback(async () => {
    if (!selectedId || !canManage || operationRef.current || createPendingRef.current) return;
    operationRef.current = true;
    setSavingVis(true); setVisError(null);
    try {
      const req = rulesToRequest(visRules);
      const vis = await notebookService.updateVisibility(selectedId, req);
      setVisRules(buildRules(vis, selectedNotebook?.ownerEmail || selectedNotebook?.ownerDisplayName));
      setSettingsOpen(false);
    } catch (err) { console.error('Failed to save notebook permissions:', err); setVisError(t('ui.saveFailed')); }
    finally { operationRef.current = false; setSavingVis(false); }
  }, [selectedId, canManage, visRules, selectedNotebook?.ownerEmail, selectedNotebook?.ownerDisplayName, t]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget || operationRef.current || createPendingRef.current) throw new Error('Notebook operation unavailable');
    operationRef.current = true;
    setDeleting(true);
    try {
      await notebookService.delete(deleteTarget.id);
      setNotebooks(current => current.filter(notebook => notebook.id !== deleteTarget.id));
      setSettingsOpen(false);
      await loadNotebooks(null);
    } finally { operationRef.current = false; setDeleting(false); }
  }, [deleteTarget, loadNotebooks]);

  const handleExport = useCallback(async () => {
    if (!selectedId || operationRef.current || createPendingRef.current) return;
    operationRef.current = true;
    setActionError(null);
    setExporting(true);
    try {
      const { blob, fileName } = await notebookService.exportArchive(selectedId);
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url);
    } catch (err) { console.error('Failed to export notebook:', err); setActionError(t('ui.exportFailed')); }
    finally { operationRef.current = false; setExporting(false); }
  }, [selectedId, t]);

  const handleImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    const targetId = importTargetRef.current;
    importTargetRef.current = null;
    if (!file || !targetId || operationRef.current || createPendingRef.current) return;
    operationRef.current = true;
    setImporting(true); setActionError(null);
    try {
      const result = await notebookService.importArchive(targetId, file);
      console.log('Import result:', result);
      if (selectedIdRef.current === targetId) setRefreshKey(k => k + 1);
    } catch (err) {
      console.error('Import failed:', err);
      setActionError(t('ui.importFailed'));
    } finally { operationRef.current = false; setImporting(false); }
  }, [t]);

  return (
    <BoxAny sx={{ display: 'flex', flexDirection: 'column', height: '100dvh', pt: APP_HEADER_OFFSET }}>
      <AppHeader />

      {actionError && <Alert severity="error" onClose={() => setActionError(null)}>{actionError}</Alert>}
      <BoxAny sx={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        {loading && (
          <BoxAny sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress /></BoxAny>
        )}
        {error && (
          <BoxAny sx={{ flex: 1, p: 3 }}>
            <Alert severity="error" action={<Button color="inherit" disabled={loading || busy} onClick={() => void loadNotebooks()}>{t('common.retry')}</Button>}>{error}</Alert>
          </BoxAny>
        )}
        {!loading && !error && notebooks.length === 0 && (
          <BoxAny sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography color="text.secondary">{t('notebook.empty')}</Typography>
          </BoxAny>
        )}
        {!loading && !error && selectedNotebook && (
          <Notebook key={`${selectedNotebook.id}-${refreshKey}`} notebookId={selectedNotebook.id} canEdit={selectedNotebook.canEdit} />
        )}
      </BoxAny>

      {/* Bottom bar */}
      <BoxAny sx={{
        borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper',
        px: 2, pt: 1, pb: 'max(8px, env(safe-area-inset-bottom, 0px))', flexShrink: 0, display: 'flex', justifyContent: 'flex-end',
        ...(isMobile ? { px: 1, minHeight: 52 } : {}),
      }}>
        <BoxAny sx={{
          display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end',
          ...(isMobile ? { width: '100%', flexWrap: 'nowrap', gap: 0.5, justifyContent: 'flex-start', overflowX: 'auto' } : {}),
        }}>
          <Button size="small" variant="contained"
            disabled={busy || Boolean(deleteTarget)}
            onClick={() => { setCreateName(''); setCreateError(null); setCreateOpen(true); }}
            sx={{
              minWidth: 0,
              ...(isMobile ? { flexShrink: 0 } : {}),
            }}>
            {t('ui.new')}
          </Button>
          {selectedNotebook?.canEdit && (
            <Button size="small" variant="outlined"
              disabled={busy || Boolean(deleteTarget)}
              onClick={() => { importTargetRef.current = selectedId; importRef.current?.click(); }}
              sx={{
                minWidth: 0,
                ...(isMobile ? { flexShrink: 0 } : {}),
              }}>
              {t(importing ? 'ui.importing' : 'ui.import')}
            </Button>
          )}
          {selectedNotebook && (
            <Button size="small" variant="outlined" onClick={handleExport} disabled={busy || Boolean(deleteTarget)}
              sx={{
                minWidth: 0,
                ...(isMobile ? { flexShrink: 0 } : {}),
              }}>
              {t(exporting ? 'ui.exporting' : 'ui.export')}
            </Button>
          )}
          {selectedNotebook?.canManage && (
            <Button size="small" variant="outlined" color="error" onClick={() => setDeleteTarget(selectedNotebook)} disabled={busy || Boolean(deleteTarget)}
              sx={{
                minWidth: 0,
                ...(isMobile ? { flexShrink: 0 } : {}),
              }}>
              {t(deleting ? 'ui.deleting' : 'ui.delete')}
            </Button>
          )}
          {selectedNotebook && (
            <Button size="small" variant="outlined" onClick={handleOpenSettings} disabled={busy || Boolean(deleteTarget)}
              sx={{
                minWidth: 0,
                ...(isMobile ? { flexShrink: 0 } : {}),
              }}>
              {t('ui.settings')}
            </Button>
          )}
          {notebooks.length > 0 && (
            <FormControl
              size="small"
              sx={isMobile ? { minWidth: 88, flexShrink: 0 } : { minWidth: 140 }}
              disabled={notebooks.length === 0 || busy || settingsOpen || Boolean(deleteTarget)}
            >
              <Select
                IconComponent={ExpandMoreIcon}
                value={selectedId ?? ''}
                inputProps={{ 'aria-label': t('notebook.select') }}
                onChange={e => setSelectedId(e.target.value || null)}
                sx={{
                  minHeight: 32,
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
                      backgroundColor: 'background.paper', backgroundImage: 'none',
                      border: '1px solid', borderColor: 'divider',
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
      <Dialog open={createOpen} onClose={() => { if (!createPendingRef.current) setCreateOpen(false); }} maxWidth="xs" fullWidth
        PaperProps={{ sx: { backgroundColor: 'background.paper', backgroundImage: 'none' } }}>
        <DialogTitle sx={{ fontSize: 16, backgroundColor: 'background.paper' }}>{t('notebook.createTitle')}</DialogTitle>
        <DialogContent sx={{ backgroundColor: 'background.paper' }}>
          {createError && <Alert severity="error" sx={{ mb: 1 }}>{createError}</Alert>}
          <TextField autoFocus label={t('ui.name')} disabled={creating} value={createName} onChange={e => setCreateName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void handleCreate(); } }} fullWidth size="small" sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions sx={{ backgroundColor: 'background.paper' }}>
          <Button onClick={() => setCreateOpen(false)} disabled={creating}>{t('common.cancel')}</Button>
          <Button onClick={handleCreate} variant="contained" disabled={creating || !createName.trim()}>
            {t(creating ? 'ui.creating' : 'ui.create')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Settings dialog — matches family tree 设置 pattern */}
      <Dialog open={settingsOpen} onClose={() => { if (!operationRef.current) setSettingsOpen(false); }} maxWidth={false}
        sx={{ '& .MuiDialog-container': { alignItems: { xs: 'flex-end', sm: 'center' } } }}
        PaperProps={{ sx: {
          width: { xs: '100%', sm: 'min(560px, calc(100vw - 64px))' },
          maxWidth: { xs: '100%', sm: 'min(560px, calc(100vw - 64px))' },
          m: { xs: 0, sm: '32px' },
          borderRadius: { xs: '8px 8px 0 0', sm: '8px' },
          backgroundColor: 'background.paper', backgroundImage: 'none',
        } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, backgroundColor: 'background.paper' }}>
          <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
            <BoxAny component="span" sx={{ flexShrink: 0 }}>{t('ui.settings')}</BoxAny>
            {selectedNotebook && (
              <BoxAny component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedNotebook.name}
              </BoxAny>
            )}
          </BoxAny>
        </DialogTitle>
        <DialogContent sx={{ backgroundColor: 'background.paper', px: 2.25, pt: 2, pb: 1 }}>
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
                  backgroundColor: 'action.hover',
                  borderBottom: visRules.length > 0 ? '1px solid' : 'none',
                  borderColor: 'divider',
                }}>
                  <BoxAny sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>{t('ui.subject')}</Typography>
                    {canManage && (
                      <Button size="small" disabled={savingVis} aria-label={t('ui.addRule')} onClick={() => setVisRules(r => [...r, createRule()])}
                        sx={{ ml: 'auto', flexShrink: 0, minWidth: 30, px: 0.5, fontSize: 18, lineHeight: 1, fontWeight: 500 }}>+</Button>
                    )}
                  </BoxAny>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, textAlign: 'center' }}>{t('ui.type')}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, textAlign: 'center' }}>{t('ui.permission')}</Typography>
                  {canManage ? <BoxAny /> : null}
                </BoxAny>

                {/* Rules */}
                <BoxAny sx={{ px: 1.25, py: 0.35 }}>
                  {visRules.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, fontStyle: 'italic', py: 0.75 }}>{t('ui.noRecords')}</Typography>
                  ) : visRules.map((rule, index) => {
                    const subjectType = t(rule.locked ? 'ui.owner' : inferType(rule.subject.trim()));
                    const showDelete = canManage && !rule.locked;
                    return (
                      <BoxAny key={rule.key} sx={{
                        display: 'grid',
                        gridTemplateColumns: canManage ? 'minmax(0, 1fr) 64px 56px 28px' : 'minmax(0, 1fr) 64px 56px',
                        columnGap: 1, py: 0.65, alignItems: 'center',
                        borderBottom: index === visRules.length - 1 ? 'none' : '1px solid',
                        borderColor: 'divider',
                      }}>
                        <BoxAny sx={{ minWidth: 0 }}>
                          {canManage && !rule.locked ? (
                            <InputBase value={rule.subject} disabled={savingVis} inputProps={{ 'aria-label': t('ui.subject') }}
                              onChange={e => setVisRules(r => r.map(x => x.key === rule.key ? { ...x, subject: e.target.value } : x))}
                              fullWidth sx={{ ...inlineInputSx, fontFamily: rule.subject.includes('@') ? 'monospace' : 'inherit' }} />
                          ) : (
                            <Typography sx={{ fontSize: 13, px: 0.75, py: 0.35, wordBreak: 'break-word', fontFamily: rule.subject.includes('@') ? 'monospace' : 'inherit' }}>{rule.subject}</Typography>
                          )}
                        </BoxAny>
                        <Typography sx={{ fontSize: 12, textAlign: 'center', color: 'text.secondary' }}>{subjectType}</Typography>
                        <Button size="small" variant="text" disabled={!canManage || rule.locked || savingVis}
                          onClick={() => setVisRules(r => r.map(x => x.key === rule.key ? { ...x, permission: togglePerm(x.permission) } : x))}
                          sx={toggleBtnSx}>{t(formatPerm(rule.permission))}</Button>
                        {canManage ? (
                          showDelete ? (
                            <BoxAny sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                              <BoxAny component="button" disabled={savingVis} aria-label={t('ui.removeRule')} onClick={() => setVisRules(r => r.filter(x => x.key !== rule.key))}
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
        <DialogActions sx={{ backgroundColor: 'background.paper', px: 3, pt: 0.25, pb: 2 }}>
          <Button onClick={() => setSettingsOpen(false)} disabled={busy} sx={{ borderRadius: '4px', '&:hover': { backgroundColor: 'action.hover' } }}>{t('common.cancel')}</Button>
          {canManage && (
            <Button onClick={handleSaveVis} variant="contained" disabled={loadingVis || savingVis} sx={{ borderRadius: '4px', boxShadow: 'none' }}>
              {t('common.save')}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t('notebook.deleteTitle')}
        description={t('notebook.deleteDescription').replace('{name}', deleteTarget?.name ?? '')}
        confirmLabel={t('ui.delete')}
        failureMessage={t('ui.deleteFailed')}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
      <input ref={importRef} type="file" accept=".zip,application/zip" hidden onChange={handleImport} />
    </BoxAny>
  );
};
