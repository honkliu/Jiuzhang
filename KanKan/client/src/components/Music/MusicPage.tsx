import React from 'react';
import {
  Alert,
  Box,
  Chip,
  Container,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Slider,
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
import {
  Album as AlbumIcon,
  Clear as ClearIcon,
  Pause as PauseIcon,
  PlayArrow as PlayArrowIcon,
  QueueMusic as QueueMusicIcon,
  Search as SearchIcon,
  SkipNext as SkipNextIcon,
  SkipPrevious as SkipPreviousIcon,
  VolumeUp as VolumeUpIcon,
} from '@mui/icons-material';
import { TableVirtuoso, type TableComponents } from 'react-virtuoso';
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
  appPageTitleSx,
  appSurfaceSx,
} from '@/styles/appLayout';

const BoxAny = Box as any;

const tableComponents: TableComponents<MusicCatalogRecord> = {
  Scroller: React.forwardRef<HTMLDivElement>((props, ref) => (
    <TableContainer {...props} ref={ref} />
  )),
  Table: (props) => (
    <Table {...props} size="small" sx={{ borderCollapse: 'separate', tableLayout: 'fixed' }} />
  ),
  TableHead: React.forwardRef<HTMLTableSectionElement>((props, ref) => (
    <TableHead {...props} ref={ref} />
  )),
  TableRow,
  TableBody: React.forwardRef<HTMLTableSectionElement>((props, ref) => (
    <TableBody {...props} ref={ref} />
  )),
};

