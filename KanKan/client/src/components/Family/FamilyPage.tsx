import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box, Typography, CircularProgress, Alert, Select, MenuItem,
  FormControl, InputLabel, Tabs, Tab, Divider,
  Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Chip, Autocomplete,
} from '@mui/material';
import {
  Search as SearchIcon,
} from '@mui/icons-material';
import { AppHeader } from '@/components/Shared/AppHeader';
import { FamilyHisto, type FamilyHistoHandle } from './FamilyHisto';
import { FamilyPersonPanel } from './FamilyPersonPanel';
import { FamilyNodeContextMenu } from './FamilyNodeContextMenu';
import {
  familyService, buildTree,
  type FamilyTreeDto, type FamilyPersonDto, type FamilyRelationshipDto, type FamilyNode,
} from '@/services/family.service';

const BoxAny = Box as any;

type ViewMode = 'tree' | 'list' | 'generation';

const MAX_VISIBLE_DEPTH = 4;

function flattenTree(node: FamilyNode, result: FamilyNode[] = []): FamilyNode[] {
  result.push(node);
  node.children.forEach(c => flattenTree(c, result));
  return result;
}

function getTreeDepth(node: FamilyNode): number {
  if (node.children.length === 0) return 0;
  return 1 + Math.max(...node.children.map(getTreeDepth));
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
  const [trees, setTrees] = useState<FamilyTreeDto[]>([]);
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
  const [persons, setPersons] = useState<FamilyPersonDto[]>([]);
  const [, setRels] = useState<FamilyRelationshipDto[]>([]);
  const [rootNode, setRootNode] = useState<FamilyNode | null>(null);
  const [allNodes, setAllNodes] = useState<FamilyNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  const [selectedPerson, setSelectedPerson] = useState<FamilyNode | null>(null);
  const [contextMenu, setContextMenu] = useState<{ node: FamilyNode; x: number; y: number } | null>(null);
  const [listSearch, setListSearch] = useState('');
  const [visibleStartDepth, setVisibleStartDepth] = useState(0);
  const [focusPersonId, setFocusPersonId] = useState<string | null>(null);
  const canvasRef = useRef<FamilyHistoHandle>(null);

  const selectedTree = trees.find(t => t.id === selectedTreeId) ?? null;
  const treeMaxDepth = useMemo(() => rootNode ? getTreeDepth(rootNode) : 0, [rootNode]);

  // Load tree list on mount
  useEffect(() => {
    familyService.listTrees()
      .then(list => {
        setTrees(list);
        if (list.length > 0) setSelectedTreeId(list[0].id);
      })
      .catch(() => setError('Failed to load trees'));
  }, []);

  // Load full tree when selection changes
  useEffect(() => {
    if (!selectedTreeId) return;
    setLoading(true);
    setError(null);
    setVisibleStartDepth(0);
    setFocusPersonId(null);
    familyService.getTree(selectedTreeId)
      .then(({ persons: p, relationships: r }) => {
        setPersons(p);
        setRels(r);
        const root = buildTree(p, r);
        setRootNode(root);
        setAllNodes(root ? flattenTree(root) : []);
      })
      .catch(() => setError('Failed to load tree data'))
      .finally(() => setLoading(false));
  }, [selectedTreeId]);

  const handleNodeClick = useCallback((node: FamilyNode) => {
    setSelectedPerson(node);
    setFocusPersonId(null);
  }, []);

  const handleNodeRightClick = useCallback((node: FamilyNode, x: number, y: number) => {
    setContextMenu({ node, x, y });
  }, []);

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
    setSelectedPerson(node);
    setViewMode('tree');

    // Auto-adjust depth window so the person is visible
    const personDepth = getPersonTreeDepth(personId, allNodes);
    if (personDepth < visibleStartDepth || personDepth >= visibleStartDepth + MAX_VISIBLE_DEPTH) {
      const newStart = Math.max(0, personDepth - Math.floor(MAX_VISIBLE_DEPTH / 2));
      setVisibleStartDepth(Math.min(newStart, Math.max(0, treeMaxDepth - MAX_VISIBLE_DEPTH + 1)));
    }

    setTimeout(() => {
      const activeRef = pickCanvasRef();
      activeRef.current?.centerOnPerson(personId);
    }, 80);
  }, [allNodes, visibleStartDepth, treeMaxDepth, viewMode, pickCanvasRef]);

  const handleSearchSelect = useCallback((_: any, value: FamilyNode | null) => {
    if (value) navigateToPerson(value.id);
  }, [navigateToPerson]);

  const filteredPersons = listSearch
    ? persons.filter(p => p.name.includes(listSearch) || (p.aliases ?? []).some(a => a.includes(listSearch)))
    : persons;

  const byGeneration: Record<number, FamilyNode[]> = {};
  allNodes.forEach(n => {
    if (!byGeneration[n.generation]) byGeneration[n.generation] = [];
    byGeneration[n.generation].push(n);
  });
  const generations = Object.keys(byGeneration).map(Number).sort((a, b) => a - b);

  const canGoUp = visibleStartDepth > 0;
  const canGoDown = visibleStartDepth + MAX_VISIBLE_DEPTH <= treeMaxDepth;

  return (
    <BoxAny sx={{ display: 'flex', flexDirection: 'column', height: '100vh', pt: '61px' }}>
      <AppHeader />

      {/* Toolbar */}
      <BoxAny sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1,
        borderBottom: '1px solid rgba(15,23,42,0.08)', flexWrap: 'wrap',
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)',
      }}>
        <FormControl size="small" sx={{ minWidth: 160 }} disabled={trees.length === 0}>
          <InputLabel>家谱</InputLabel>
          <Select
            label="家谱"
            value={selectedTreeId ?? ''}
            onChange={e => setSelectedTreeId(e.target.value as string)}
          >
            {trees.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
          </Select>
        </FormControl>

        <Tabs
          value={viewMode}
          onChange={(_, v) => setViewMode(v as ViewMode)}
          textColor="primary"
          indicatorColor="primary"
          sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0, fontSize: 13 } }}
        >
          <Tab label="树形" value="tree" />
          <Tab label="列表" value="list" />
          <Tab label="世代" value="generation" />
        </Tabs>

        {/* Search */}
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
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="搜索人名…"
                InputProps={{
                  ...params.InputProps,
                  startAdornment: <SearchIcon sx={{ fontSize: 16, color: 'text.secondary', mr: 0.5 }} />,
                }}
              />
            )}
            sx={{ width: 200 }}
            clearOnBlur
            blurOnSelect
          />
        )}

        {selectedTree && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            {selectedTree.surname ? `${selectedTree.surname}氏` : ''} · 共{persons.length}人 · {generations.length}代
          </Typography>
        )}
      </BoxAny>

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
            {selectedPerson && (
              <BoxAny sx={{
                width: 300, flexShrink: 0, overflow: 'hidden',
                borderRight: '1px solid rgba(15,23,42,0.08)',
                ...(viewMode === 'tree' ? {
                  position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 10,
                  background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(8px)',
                  boxShadow: '2px 0 12px rgba(0,0,0,0.08)',
                } : {}),
              }}>
                <FamilyPersonPanel
                  person={selectedPerson}
                  tree={selectedTree}
                  allPersons={allNodes}
                  onClose={() => setSelectedPerson(null)}
                  onNavigate={navigateToPerson}
                />
              </BoxAny>
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
                    onClearSelection={() => { setSelectedPerson(null); setFocusPersonId(null); }}
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
              <BoxAny sx={{ flex: 1, overflow: 'auto', p: 2 }}>
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
                              sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'rgba(42,175,71,0.04)' } }}
                              onClick={() => navigateToPerson(p.id)}
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
              <BoxAny sx={{ flex: 1, overflow: 'auto', p: 2 }}>
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
                          onClick={() => navigateToPerson(node.id)}
                          sx={{
                            cursor: 'pointer',
                            background: 'rgba(255,255,255,0.8)',
                            '&:hover': { borderColor: 'rgb(42,175,71)', bgcolor: 'rgba(42,175,71,0.04)' },
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

      {contextMenu && (
        <FamilyNodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
          onView={() => setSelectedPerson(contextMenu.node)}
          onHighlightAncestors={() => {
            setSelectedPerson(contextMenu.node);
          }}
        />
      )}
    </BoxAny>
  );
};
