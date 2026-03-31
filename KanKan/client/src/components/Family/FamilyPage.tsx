import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box, Typography, CircularProgress, Alert, Select, MenuItem,
  FormControl, Divider, Drawer, Button, Dialog,
  DialogTitle, DialogContent, DialogActions,
  Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Chip, Autocomplete, useMediaQuery, useTheme,
} from '@mui/material';
import {
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { AppHeader } from '@/components/Shared/AppHeader';
import { FamilyHisto, type FamilyHistoHandle } from './FamilyHisto';
import { FamilyPersonPanel } from './FamilyPersonPanel';
import { FamilyNodeContextMenu } from './FamilyNodeContextMenu';
import {
  familyService, buildFamilyNodes, buildTree,
  type FamilyTreeDto, type FamilyPersonDto, type FamilyRelationshipDto, type FamilyNode,
  type NestedFamilyPersonImport,
} from '@/services/family.service';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';

const BoxAny = Box as any;

type ViewMode = 'tree' | 'list' | 'generation';

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

function normalizeImportGender(value?: string): 'male' | 'female' | 'unknown' | undefined {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === '男' || normalized === 'male' || normalized === 'm') return 'male';
  if (normalized === '女' || normalized === 'female' || normalized === 'f') return 'female';
  if (normalized === '未知' || normalized === 'unknown') return 'unknown';
  throw new Error(`无法识别性别：${value}`);
}

function parseOptionalYear(value: string | undefined, lineNumber: number, label: string): number | undefined {
  const normalized = (value ?? '').trim();
  if (!normalized) return undefined;
  const year = Number.parseInt(normalized, 10);
  if (Number.isNaN(year)) {
    throw new Error(`第${lineNumber}行的${label}不是有效年份：${normalized}`);
  }
  return year;
}

