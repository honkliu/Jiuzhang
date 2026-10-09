import React from 'react';
import {
  Alert,
  Box,
  ButtonBase,
  Chip,
  Container,
  FormControl,
  GlobalStyles,
  IconButton,
  InputAdornment,
  InputLabel,
  LinearProgress,
  MenuItem,
  Pagination,
  Paper,
  Select,
  Slider,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha, type Theme } from '@mui/material/styles';
import {
  Album as AlbumIcon,
  Clear as ClearIcon,
  UnfoldLess as UnfoldLessIcon,
  UnfoldMore as UnfoldMoreIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  FolderOutlined as FolderOutlinedIcon,
  Pause as PauseIcon,
  PlayArrow as PlayArrowIcon,
  Search as SearchIcon,
  SkipNext as SkipNextIcon,
  SkipPrevious as SkipPreviousIcon,
  VolumeUp as VolumeUpIcon,
} from '@mui/icons-material';
import { AppHeader } from '@/components/Shared/AppHeader';
import { useLanguage } from '@/i18n/LanguageContext';
import {
  musicService,
  type MusicCatalog,
  type MusicCatalogField,
  type MusicCatalogRecord,
} from '@/services/music.service';
import {
  appPageContentSx,
  appPageShellSx,
  appSurfaceSx,
} from '@/styles/appLayout';
import {
  fieldValues,
  filterMusicRecords,
  groupMusicRecords,
  MUSIC_PAGE_SIZE,
  paginateMusicGroups,
  scalarText,
  trackFields,
  type MusicAlbumGroup,
} from './musicCatalog';

const BoxAny = Box as any;
const MUSIC_ROW_HEIGHT = 40;

function selectionRowSx(theme: Theme) {
  return {
    '&.Mui-selected, &.Mui-selected:hover': {
      bgcolor: alpha(theme.palette.primary.main, 0.16),
    },
    '&.Mui-selected > :first-child': {
      boxShadow: `inset 3px 0 0 ${theme.palette.primary.main}`,
    },
    '&:focus-visible': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: -2,
    },
  };
}

function fieldLabel(field: MusicCatalogField, language: string): string {
  return field.labels?.[language]
    || field.labels?.en
    || field.label
    || field.key;
}

