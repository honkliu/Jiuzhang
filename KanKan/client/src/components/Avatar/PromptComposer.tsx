import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Chip,
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  InputAdornment,
  useMediaQuery,
  useTheme,
  Badge,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Search as SearchIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useLanguage } from '@/i18n/LanguageContext';
import type { PromptLibrary, Prompt } from '@/data/promptLibrary';

const BoxAny = Box as any;

export interface SelectedPrompt {
  key: string;
  en: string;
  zh: string;
}

interface PromptComposerProps {
  open: boolean;
  onClose: () => void;
  onApply: (prompts: SelectedPrompt[]) => void;
}

// Lazy-loaded prompt library data
let _libraryCache: PromptLibrary | null = null;
let _libraryPromise: Promise<PromptLibrary> | null = null;

function loadLibrary(): Promise<PromptLibrary> {
  if (_libraryCache) return Promise.resolve(_libraryCache);
  if (_libraryPromise) return _libraryPromise;
  _libraryPromise = import('@/data/promptLibrary').then((mod) => {
    _libraryCache = mod.default;
    return _libraryCache;
  });
  return _libraryPromise;
}

function pKey(pi: number, si: number, idx: number): string {
  return `${pi}-${si}-${idx}`;
}

export const PromptComposer: React.FC<PromptComposerProps> = ({ open, onClose, onApply }) => {
  const { t, language } = useLanguage();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isZh = language === 'zh';

  const [library, setLibrary] = useState<PromptLibrary | null>(_libraryCache);
  const [loading, setLoading] = useState(!_libraryCache);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPartIdx, setSelectedPartIdx] = useState<number | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && !library) {
      setLoading(true);
      loadLibrary().then((data) => {
        setLibrary(data);
        setLoading(false);
      });
    }
  }, [open, library]);

  useEffect(() => {
    if (open) {
      setSearchQuery('');
      setSelectedPartIdx(null);
      setExpandedSections(new Set());
      setSelectedKeys(new Set());
    }
  }, [open]);

  const lbl = useCallback((item: { en: string; zh: string }) => (isZh ? item.zh : item.en), [isZh]);
  const pLbl = useCallback((p: Prompt) => (isZh ? p[1] : p[0]), [isZh]);

  // Collect selected prompt data
  const selectedPrompts = useMemo(() => {
    if (!library) return [];
    const results: SelectedPrompt[] = [];
    for (const key of selectedKeys) {
      const [pi, si, idx] = key.split('-').map(Number);
      const p = library[pi]?.sections[si]?.prompts[idx];
      if (p) results.push({ key, en: p[0], zh: p[1] });
    }
    return results;
  }, [library, selectedKeys]);

  // Search results
  const searchResults = useMemo(() => {
    if (!library || !searchQuery.trim()) return null;
    const q = searchQuery.trim().toLowerCase();
    const results: { key: string; prompt: Prompt; breadcrumb: string }[] = [];
    for (let pi = 0; pi < library.length; pi++) {
      const part = library[pi];
      for (let si = 0; si < part.sections.length; si++) {
        const sec = part.sections[si];
        for (let idx = 0; idx < sec.prompts.length; idx++) {
          const p = sec.prompts[idx];
          if (p[0].toLowerCase().includes(q) || p[1].includes(q)) {
            results.push({ key: pKey(pi, si, idx), prompt: p, breadcrumb: `${lbl(part)} > ${lbl(sec)}` });
            if (results.length >= 80) return results;
          }
        }
      }
    }
    return results;
  }, [library, searchQuery, lbl]);

  const togglePrompt = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const handleApply = useCallback(() => {
    if (selectedPrompts.length > 0) onApply(selectedPrompts);
    onClose();
  }, [selectedPrompts, onApply, onClose]);

  const toggleSection = useCallback((id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const renderChip = (key: string, prompt: Prompt) => {
    const sel = selectedKeys.has(key);
    return (
      <Chip
        key={key}
        label={pLbl(prompt)}
        size="small"
        variant={sel ? 'filled' : 'outlined'}
        color={sel ? 'primary' : 'default'}
        onClick={() => togglePrompt(key)}
        sx={{ fontSize: '0.75rem', maxWidth: 260 }}
      />
    );
  };

  const selectedPart = library && selectedPartIdx !== null ? library[selectedPartIdx] : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { height: isMobile ? '100%' : '80vh', display: 'flex', flexDirection: 'column' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', pb: 1 }}>
        <Typography variant="h6" sx={{ flex: 1 }}>{t('promptComposer.title')}</Typography>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent sx={{ flex: 1, overflow: 'auto', pt: '8px !important', display: 'flex', flexDirection: 'column' }}>
        {/* Search */}
        <TextField
          size="small"
          fullWidth
          placeholder={t('promptComposer.search')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ mb: 1.5, flexShrink: 0 }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
            endAdornment: searchQuery ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearchQuery('')}><CloseIcon fontSize="small" /></IconButton>
              </InputAdornment>
            ) : undefined,
          }}
        />

        {loading && (
          <BoxAny sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary">{t('promptComposer.loading')}</Typography>
          </BoxAny>
        )}

        {/* Search results as chips */}
        {!loading && searchResults && (
          <BoxAny sx={{ flex: 1, overflow: 'auto' }}>
            {searchResults.length === 0 ? (
              <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                {t('promptComposer.noResults')}
              </Typography>
            ) : (
              <BoxAny sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {searchResults.map((r) => renderChip(r.key, r.prompt))}
              </BoxAny>
            )}
          </BoxAny>
        )}

        {/* Browse mode */}
        {!loading && !searchResults && library && (
          <BoxAny sx={{ flex: 1, overflow: 'auto' }}>
            {/* Part chips */}
            <BoxAny sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
              {library.map((part, pi) => {
                const n = part.sections.reduce((s, sec) => s + sec.prompts.length, 0);
                return (
                  <Chip
                    key={part.id}
                    label={`${lbl(part)} (${n})`}
                    variant={selectedPartIdx === pi ? 'filled' : 'outlined'}
                    color={selectedPartIdx === pi ? 'primary' : 'default'}
                    onClick={() => { setSelectedPartIdx(selectedPartIdx === pi ? null : pi); setExpandedSections(new Set()); }}
                    size="small"
                  />
                );
              })}
            </BoxAny>

            {/* Sections */}
            {selectedPart && selectedPart.sections.map((sec, si) => {
              const secKey = `${selectedPartIdx}-${si}`;
              return (
                <Accordion
                  key={secKey}
                  expanded={expandedSections.has(secKey)}
                  onChange={() => toggleSection(secKey)}
                  disableGutters
                  sx={{ '&:before': { display: 'none' }, boxShadow: 'none', border: '1px solid', borderColor: 'divider', mb: 0.5, borderRadius: '4px !important' }}
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
                    <Badge badgeContent={sec.prompts.length} color="primary" sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', height: 16, minWidth: 16 } }}>
                      <Typography variant="body2" sx={{ pr: 2 }}>{lbl(sec)}</Typography>
                    </Badge>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0, pb: 1, px: 1 }}>
                    <BoxAny sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {sec.prompts.map((p, idx) => renderChip(pKey(selectedPartIdx!, si, idx), p))}
                    </BoxAny>
                  </AccordionDetails>
                </Accordion>
              );
            })}

            {!selectedPart && (
              <Typography color="text.secondary" variant="body2" sx={{ textAlign: 'center', py: 2 }}>
                {t('promptComposer.selectPartHint')}
              </Typography>
            )}
          </BoxAny>
        )}
      </DialogContent>

      {/* Bottom staging area */}
      <DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', p: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
        {selectedPrompts.length > 0 && (
          <BoxAny sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1, maxHeight: 80, overflow: 'auto' }}>
            {selectedPrompts.map((sp) => (
              <Chip
                key={sp.key}
                label={isZh ? sp.zh : sp.en}
                size="small"
                onDelete={() => togglePrompt(sp.key)}
                sx={{ maxWidth: 200, fontSize: '0.7rem' }}
              />
            ))}
          </BoxAny>
        )}
        <BoxAny sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1, alignSelf: 'center' }}>
            {selectedPrompts.length > 0 ? `${t('promptComposer.selected')}: ${selectedPrompts.length}` : ''}
          </Typography>
          {selectedPrompts.length > 0 && (
            <Button size="small" onClick={() => setSelectedKeys(new Set())}>{t('promptComposer.clear')}</Button>
          )}
          <Button size="small" variant="contained" onClick={handleApply} disabled={selectedPrompts.length === 0}>
            {t('promptComposer.apply')}
          </Button>
        </BoxAny>
      </DialogActions>
    </Dialog>
  );
};