function scalarText(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(scalarText).filter(Boolean).join(' · ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
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

function compareRecords(
  left: MusicCatalogRecord,
  right: MusicCatalogRecord,
  field?: MusicCatalogField,
): number {
  if (!field) return 0;
  const a = left.data[field.key];
  const b = right.data[field.key];
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return scalarText(a).localeCompare(scalarText(b), undefined, { numeric: true });
}

export const MusicPage: React.FC = () => {
  const { t, language } = useLanguage();
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const advancingRef = React.useRef(false);
  const [catalog, setCatalog] = React.useState<MusicCatalog | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [filters, setFilters] = React.useState<Record<string, string>>({});
  const [current, setCurrent] = React.useState<MusicCatalogRecord | null>(null);
  const [queue, setQueue] = React.useState<MusicCatalogRecord[]>([]);
  const [queueIndex, setQueueIndex] = React.useState(-1);
  const [playbackUrl, setPlaybackUrl] = React.useState('');
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
    () => fields.filter((field) => field.visible !== false),
    [fields],
  );
  const searchableFields = React.useMemo(() => {
    const configured = fields.filter((field) => field.searchable);
    return configured.length > 0 ? configured : visibleFields;
  }, [fields, visibleFields]);
  const filterableFields = React.useMemo(
    () => fields.filter((field) => field.filterable),
    [fields],
  );
  const primaryField = React.useMemo(
    () => fields.find((field) => field.primary) || fieldByRole(fields, 'title') || visibleFields[0],
    [fields, visibleFields],
  );
  const secondaryField = React.useMemo(
    () => fieldByRole(fields, 'album') || visibleFields.find((field) => field !== primaryField),
    [fields, primaryField, visibleFields],
  );
  const albumField = React.useMemo(() => fieldByRole(fields, 'album'), [fields]);
  const trackNumberField = React.useMemo(
    () => fieldByRole(fields, 'trackNumber'),
    [fields],
  );

  const filterOptions = React.useMemo(() => {
    const options: Record<string, string[]> = {};
    for (const field of filterableFields) {
      const values = new Set<string>();
      for (const record of catalog?.records ?? []) {
        const value = record.data[field.key];
        const items = Array.isArray(value) ? value : [value];
        for (const item of items) {
          const text = scalarText(item);
          if (text) values.add(text);
        }
      }
      options[field.key] = [...values].sort((a, b) => a.localeCompare(b, language));
    }
    return options;
  }, [catalog, filterableFields, language]);

  const filteredRecords = React.useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return (catalog?.records ?? []).filter((record) => {
      if (
        normalizedSearch
        && !searchableFields.some((field) =>
          scalarText(record.data[field.key]).toLocaleLowerCase().includes(normalizedSearch))
      ) {
        return false;
      }

      return filterableFields.every((field) => {
        const selected = filters[field.key];
        if (!selected) return true;
        const value = record.data[field.key];
        return (Array.isArray(value) ? value : [value])
          .some((item) => scalarText(item) === selected);
      });
    });
  }, [catalog, filterableFields, filters, search, searchableFields]);

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
      setPosition(0);
      advancingRef.current = false;
    } catch {
      setError(t('music.playFailed'));
    }
  }, [t]);

  const playAlbum = React.useCallback((record: MusicCatalogRecord) => {
    if (!albumField) {
      void startPlayback(record, filteredRecords);
      return;
    }
    const album = scalarText(record.data[albumField.key]);
    const albumQueue = (catalog?.records ?? [])
      .filter((item) => scalarText(item.data[albumField.key]) === album)
      .sort((a, b) => compareRecords(a, b, trackNumberField));
    void startPlayback(record, albumQueue);
  }, [albumField, catalog, filteredRecords, startPlayback, trackNumberField]);

  const playAdjacent = React.useCallback((offset: number) => {
    const nextIndex = queueIndex + offset;
    if (nextIndex < 0 || nextIndex >= queue.length) {
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
      advancingRef.current = true;
      playAdjacent(1);
    }
  }, [current, playAdjacent]);

  const togglePlayback = React.useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play()
        .then(() => setIsPlaying(true))
        .catch(() => setError(t('music.playFailed')));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [t]);

  const clearFilters = () => {
    setSearch('');
    setFilters({});
  };

  const renderValue = (record: MusicCatalogRecord, field: MusicCatalogField) => {
    const value = record.data[field.key];
    if (Array.isArray(value)) {
      return (
        <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
          {value.map((item) => {
            const text = scalarText(item);
            return (
              <Chip
                key={text}
                label={text}
                size="small"
                clickable={field.filterable}
                onClick={field.filterable
                  ? () => setFilters((currentFilters) => ({
                    ...currentFilters,
                    [field.key]: text,
                  }))
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
      <AppHeader />
      <BoxAny sx={{ ...appPageShellSx, pb: current ? 14 : 0 }}>
        <Container maxWidth={false} sx={{ ...appPageContentSx, maxWidth: 1600 }}>
          <Stack spacing={2}>
            <BoxAny>
              <Typography sx={appPageTitleSx}>{t('music.title')}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t('music.resultCount').replace('{count}', String(filteredRecords.length))}
              </Typography>
            </BoxAny>

            {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

            <Paper
              sx={{
                ...appSurfaceSx,
                p: 2,
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'minmax(240px, 2fr) repeat(2, minmax(160px, 1fr))',
                  lg: `minmax(280px, 2fr) repeat(${Math.min(filterableFields.length, 4)}, minmax(160px, 1fr))`,
                },
                gap: 1.5,
              }}
            >
              <TextField
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                label={t('music.search')}
                size="small"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
                  ),
                  endAdornment: search ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setSearch('')}>
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : undefined,
                }}
              />
              {filterableFields.slice(0, 4).map((field) => (
                <FormControl key={field.key} size="small">
                  <InputLabel>{fieldLabel(field, language)}</InputLabel>
                  <Select
                    value={filters[field.key] ?? ''}
                    label={fieldLabel(field, language)}
                    onChange={(event) => setFilters((currentFilters) => ({
                      ...currentFilters,
                      [field.key]: event.target.value,
                    }))}
                  >
                    <MenuItem value="">{t('music.all')}</MenuItem>
                    {(filterOptions[field.key] ?? []).map((option) => (
                      <MenuItem key={option} value={option}>{option}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ))}
              {(search || Object.values(filters).some(Boolean)) && (
                <BoxAny sx={{ display: 'flex', alignItems: 'center' }}>
                  <Chip label={t('music.clearFilters')} onDelete={clearFilters} />
                </BoxAny>
              )}
            </Paper>

            <Paper sx={{ ...appSurfaceSx, overflow: 'hidden' }}>
              {loading && <LinearProgress />}
              {!loading && filteredRecords.length === 0 ? (
                <BoxAny sx={{ p: 5, textAlign: 'center' }}>
                  <Typography color="text.secondary">{t('music.empty')}</Typography>
                </BoxAny>
              ) : (
                <TableVirtuoso
                  style={{ height: 'min(62dvh, 720px)', minHeight: 420 }}
                  data={filteredRecords}
                  components={tableComponents}
                  fixedHeaderContent={() => (
                    <TableRow>
                      <TableCell sx={{ width: 92, bgcolor: 'background.paper' }}>
                        {t('music.play')}
                      </TableCell>
                      {visibleFields.map((field) => (
                        <TableCell
                          key={field.key}
                          sx={{
                            width: field.width,
                            minWidth: field.width ?? (field.primary ? 220 : 130),
                            bgcolor: 'background.paper',
                            fontWeight: 600,
                          }}
                        >
                          {fieldLabel(field, language)}
                        </TableCell>
                      ))}
                    </TableRow>
                  )}
                  itemContent={(_, record) => (
                    <>
                      <TableCell>
                        <Tooltip title={t('music.playTrack')}>
                          <IconButton
                            size="small"
                            onClick={() => void startPlayback(record, filteredRecords)}
                          >
                            <PlayArrowIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={t('music.playAlbum')}>
                          <span>
                            <IconButton
                              size="small"
                              disabled={!albumField}
                              onClick={() => playAlbum(record)}
                            >
                              <QueueMusicIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                      {visibleFields.map((field) => (
                        <TableCell
                          key={field.key}
                          sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: field.type === 'tags' ? 'normal' : 'nowrap',
                            fontWeight: field.primary ? 600 : 400,
                          }}
                        >
                          {renderValue(record, field)}
                        </TableCell>
                      ))}
                    </>
                  )}
                />
              )}
            </Paper>
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
                <Typography fontWeight={600} noWrap>{recordTitle(current)}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
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