function fieldByRole(fields: MusicCatalogField[], role: string): MusicCatalogField | undefined {
  return fields.find((field) => field.role === role);
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export const MusicPage: React.FC = () => {
  const { t, language } = useLanguage();
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const advancingRef = React.useRef(false);
  const selectedFilteredGroupRef = React.useRef<string | null>(null);
  const pendingDirectoryScrollRef = React.useRef<string | null>(null);
  const directoryHeadingRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const [catalog, setCatalog] = React.useState<MusicCatalog | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [filters, setFilters] = React.useState<Record<string, string>>({});
  const [page, setPage] = React.useState(1);
  const [browseExpandedGroups, setBrowseExpandedGroups] = React.useState<Set<string>>(() => new Set());
  const [filteredExpandedGroups, setFilteredExpandedGroups] = React.useState<Set<string> | null>(null);
  const [selection, setSelection] = React.useState<{
    groupId: string; recordId: string | null;
  } | null>(null);
  const [current, setCurrent] = React.useState<MusicCatalogRecord | null>(null);
  const [queue, setQueue] = React.useState<MusicCatalogRecord[]>([]);
  const [queueIndex, setQueueIndex] = React.useState(-1);
  const [playbackUrl, setPlaybackUrl] = React.useState('');
  const [playbackVersion, setPlaybackVersion] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [position, setPosition] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [volume, setVolume] = React.useState(0.8);

  React.useEffect(() => {
    let active = true;
    musicService.getCatalog()
      .then((result) => {
        if (active) setCatalog(result);
      })
      .catch(() => {
        if (active) setError(t('music.loadFailed'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  const fields = React.useMemo(
    () => catalog?.schema.fields ?? [],
    [catalog],
  );
  const visibleFields = React.useMemo(
    () => trackFields(fields),
    [fields],
  );
  const searchableFields = React.useMemo(() => {
    const configured = fields.filter((field) => field.searchable);
    return configured.length > 0 ? configured : visibleFields;
  }, [fields, visibleFields]);
  const filterableFields = React.useMemo(
    () => fields.filter((field) => field.filterable
      && (field.type === 'tags' || field.key === 'tags')).slice(0, 1),
    [fields],
  );
  const primaryField = React.useMemo(
    () => fields.find((field) => field.primary) || fieldByRole(fields, 'title') || visibleFields[0],
    [fields, visibleFields],
  );
  const secondaryField = React.useMemo(
    () => fields.find((field) => field.role === 'directory' || field.key === 'directory')
      || visibleFields.find((field) => field !== primaryField),
    [fields, primaryField, visibleFields],
  );
  const albumGroups = React.useMemo(
    () => groupMusicRecords(catalog?.records ?? [], fields),
    [catalog, fields],
  );
  const hasActiveFilters = Boolean(search.trim())
    || filterableFields.some((field) => Boolean(filters[field.key]));
  const expandedGroups = React.useMemo(
    () => hasActiveFilters
      ? filteredExpandedGroups ?? new Set(albumGroups.map((group) => group.id))
      : browseExpandedGroups,
    [albumGroups, browseExpandedGroups, hasActiveFilters, filteredExpandedGroups],
  );
  const selectItem = (groupId: string, recordId: string | null = null) => {
    setSelection({ groupId, recordId });
    if (hasActiveFilters) selectedFilteredGroupRef.current = groupId;
  };
  const isSelected = (groupId: string, recordId: string | null = null) =>
    selection?.groupId === groupId && selection.recordId === recordId;
  const updateFilterPosition = (
    nextSearch: string,
    nextFilters: Record<string, string>,
    removingFilter: boolean,
  ) => {
    const nextHasFilters = Boolean(nextSearch.trim())
      || filterableFields.some((field) => Boolean(nextFilters[field.key]));
    const selectedGroup = selectedFilteredGroupRef.current;
    if (removingFilter && selectedGroup !== null) {
      const nextExpanded = nextHasFilters
        ? new Set(albumGroups.map((group) => group.id))
        : new Set(browseExpandedGroups).add(selectedGroup);
      const nextRecords = filterMusicRecords(
        catalog?.records ?? [], searchableFields, filterableFields, nextSearch, nextFilters,
      );
      const nextPagination = paginateMusicGroups(albumGroups, nextRecords, 1, nextExpanded);
      const targetPage = nextPagination.groupPages.get(selectedGroup);
      if (targetPage !== undefined) {
        if (!nextHasFilters) setBrowseExpandedGroups(nextExpanded);
        setPage(targetPage);
        pendingDirectoryScrollRef.current = selectedGroup;
      } else {
        setPage(1);
      }
    } else {
      setPage(1);
    }
    if (!nextHasFilters || !hasActiveFilters) selectedFilteredGroupRef.current = null;
  };
  const updateSearch = (value: string) => {
    updateFilterPosition(value, filters, Boolean(search.trim()) && !value.trim());
    setSearch(value);
    setFilteredExpandedGroups(null);
  };
  const updateFilter = (key: string, value: string) => {
    const nextFilters = { ...filters, [key]: value };
    updateFilterPosition(search, nextFilters, Boolean(filters[key]) && !value);
    setFilters(nextFilters);
    setFilteredExpandedGroups(null);
  };
  const updateExpandedGroups = (next: Set<string>) => {
    if (hasActiveFilters) setFilteredExpandedGroups(next);
    else setBrowseExpandedGroups(next);
  };
  const rowSlots = Math.min(MUSIC_PAGE_SIZE, albumGroups.reduce(
    (count, group) => count + 1 + (expandedGroups.has(group.id) ? group.records.length : 0), 0,
  ));
  const tableHeight = (rowSlots + 1) * MUSIC_ROW_HEIGHT;

  const filterOptions = React.useMemo(() => {
    const options: Record<string, string[]> = {};
    for (const field of filterableFields) {
      const values = new Set<string>();
      for (const record of catalog?.records ?? []) {
        for (const text of fieldValues(record, field)) {
          values.add(text);
        }
      }
      options[field.key] = [...values].sort((a, b) => a.localeCompare(b, language));
    }
    return options;
  }, [catalog, filterableFields, language]);

  const filteredRecords = React.useMemo(
    () => filterMusicRecords(
      catalog?.records ?? [], searchableFields, filterableFields, search, filters),
    [catalog, filterableFields, filters, search, searchableFields],
  );
  const { rows, totalRows, pageCount, currentPage, firstRow, lastRow } = React.useMemo(
    () => paginateMusicGroups(albumGroups, filteredRecords, page, expandedGroups),
    [albumGroups, filteredRecords, page, expandedGroups],
  );
  React.useEffect(() => setPage(currentPage), [currentPage]);
  const allCollapsed = albumGroups.length > 0
    && albumGroups.every((group) => !expandedGroups.has(group.id));
  const toggleGroup = (groupId: string) => {
    selectItem(groupId);
    const next = new Set(expandedGroups);
    const expanding = !next.has(groupId);
    if (expanding) {
      next.add(groupId);
    } else {
      next.delete(groupId);
      if (selectedFilteredGroupRef.current === groupId) selectedFilteredGroupRef.current = null;
    }
    updateExpandedGroups(next);
    if (expanding) {
      const pagination = paginateMusicGroups(albumGroups, filteredRecords, page, next);
      const targetPage = pagination.groupPages.get(groupId);
      if (targetPage !== undefined) setPage(targetPage);
    }
  };
  React.useEffect(() => {
    const groupId = pendingDirectoryScrollRef.current;
    if (groupId === null) return;
    const heading = directoryHeadingRefs.current.get(groupId);
    if (heading) {
      heading.scrollIntoView({ block: 'center', inline: 'nearest' });
      pendingDirectoryScrollRef.current = null;
    }
  }, [rows]);

  const recordTitle = React.useCallback(
    (record: MusicCatalogRecord | null) =>
      record && primaryField ? scalarText(record.data[primaryField.key]) : '',
    [primaryField],
  );
  const recordSubtitle = React.useCallback(
    (record: MusicCatalogRecord | null) =>
      record && secondaryField ? scalarText(record.data[secondaryField.key]) : '',
    [secondaryField],
  );

  const startPlayback = React.useCallback(async (
    record: MusicCatalogRecord,
    nextQueue: MusicCatalogRecord[],
  ) => {
    try {
      setError('');
      const playback = await musicService.createPlaybackUrl(record.id);
      setCurrent(record);
      setQueue(nextQueue);
      setQueueIndex(nextQueue.findIndex((item) => item.id === record.id));
      setPlaybackUrl(playback.url);
      setPlaybackVersion((version) => version + 1);
      setPosition(0);
      advancingRef.current = false;
    } catch {
      setError(t('music.playFailed'));
    }
  }, [t]);

  const playAlbum = React.useCallback((group: MusicAlbumGroup) => {
    void startPlayback(group.records[0], group.records);
  }, [startPlayback]);

  const playAdjacent = React.useCallback((offset: number) => {
    const nextIndex = queueIndex + offset;
    if (nextIndex < 0 || nextIndex >= queue.length) {
      audioRef.current?.pause();
      setIsPlaying(false);
      return;
    }
    advancingRef.current = true;
    void startPlayback(queue[nextIndex], queue);
  }, [queue, queueIndex, startPlayback]);

  const handleLoadedMetadata = React.useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    const start = current.playback.startSeconds ?? 0;
    const end = current.playback.endSeconds;
    audio.currentTime = start;
    audio.volume = volume;
    setDuration(end != null ? Math.max(0, end - start) : Math.max(0, audio.duration - start));
    audio.play()
      .then(() => setIsPlaying(true))
      .catch(() => setError(t('music.playFailed')));
  }, [current, t, volume]);

  const handleTimeUpdate = React.useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    const start = current.playback.startSeconds ?? 0;
    const end = current.playback.endSeconds;
    setPosition(Math.max(0, audio.currentTime - start));
    if (end != null && audio.currentTime >= end - 0.1 && !advancingRef.current) {
      audio.pause();
      advancingRef.current = true;
      playAdjacent(1);
    }
  }, [current, playAdjacent]);

  const togglePlayback = React.useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      const start = current?.playback.startSeconds ?? 0;
      const end = current?.playback.endSeconds ?? audio.duration;
      if (audio.ended || audio.currentTime >= end - 0.1) {
        audio.currentTime = start;
        setPosition(0);
        advancingRef.current = false;
      }
      audio.play()
        .then(() => setIsPlaying(true))
        .catch(() => setError(t('music.playFailed')));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [current, t]);

  const renderValue = (record: MusicCatalogRecord, field: MusicCatalogField) => {
    const value = record.data[field.key];
    if (Array.isArray(value) || field.type === 'tags') {
      return (
        <Stack direction="row" spacing={0.5} sx={{ overflow: 'hidden', maxHeight: 28 }}>
          {fieldValues(record, field).map((text) => {
            const label = text || t('music.uncategorized');
            return (
              <Chip
                key={text}
                label={label}
                title={label}
                size="small"
                variant="outlined"
                sx={{
                  maxWidth: '100%',
                  flexShrink: 0,
                  height: 20,
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  '& .MuiChip-label': { px: 0.75 },
                }}
                clickable={field.filterable}
                onClick={field.filterable
                  ? (event) => {
                    event.stopPropagation();
                    updateFilter(field.key, JSON.stringify(text));
                  }
                  : undefined}
              />
            );
          })}
        </Stack>
      );
    }
    return scalarText(value) || '—';
  };

  return (
    <>
      <GlobalStyles styles={{ body: { scrollbarGutter: 'stable' } }} />
      <AppHeader />
      <Snackbar open={Boolean(error)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity="error" onClose={() => setError('')}>{error}</Alert>
      </Snackbar>
      <BoxAny sx={{ ...appPageShellSx, pb: { xs: 24, md: 14 } }}>
        <Container maxWidth={false} sx={{ ...appPageContentSx, maxWidth: 1440 }}>
          <Stack spacing={1.5}>
            <Paper
              data-testid="music-filters"
              sx={{
                ...appSurfaceSx,
                p: { xs: 1, sm: 2 },
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) minmax(88px, 0.6fr) 36px',
                alignItems: 'center',
                gap: { xs: 1, sm: 1.5 },
              }}
            >
              <TextField
                value={search}
                onChange={(event) => updateSearch(event.target.value)}
                label={t('music.searchLabel')}
                inputProps={{ 'aria-label': t('music.search') }}
                size="small"
                sx={{ minWidth: 0 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start" sx={{ display: { xs: 'none', sm: 'flex' } }}><SearchIcon fontSize="small" /></InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        aria-label={t('music.clearSearch')}
                        disabled={!search}
                        onClick={() => updateSearch('')}
                      >
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              {filterableFields.map((field) => (
                <FormControl key={field.key} size="small" sx={{ minWidth: 0 }}>
                  <InputLabel id={`music-filter-${field.key}`}>{fieldLabel(field, language)}</InputLabel>
                  <Select
                    labelId={`music-filter-${field.key}`}
                    value={filters[field.key] ?? ''}
                    label={fieldLabel(field, language)}
                    MenuProps={{ disableScrollLock: true }}
                    onChange={(event) => updateFilter(field.key, event.target.value)}
                  >
                    <MenuItem value="">{t('music.all')}</MenuItem>
                    {(filterOptions[field.key] ?? []).map((option) => (
                      <MenuItem key={option} value={JSON.stringify(option)} title={option || t('music.uncategorized')}>
                        {option || t('music.uncategorized')}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ))}
              <Tooltip title={t(allCollapsed ? 'music.expandAll' : 'music.collapseAll')}>
                <span>
                  <IconButton
                    size="small"
                    aria-label={t(allCollapsed ? 'music.expandAll' : 'music.collapseAll')}
                    aria-expanded={!allCollapsed}
                    disabled={albumGroups.length === 0}
                    onClick={() => {
                      setPage(1);
                      updateExpandedGroups(allCollapsed
                        ? new Set(albumGroups.map((group) => group.id))
                        : new Set());
                    }}
                  >
                    {allCollapsed ? <UnfoldMoreIcon fontSize="small" /> : <UnfoldLessIcon fontSize="small" />}
                  </IconButton>
                </span>
              </Tooltip>
            </Paper>

            <Paper sx={{ borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
              {loading && <LinearProgress sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3 }} />}
                <TableContainer data-testid="music-table" aria-busy={loading}>
                  <BoxAny sx={{ minHeight: tableHeight }}>
                  <Table aria-label={t('music.title')} size="small" stickyHeader sx={{ tableLayout: 'fixed', minWidth: 760, fontSize: '0.875rem' }}>
                    <colgroup>
                      {visibleFields.map((field) => (
                        <col
                          key={field.key}
                          style={{
                            width: field.type === 'tags' ? 'calc(10em + 32px)'
                              : field === primaryField ? undefined : field.width ?? 180,
                          }}
                        />
                      ))}
                    </colgroup>
                    <TableHead>
                      <TableRow sx={{ height: MUSIC_ROW_HEIGHT }}>
                        {visibleFields.map((field) => (
                          <TableCell key={field.key} sx={{ bgcolor: 'background.paper', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {fieldLabel(field, language)}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    {rows.map((row) => (
                      <TableBody key={row.group.id}>
                        {row.showDirectory && <TableRow
                          data-testid="music-directory-row"
                          selected={isSelected(row.group.id)}
                          aria-selected={isSelected(row.group.id)}
                          sx={(theme) => ({
                            height: MUSIC_ROW_HEIGHT,
                            bgcolor: 'action.selected',
                            ...selectionRowSx(theme),
                          })}
                        >
                          <TableCell
                            component="th"
                            scope="rowgroup"
                            colSpan={visibleFields.length}
                            sx={{ py: 0.375, borderLeft: '3px solid', borderLeftColor: 'primary.main' }}
                          >
                            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0, maxWidth: 'calc(100vw - 67px)' }}>
                              <ButtonBase
                                data-testid="music-directory-toggle"
                                ref={(element: HTMLButtonElement | null) => {
                                  if (element) directoryHeadingRefs.current.set(row.group.id, element);
                                  else directoryHeadingRefs.current.delete(row.group.id);
                                }}
                                aria-expanded={expandedGroups.has(row.group.id)}
                                aria-label={`${t(expandedGroups.has(row.group.id) ? 'music.collapseDirectory' : 'music.expandDirectory')}: ${row.group.directory}`}
                                onClick={() => toggleGroup(row.group.id)}
                                sx={{
                                  flex: 1,
                                  minWidth: 0,
                                  minHeight: 32,
                                  gap: 1.5,
                                  textAlign: 'left',
                                  justifyContent: 'flex-start',
                                  borderRadius: 0.5,
                                  '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                                }}
                              >
                              <FolderOutlinedIcon fontSize="small" color="primary" sx={{ flexShrink: 0 }} />
                              <Typography
                                variant="body2"
                                fontWeight={700}
                                color={isSelected(row.group.id) ? 'primary.main' : 'text.primary'}
                                title={row.group.directory}
                                sx={{
                                  flex: 1,
                                  minWidth: 0,
                                  whiteSpace: 'nowrap',
                                  textOverflow: 'ellipsis',
                                  overflow: 'hidden',
                                  lineHeight: '20px',
                                }}
                              >
                                {row.group.directory}
                              </Typography>
                                {expandedGroups.has(row.group.id)
                                  ? <ExpandMoreIcon fontSize="small" sx={{ flexShrink: 0 }} />
                                  : <ChevronRightIcon fontSize="small" sx={{ flexShrink: 0 }} />}
                              </ButtonBase>
                              <Tooltip title={t('music.playAlbum')}>
                                <IconButton
                                  size="small"
                                  color="primary"
                                  aria-label={t('music.playAlbum')}
                                  onClick={() => {
                                    selectItem(row.group.id);
                                    playAlbum(row.group);
                                  }}
                                  sx={{ flexShrink: 0, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}
                                >
                                  <PlayArrowIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          </TableCell>
                        </TableRow>}
                        {row.tracks.map((record, trackIndex) => (
                          <TableRow
                            key={record.id}
                            hover
                            tabIndex={0}
                            selected={isSelected(row.group.id, record.id)}
                            aria-selected={isSelected(row.group.id, record.id)}
                            onClick={() => selectItem(row.group.id, record.id)}
                            onKeyDown={(event) => {
                              if (event.target === event.currentTarget
                                && (event.key === 'Enter' || event.key === ' ')) {
                                event.preventDefault();
                                selectItem(row.group.id, record.id);
                              }
                            }}
                            sx={(theme) => ({
                              height: MUSIC_ROW_HEIGHT,
                              cursor: 'pointer',
                              ...selectionRowSx(theme),
                            })}
                          >
                            {visibleFields.map((field) => (
                                  <TableCell
                                    key={field.key}
                                    title={scalarText(record.data[field.key]) || (field.type === 'tags' ? t('music.uncategorized') : undefined)}
                                    sx={{
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: field.type === 'tags' ? 'normal' : 'nowrap',
                                      fontWeight: 400,
                                      py: field.type === 'tags' ? 0.5 : 0.375,
                                      ...(field === primaryField && {
                                        pl: 6,
                                        position: 'relative',
                                        '&::before': {
                                          content: '""',
                                          position: 'absolute',
                                          left: 29,
                                          top: 0,
                                          bottom: trackIndex === row.tracks.length - 1 ? '50%' : 0,
                                          width: '1px',
                                          bgcolor: 'divider',
                                          pointerEvents: 'none',
                                        },
                                        '&::after': {
                                          content: '""',
                                          position: 'absolute',
                                          left: 29,
                                          top: '50%',
                                          width: 16,
                                          height: '1px',
                                          bgcolor: 'divider',
                                          pointerEvents: 'none',
                                        },
                                      }),
                                    }}
                                  >
                                    {field === primaryField ? (
                                      <Stack
                                        direction="row"
                                        alignItems="center"
                                        spacing={1}
                                        sx={{ minWidth: 0 }}
                                      >
                                        <Tooltip title={t('music.playTrack')}>
                                          <IconButton
                                            size="small"
                                            aria-label={t('music.playTrack')}
                                            onClick={() => void startPlayback(record, [record])}
                                            sx={{ flexShrink: 0 }}
                                          >
                                            <PlayArrowIcon fontSize="small" />
                                          </IconButton>
                                        </Tooltip>
                                        <Typography
                                          noWrap
                                          variant="body2"
                                          fontWeight={400}
                                          color={isSelected(row.group.id, record.id) ? 'primary.main' : 'text.primary'}
                                        >
                                          {renderValue(record, field)}
                                        </Typography>
                                      </Stack>
                                    ) : renderValue(record, field)}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                      </TableBody>
                    ))}
                    {!loading && filteredRecords.length === 0 && (
                      <TableBody>
                        <TableRow sx={{ height: tableHeight - MUSIC_ROW_HEIGHT }}>
                          <TableCell colSpan={visibleFields.length} align="center">
                            <Typography color="text.secondary">
                              {!catalog && error ? error : t('music.empty')}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    )}
                  </Table>
                  </BoxAny>
                </TableContainer>
            </Paper>
              <Stack
                data-testid="music-pagination"
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                alignItems="center"
                justifyContent="space-between"
                sx={{ minHeight: { xs: 76, sm: 40 } }}
              >
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  {t('music.pageRange')
                    .replace('{from}', String(firstRow))
                    .replace('{to}', String(lastRow))
                    .replace('{count}', String(totalRows))}
                </Typography>
                <BoxAny sx={{ width: 340, maxWidth: '100%', display: 'flex', justifyContent: { xs: 'center', sm: 'flex-end' } }}>
                  <Pagination
                  disabled={loading || filteredRecords.length === 0}
                  count={pageCount}
                  page={currentPage}
                  onChange={(_, nextPage) => setPage(nextPage)}
                  color="primary"
                  size="small"
                  siblingCount={0}
                  sx={{
                    '& .MuiPagination-ul': { flexWrap: 'nowrap' },
                    '& .MuiPaginationItem-root': { mx: 0.25 },
                  }}
                  showFirstButton
                  showLastButton
                  aria-label={t('music.pagination')}
                  getItemAriaLabel={(type, targetPage) => type === 'page'
                    ? t('music.goToPage').replace('{page}', String(targetPage))
                    : ['first', 'last', 'previous', 'next'].includes(type)
                      ? t(`music.${type}Page`)
                      : t('music.pagination')}
                />
                </BoxAny>
              </Stack>
          </Stack>
        </Container>
      </BoxAny>

      {current && (
        <Paper
          square
          elevation={8}
          sx={{
            position: 'fixed',
            zIndex: (theme) => theme.zIndex.appBar,
            left: 0,
            right: 0,
            bottom: 0,
            borderTop: '1px solid',
            borderColor: 'divider',
            px: { xs: 1.5, sm: 3 },
            py: 1,
            pb: 'calc(8px + env(safe-area-inset-bottom))',
          }}
        >
          <BoxAny
            sx={{
              maxWidth: 1500,
              mx: 'auto',
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 1fr) minmax(320px, 2fr) auto' },
              alignItems: 'center',
              gap: { xs: 0.5, md: 2 },
            }}
          >
            <BoxAny sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
              <AlbumIcon color="action" />
              <BoxAny sx={{ minWidth: 0 }}>
                <Typography fontWeight={600} noWrap title={recordTitle(current)}>{recordTitle(current)}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap title={recordSubtitle(current)}>
                  {recordSubtitle(current)}
                </Typography>
              </BoxAny>
            </BoxAny>

            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="caption" sx={{ width: 38, textAlign: 'right' }}>
                {formatTime(position)}
              </Typography>
              <Slider
                size="small"
                min={0}
                max={Math.max(duration, 0.1)}
                value={Math.min(position, Math.max(duration, 0.1))}
                onChange={(_, value) => {
                  const next = Array.isArray(value) ? value[0] : value;
                  const audio = audioRef.current;
                  if (!audio || !current) return;
                  audio.currentTime = (current.playback.startSeconds ?? 0) + next;
                  setPosition(next);
                }}
              />
              <Typography variant="caption" sx={{ width: 38 }}>
                {formatTime(duration)}
              </Typography>
            </Stack>

            <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
              <IconButton
                size="small"
                disabled={queueIndex <= 0}
                onClick={() => playAdjacent(-1)}
              >
                <SkipPreviousIcon />
              </IconButton>
              <IconButton color="primary" onClick={togglePlayback}>
                {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
              </IconButton>
              <IconButton
                size="small"
                disabled={queueIndex < 0 || queueIndex >= queue.length - 1}
                onClick={() => playAdjacent(1)}
              >
                <SkipNextIcon />
              </IconButton>
              <VolumeUpIcon fontSize="small" color="action" />
              <Slider
                size="small"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(_, value) => {
                  const next = Array.isArray(value) ? value[0] : value;
                  setVolume(next);
                  if (audioRef.current) audioRef.current.volume = next;
                }}
                sx={{ width: 72 }}
              />
            </Stack>
          </BoxAny>
          <audio
            key={playbackVersion}
            ref={audioRef}
            src={playbackUrl}
            preload="metadata"
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => playAdjacent(1)}
            onError={() => setError(t('music.playFailed'))}
          />
        </Paper>
      )}
    </>
  );
};

export default MusicPage;
