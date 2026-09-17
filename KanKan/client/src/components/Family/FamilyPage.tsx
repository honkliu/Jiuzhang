import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box, Typography, CircularProgress, Alert, Select, MenuItem,
  FormControl, Divider, Drawer, Button, Dialog,
  DialogTitle, DialogContent, DialogActions,
  Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Autocomplete, useMediaQuery, useTheme, InputBase, IconButton, Chip, Tabs, Tab,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  DeleteOutline as DeleteOutlineIcon,
} from '@mui/icons-material';
import { AppHeader } from '@/components/Shared/AppHeader';
import { ConfirmDialog } from '@/components/Shared/ConfirmDialog';
import { FamilyHisto, type FamilyHistoHandle } from './FamilyHisto';
import { FamilyPersonPanel } from './FamilyPersonPanel';
import { FamilyNodeContextMenu } from './FamilyNodeContextMenu';
import {
  familyService, buildFamilyNodes, buildTree,
  type FamilyTreeDto, type FamilyPersonDto, type FamilyRelationshipDto, type FamilyNode,
  type NestedFamilyPersonImport, type FamilyTreeVisibilityDto,
} from '@/services/family.service';
import { contactService } from '@/services/contact.service';
import { authService } from '@/services/auth.service';
import { useDispatch, useSelector } from 'react-redux';
import { updateUser } from '@/store/authSlice';
import type { AppDispatch, RootState } from '@/store';
import { FamilyNotebook } from './FamilyNotebook';
import { APP_HEADER_OFFSET } from '@/styles/appLayout';
import { useLanguage } from '@/i18n/LanguageContext';

const BoxAny = Box as any;

type ViewMode = 'tree' | 'list' | 'generation';
type CreateTreeMode = 'text' | 'archive';

interface FamilyPagePersistedState {
  selectedTreeId: string | null;
  viewMode: ViewMode;
  selectedPersonId: string | null;
  focusPersonId: string | null;
  visibleStartDepth: number;
}

const MAX_VISIBLE_DEPTH = 3;
const FAMILY_PAGE_STATE_KEY = 'kankan.familyPageState';

const TEXT_IMPORT_EXAMPLE = [
  '张三，男，李某，女，1980，',
  '  张大，男，，，2005，',
  '  张二，女，，，2008，',
].join('\n');

const IDEOGRAPHIC_SPACE = '\u3000';

function normalizeIndentedInputForDisplay(input: string): string {
  return input
    .split(/\r?\n/)
    .map(line => line.replace(/^[\t \u3000]+/, indent => {
      const normalizedIndent = indent
        .replace(/\u3000/g, ' ')
        .replace(/\t/g, '  ');
      return normalizedIndent.replace(/ /g, IDEOGRAPHIC_SPACE);
    }))
    .join('\n');
}

function normalizeIndentedInputForParsing(input: string): string {
  return input.replace(/\u3000/g, ' ');
}

function mapDisplaySelectionOffset(input: string, offset: number | null): number | null {
  if (offset == null) return null;
  return normalizeIndentedInputForDisplay(input.slice(0, offset)).length;
}

function normalizeImportGender(value: string | undefined, t: (key: string) => string): 'male' | 'female' | 'unknown' | undefined {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === '男' || normalized === 'male' || normalized === 'm') return 'male';
  if (normalized === '女' || normalized === 'female' || normalized === 'f') return 'female';
  if (normalized === '未知' || normalized === 'unknown') return 'unknown';
  throw new Error(t('family.invalidGender').replace('{value}', value ?? ''));
}

function parseOptionalYear(value: string | undefined, lineNumber: number, label: string, t: (key: string) => string): number | undefined {
  const normalized = (value ?? '').trim();
  if (!normalized) return undefined;
  const year = Number.parseInt(normalized, 10);
  if (Number.isNaN(year)) {
    throw new Error(t('family.invalidYear').replace('{line}', String(lineNumber)).replace('{label}', label).replace('{value}', normalized));
  }
  return year;
}

function parseIndentedFamilyText(input: string, t: (key: string) => string): NestedFamilyPersonImport {
  const lines = normalizeIndentedInputForParsing(input)
    .split(/\r?\n/)
    .map((raw, index) => ({ raw: raw.replace(/\t/g, '  '), lineNumber: index + 1 }))
    .filter(line => line.raw.trim().length > 0);

  if (lines.length === 0) {
    throw new Error(t('family.textRequired'));
  }

  const roots: NestedFamilyPersonImport[] = [];
  const stack: NestedFamilyPersonImport[] = [];

  for (const line of lines) {
    const indent = line.raw.match(/^ */)?.[0].length ?? 0;
    if (indent % 2 !== 0) {
      throw new Error(t('family.invalidIndent').replace('{line}', String(line.lineNumber)));
    }

    const level = indent / 2;
    const fields = line.raw.trim().split(/[，,]/).map(part => part.trim());
    const [name, genderText, spouse, spouseGenderText, birthYearText, deathYearText] = fields;

    if (!name) {
      throw new Error(t('family.nameMissing').replace('{line}', String(line.lineNumber)));
    }

    const person: NestedFamilyPersonImport = {
      name,
      gender: normalizeImportGender(genderText, t),
      spouse: spouse || undefined,
      spouseGender: spouse ? normalizeImportGender(spouseGenderText, t) : undefined,
      birthYear: parseOptionalYear(birthYearText, line.lineNumber, t('family.birthYear'), t),
      deathYear: parseOptionalYear(deathYearText, line.lineNumber, t('family.deathYear'), t),
      children: [],
    };

    while (stack.length > level) {
      stack.pop();
    }

    if (level > stack.length) {
      throw new Error(t('family.indentTooDeep').replace('{line}', String(line.lineNumber)));
    }

    if (level === 0) {
      roots.push(person);
    } else {
      const parent = stack[level - 1];
      if (!parent) {
        throw new Error(t('family.parentMissing').replace('{line}', String(line.lineNumber)));
      }
      parent.children = parent.children ?? [];
      parent.children.push(person);
    }

    stack[level] = person;
  }

  if (roots.length !== 1) {
    throw new Error(t('family.singleRoot'));
  }

  return roots[0];
}

function parseZibeiPoem(input: string): string[] | undefined {
  const normalized = input.trim();
  if (!normalized) return undefined;
  if (/[\s,，]/.test(normalized)) {
    const items = normalized.split(/[\s,，]+/).map(item => item.trim()).filter(Boolean);
    return items.length > 0 ? items : undefined;
  }
  return Array.from(normalized).filter(Boolean);
}

interface VisibilityRuleRow {
  key: string;
  subject: string;
  permission: 'view' | 'edit';
  locked?: boolean;
}