function parseIndentedFamilyText(input: string): NestedFamilyPersonImport {
  const lines = input
    .split(/\r?\n/)
    .map((raw, index) => ({ raw: raw.replace(/\t/g, '  '), lineNumber: index + 1 }))
    .filter(line => line.raw.trim().length > 0);

  if (lines.length === 0) {
    throw new Error('请输入家谱文本。');
  }

  const roots: NestedFamilyPersonImport[] = [];
  const stack: NestedFamilyPersonImport[] = [];

  for (const line of lines) {
    const indent = line.raw.match(/^ */)?.[0].length ?? 0;
    if (indent % 2 !== 0) {
      throw new Error(`第${line.lineNumber}行缩进不是两个空格的倍数。`);
    }

    const level = indent / 2;
    const fields = line.raw.trim().split(/[，,]/).map(part => part.trim());
    const [name, genderText, spouse, spouseGenderText, birthYearText, deathYearText] = fields;

    if (!name) {
      throw new Error(`第${line.lineNumber}行缺少姓名。`);
    }

    const person: NestedFamilyPersonImport = {
      name,
      gender: normalizeImportGender(genderText),
      spouse: spouse || undefined,
      spouseGender: spouse ? normalizeImportGender(spouseGenderText) : undefined,
      birthYear: parseOptionalYear(birthYearText, line.lineNumber, '出生年'),
      deathYear: parseOptionalYear(deathYearText, line.lineNumber, '去世年'),
      children: [],
    };

    while (stack.length > level) {
      stack.pop();
    }

    if (level > stack.length) {
      throw new Error(`第${line.lineNumber}行缩进层级跳得太深。`);
    }

    if (level === 0) {
      roots.push(person);
    } else {
      const parent = stack[level - 1];
      if (!parent) {
        throw new Error(`第${line.lineNumber}行找不到父节点。`);
      }
      parent.children = parent.children ?? [];
      parent.children.push(person);
    }

    stack[level] = person;
  }

  if (roots.length !== 1) {
    throw new Error('当前导入只支持一个根人物，请只保留一棵树的顶层人物。');
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
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const persistedStateRef = useRef<FamilyPagePersistedState | null>(readFamilyPageState());
  const [trees, setTrees] = useState<FamilyTreeDto[]>([]);
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(persistedStateRef.current?.selectedTreeId ?? null);
  const [persons, setPersons] = useState<FamilyPersonDto[]>([]);
  const [, setRels] = useState<FamilyRelationshipDto[]>([]);
  const [rootNode, setRootNode] = useState<FamilyNode | null>(null);
  const [allNodes, setAllNodes] = useState<FamilyNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(persistedStateRef.current?.viewMode ?? 'tree');
  const [selectedPerson, setSelectedPerson] = useState<FamilyNode | null>(null);
  const [contextMenu, setContextMenu] = useState<{ node: FamilyNode; x: number; y: number } | null>(null);
  const [listSearch, setListSearch] = useState('');
  const [visibleStartDepth, setVisibleStartDepth] = useState(persistedStateRef.current?.visibleStartDepth ?? 0);
  const [focusPersonId, setFocusPersonId] = useState<string | null>(persistedStateRef.current?.focusPersonId ?? null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createTreeName, setCreateTreeName] = useState('');
  const [createTreeSurname, setCreateTreeSurname] = useState('');
  const [createTreeDomain, setCreateTreeDomain] = useState(currentUser?.domain ?? '');
  const [createTreeRootGeneration, setCreateTreeRootGeneration] = useState('1');
  const [createTreePoem, setCreateTreePoem] = useState('');
  const [createTreeText, setCreateTreeText] = useState(TEXT_IMPORT_EXAMPLE);
  const [createTreeError, setCreateTreeError] = useState<string | null>(null);
  const [creatingTree, setCreatingTree] = useState(false);
  const [panelEditing, setPanelEditing] = useState(false);
  const canvasRef = useRef<FamilyHistoHandle>(null);
  const selectedPersonIdRef = useRef<string | null>(persistedStateRef.current?.selectedPersonId ?? null);
  const listViewRef = useRef<HTMLDivElement | null>(null);
  const generationViewRef = useRef<HTMLDivElement | null>(null);
  const didHydrateTreeStateRef = useRef(false);
  const initialRestorePendingRef = useRef(Boolean(persistedStateRef.current?.selectedTreeId));
  const restoreTreeSelectionRef = useRef(false);
  const pendingTreeNavigationPersonIdRef = useRef<string | null | undefined>(undefined);

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
    writeFamilyPageState({
      selectedTreeId,
      viewMode,
      selectedPersonId: selectedPersonIdRef.current,
      focusPersonId,
      visibleStartDepth,
    });
  }, [selectedTreeId, viewMode, focusPersonId, visibleStartDepth, selectedPerson?.id]);

  const selectedTree = trees.find(t => t.id === selectedTreeId) ?? null;
  const treeMaxDepth = useMemo(() => rootNode ? getTreeDepth(rootNode) : 0, [rootNode]);

  const loadTrees = useCallback(async (preferredTreeId?: string) => {
    const list = await familyService.listTrees();
    setTrees(list);
    if (list.length === 0) {
      setSelectedTreeId(null);
      return;
    }

    if (preferredTreeId && list.some(tree => tree.id === preferredTreeId)) {
      setSelectedTreeId(preferredTreeId);
      return;
    }

    setSelectedTreeId(current => {
      if (current && list.some(tree => tree.id === current)) {
        return current;
      }
      return list[0].id;
    });
  }, []);

  // Load tree list on mount
  useEffect(() => {
    familyService.listTrees()
      .then(list => {
        setTrees(list);
        if (list.length > 0) {
          setSelectedTreeId(current => {
            if (current && list.some(tree => tree.id === current)) {
              return current;
            }
            return list[0].id;
          });
        }
      })
      .catch(() => setError('Failed to load trees'));
  }, []);

  useEffect(() => {
    if (currentUser?.domain && !createDialogOpen) {
      setCreateTreeDomain(currentUser.domain);
    }
  }, [currentUser?.domain, createDialogOpen]);

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
    } catch {
      setError('Failed to load tree data');
    } finally {
      setLoading(false);
    }
  }, [applyTreeData, selectedTreeId]);

  // Load full tree when selection changes
  useEffect(() => {
    if (!selectedTreeId) return;

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
  }, [refreshCurrentTree, selectedTreeId]);

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

  const handleOpenCreateDialog = useCallback(() => {
    setCreateTreeError(null);
    setCreateDialogOpen(true);
  }, []);

  const handleCloseCreateDialog = useCallback(() => {
    if (creatingTree) return;
    setCreateDialogOpen(false);
    setCreateTreeError(null);
  }, [creatingTree]);

  const handleCreateTree = useCallback(async () => {
    const treeName = createTreeName.trim();
    if (!treeName) {
      setCreateTreeError('请输入家谱名称。');
      return;
    }

    const rootGeneration = Number.parseInt(createTreeRootGeneration, 10);
    if (Number.isNaN(rootGeneration)) {
      setCreateTreeError('始祖世代必须是数字。');
      return;
    }

    let parsedRoot: NestedFamilyPersonImport | null = null;
    if (createTreeText.trim()) {
      try {
        parsedRoot = parseIndentedFamilyText(createTreeText);
      } catch (parseError) {
        setCreateTreeError(parseError instanceof Error ? parseError.message : '家谱文本格式不正确。');
        return;
      }
    }

    setCreatingTree(true);
    setCreateTreeError(null);

    try {
      const tree = await familyService.createTree({
        name: treeName,
        surname: createTreeSurname.trim() || undefined,
        domain: createTreeDomain.trim() || undefined,
        rootGeneration,
        zibeiPoem: parseZibeiPoem(createTreePoem),
      });

      if (parsedRoot) {
        await familyService.importTree(tree.id, parsedRoot);
      }

      await loadTrees(tree.id);
      setCreateDialogOpen(false);
      setCreateTreeName('');
      setCreateTreeSurname('');
      setCreateTreePoem('');
      setCreateTreeRootGeneration('1');
      setCreateTreeText(TEXT_IMPORT_EXAMPLE);
      setCreateTreeError(null);
    } catch (createError: any) {
      setCreateTreeError(createError?.message || '创建家谱失败。');
    } finally {
      setCreatingTree(false);
    }
  }, [createTreeDomain, createTreeName, createTreePoem, createTreeRootGeneration, createTreeSurname, createTreeText, loadTrees]);

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

  if (!currentUser?.canViewFamilyTree) {
    return (
      <BoxAny sx={{ display: 'flex', flexDirection: 'column', height: '100vh', pt: '61px' }}>
        <AppHeader />
        <BoxAny sx={{ flex: 1, p: 3 }}>
          <Alert severity="warning">当前账号未开通家谱访问权限。</Alert>
        </BoxAny>
      </BoxAny>
    );
  }

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
        {!loading && !error && trees.length === 0 && (
          <BoxAny sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography color="text.secondary">暂无家谱数据。请先在后台添加或导入家谱。</Typography>
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
                  background: '#fff',
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
                    background: '#fff',
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
                    <Typography color="text.secondary">该家谱暂无人员数据</Typography>
                  </BoxAny>
                )}
              </BoxAny>
            )}

            {viewMode === 'list' && (
              <BoxAny ref={listViewRef} sx={{ flex: 1, overflow: 'auto', p: 2, pb: isMobile ? 10 : 2 }}>
                <TextField
                  size="small"
                  placeholder="搜索姓名或别名…"
                  value={listSearch}
                  onChange={e => setListSearch(e.target.value)}
                  sx={{ mb: 1.5, width: 260 }}
                />
                <TableContainer component={Paper} elevation={1}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 'bold' }}>世代</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>姓名</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>性别</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>出生年</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>配偶</TableCell>
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
                              <TableCell>第{p.generation}世</TableCell>
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
                              <TableCell>{p.gender === 'female' ? '女' : '男'}</TableCell>
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
                        第{gen}世
                      </Typography>
                      <Chip label={`${byGeneration[gen].length}人`} size="small" sx={{ height: 18, fontSize: 10, bgcolor: 'rgba(42,175,71,0.1)' }} />
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
              variant="outlined"
              onClick={handleOpenCreateDialog}
              sx={{
                minHeight: 36,
                borderColor: 'rgba(15, 23, 42, 0.23)',
                color: 'text.primary',
                ...(isMobile ? { flexShrink: 0 } : {}),
                px: 1.5,
                fontSize: 14,
                lineHeight: 1.35,
                textTransform: 'none',
                '&:hover': {
                  borderColor: 'rgba(15, 23, 42, 0.35)',
                  backgroundColor: 'rgba(15, 23, 42, 0.03)',
                },
              }}
            >
              新建家谱
            </Button>
          )}
          {allNodes.length > 0 && (
            <Autocomplete
              size="small"
              options={allNodes}
              getOptionLabel={(n: FamilyNode) => `${n.name}（第${n.generation}世）`}
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
              disableClearable={isMobile}
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
                    backgroundColor: '#f5f7fb',
                    backgroundImage: 'none',
                    border: '1px solid rgba(15, 23, 42, 0.08)',
                    boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
                    backdropFilter: 'none',
                    opacity: 1,
                    mt: 0.5,
                    overflow: 'hidden',
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
                  {`${option.name}（第${option.generation}世）`}
                </BoxAny>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="搜索人名…"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: isMobile ? null : params.InputProps.endAdornment,
                    startAdornment: <SearchIcon sx={{ fontSize: 16, color: 'text.secondary', mr: 0.5 }} />,
                  }}
                />
              )}
              sx={{
                ...(isMobile ? { width: 120, flexShrink: 0 } : { width: 200 }),
                '& .MuiOutlinedInput-root': {
                  minHeight: 36,
                  backgroundColor: '#fff',
                  backgroundImage: 'none',
                  borderRadius: 1,
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
                '& .MuiInputBase-input': {
                  fontSize: 14,
                  lineHeight: 1.35,
                  py: 0.75,
                },
                '& .MuiAutocomplete-popupIndicator, & .MuiAutocomplete-clearIndicator': {
                  color: 'text.primary',
                },
              }}
              clearOnBlur
              blurOnSelect
            />
          )}
          <FormControl
            size="small"
            sx={isMobile ? { minWidth: 88, flexShrink: 0 } : { minWidth: 140 }}
            disabled={trees.length === 0}
          >
            <Select
              IconComponent={ExpandMoreIcon}
              value={selectedTreeId ?? ''}
              onChange={e => setSelectedTreeId(e.target.value as string)}
              sx={{
                '& .MuiSelect-select': {
                  fontSize: 14,
                  lineHeight: 1.35,
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
                    backgroundColor: '#f5f7fb',
                    backgroundImage: 'none',
                    border: '1px solid rgba(15, 23, 42, 0.08)',
                    boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
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
            sx={isMobile ? { minWidth: 88, flexShrink: 0 } : { minWidth: 104 }}
          >
            <Select
              IconComponent={ExpandMoreIcon}
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as ViewMode)}
              sx={{
                '& .MuiSelect-select': {
                  fontSize: 14,
                  lineHeight: 1.35,
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
                    backgroundColor: '#f5f7fb',
                    backgroundImage: 'none',
                    border: '1px solid rgba(15, 23, 42, 0.08)',
                    boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
                    backdropFilter: 'none',
                    opacity: 1,
                  },
                },
              }}
            >
              <MenuItem value="tree" sx={{ fontSize: 14, lineHeight: 1.35, minHeight: 36 }}>树形</MenuItem>
              <MenuItem value="list" sx={{ fontSize: 14, lineHeight: 1.35, minHeight: 36 }}>列表</MenuItem>
              <MenuItem value="generation" sx={{ fontSize: 14, lineHeight: 1.35, minHeight: 36 }}>世代</MenuItem>
            </Select>
          </FormControl>

          {selectedTree && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5, whiteSpace: 'nowrap', flexShrink: 0, fontSize: 10 }}>
              {selectedTree.surname ? `${selectedTree.surname}氏` : ''} · 共{persons.length}人 · {generations.length}代
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

      <Dialog open={createDialogOpen} onClose={handleCloseCreateDialog} fullWidth maxWidth="md">
        <DialogTitle>新建家谱</DialogTitle>
        <DialogContent dividers>
          <BoxAny sx={{ display: 'grid', gap: 1.25, pt: 0.5 }}>
            {createTreeError && <Alert severity="error">{createTreeError}</Alert>}
            <TextField
              label="家谱名称"
              value={createTreeName}
              onChange={e => setCreateTreeName(e.target.value)}
              size="small"
              fullWidth
            />
            <TextField
              label="姓氏"
              value={createTreeSurname}
              onChange={e => setCreateTreeSurname(e.target.value)}
              size="small"
              fullWidth
            />
            <TextField
              label="目标域名"
              value={createTreeDomain}
              onChange={e => setCreateTreeDomain(e.target.value)}
              size="small"
              fullWidth
              helperText="例如 four.com 或 five.com。服务器会校验你是否有权管理这个域。"
            />
            <TextField
              label="始祖世代"
              value={createTreeRootGeneration}
              onChange={e => setCreateTreeRootGeneration(e.target.value)}
              size="small"
              fullWidth
            />
            <TextField
              label="字辈"
              value={createTreePoem}
              onChange={e => setCreateTreePoem(e.target.value)}
              size="small"
              fullWidth
              helperText="可留空。可输入连续汉字，或用空格/逗号分隔。"
            />
            <TextField
              label="家谱文本"
              value={createTreeText}
              onChange={e => setCreateTreeText(e.target.value)}
              multiline
              minRows={12}
              fullWidth
              helperText="每行格式：姓名，性别，配偶姓名，配偶性别，出生年，去世年。可使用中文逗号。"
            />
            <Paper variant="outlined" sx={{ p: 1.25, bgcolor: 'rgba(15,23,42,0.02)' }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                示例
              </Typography>
              <Typography component="pre" sx={{ m: 0, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                {TEXT_IMPORT_EXAMPLE}
              </Typography>
            </Paper>
          </BoxAny>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCreateDialog} disabled={creatingTree}>取消</Button>
          <Button onClick={handleCreateTree} variant="contained" disabled={creatingTree}>
            {creatingTree ? '创建中…' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>
    </BoxAny>
  );
};
