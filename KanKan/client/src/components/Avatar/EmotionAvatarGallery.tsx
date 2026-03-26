import React, { useState, useEffect } from 'react';
import {
  Typography,
  Button,
  IconButton,
  Popover,
  CircularProgress,
  Box,
  TextField,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { AutoAwesome as MagicIcon, LibraryBooks as LibraryBooksIcon, Tune as TuneIcon } from '@mui/icons-material';
import { avatarService, type EmotionFullResult, type EmotionThumbnailResult } from '@/services/avatar.service';
import { imageGenerationService } from '@/services/imageGeneration.service';
import { ImageHoverPreview } from '@/components/Shared/ImageHoverPreview';
import { AvatarQuickPicker } from '@/components/Avatar/AvatarQuickPicker';
import { PromptComposer, type SelectedPrompt } from '@/components/Avatar/PromptComposer';
import { useLanguage } from '@/i18n/LanguageContext';

const BoxAny = Box as any;

// Module-level caches — survive component unmount/remount so re-opening never re-fetches.
const _thumbCache = new Map<string, EmotionThumbnailResult[]>();
const _fullCache = new Map<string, EmotionFullResult[]>();
const _labelCache = new Map<string, string[]>();
// In-flight deduplication: if a request is already in-flight for an avatarId, reuse it.
const _thumbInFlight = new Map<string, Promise<EmotionThumbnailResult[]>>();
const _fullInFlight = new Map<string, Promise<EmotionFullResult[]>>();

interface EmotionAvatarGalleryProps {
  userId: string;
  avatarId: string;
}

export const EmotionAvatarGallery: React.FC<EmotionAvatarGalleryProps> = ({ userId, avatarId }) => {
  const { t, language } = useLanguage();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));


  const buildThumbnailUrl = (imageUrl: string, bust?: number) => {
    if (!imageUrl) return imageUrl;
    const sep = imageUrl.includes('?') ? '&' : '?';
    let url = `${imageUrl}${sep}size=thumbnail`;
    if (bust) url += `&_t=${bust}`;
    return url;
  };

  const defaultEmotionLabels = ['angry', 'smile', 'sad', 'happy', 'crying', 'thinking', 'surprised', 'neutral', 'excited'];

  const [emotions, setEmotions] = useState<EmotionThumbnailResult[]>([]);
  const [emotionLabels, setEmotionLabels] = useState<string[]>(defaultEmotionLabels);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatarIdRef = React.useRef<string>(avatarId);
  const refreshInFlightRef = React.useRef(false);
  const [fullById, setFullById] = useState<Map<string, string>>(new Map());
  const [promptValue, setPromptValue] = useState('');
  const [helpAnchorEl, setHelpAnchorEl] = useState<HTMLElement | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [showQuickPicker, setShowQuickPicker] = useState(false);
  const [selectedPrompts, setSelectedPrompts] = useState<SelectedPrompt[]>([]);
  const [cacheBust, setCacheBust] = useState<Record<string, number>>({});

  const helpOpen = Boolean(helpAnchorEl);
  const helpId = helpOpen ? 'emotion-prompt-help' : undefined;

  const notifyEmotionThumbnailsUpdated = (sourceAvatarId: string) => {
    window.dispatchEvent(new CustomEvent('emotion-thumbnails-updated', {
      detail: { sourceAvatarId },
    }));
  };

  useEffect(() => {
    avatarIdRef.current = avatarId;
    loadEmotionAvatars();
  }, [userId, avatarId]);

  const loadEmotionAvatars = async (silent: boolean = false, targetAvatarId: string = avatarId) => {
    try {
      const cached = targetAvatarId ? _thumbCache.get(targetAvatarId) : null;
      if (cached) {
        if (avatarIdRef.current === targetAvatarId) {
          setEmotions(cached);
        }
      }

      const cachedLabels = targetAvatarId ? _labelCache.get(targetAvatarId) : null;
      if (cachedLabels && avatarIdRef.current === targetAvatarId) {
        setEmotionLabels(cachedLabels);
      }

      if (!silent && !cached) {
        setLoading(true);
      }
      if (!targetAvatarId) {
        if (avatarIdRef.current === targetAvatarId) {
          setEmotions([]);
        }
        if (!silent) {
          setLoading(false);
        }
        return;
      }

      // Deduplicate concurrent thumbnail requests for the same avatarId
      let thumbPromise = _thumbInFlight.get(targetAvatarId);
      if (!thumbPromise) {
        thumbPromise = avatarService.getEmotionThumbnailsMeta(targetAvatarId)
          .then((payload) => {
            const labels = (payload.emotions || []).map((item) => (item || '').toLowerCase()).filter(Boolean);
            if (labels.length > 0) {
              _labelCache.set(targetAvatarId, labels);
              if (avatarIdRef.current === targetAvatarId) {
                setEmotionLabels(labels);
              }
            }
            return payload.results || [];
          });
        _thumbInFlight.set(targetAvatarId, thumbPromise);
        thumbPromise.finally(() => _thumbInFlight.delete(targetAvatarId));
      }
      const generated = await thumbPromise;
      _thumbCache.set(targetAvatarId, generated);
      if (avatarIdRef.current === targetAvatarId) {
        setEmotions(generated);
        // Clear cache-bust entries for items that now have fresh thumbnail data
        const idsWithData = generated.filter((g) => g.thumbnailDataUrl).map((g) => g.avatarImageId);
        if (idsWithData.length > 0) {
          setCacheBust((prev) => {
            const next = { ...prev };
            let changed = false;
            for (const id of idsWithData) {
              if (id in next) { delete next[id]; changed = true; }
            }
            return changed ? next : prev;
          });
        }
      }

      const cachedFull = _fullCache.get(targetAvatarId);
      if (cachedFull && avatarIdRef.current === targetAvatarId) {
        setFullById(new Map(cachedFull.map((item) => [item.avatarImageId, item.fullImageDataUrl || ''])));
      }
      if (!cachedFull && !_fullInFlight.has(targetAvatarId)) {
        // Deduplicate concurrent full-image requests for the same avatarId
        const fullPromise = avatarService.getEmotionThumbnailsFull(targetAvatarId);
        _fullInFlight.set(targetAvatarId, fullPromise);
        fullPromise
          .then((items) => {
            _fullCache.set(targetAvatarId, items);
            if (avatarIdRef.current === targetAvatarId) {
              setFullById(new Map(items.map((item) => [item.avatarImageId, item.fullImageDataUrl || ''])));
            }
          })
          .catch(() => {
            // Ignore full prefetch errors; thumbnails already rendered.
          })
          .finally(() => _fullInFlight.delete(targetAvatarId));
      }
      if (!silent) {
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load emotion avatars');
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const handleGenerateEmotion = async (emotion: string, extraPrompt?: string) => {
    try {
      const targetAvatarId = avatarId;
      setGenerating(emotion);
      setError(null);

      const { jobId } = await imageGenerationService.generateAvatarEmotion(targetAvatarId, emotion, extraPrompt);

      // Poll for completion
      const result = await imageGenerationService.pollJobUntilComplete(jobId);

      if (result.status === 'completed') {
        const avatarIds = result.results?.avatarImageIds || [];
        const newAvatarId = avatarIds.length > 0 ? avatarIds[avatarIds.length - 1] : null;
        if (newAvatarId) {
          const normalized = emotion.trim().toLowerCase();
          const nextImageUrl = `/api/avatar/image/${newAvatarId}`;
          let replacedId: string | null = null;

          setEmotions((prev) => {
            let replaced = false;
            const next = prev.map((item) => {
              if ((item.emotion || '').toLowerCase() === normalized) {
                replaced = true;
                replacedId = item.avatarImageId;
                return {
                  ...item,
                  avatarImageId: newAvatarId,
                  emotion,
                  imageUrl: nextImageUrl,
                  thumbnailDataUrl: null,
                };
              }
              return item;
            });
            if (!replaced) {
              next.push({
                avatarImageId: newAvatarId,
                emotion,
                imageUrl: nextImageUrl,
                thumbnailDataUrl: null,
              });
            }
            _thumbCache.set(targetAvatarId, next);
            return next;
          });

          notifyEmotionThumbnailsUpdated(targetAvatarId);

          setCacheBust((prev) => ({ ...prev, [newAvatarId]: Date.now() }));

          setFullById((prev) => {
            const nextMap = new Map(prev);
            if (replacedId) {
              nextMap.delete(replacedId);
            }
            // Clear cached entry so the popup uses the fresh server URL
            nextMap.delete(newAvatarId);
            return nextMap;
          });

          // Invalidate full cache so next load fetches fresh data including the new emotion
          _fullCache.delete(targetAvatarId);
          _fullInFlight.delete(targetAvatarId);

          // Background re-fetch full-res images so popup shows the updated image
          avatarService.getEmotionThumbnailsFull(targetAvatarId)
            .then((items) => {
              _fullCache.set(targetAvatarId, items);
              if (avatarIdRef.current === targetAvatarId) {
                setFullById(new Map(items.map((item) => [item.avatarImageId, item.fullImageDataUrl || ''])));
              }
            })
            .catch(() => { /* ignore */ });

        } else {
          // Fallback: refresh all thumbnails if the job doesn't return an id.
          _thumbCache.delete(targetAvatarId);
          _fullCache.delete(targetAvatarId);
          await loadEmotionAvatars(false, targetAvatarId);
        }
      } else {
        setError(result.errorMessage || 'Generation failed');
      }

      setGenerating(null);
    } catch (err: any) {
      setError(err.message || 'Failed to generate emotions');
      setGenerating(null);
    }
  };

  const handleGenerateAll = async (extraPrompt?: string) => {
    try {
      const targetAvatarId = avatarId;
      setGeneratingAll(true);
      setError(null);

      const { jobId } = await imageGenerationService.generateAvatarEmotions(targetAvatarId, extraPrompt);
      const result = await imageGenerationService.pollJobUntilComplete(jobId, () => {
        if (refreshInFlightRef.current) return;
        refreshInFlightRef.current = true;
        _thumbCache.delete(targetAvatarId);
        _fullCache.delete(targetAvatarId);
        return loadEmotionAvatars(true, targetAvatarId).finally(() => {
          refreshInFlightRef.current = false;
        });
      });

      if (result.status === 'completed') {
        _thumbCache.delete(targetAvatarId);
        _fullCache.delete(targetAvatarId);
        await loadEmotionAvatars(true, targetAvatarId);
        notifyEmotionThumbnailsUpdated(targetAvatarId);
      } else {
        setError(result.errorMessage || 'Generation failed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate emotions');
    } finally {
      setGeneratingAll(false);
    }
  };

  const handlePromptSubmit = async (emotion?: string) => {
    const parts: string[] = [];
    const typed = promptValue.trim();
    if (typed) parts.push(typed);
    for (const sp of selectedPrompts) {
      parts.push(language === 'zh' ? sp.zh : sp.en);
    }
    const extraPrompt = parts.join(', ');
    if (emotion) {
      await handleGenerateEmotion(emotion, extraPrompt);
      return;
    }
    await handleGenerateAll(extraPrompt);
  };

  return (
    <BoxAny sx={{ px: 0, py: isMobile ? 1 : 0.375 }}>
      <BoxAny sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: '1px' }}>
        <Typography variant="h6">{t('avatar.emotionTitle')}</Typography>
        <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Button
            size="small"
            variant="outlined"
            aria-describedby={helpId}
            title={t('avatar.promptHelp')}
            onClick={(event) => setHelpAnchorEl(event.currentTarget)}
            sx={{
              minWidth: 31,
              width: 31,
              height: 31,
              px: 0,
              py: 0,
            }}
          >
            例
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<MagicIcon />}
            onClick={() => {
              void handlePromptSubmit();
            }}
            disabled={generating !== null || generatingAll || !avatarId}
          >
            {generatingAll ? t('avatar.generatingAll') : t('avatar.generateAll')}
          </Button>
        </BoxAny>
      </BoxAny>

      <Popover
        id={helpId}
        open={helpOpen}
        anchorEl={helpAnchorEl}
        onClose={() => setHelpAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <BoxAny sx={{ p: 1.5, maxWidth: 320 }}>
          <Typography variant="body2">
            {t('avatar.promptHelpText')}
          </Typography>
        </BoxAny>
      </Popover>

      <BoxAny
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 0.5,
        }}
      >
        <TextField
          autoFocus
          size="small"
          multiline
          maxRows={6}
          label={t('avatar.extraPromptLabel')}
          placeholder={t('avatar.extraPromptPlaceholder')}
          fullWidth
          value={promptValue}
          onChange={(e) => setPromptValue(e.target.value)}
        />
        <IconButton
          size="small"
          title={t('promptComposer.browsePrompts')}
          onClick={() => setComposerOpen(true)}
        >
          <LibraryBooksIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          title={t('promptComposer.browsePrompts')}
          onClick={() => setShowQuickPicker((prev) => !prev)}
          color={showQuickPicker ? 'primary' : 'default'}
        >
          <TuneIcon fontSize="small" />
        </IconButton>
      </BoxAny>

      {showQuickPicker && (
        <AvatarQuickPicker
        selectedKeys={new Set(selectedPrompts.map((p) => p.key))}
        onSelect={(sp) => setSelectedPrompts((prev) => [...prev, sp])}
        onDeselect={(key) => setSelectedPrompts((prev) => prev.filter((p) => p.key !== key))}
      />
      )}

      {selectedPrompts.length > 0 && (
        <BoxAny sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
          {selectedPrompts.map((sp) => (
            <Button
              key={sp.key}
              size="small"
              variant="outlined"
              onClick={() => setSelectedPrompts((prev) => prev.filter((p) => p.key !== sp.key))}
              sx={{
                fontSize: '0.7rem',
                textTransform: 'none',
              }}
            >
              {language === 'zh' ? sp.zh : sp.en}
            </Button>
          ))}
        </BoxAny>
      )}

      <PromptComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onApply={(prompts) => {
          setSelectedPrompts((prev) => {
            const existing = new Set(prev.map((p) => p.key));
            const added = prompts.filter((p) => !existing.has(p.key));
            return [...prev, ...added];
          });
          setComposerOpen(false);
        }}
      />

      {error && (
        <Typography color="error" sx={{ mb: '6px' }}>
          {error}
        </Typography>
      )}

      {loading ? (
        <BoxAny sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </BoxAny>
      ) : (
        <BoxAny
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            columnGap: '22px',
            rowGap: 0,
          }}
        >
          {emotionLabels.map((label) => {
            const match = emotions.find((e) => (e.emotion || '').toLowerCase() === label);
            const isGeneratingThis = generating === label;
            return (
              <BoxAny key={label} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {match ? (
                  <ImageHoverPreview
                    key={`${label}-${match.avatarImageId}-${cacheBust[match.avatarImageId] || 0}`}
                    src={fullById.get(match.avatarImageId) || (cacheBust[match.avatarImageId] ? `${match.imageUrl}?_t=${cacheBust[match.avatarImageId]}` : match.imageUrl)}
                    alt={`${match.emotion || label} preview`}
                    maxSize={400}
                    openOnHover={false}
                    openOnLongPress={false}
                    openOnTap
                    openOnClick
                    openOnDoubleClick={false}
                    dismissOnHoverOut={false}
                    closeOnClickWhenOpen
                    closeOnTriggerClickWhenOpen
                  >
                    {(previewProps) => (
                      <BoxAny
                        {...previewProps}
                        component="img"
                        src={match.thumbnailDataUrl || buildThumbnailUrl(match.imageUrl, cacheBust[match.avatarImageId])}
                        alt={match.emotion || label}
                        sx={{
                          width: '100%',
                          aspectRatio: '1 / 1',
                          objectFit: 'cover',
                          borderRadius: '5px',
                          display: 'block',
                          cursor: 'pointer',
                          WebkitTouchCallout: 'none',
                          WebkitUserSelect: 'none',
                          userSelect: 'none',
                          WebkitUserDrag: 'none',
                        }}
                      />
                    )}
                  </ImageHoverPreview>
                ) : (
                  <BoxAny
                    sx={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      background: '#f0f0f0',
                      borderRadius: '5px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#888',
                      fontSize: 12,
                    }}
                  >
                    Not generated
                  </BoxAny>
                )}
                <Typography
                  variant="caption"
                  onClick={() => {
                    if (generating === null && !generatingAll && avatarId) {
                      void handlePromptSubmit(label);
                    }
                  }}
                  sx={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    lineHeight: 1,
                    py: 0.5,
                    color: 'primary.main',
                    cursor: (generating !== null || generatingAll || !avatarId) ? 'default' : 'pointer',
                    opacity: isGeneratingThis ? 0.6 : 1,
                    '&:hover': (generating !== null || generatingAll || !avatarId) ? {} : { textDecoration: 'underline' },
                  }}
                >
                  {isGeneratingThis ? t('avatar.generatingOne') : `✦ ${label}`}
                </Typography>
              </BoxAny>
            );
          })}
        </BoxAny>
      )}
    </BoxAny>
  );
};