function createVisibilityRuleId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}_${Math.round(Math.random() * 100000)}`;
}

function createVisibilityRule(subject = '', permission: 'view' | 'edit' = 'view'): VisibilityRuleRow {
  return {
    key: `visibility-rule-${createVisibilityRuleId()}`,
    subject,
    permission,
  };
}

function inferVisibilitySubjectType(subject: string) {
  return subject.includes('@') ? 'ui.user' : 'ui.domain';
}

function formatVisibilityPermission(permission: 'view' | 'edit') {
  return permission === 'edit' ? 'ui.edit' : 'ui.view';
}

function toggleVisibilityPermission(permission: 'view' | 'edit'): 'view' | 'edit' {
  return permission === 'edit' ? 'view' : 'edit';
}

function buildVisibilityRules(visibility: FamilyTreeVisibilityDto, treeDomain?: string): VisibilityRuleRow[] {
  const rows: VisibilityRuleRow[] = [];

  if (treeDomain) {
    rows.push({
      key: `visibility-baseline-${treeDomain}`,
      subject: treeDomain,
      permission: 'view',
      locked: true,
    });
  }

  visibility.userEditors.forEach(subject => rows.push(createVisibilityRule(subject, 'edit')));
  visibility.userViewers.forEach(subject => rows.push(createVisibilityRule(subject, 'view')));
  visibility.domainEditors.forEach(subject => rows.push(createVisibilityRule(subject, 'edit')));
  visibility.domainViewers.forEach(subject => rows.push(createVisibilityRule(subject, 'view')));

  return rows;
}

function toVisibilityRequest(rows: VisibilityRuleRow[]): FamilyTreeVisibilityDto {
  const userViewers = new Set<string>();
  const userEditors = new Set<string>();
  const domainViewers = new Set<string>();
  const domainEditors = new Set<string>();

  rows.forEach(row => {
    if (row.locked) {
      return;
    }

    const subject = row.subject.trim();
    if (!subject) {
      return;
    }

    const isUser = subject.includes('@');
    if (isUser) {
      if (row.permission === 'edit') {
        userEditors.add(subject);
        userViewers.delete(subject);
      } else if (!userEditors.has(subject)) {
        userViewers.add(subject);
      }
      return;
    }

    if (row.permission === 'edit') {
      domainEditors.add(subject);
      domainViewers.delete(subject);
    } else if (!domainEditors.has(subject)) {
      domainViewers.add(subject);
    }
  });

  return {
    treeId: '',
    userViewers: Array.from(userViewers),
    userEditors: Array.from(userEditors),
    domainViewers: Array.from(domainViewers),
    domainEditors: Array.from(domainEditors),
  };
}

function getTreeDepth(node: FamilyNode): number {
  if (node.children.length === 0) return 0;
  return 1 + Math.max(...node.children.map(getTreeDepth));
}

function readFamilyPageState(): FamilyPagePersistedState | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(FAMILY_PAGE_STATE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<FamilyPagePersistedState>;
    const viewMode = parsed.viewMode;
    return {
      selectedTreeId: typeof parsed.selectedTreeId === 'string' ? parsed.selectedTreeId : null,
      viewMode: viewMode === 'tree' || viewMode === 'list' || viewMode === 'generation' ? viewMode : 'tree',
      selectedPersonId: typeof parsed.selectedPersonId === 'string' ? parsed.selectedPersonId : null,
      focusPersonId: typeof parsed.focusPersonId === 'string' ? parsed.focusPersonId : null,
      visibleStartDepth: typeof parsed.visibleStartDepth === 'number' ? parsed.visibleStartDepth : 0,
    };
  } catch {
    return null;
  }
}

function writeFamilyPageState(state: FamilyPagePersistedState) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(FAMILY_PAGE_STATE_KEY, JSON.stringify(state));
}

// Get 0-based depth of a person in the tree (depth from root)
function getPersonTreeDepth(personId: string, allNodes: FamilyNode[]): number {
  const node = allNodes.find(n => n.id === personId);
  if (!node) return 0;
  let depth = 0;
  let current: FamilyNode | undefined = node;
  while (current) {
    if (current.parentRels.length === 0) break;
    const parentId: string = current.parentRels[0].fromId;
    current = allNodes.find(n => n.id === parentId);
    depth++;
  }
  return depth;
}

export const FamilyPage: React.FC = () => {
  const { t } = useLanguage();
  const dispatch = useDispatch<AppDispatch>();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const editableFamilyDomains = useMemo(() => {
    const candidates = currentUser?.editableFamilyTreeDomains ?? [];
    return [...new Set(candidates.map(domain => domain.trim()).filter(Boolean))];
  }, [currentUser?.editableFamilyTreeDomains]);
  const persistedStateRef = useRef<FamilyPagePersistedState | null>(readFamilyPageState());
  const [trees, setTrees] = useState<FamilyTreeDto[]>([]);
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(persistedStateRef.current?.selectedTreeId ?? null);
  const selectedTreeIdRef = useRef(selectedTreeId);
  selectedTreeIdRef.current = selectedTreeId;
  const [persons, setPersons] = useState<FamilyPersonDto[]>([]);
  const [, setRels] = useState<FamilyRelationshipDto[]>([]);
  const [rootNode, setRootNode] = useState<FamilyNode | null>(null);
  const [allNodes, setAllNodes] = useState<FamilyNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [treeListReady, setTreeListReady] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(persistedStateRef.current?.viewMode ?? 'tree');
  const [selectedPerson, setSelectedPerson] = useState<FamilyNode | null>(null);
  const [contextMenu, setContextMenu] = useState<{ node: FamilyNode; x: number; y: number } | null>(null);
  const [listSearch, setListSearch] = useState('');
  const [visibleStartDepth, setVisibleStartDepth] = useState(persistedStateRef.current?.visibleStartDepth ?? 0);
  const [focusPersonId, setFocusPersonId] = useState<string | null>(persistedStateRef.current?.focusPersonId ?? null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createTreeName, setCreateTreeName] = useState('');
  const [createTreeSurname, setCreateTreeSurname] = useState('');
  const [createTreeDomain, setCreateTreeDomain] = useState('');
  const [createTreeRootGeneration, setCreateTreeRootGeneration] = useState('1');
  const [createTreePoem, setCreateTreePoem] = useState('');
  const [createTreeText, setCreateTreeText] = useState(() => normalizeIndentedInputForDisplay(''));
  const [createArchiveFile, setCreateArchiveFile] = useState<File | null>(null);
  const [createTreeMode, setCreateTreeMode] = useState<CreateTreeMode>('text');
  const [createTreeError, setCreateTreeError] = useState<string | null>(null);
  const [creatingTree, setCreatingTree] = useState(false);
  const [deletingTree, setDeletingTree] = useState(false);
  const [deleteTreeTarget, setDeleteTreeTarget] = useState<{ id: string; name: string } | null>(null);
  const deletingTreeRef = useRef(false);
  const [exportingTreeArchive, setExportingTreeArchive] = useState(false);
  const [visibilityDialogOpen, setVisibilityDialogOpen] = useState(false);
  const [loadingVisibility, setLoadingVisibility] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const [, setVisibilityForm] = useState<FamilyTreeVisibilityDto>({
    treeId: '',
    userViewers: [],
    userEditors: [],
    domainViewers: [],
    domainEditors: [],
  });
  const [visibilityRules, setVisibilityRules] = useState<VisibilityRuleRow[]>([]);
  const [panelEditing, setPanelEditing] = useState(false);
  const canvasRef = useRef<FamilyHistoHandle>(null);
  const createTreeTextInputRef = useRef<HTMLTextAreaElement | null>(null);
  const createArchiveInputRef = useRef<HTMLInputElement | null>(null);
  const pendingCreateTreeTextSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const selectedPersonIdRef = useRef<string | null>(persistedStateRef.current?.selectedPersonId ?? null);
  const listViewRef = useRef<HTMLDivElement | null>(null);
  const generationViewRef = useRef<HTMLDivElement | null>(null);
  const didHydrateTreeStateRef = useRef(false);
  const initialRestorePendingRef = useRef(Boolean(persistedStateRef.current?.selectedTreeId));
  const restoreTreeSelectionRef = useRef(false);
  const pendingTreeNavigationPersonIdRef = useRef<string | null | undefined>(undefined);
  const refreshedFamilyUserIdRef = useRef<string | null>(null);

  // ── Notebook dialog state ──────────────────────────────────────────────
  const [notebookDialogOpen, setNotebookDialogOpen] = useState(false);

  const selectPerson = useCallback((person: FamilyNode | null) => {
    selectedPersonIdRef.current = person?.id ?? null;
    setSelectedPerson(person);
  }, []);

  useEffect(() => {
    const selectedId = selectedPerson?.id;
    if (!selectedId) return;

    const activeContainer = viewMode === 'list'
      ? listViewRef.current
      : viewMode === 'generation'
        ? generationViewRef.current
        : null;

    if (!activeContainer) return;

    const target = activeContainer.querySelector<HTMLElement>(`[data-person-id="${selectedId}"]`);
    if (!target) return;

    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedPerson?.id, viewMode]);

  useEffect(() => {
    if (selectedPerson || allNodes.length === 0 || !selectedPersonIdRef.current) return;

    const restoredPerson = allNodes.find(node => node.id === selectedPersonIdRef.current);
    if (restoredPerson) {
      restoreTreeSelectionRef.current = true;
      selectPerson(restoredPerson);
    }
  }, [allNodes, selectedPerson, selectPerson]);

  useEffect(() => {
    if (viewMode !== 'tree' || loading || !restoreTreeSelectionRef.current) return;

    const personId = focusPersonId ?? selectedPerson?.id;
    if (!personId || !canvasRef.current) return;

    restoreTreeSelectionRef.current = false;
    canvasRef.current.setPendingHighlight(personId);
    const timer = window.setTimeout(() => {
      canvasRef.current?.centerOnPerson(personId);
    }, 80);

    return () => window.clearTimeout(timer);
  }, [viewMode, loading, focusPersonId, selectedPerson?.id, visibleStartDepth]);

  useEffect(() => {
    const selection = pendingCreateTreeTextSelectionRef.current;
    const input = createTreeTextInputRef.current;
    if (!selection || !input) return;

    pendingCreateTreeTextSelectionRef.current = null;
    const restore = () => input.setSelectionRange(selection.start, selection.end);
    window.requestAnimationFrame(restore);
  }, [createTreeText]);

  useEffect(() => {
    writeFamilyPageState({
      selectedTreeId,
      viewMode,
      selectedPersonId: selectedPersonIdRef.current,
      focusPersonId,
      visibleStartDepth,
    });
  }, [selectedTreeId, viewMode, focusPersonId, visibleStartDepth, selectedPerson?.id]);

  const selectedTree = trees.find(t => t.id === selectedTreeId) ?? null;
  const canManageSelectedTreePermissions = Boolean(selectedTree?.canManagePermissions);
  const isArchiveImportMode = createTreeMode === 'archive';
  const treeMaxDepth = useMemo(() => rootNode ? getTreeDepth(rootNode) : 0, [rootNode]);
  const visibilityInlineInputSx = {
    px: 0.75,
    py: 0.35,
    width: '100%',
    fontSize: 13,
    lineHeight: 1.35,
    borderRadius: '4px',
    backgroundColor: 'background.paper',
    border: '1px solid',
    borderColor: 'divider',
    '& input': {
      padding: 0,
    },
    '&.Mui-disabled': {
      backgroundColor: 'action.disabledBackground',
      borderColor: 'divider',
    },
  };
  const compactVisibilityToggleSx = {
    minWidth: 46,
    width: 46,
    px: 0.25,
    py: 0.2,
    fontSize: 12,
    lineHeight: 1.2,
    borderRadius: '4px',
    justifySelf: 'center',
  };
  const visibilityTableSurfaceSx = {
    overflow: 'hidden',
    borderRadius: '4px',
    backgroundColor: 'background.paper',
    borderColor: 'divider',
    backgroundImage: 'none',
  };
  const createDialogTextFieldSx = {
    '& .MuiOutlinedInput-root': {
      borderRadius: '4px',
      backgroundColor: 'background.paper',
    },
  };
  const createDialogSelectMenuProps = {
    disableScrollLock: true,
    PaperProps: {
      sx: {
        backgroundColor: 'background.paper',
        backgroundImage: 'none',
        border: '1px solid',
        borderColor: 'divider',
        backdropFilter: 'none',
        opacity: 1,
      },
    },
  };
  const createDialogSelectSx = {
    ...createDialogTextFieldSx,
    '& .MuiOutlinedInput-root': {
      ...createDialogTextFieldSx['& .MuiOutlinedInput-root'],
      minHeight: 40,
    },
    '& .MuiSelect-select': {
      fontSize: 14,
      lineHeight: 1.35,
      py: '8.5px',
      pl: '14px',
      pr: 2.5,
    },
    '& .MuiSelect-icon': {
      fontSize: '1.25rem',
      color: 'text.primary',
    },
  };

  const loadTrees = useCallback(async (preferredTreeId?: string) => {
    const list = await familyService.listTrees();
    setTrees(list);
    if (list.length === 0) {
      setSelectedTreeId(null);
      setTreeListReady(true);
      return;
    }

    if (preferredTreeId && list.some(tree => tree.id === preferredTreeId)) {
      setSelectedTreeId(preferredTreeId);
      setTreeListReady(true);
      return;
    }

    setSelectedTreeId(current => {
      if (current && list.some(tree => tree.id === current)) {
        return current;
      }
      return list[0].id;
    });
    setTreeListReady(true);
  }, []);

  // Load tree list on mount
  useEffect(() => {
    loadTrees().catch((error) => {
      console.error('Failed to load family trees:', error);
      setTreeListReady(true);
      setError(t('ui.loadFailed'));
    });
  }, [loadTrees, t]);

  useEffect(() => {
    setCreateTreeDomain(current => {
      if (current && editableFamilyDomains.includes(current)) {
        return current;
      }

      return editableFamilyDomains[0] ?? '';
    });
  }, [editableFamilyDomains]);

  useEffect(() => {
    if (!currentUser?.id || !currentUser.canEditFamilyTree) {
      refreshedFamilyUserIdRef.current = null;
      return;
    }

    if (refreshedFamilyUserIdRef.current === currentUser.id) {
      return;
    }

    refreshedFamilyUserIdRef.current = currentUser.id;

    let cancelled = false;

    contactService.getCurrentUser()
      .then(user => {
        if (cancelled) return;
        dispatch(updateUser(user));
        const accessToken = authService.getAccessToken();
        if (accessToken) {
          authService.saveAuth(accessToken, { ...currentUser, ...user });
        }
      })
      .catch(() => {
        refreshedFamilyUserIdRef.current = null;
        // Leave the current session state unchanged if the refresh fails.
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser, dispatch]);

  const applyTreeData = useCallback((p: FamilyPersonDto[], r: FamilyRelationshipDto[], preferredPersonId?: string | null) => {
    setPersons(p);
    setRels(r);

    const nodes = buildFamilyNodes(p, r);
    const root = buildTree(p, r);

    setRootNode(root);
    setAllNodes(nodes);

    const nextSelectedId = preferredPersonId === undefined ? selectedPersonIdRef.current : preferredPersonId;
    selectPerson(nextSelectedId ? nodes.find(n => n.id === nextSelectedId) ?? null : null);

    setFocusPersonId(currentFocusId => (
      currentFocusId && !nodes.some(node => node.id === currentFocusId)
        ? null
        : currentFocusId
    ));

    if (persistedStateRef.current?.selectedTreeId === selectedTreeId) {
      initialRestorePendingRef.current = false;
    }
  }, [selectPerson, selectedTreeId]);

  const refreshCurrentTree = useCallback(async (preferredPersonId?: string | null) => {
    if (!selectedTreeId) return;

    setLoading(true);
    setError(null);

    try {
      const { persons: p, relationships: r } = await familyService.getTree(selectedTreeId);
      applyTreeData(p, r, preferredPersonId);
    } catch (error) {
      console.error('Failed to load family tree:', error);
      setError(t('ui.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [applyTreeData, selectedTreeId, t]);

  // Load full tree when selection changes
  useEffect(() => {
    if (!treeListReady || !selectedTreeId) return;

    const persistedState = persistedStateRef.current;
    const pendingTreeNavigationPersonId = pendingTreeNavigationPersonIdRef.current;
    const shouldHydrate =
      initialRestorePendingRef.current &&
      persistedState?.selectedTreeId === selectedTreeId;

    didHydrateTreeStateRef.current = true;

    if (pendingTreeNavigationPersonId !== undefined) {
      pendingTreeNavigationPersonIdRef.current = undefined;
      restoreTreeSelectionRef.current = true;
      void refreshCurrentTree(pendingTreeNavigationPersonId);
      return;
    }

    if (shouldHydrate) {
      restoreTreeSelectionRef.current = true;
      void refreshCurrentTree(persistedState?.selectedPersonId ?? null);
      return;
    }

    setVisibleStartDepth(0);
    setFocusPersonId(null);
    void refreshCurrentTree(null);
  }, [refreshCurrentTree, selectedTreeId, treeListReady]);

  const handleNodeClick = useCallback((node: FamilyNode) => {
    const canonicalPersonId = node.canonicalPersonId ?? node.id;
    selectPerson(allNodes.find(candidate => candidate.id === canonicalPersonId) ?? node);
    setFocusPersonId(null);
  }, [allNodes, selectPerson]);

  const handleNodeRightClick = useCallback((node: FamilyNode, x: number, y: number) => {
    const canonicalPersonId = node.canonicalPersonId ?? node.id;
    const canonicalNode = allNodes.find(candidate => candidate.id === canonicalPersonId) ?? node;

    if (isMobile) {
      selectPerson(canonicalNode);
      setFocusPersonId(null);
      return;
    }

    const menuW = 200;
    const menuH = 96;
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : x + menuW;
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : y + menuH;
    const clampedX = Math.min(x, viewportW - menuW - 8);
    const clampedY = Math.min(y, viewportH - menuH - 8);
    setContextMenu({ node: canonicalNode, x: Math.max(8, clampedX), y: Math.max(8, clampedY) });
  }, [allNodes, isMobile, selectPerson]);

  const handleCloseContextMenu = useCallback(() => setContextMenu(null), []);

  const pickCanvasRef = useCallback(() => canvasRef, []);

  const handleExpandDepth = useCallback((personId: string) => {
    const personDepth = getPersonTreeDepth(personId, allNodes);
    const newStart = Math.max(
      visibleStartDepth + 1,
      personDepth - MAX_VISIBLE_DEPTH + 2
    );
    const clamped = Math.min(newStart, Math.max(0, treeMaxDepth - MAX_VISIBLE_DEPTH + 1));
    const activeRef = pickCanvasRef();
    activeRef.current?.setPendingHighlight(personId);
    setFocusPersonId(personId);
    setVisibleStartDepth(clamped);
    setTimeout(() => activeRef.current?.centerOnPerson(personId), 80);
  }, [visibleStartDepth, treeMaxDepth, allNodes, viewMode, pickCanvasRef]);

  const navigateToPerson = useCallback((personId: string) => {
    const node = allNodes.find(n => n.id === personId);
    if (!node) return;
    selectPerson(node);
    setFocusPersonId(null);
    setViewMode('tree');

    const activeRef = pickCanvasRef();
    activeRef.current?.highlightPerson(personId);

    // Auto-adjust depth window so the person is visible
    const personDepth = getPersonTreeDepth(personId, allNodes);
    if (personDepth < visibleStartDepth || personDepth >= visibleStartDepth + MAX_VISIBLE_DEPTH) {
      const newStart = Math.max(0, personDepth - Math.floor(MAX_VISIBLE_DEPTH / 2));
      setVisibleStartDepth(Math.min(newStart, Math.max(0, treeMaxDepth - MAX_VISIBLE_DEPTH + 1)));
    }

    setTimeout(() => {
      activeRef.current?.centerOnPerson(personId);
    }, 80);
  }, [allNodes, visibleStartDepth, treeMaxDepth, viewMode, pickCanvasRef, selectPerson]);

  const openPersonDetails = useCallback((personId: string) => {
    const node = allNodes.find(n => n.id === personId);
    if (!node) return;
    selectPerson(node);
    setFocusPersonId(null);
  }, [allNodes, selectPerson]);

  const handleSearchSelect = useCallback((_: any, value: FamilyNode | null) => {
    if (!value) return;

    if (viewMode === 'tree') {
      navigateToPerson(value.id);
      return;
    }

    openPersonDetails(value.id);
  }, [navigateToPerson, openPersonDetails, viewMode]);

  const handlePanelNavigate = useCallback((personId: string) => {
    if (viewMode === 'tree') {
      navigateToPerson(personId);
      return;
    }

    openPersonDetails(personId);
  }, [navigateToPerson, openPersonDetails, viewMode]);

  const handleOpenLinkedPerson = useCallback((treeId: string, personId: string) => {
    if (!treeId || !personId) return;

    pendingTreeNavigationPersonIdRef.current = personId;
    selectedPersonIdRef.current = personId;
    restoreTreeSelectionRef.current = true;
    setFocusPersonId(personId);
    setViewMode('tree');
    setSelectedTreeId(treeId);
  }, []);

  const handleOpenCreateDialog = useCallback(async () => {
    setCreateTreeError(null);

    if (currentUser?.canEditFamilyTree) {
      try {
        const user = await contactService.getCurrentUser();
        dispatch(updateUser(user));
        const accessToken = authService.getAccessToken();
        if (accessToken) {
          authService.saveAuth(accessToken, { ...currentUser, ...user });
        }

        const nextDomains = [...new Set((user.editableFamilyTreeDomains ?? []).map(domain => domain.trim()).filter(Boolean))];
        setCreateTreeDomain(current => {
          if (current && nextDomains.includes(current)) {
            return current;
          }

          return nextDomains[0] ?? '';
        });
      } catch {
        // Keep the dialog usable with the last known client-side capabilities.
      }
    }

    setCreateDialogOpen(true);
  }, [currentUser, dispatch]);

  const handleCloseCreateDialog = useCallback(() => {
    if (creatingTree) return;
    setCreateDialogOpen(false);
    setCreateTreeError(null);
    setCreateArchiveFile(null);
    setCreateTreeMode('text');
    if (createArchiveInputRef.current) {
      createArchiveInputRef.current.value = '';
    }
  }, [creatingTree]);

  const handleSelectCreateArchive = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setCreateArchiveFile(nextFile);
    setCreateTreeMode('archive');
    setCreateTreeError(null);
  }, []);

  const handleClearCreateArchive = useCallback(() => {
    setCreateArchiveFile(null);
    if (createArchiveInputRef.current) {
      createArchiveInputRef.current.value = '';
    }
  }, []);

  const handleSelectCreateMode = useCallback((mode: CreateTreeMode) => {
    setCreateTreeMode(mode);
    setCreateTreeError(null);
  }, []);

  const handleExportSelectedTreeArchive = useCallback(async () => {
    if (!selectedTreeId || !selectedTree || exportingTreeArchive || deletingTreeRef.current) {
      return;
    }

    setVisibilityError(null);
    setExportingTreeArchive(true);

    try {
      const { blob, fileName } = await familyService.exportTreeArchive(selectedTreeId);
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName || `${selectedTree.name}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (exportError: any) {
      console.error('Failed to export family tree:', exportError);
      setVisibilityError(t('ui.exportFailed'));
    } finally {
      setExportingTreeArchive(false);
    }
  }, [exportingTreeArchive, selectedTree, selectedTreeId, t]);

  const handleDeleteSelectedTree = useCallback(async () => {
    if (!deleteTreeTarget || deletingTreeRef.current || savingVisibility || exportingTreeArchive) {
      throw new Error('Family tree deletion unavailable');
    }

    const targetId = deleteTreeTarget.id;
    deletingTreeRef.current = true;
    setDeletingTree(true);
    setError(null);

    try {
      await familyService.deleteTree(targetId);
      setTrees(current => current.filter(tree => tree.id !== targetId));
      if (selectedTreeIdRef.current === targetId) selectPerson(null);
      setSelectedTreeId(current => current === targetId ? null : current);
      setVisibilityDialogOpen(false);
      try {
        await loadTrees();
      } catch (loadError) {
        console.error('Failed to refresh family trees after deletion:', loadError);
        setError(t('ui.loadFailed'));
      }
    } finally {
      deletingTreeRef.current = false;
      setDeletingTree(false);
    }
  }, [deleteTreeTarget, exportingTreeArchive, loadTrees, savingVisibility, selectPerson, t]);

  const handleOpenVisibilityDialog = useCallback(async () => {
    if (!selectedTreeId) return;

    setVisibilityDialogOpen(true);
    setLoadingVisibility(true);
    setVisibilityError(null);

    try {
      const visibility = await familyService.getTreeVisibility(selectedTreeId);
      setVisibilityForm(visibility);
      setVisibilityRules(buildVisibilityRules(visibility, selectedTree?.domain));
    } catch (loadError: any) {
      const emptyVisibility = {
        treeId: selectedTreeId,
        userViewers: [],
        userEditors: [],
        domainViewers: [],
        domainEditors: [],
      };
      setVisibilityForm(emptyVisibility);
      setVisibilityRules(buildVisibilityRules(emptyVisibility, selectedTree?.domain));
      console.error('Failed to load family tree permissions:', loadError);
      setVisibilityError(t('ui.accessLoadFailed'));
    } finally {
      setLoadingVisibility(false);
    }
  }, [selectedTree?.domain, selectedTreeId, t]);

  const handleCloseVisibilityDialog = useCallback(() => {
    if (savingVisibility || deletingTreeRef.current) return;
    setVisibilityDialogOpen(false);
    setVisibilityError(null);
  }, [savingVisibility]);

  const handleSaveVisibility = useCallback(async () => {
    if (!selectedTreeId || !canManageSelectedTreePermissions || deletingTreeRef.current) return;

    setSavingVisibility(true);
    setVisibilityError(null);

    const nextRequest = toVisibilityRequest(visibilityRules);

    try {
      const nextVisibility = await familyService.updateTreeVisibility(selectedTreeId, nextRequest);
      setVisibilityForm(nextVisibility);
      setVisibilityRules(buildVisibilityRules(nextVisibility, selectedTree?.domain));
      setVisibilityDialogOpen(false);
      await loadTrees(selectedTreeId);
    } catch (saveError: any) {
      console.error('Failed to save family tree permissions:', saveError);
      setVisibilityError(t('ui.saveFailed'));
    } finally {
      setSavingVisibility(false);
    }
  }, [canManageSelectedTreePermissions, loadTrees, selectedTree?.domain, selectedTreeId, visibilityRules, t]);

  const handleCreateTree = useCallback(async () => {
    setCreatingTree(true);
    setCreateTreeError(null);

    try {
      let tree: FamilyTreeDto;

      if (isArchiveImportMode) {
        if (!createArchiveFile) {
          setCreateTreeError(t('family.archiveRequired'));
          return;
        }

        tree = await familyService.importTreeArchive({
          file: createArchiveFile,
          name: createTreeName.trim() || undefined,
          domain: createTreeDomain.trim() || undefined,
        });
      } else {
        const treeName = createTreeName.trim();
        if (!treeName) {
          setCreateTreeError(t('family.nameRequired'));
          return;
        }

        const rootGeneration = Number.parseInt(createTreeRootGeneration, 10);
        if (Number.isNaN(rootGeneration)) {
          setCreateTreeError(t('family.generationInvalid'));
          return;
        }

        let parsedRoot: NestedFamilyPersonImport | null = null;
        if (createTreeText.trim()) {
          try {
            parsedRoot = parseIndentedFamilyText(createTreeText, t);
          } catch (parseError) {
            setCreateTreeError(parseError instanceof Error ? parseError.message : t('family.invalidText'));
            return;
          }
        }

        tree = await familyService.createTree({
          name: treeName,
          surname: createTreeSurname.trim() || undefined,
          domain: createTreeDomain.trim() || undefined,
          rootGeneration,
          zibeiPoem: parseZibeiPoem(createTreePoem),
        });

        if (parsedRoot) {
          await familyService.importTree(tree.id, parsedRoot);
        }
      }

      await loadTrees(tree.id);
      setCreateDialogOpen(false);
      setCreateTreeName('');
      setCreateTreeSurname('');
      setCreateTreePoem('');
      setCreateTreeRootGeneration('1');
      setCreateTreeText('');
      setCreateArchiveFile(null);
      setCreateTreeMode('text');
      setCreateTreeError(null);
      if (createArchiveInputRef.current) {
        createArchiveInputRef.current.value = '';
      }
    } catch (createError: any) {
      console.error('Failed to create family tree:', createError);
      setCreateTreeError(t('ui.createFailed'));
    } finally {
      setCreatingTree(false);
    }
  }, [createArchiveFile, createTreeDomain, createTreeMode, createTreeName, createTreePoem, createTreeRootGeneration, createTreeSurname, createTreeText, isArchiveImportMode, loadTrees, t]);

  const filteredPersons = listSearch
    ? allNodes.filter(person => person.name.includes(listSearch) || (person.aliases ?? []).some(alias => alias.includes(listSearch)))
    : allNodes;

  const byGeneration: Record<number, FamilyNode[]> = {};
  allNodes.forEach(n => {
    if (!byGeneration[n.generation]) byGeneration[n.generation] = [];
    byGeneration[n.generation].push(n);
  });
  const generations = Object.keys(byGeneration).map(Number).sort((a, b) => a - b);

  const canGoUp = visibleStartDepth > 0;
  const canGoDown = visibleStartDepth + MAX_VISIBLE_DEPTH <= treeMaxDepth;
  const handleAddVisibilityRule = useCallback(() => {
    if (!canManageSelectedTreePermissions) return;
    setVisibilityRules(current => [...current, createVisibilityRule()]);
  }, [canManageSelectedTreePermissions]);

  const handleRemoveVisibilityRule = useCallback((ruleId: string) => {
    if (!canManageSelectedTreePermissions) return;
    setVisibilityRules(current => current.filter(rule => rule.key !== ruleId));
  }, [canManageSelectedTreePermissions]);
  const handleVisibilitySubjectChange = useCallback((ruleId: string, value: string) => {
    if (!canManageSelectedTreePermissions) return;
    setVisibilityRules(current => current.map(rule => rule.key === ruleId ? { ...rule, subject: value } : rule));
  }, [canManageSelectedTreePermissions]);

  const handleToggleVisibilityRulePermission = useCallback((ruleId: string) => {
    if (!canManageSelectedTreePermissions) return;
    setVisibilityRules(current => current.map(rule =>
      rule.key === ruleId
        ? { ...rule, permission: toggleVisibilityPermission(rule.permission) }
        : rule));
  }, [canManageSelectedTreePermissions]);
  const handleCreateTreeTextChange = useCallback((value: string, selectionStart: number | null, selectionEnd: number | null) => {
    const nextValue = normalizeIndentedInputForDisplay(value);
    const nextSelectionStart = mapDisplaySelectionOffset(value, selectionStart);
    const nextSelectionEnd = mapDisplaySelectionOffset(value, selectionEnd);

    if (nextSelectionStart != null && nextSelectionEnd != null) {
      pendingCreateTreeTextSelectionRef.current = {
        start: nextSelectionStart,
        end: nextSelectionEnd,
      };
    }

    setCreateTreeText(nextValue);
  }, []);

  if (!currentUser?.canViewFamilyTree) {
    return (
      <BoxAny sx={{ display: 'flex', flexDirection: 'column', height: '100dvh', pt: APP_HEADER_OFFSET }}>
        <AppHeader />
        <BoxAny sx={{ flex: 1, p: 3 }}>
          <Alert severity="warning">{t('family.noAccess')}</Alert>
        </BoxAny>
      </BoxAny>
    );
  }

  return (
    <BoxAny sx={{ display: 'flex', flexDirection: 'column', height: '100dvh', pt: APP_HEADER_OFFSET }}>
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
        {!loading && !error && trees.length === 0 && (
          <BoxAny sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography color="text.secondary">{t('family.empty')}</Typography>
          </BoxAny>
        )}

        {!loading && !error && trees.length > 0 && (
          <>
            {/* Person detail panel — floating for tree mode */}
            {selectedPerson && !isMobile && (
              <BoxAny sx={{
                width: 404, flexShrink: 0, overflow: 'hidden',
                borderRadius: '8px',
                borderRight: '1px solid rgba(15,23,42,0.08)',
                ...(viewMode === 'tree' ? {
                  position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 10,
                  bgcolor: 'background.paper',
                  boxShadow: '2px 0 12px rgba(0,0,0,0.08)',
                } : {}),
              }}>
                <FamilyPersonPanel
                  person={selectedPerson}
                  tree={selectedTree}
                  allPersons={allNodes}
                  onClose={() => selectPerson(null)}
                  onNavigate={handlePanelNavigate}
                  onOpenLinkedPerson={handleOpenLinkedPerson}
                  onRefresh={refreshCurrentTree}
                  onEditingChange={setPanelEditing}
                  canEdit={Boolean(currentUser?.canEditFamilyTree)}
                />
              </BoxAny>
            )}

            {isMobile && (
              <Drawer
                anchor="bottom"
                open={Boolean(selectedPerson)}
                onClose={() => {
                  if (panelEditing) return;
                  selectPerson(null);
                }}
                ModalProps={{ keepMounted: true }}
                PaperProps={{
                  sx: {
                    borderTopLeftRadius: 8,
                    borderTopRightRadius: 8,
                    maxHeight: '80vh',
                    bgcolor: 'background.paper',
                    backgroundImage: 'none',
                  },
                }}
              >
                <FamilyPersonPanel
                  person={selectedPerson}
                  tree={selectedTree}
                  allPersons={allNodes}
                  onClose={() => selectPerson(null)}
                  onNavigate={handlePanelNavigate}
                  onOpenLinkedPerson={handleOpenLinkedPerson}
                  onRefresh={refreshCurrentTree}
                  onEditingChange={setPanelEditing}
                  canEdit={Boolean(currentUser?.canEditFamilyTree)}
                  fullWidth
                />
              </Drawer>
            )}

            {viewMode === 'tree' && (
              <BoxAny sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {rootNode ? (
                  <FamilyHisto
                    ref={canvasRef}
                    root={rootNode}
                    tree={selectedTree}
                    visibleStartDepth={visibleStartDepth}
                    maxVisibleDepth={MAX_VISIBLE_DEPTH}
                    canShiftUp={canGoUp}
                    canShiftDown={canGoDown}
                    onNodeClick={handleNodeClick}
                    onNodeRightClick={handleNodeRightClick}
                    onExpandDepth={handleExpandDepth}
                    onClearSelection={() => {
                      if (panelEditing) return;
                      selectPerson(null);
                      setFocusPersonId(null);
                    }}
                    onShiftUp={() => {
                      canvasRef.current?.setShiftDirection(-1);
                      const pid = focusPersonId ?? selectedPerson?.id ?? null;
                      if (pid) canvasRef.current?.setPendingHighlight(pid);
                      setVisibleStartDepth(d => d - 1);
                      if (pid) setTimeout(() => canvasRef.current?.centerOnPerson(pid), 80);
                    }}
                    onShiftDown={() => {
                      canvasRef.current?.setShiftDirection(1);
                      const pid = focusPersonId ?? selectedPerson?.id ?? null;
                      if (pid) canvasRef.current?.setPendingHighlight(pid);
                      setVisibleStartDepth(d => d + 1);
                      if (pid) setTimeout(() => canvasRef.current?.centerOnPerson(pid), 80);
                    }}
                  />
                ) : (
                  <BoxAny sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <Typography color="text.secondary">{t('family.noPeople')}</Typography>
                  </BoxAny>
                )}
              </BoxAny>
            )}

            {viewMode === 'list' && (
              <BoxAny ref={listViewRef} sx={{ flex: 1, overflow: 'auto', p: 2, pb: isMobile ? 10 : 2 }}>
                <TextField
                  size="small"
                  placeholder={t('family.search')}
                  value={listSearch}
                  onChange={e => setListSearch(e.target.value)}
                  sx={{ mb: 1.5, width: 260 }}
                />
                <TableContainer component={Paper} elevation={1}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 'bold' }}>{t('family.generation')}</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>{t('family.personName')}</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>{t('family.gender')}</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>{t('family.birthYear')}</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>{t('family.spouse')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredPersons
                        .slice()
                        .sort((a, b) => a.generation - b.generation || a.name.localeCompare(b.name))
                        .map(p => {
                          const node = allNodes.find(n => n.id === p.id);
                          return (
                            <TableRow
                              key={p.id}
                              hover
                              data-person-id={p.id}
                              selected={selectedPerson?.id === p.id}
                              sx={{
                                cursor: 'pointer',
                                bgcolor: selectedPerson?.id === p.id ? 'rgba(42,175,71,0.10)' : undefined,
                                '&:hover': { bgcolor: selectedPerson?.id === p.id ? 'rgba(42,175,71,0.14)' : 'rgba(42,175,71,0.04)' },
                                '& .MuiTableCell-root': {
                                  fontWeight: selectedPerson?.id === p.id ? 600 : undefined,
                                },
                              }}
                              onClick={() => openPersonDetails(p.id)}
                            >
                              <TableCell>{t('family.generationNumber').replace('{generation}', String(p.generation))}</TableCell>
                              <TableCell>
                                <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <BoxAny sx={{
                                    width: 6, height: 6, borderRadius: '50%',
                                    bgcolor: p.gender === 'female' ? '#f472b6' : '#60a5fa',
                                    flexShrink: 0,
                                  }} />
                                  {p.name}
                                </BoxAny>
                              </TableCell>
                              <TableCell>{t(p.gender === 'female' ? 'profile.female' : 'profile.male')}</TableCell>
                              <TableCell>{p.birthDate?.year ?? '—'}</TableCell>
                              <TableCell>{node?.spouses.map(s => s.name).join('、') || '—'}</TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </BoxAny>
            )}

            {viewMode === 'generation' && (
              <BoxAny ref={generationViewRef} sx={{ flex: 1, overflow: 'auto', p: 2, pb: isMobile ? 10 : 2 }}>
                {generations.map(gen => (
                  <BoxAny key={gen} sx={{ mb: 2 }}>
                    <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                      <Typography variant="subtitle2" fontWeight="bold" color="primary">
                        {t('family.generationNumber').replace('{generation}', String(gen))}
                      </Typography>
                      <Chip label={t('family.peopleCount').replace('{count}', String(byGeneration[gen].length))} size="small" sx={{ height: 18, fontSize: 10, bgcolor: 'rgba(42,175,71,0.1)' }} />
                    </BoxAny>
                    <BoxAny sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                      {byGeneration[gen].map(node => (
                        <Chip
                          key={node.id}
                          data-person-id={node.id}
                          label={
                            <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <BoxAny sx={{
                                width: 5, height: 5, borderRadius: '50%',
                                bgcolor: node.gender === 'female' ? '#f472b6' : '#60a5fa',
                              }} />
                              <span>{node.name}</span>
                            </BoxAny>
                          }
                          size="small"
                          variant="outlined"
                          clickable
                          onClick={() => openPersonDetails(node.id)}
                          sx={{
                            cursor: 'pointer',
                            background: selectedPerson?.id === node.id ? 'rgba(42,175,71,0.10)' : 'rgba(255,255,255,0.8)',
                            borderColor: selectedPerson?.id === node.id ? 'rgb(42,175,71)' : undefined,
                            color: selectedPerson?.id === node.id ? 'rgb(22,101,52)' : undefined,
                            '&:hover': {
                              borderColor: 'rgb(42,175,71)',
                              bgcolor: selectedPerson?.id === node.id ? 'rgba(42,175,71,0.14)' : 'rgba(42,175,71,0.04)',
                            },
                          }}
                        />
                      ))}
                    </BoxAny>
                    <Divider sx={{ mt: 1.5 }} />
                  </BoxAny>
                ))}
              </BoxAny>
            )}
          </>
        )}
      </BoxAny>

      {/* Notebook view (谱志) — same layout as 札记 */}
      {notebookDialogOpen && selectedTreeId && (
        <BoxAny sx={{ position: 'fixed', top: APP_HEADER_OFFSET, left: 0, right: 0, bottom: 0, zIndex: 5, display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
          <BoxAny sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <FamilyNotebook treeId={selectedTreeId} />
          </BoxAny>
          <BoxAny sx={{
            borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper',
            px: 2, py: 1, display: 'flex', justifyContent: 'flex-end',
          }}>
            <Button onClick={() => setNotebookDialogOpen(false)} size="small" variant="outlined"
              sx={{ height: 32, minHeight: 32, px: 1.25, fontSize: 14, lineHeight: 1.35, textTransform: 'none', color: 'text.primary' }}>
              {t('family.returnToTree')}
            </Button>
          </BoxAny>
        </BoxAny>
      )}

      {/* Bottom control bar */}
      <BoxAny sx={{
        borderTop: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
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
          ...(isMobile ? {
            width: '100%',
            flexWrap: 'nowrap',
            gap: 0.5,
            justifyContent: 'flex-start',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          } : {}),
        }}>
          {currentUser?.canEditFamilyTree && (
            <Button
              size="small"
              variant="contained"
              onClick={handleOpenCreateDialog}
              sx={{
                minWidth: 0,
                ...(isMobile ? { flexShrink: 0 } : {}),
              }}
            >
              {t('ui.new')}
            </Button>
          )}
          {selectedTree && (
            <Button
              size="small"
              variant="outlined"
              onClick={handleOpenVisibilityDialog}
              sx={{
                minWidth: 0,
                ...(isMobile ? { flexShrink: 0 } : {}),
              }}
            >
              {t('ui.settings')}
            </Button>
          )}
          {selectedTree && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => setNotebookDialogOpen(true)}
              sx={{
                minWidth: 0,
                ...(isMobile ? { flexShrink: 0 } : {}),
              }}
            >
              {t('family.notebook')}
            </Button>
          )}
          {allNodes.length > 0 && (
            <Autocomplete
              size="small"
              options={allNodes}
              getOptionLabel={(n: FamilyNode) => `${n.name} ${t('family.generationNumber').replace('{generation}', String(n.generation))}`}
              filterOptions={(opts, { inputValue }) =>
                inputValue.length > 0
                  ? opts.filter(o =>
                      o.name.includes(inputValue) ||
                      (o.aliases ?? []).some(a => a.includes(inputValue))
                    ).slice(0, 15)
                  : []
              }
              onChange={handleSearchSelect}
              forcePopupIcon={!isMobile}
              popupIcon={isMobile ? null : <ExpandMoreIcon sx={{ fontSize: '1.25rem' }} />}
              disableClearable
              ListboxProps={{
                className: 'chat-window-scroll-hidden',
                style: {
                  maxHeight: isMobile ? 162 : 198,
                  overflowY: 'auto',
                  paddingTop: 0,
                  paddingBottom: 0,
                },
              }}
              PaperComponent={(paperProps) => (
                <Paper
                  {...paperProps}
                  sx={{
                    backgroundColor: 'background.paper',
                    backgroundImage: 'none',
                    border: '1px solid',
                    borderColor: 'divider',
                    backdropFilter: 'none',
                    opacity: 1,
                    mt: 0.5,
                    overflow: 'hidden',
                    '& .MuiAutocomplete-noOptions': {
                      display: 'none',
                    },
                  }}
                />
              )}
              renderOption={(props, option) => (
                <BoxAny
                  component="li"
                  {...props}
                  sx={{
                    fontSize: 14,
                    lineHeight: 1.35,
                    minHeight: 36,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {`${option.name} ${t('family.generationNumber').replace('{generation}', String(option.generation))}`}
                </BoxAny>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: isMobile ? null : params.InputProps.endAdornment,
                  }}
                />
              )}
              sx={{
                ...(isMobile ? { width: 96, flexShrink: 0 } : { width: 144 }),
                '& .MuiOutlinedInput-root': {
                  height: 32,
                  minHeight: 32,
                  backgroundColor: 'background.paper',
                  backgroundImage: 'none',
                  borderRadius: 1,
                  alignItems: 'center',
                  '& fieldset': {
                    borderColor: 'rgba(15, 23, 42, 0.23)',
                  },
                  '&:hover fieldset': {
                    borderColor: 'rgba(15, 23, 42, 0.35)',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: 'primary.main',
                    borderWidth: 1,
                  },
                },
                '& .MuiAutocomplete-inputRoot': {
                  paddingTop: '0 !important',
                  paddingBottom: '0 !important',
                },
                '& .MuiInputBase-input': {
                  fontSize: 14,
                  lineHeight: 1.35,
                  paddingTop: '0 !important',
                  paddingBottom: '0 !important',
                  paddingLeft: '6px !important',
                  paddingRight: '6px !important',
                },
                '& .MuiAutocomplete-popupIndicator': {
                  color: 'text.primary',
                  padding: 0.5,
                },
                '& .MuiAutocomplete-clearIndicator': {
                  color: 'text.primary',
                  padding: 1,
                },
                '& .MuiAutocomplete-endAdornment': {
                  right: 1,
                },
              }}
              clearOnBlur
              blurOnSelect
            />
          )}
          <FormControl
            size="small"
            sx={isMobile ? { minWidth: 88, flexShrink: 0 } : { minWidth: 140 }}
            disabled={trees.length === 0 || deletingTree || Boolean(deleteTreeTarget)}
          >
            <Select
              IconComponent={ExpandMoreIcon}
              value={trees.some(tree => tree.id === selectedTreeId) ? selectedTreeId : ''}
              onChange={e => setSelectedTreeId(e.target.value as string)}
              sx={{
                minHeight: 32,
                '& .MuiSelect-select': {
                  fontSize: 14,
                  lineHeight: 1.35,
                  py: 0.35,
                  pl: 0.75,
                  pr: 2.5,
                },
                '& .MuiSelect-icon': {
                  fontSize: '1.25rem',
                  color: 'text.primary',
                },
              }}
              MenuProps={{
                disableScrollLock: true,
                PaperProps: {
                  sx: {
                    backgroundColor: 'background.paper',
                    backgroundImage: 'none',
                    border: '1px solid',
                    borderColor: 'divider',
                    backdropFilter: 'none',
                    opacity: 1,
                  },
                },
              }}
            >
              {trees.map(t => (
                <MenuItem
                  key={t.id}
                  value={t.id}
                  sx={{
                    fontSize: 14,
                    lineHeight: 1.35,
                    minHeight: 36,
                  }}
                >
                  {t.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl
            size="small"
            sx={isMobile ? { minWidth: 72, flexShrink: 0 } : { minWidth: 72 }}
          >
            <Select
              IconComponent={ExpandMoreIcon}
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as ViewMode)}
              sx={{
                minHeight: 32,
                '& .MuiSelect-select': {
                  fontSize: 14,
                  lineHeight: 1.35,
                  py: 0.35,
                  pl: 0.75,
                  pr: 2.25,
                },
                '& .MuiSelect-icon': {
                  fontSize: '1.25rem',
                  color: 'text.primary',
                },
              }}
              MenuProps={{
                disableScrollLock: true,
                PaperProps: {
                  sx: {
                    backgroundColor: 'background.paper',
                    backgroundImage: 'none',
                    border: '1px solid',
                    borderColor: 'divider',
                    backdropFilter: 'none',
                    opacity: 1,
                  },
                },
              }}
            >
              <MenuItem value="tree" sx={{ fontSize: 14, lineHeight: 1.35, minHeight: 36 }}>{t('family.treeView')}</MenuItem>
              <MenuItem value="list" sx={{ fontSize: 14, lineHeight: 1.35, minHeight: 36 }}>{t('family.listView')}</MenuItem>
              <MenuItem value="generation" sx={{ fontSize: 14, lineHeight: 1.35, minHeight: 36 }}>{t('family.generation')}</MenuItem>
            </Select>
          </FormControl>

          {selectedTree && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5, whiteSpace: 'nowrap', flexShrink: 0, fontSize: 10 }}>
              {selectedTree.surname ? `${t('family.surnameLabel').replace('{surname}', selectedTree.surname)} · ` : ''}{t('family.summary').replace('{people}', String(persons.length)).replace('{generations}', String(generations.length))}
            </Typography>
          )}
        </BoxAny>
      </BoxAny>

      {contextMenu && !isMobile && (
        <FamilyNodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
          onView={() => selectPerson(contextMenu.node)}
          onHighlightAncestors={() => {
            selectPerson(contextMenu.node);
          }}
        />
      )}

      <Dialog
        open={createDialogOpen}
        onClose={handleCloseCreateDialog}
        maxWidth={false}
        sx={{
          '& .MuiDialog-container': {
            alignItems: 'flex-start',
          },
        }}
        PaperProps={{
          sx: {
            width: {
              xs: 'calc(100vw - 16px)',
              sm: 'min(720px, calc(100vw - 64px))',
            },
            maxWidth: {
              xs: 'calc(100vw - 16px)',
              sm: 'min(720px, calc(100vw - 64px))',
            },
            m: {
              xs: '8px',
              sm: '32px',
            },
            borderRadius: '8px',
            backgroundColor: 'background.paper',
            backgroundImage: 'none',
          },
        }}
      >
        <DialogContent sx={{ backgroundColor: 'background.paper', borderTop: 'none', borderBottom: 'none', px: 2.25, pt: 2, pb: 1 }}>
          <BoxAny sx={{ display: 'grid', gap: 0.9 }}>
            {createTreeError && <Alert severity="error">{createTreeError}</Alert>}
            <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: '4px', backgroundColor: 'action.hover', backgroundImage: 'none' }}>
              <Tabs
                value={createTreeMode}
                onChange={(_, value: CreateTreeMode) => handleSelectCreateMode(value)}
                variant="fullWidth"
                sx={{
                  minHeight: 42,
                  backgroundColor: 'action.hover',
                  '& .MuiTabs-indicator': {
                    height: 2.5,
                  },
                  '& .MuiTab-root': {
                    minHeight: 42,
                    fontSize: 13,
                    fontWeight: 600,
                    textTransform: 'none',
                  },
                }}
              >
                <Tab value="text" label={t('family.manualInput')} disabled={creatingTree} />
                <Tab value="archive" label={t('family.archiveImport')} disabled={creatingTree} />
              </Tabs>
            </Paper>

            <Paper variant="outlined" sx={{ p: 1, borderRadius: '4px', backgroundColor: 'action.hover', backgroundImage: 'none' }}>
              <BoxAny
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
                  gap: 1,
                }}
              >
                <TextField
                  label={t(isArchiveImportMode ? 'family.nameOverride' : 'family.treeName')}
                  value={createTreeName}
                  onChange={e => setCreateTreeName(e.target.value)}
                  size="small"
                  fullWidth
                  sx={createDialogTextFieldSx}
                />
                <TextField
                  label={t('family.surname')}
                  value={createTreeSurname}
                  onChange={e => setCreateTreeSurname(e.target.value)}
                  size="small"
                  fullWidth
                  disabled={isArchiveImportMode}
                  sx={createDialogTextFieldSx}
                />
                <TextField
                  label={t('family.targetDomain')}
                  select
                  value={createTreeDomain}
                  onChange={e => setCreateTreeDomain(e.target.value)}
                  size="small"
                  fullWidth
                  sx={createDialogSelectSx}
                  SelectProps={{
                    IconComponent: ExpandMoreIcon,
                    MenuProps: createDialogSelectMenuProps,
                  }}
                >
                  {editableFamilyDomains.map(domain => (
                    <MenuItem key={domain} value={domain} sx={{ fontSize: 14, lineHeight: 1.35, minHeight: 32, py: 0.5 }}>
                      {domain}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label={t('family.rootGeneration')}
                  value={createTreeRootGeneration}
                  onChange={e => setCreateTreeRootGeneration(e.target.value)}
                  size="small"
                  fullWidth
                  disabled={isArchiveImportMode}
                  sx={createDialogTextFieldSx}
                />
              </BoxAny>
            </Paper>

            {createTreeMode === 'text' ? (
              <Paper variant="outlined" sx={{ overflow: 'visible', borderRadius: '4px', backgroundColor: 'background.paper', backgroundImage: 'none' }}>
                <TextField
                  label={t('family.inputPeople')}
                  value={createTreeText}
                  onChange={e => handleCreateTreeTextChange(e.target.value, e.target.selectionStart, e.target.selectionEnd)}
                  multiline
                  minRows={7}
                  fullWidth
                  inputRef={createTreeTextInputRef}
                  sx={createDialogTextFieldSx}
                />
                <Paper variant="outlined" sx={{ mt: '-1px', p: 1, bgcolor: 'action.hover', backgroundImage: 'none', borderRadius: 0 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    {t('family.inputExample')}
                  </Typography>
                  <Typography component="pre" sx={{ m: 0, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                    {normalizeIndentedInputForDisplay(TEXT_IMPORT_EXAMPLE)}
                  </Typography>
                </Paper>
              </Paper>
            ) : (
              <Paper variant="outlined" sx={{ p: 1, borderRadius: '4px', backgroundColor: 'action.hover', backgroundImage: 'none' }}>
                <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Button size="small" variant="outlined" onClick={() => createArchiveInputRef.current?.click()}>
                    {t(createArchiveFile ? 'family.replaceArchive' : 'family.chooseArchive')}
                  </Button>
                  {createArchiveFile ? (
                    <Button size="small" onClick={handleClearCreateArchive}>
                      {t('family.clear')}
                    </Button>
                  ) : null}
                  <input
                    ref={createArchiveInputRef}
                    type="file"
                    accept=".zip,application/zip"
                    hidden
                    onChange={handleSelectCreateArchive}
                  />
                </BoxAny>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                  {createArchiveFile
                    ? t('family.archiveSelected').replace('{name}', createArchiveFile.name)
                    : t('family.archiveRequired')}
                </Typography>
              </Paper>
            )}
          </BoxAny>
        </DialogContent>
        <DialogActions sx={{ backgroundColor: 'background.paper' }}>
          <Button onClick={handleCloseCreateDialog} disabled={creatingTree}>{t('common.cancel')}</Button>
          <Button onClick={handleCreateTree} variant="contained" disabled={creatingTree}>
            {t(creatingTree ? (isArchiveImportMode ? 'ui.importing' : 'ui.creating') : (isArchiveImportMode ? 'family.archiveImport' : 'ui.create'))}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={visibilityDialogOpen}
        onClose={handleCloseVisibilityDialog}
        maxWidth={false}
        sx={{
          '& .MuiDialog-container': {
            alignItems: {
              xs: 'flex-end',
              sm: 'center',
            },
          },
        }}
        PaperProps={{
          sx: {
            width: {
              xs: '100%',
              sm: 'min(560px, calc(100vw - 64px))',
            },
            maxWidth: {
              xs: '100%',
              sm: 'min(560px, calc(100vw - 64px))',
            },
            m: {
              xs: 0,
              sm: '32px',
            },
            borderRadius: {
              xs: '8px 8px 0 0',
              sm: '8px',
            },
            backgroundColor: 'background.paper',
            backgroundImage: 'none',
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, backgroundColor: 'background.paper' }}>
          <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
            <BoxAny component="span" sx={{ flexShrink: 0 }}>{t('family.permissions')}</BoxAny>
            {selectedTree && (
              <BoxAny component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedTree.name}
              </BoxAny>
            )}
          </BoxAny>
          {!loadingVisibility ? (
            <Button
              size="small"
              variant="outlined"
              onClick={handleExportSelectedTreeArchive}
              disabled={exportingTreeArchive || deletingTree}
              sx={{
                minWidth: 0,
                flexShrink: 0,
              }}
            >
              {t(exportingTreeArchive ? 'ui.exporting' : 'ui.export')}
            </Button>
          ) : null}
          {canManageSelectedTreePermissions && !loadingVisibility ? (
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={() => {
                if (selectedTree && !deletingTreeRef.current) {
                  setDeleteTreeTarget({ id: selectedTree.id, name: selectedTree.name });
                }
              }}
              disabled={deletingTree || savingVisibility || exportingTreeArchive}
              sx={{
                minWidth: 0,
                flexShrink: 0,
              }}
            >
              {t(deletingTree ? 'ui.deleting' : 'ui.delete')}
            </Button>
          ) : null}
        </DialogTitle>
        <DialogContent sx={{ backgroundColor: 'background.paper', borderTop: 'none', borderBottom: 'none', px: 2.25, pt: 2, pb: 1 }}>
          <BoxAny sx={{ display: 'grid', gap: 1.25, pt: 0.5 }}>
            {visibilityError && <Alert severity="error">{visibilityError}</Alert>}
            {loadingVisibility ? (
              <BoxAny sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={28} />
              </BoxAny>
            ) : (
              <Paper variant="outlined" sx={visibilityTableSurfaceSx}>
                <BoxAny
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: canManageSelectedTreePermissions
                      ? 'minmax(0, 1fr) 64px 56px 28px'
                      : 'minmax(0, 1fr) 64px 56px',
                    columnGap: 1,
                    px: 1.25,
                    py: 0.75,
                    alignItems: 'center',
                    backgroundColor: 'action.hover',
                    borderBottom: visibilityRules.length > 0 ? '1px solid' : 'none',
                    borderColor: 'divider',
                  }}
                >
                  <BoxAny sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      {t('ui.subject')}
                    </Typography>
                    {canManageSelectedTreePermissions && (
                      <Button
                        size="small"
                        onClick={handleAddVisibilityRule}
                        sx={{ ml: 'auto', flexShrink: 0, minWidth: 32, height: 32, px: 0.5, fontSize: 18, lineHeight: 1, fontWeight: 500 }}
                      >
                        +
                      </Button>
                    )}
                  </BoxAny>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, textAlign: 'center' }}>
                    {t('ui.type')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, textAlign: 'center' }}>
                    {t('ui.permission')}
                  </Typography>
                  {canManageSelectedTreePermissions ? <BoxAny /> : null}
                </BoxAny>

                <BoxAny sx={{ px: 1.25, py: 0.35 }}>
                  {visibilityRules.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, fontStyle: 'italic', py: 0.75 }}>
                      {t('ui.noRecords')}
                    </Typography>
                  ) : visibilityRules.map((rule, index) => {
                    const subjectType = t(inferVisibilitySubjectType(rule.subject.trim()));
                    const showDelete = canManageSelectedTreePermissions && !rule.locked;

                    return (
                      <BoxAny
                        key={rule.key}
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: canManageSelectedTreePermissions
                            ? 'minmax(0, 1fr) 64px 56px 28px'
                            : 'minmax(0, 1fr) 64px 56px',
                          columnGap: 1,
                          py: 0.65,
                          alignItems: 'center',
                          borderBottom: index === visibilityRules.length - 1 ? 'none' : '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        <BoxAny sx={{ minWidth: 0 }}>
                          {rule.locked || !canManageSelectedTreePermissions ? (
                            <Typography sx={{ fontSize: 13, minWidth: 0, wordBreak: 'break-word', fontFamily: rule.subject.includes('@') ? 'monospace' : 'inherit' }}>
                              {rule.subject}
                            </Typography>
                          ) : (
                            <InputBase
                              value={rule.subject}
                              onChange={event => handleVisibilitySubjectChange(rule.key, event.target.value)}
                              fullWidth
                              sx={{
                                ...visibilityInlineInputSx,
                                fontFamily: rule.subject.includes('@') ? 'monospace' : 'inherit',
                              }}
                            />
                          )}
                        </BoxAny>

                        <Typography sx={{ fontSize: 12, textAlign: 'center', color: 'text.secondary' }}>
                          {subjectType}
                        </Typography>

                        <Button
                          size="small"
                          variant="text"
                          disabled={!canManageSelectedTreePermissions || Boolean(rule.locked)}
                          onClick={() => handleToggleVisibilityRulePermission(rule.key)}
                          sx={compactVisibilityToggleSx}
                        >
                          {t(formatVisibilityPermission(rule.permission))}
                        </Button>

                        {canManageSelectedTreePermissions ? (
                          showDelete ? (
                            <IconButton size="small" onClick={() => handleRemoveVisibilityRule(rule.key)} sx={{ width: 24, height: 24, justifySelf: 'end' }}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
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
        <DialogActions sx={{ backgroundColor: 'background.paper', borderTop: 'none', px: 3, pt: 0.25, pb: 2 }}>
          <Button onClick={handleCloseVisibilityDialog} disabled={savingVisibility || deletingTree} sx={{ borderRadius: '4px', '&:hover': { backgroundColor: 'action.hover' } }}>{t('common.cancel')}</Button>
          {canManageSelectedTreePermissions && (
            <Button onClick={handleSaveVisibility} variant="contained" disabled={loadingVisibility || savingVisibility || deletingTree} sx={{ borderRadius: '4px', boxShadow: 'none' }}>
              {t('common.save')}
            </Button>
          )}
        </DialogActions>
      </Dialog>
      <ConfirmDialog
        open={Boolean(deleteTreeTarget)}
        title={t('ui.delete')}
        description={t('family.deleteConfirm').replace('{name}', deleteTreeTarget?.name ?? '')}
        confirmLabel={t('ui.delete')}
        failureMessage={t('ui.deleteFailed')}
        onConfirm={handleDeleteSelectedTree}
        onClose={() => setDeleteTreeTarget(null)}
      />
    </BoxAny>
  );
};
