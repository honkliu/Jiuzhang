import React, { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  CardMedia,
  CardContent,
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
import { AutoAwesome as MagicIcon } from '@mui/icons-material';
import { avatarService, type EmotionFullResult, type EmotionThumbnailResult } from '@/services/avatar.service';
import { imageGenerationService } from '@/services/imageGeneration.service';
import { ImageHoverPreview } from '@/components/Shared/ImageHoverPreview';
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
  const { t } = useLanguage();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));


  const buildThumbnailUrl = (imageUrl: string) => {
    if (!imageUrl) return imageUrl;
    return imageUrl.includes('?') ? `${imageUrl}&size=thumbnail` : `${imageUrl}?size=thumbnail`;
  };

  const defaultEmotionLabels = ['angry', 'smile', 'sad', 'happy', 'crying', 'thinking', 'surprised', 'neutral', 'excited'];
  const tileSize = isMobile ? 'calc((100vw - 48px) / 3)' : 125;

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

          setFullById((prev) => {
            const nextMap = new Map(prev);
            if (replacedId) {
              nextMap.delete(replacedId);
            }
            nextMap.set(newAvatarId, '');
            return nextMap;
          });

          const cachedFull = _fullCache.get(targetAvatarId);
          if (cachedFull) {
            let fullReplaced = false;
            const nextFull = cachedFull.map((item) => {
              if ((item.emotion || '').toLowerCase() === normalized) {
                fullReplaced = true;
                return {
                  ...item,
                  avatarImageId: newAvatarId,
                  emotion,
                  imageUrl: nextImageUrl,
                  fullImageDataUrl: null,
                };
              }
              return item;
            });
            if (!fullReplaced) {
              nextFull.push({
                avatarImageId: newAvatarId,
                emotion,
                imageUrl: nextImageUrl,
                fullImageDataUrl: null,
              });
            }
            _fullCache.set(targetAvatarId, nextFull);
          }

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
    const extraPrompt = promptValue.trim();
    if (emotion) {
      await handleGenerateEmotion(emotion, extraPrompt);
      return;
    }
    await handleGenerateAll(extraPrompt);
  };

  return (
    <BoxAny sx={{ p: isMobile ? 1 : 0.375 }}>
      <BoxAny sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: '1px' }}>
        <Typography variant="h6">{t('avatar.emotionTitle')}</Typography>
        <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <IconButton
            size="small"
            aria-describedby={helpId}
            title={t('avatar.promptHelp')}
            onClick={(event) => setHelpAnchorEl(event.currentTarget)}
          >
            <Typography component="span" sx={{ fontWeight: 700 }}>
              ..
            </Typography>
          </IconButton>
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
          mb: 1,
        }}
      >
        <TextField
          autoFocus
          size="small"
          label={t('avatar.extraPromptLabel')}
          placeholder={t('avatar.extraPromptPlaceholder')}
          fullWidth
          value={promptValue}
          onChange={(e) => setPromptValue(e.target.value)}
        />
      </BoxAny>

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
        <Grid container spacing={0.15} justifyContent="center">
          {emotionLabels.map((label) => {
            const match = emotions.find((e) => (e.emotion || '').toLowerCase() === label);
            return (
              <Grid item xs={4} key={label}>
                <Card
                  sx={{
                    p: 0.15,
                    borderRadius: 1,
                    transition: 'box-shadow 120ms ease',
                  }}
                >
                  {match ? (
                    <ImageHoverPreview
                      key={`${label}-${match.avatarImageId}`}
                      src={fullById.get(match.avatarImageId) || match.imageUrl}
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
                          sx={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            width: '100%',
                            cursor: 'pointer',
                          }}
                        >
                          <CardMedia
                            component="img"
                            image={match.thumbnailDataUrl || buildThumbnailUrl(match.imageUrl)}
                            alt={match.emotion || label}
                            sx={{
                              width: tileSize,
                              height: tileSize,
                              objectFit: 'cover',
                              borderRadius: 1.5,
                              display: 'block',
                              transition: 'transform 120ms ease',
                              '&:hover': {
                                transform: 'translateY(-1px)',
                              },
                              WebkitTouchCallout: 'none',
                              WebkitUserSelect: 'none',
                              userSelect: 'none',
                              WebkitUserDrag: 'none',
                            }}
                          />
                        </BoxAny>
                      )}
                    </ImageHoverPreview>
                  ) : (
                    <BoxAny
                      sx={{
                        height: tileSize,
                        width: tileSize,
                        margin: '0 auto',
                        background: '#f0f0f0',
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
                  <CardContent sx={{ p: 0.15, pt: 0.15, '&:last-child': { pb: 0.15 } }}>
                    <BoxAny sx={{ display: 'flex', alignItems: 'center', position: 'relative', minHeight: 20 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: '0.55rem',
                          lineHeight: 1,
                          position: 'absolute',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {label}
                      </Typography>
                      <Button
                        size="small"
                        variant="contained"
                        color="primary"
                        onClick={() => {
                          void handlePromptSubmit(label);
                        }}
                        disabled={generating !== null || generatingAll || !avatarId}
                        sx={{
                          ml: 'auto',
                          minWidth: 0,
                          minHeight: 24,
                          px: 1,
                          fontSize: '0.7rem',
                          lineHeight: 1,
                          borderRadius: 1.5,
                          boxShadow: '0 6px 14px rgba(7, 193, 96, 0.25)',
                        }}
                      >
                        {generating === label ? t('avatar.generatingOne') : t('avatar.generateOne')}
                      </Button>
                    </BoxAny>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </BoxAny>
  );
};
