import React, { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  CardMedia,
  CardContent,
  Typography,
  Button,
  CircularProgress,
} from '@mui/material';
import { AutoAwesome as MagicIcon } from '@mui/icons-material';
import { avatarService, type EmotionThumbnailResult } from '@/services/avatar.service';
import { imageGenerationService } from '@/services/imageGeneration.service';

interface EmotionAvatarGalleryProps {
  userId: string;
  avatarId: string;
}

export const EmotionAvatarGallery: React.FC<EmotionAvatarGalleryProps> = ({ userId, avatarId }) => {
  const containerStyle: React.CSSProperties = { padding: 3 };
  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 1,
  };
  const errorStyle: React.CSSProperties = { marginBottom: 6 };
  const loadingStyle: React.CSSProperties = { display: 'flex', justifyContent: 'center', padding: 32 };

  const buildThumbnailUrl = (imageUrl: string) => {
    if (!imageUrl) return imageUrl;
    return imageUrl.includes('?') ? `${imageUrl}&size=thumbnail` : `${imageUrl}?size=thumbnail`;
  };

  const emotionLabels = ['angry', 'smile', 'sad', 'happy', 'crying', 'thinking', 'surprised', 'neutral', 'excited'];
  const tileSize = 100;

  const [emotions, setEmotions] = useState<EmotionThumbnailResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = React.useRef<Map<string, EmotionThumbnailResult[]>>(new Map());
  const avatarIdRef = React.useRef<string>(avatarId);
  const refreshInFlightRef = React.useRef(false);

  useEffect(() => {
    avatarIdRef.current = avatarId;
    loadEmotionAvatars();
  }, [userId, avatarId]);

  const loadEmotionAvatars = async (silent: boolean = false, targetAvatarId: string = avatarId) => {
    try {
      const cached = targetAvatarId ? cacheRef.current.get(targetAvatarId) : null;
      if (cached) {
        if (avatarIdRef.current === targetAvatarId) {
          setEmotions(cached);
        }
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
      const generated = await avatarService.getEmotionThumbnails(targetAvatarId);
      cacheRef.current.set(targetAvatarId, generated);
      if (avatarIdRef.current === targetAvatarId) {
        setEmotions(generated);
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

  const handleGenerateEmotion = async (emotion: string) => {
    try {
      const targetAvatarId = avatarId;
      setGenerating(emotion);
      setError(null);

      const { jobId } = await imageGenerationService.generateAvatarEmotion(targetAvatarId, emotion);

      // Poll for completion
      const result = await imageGenerationService.pollJobUntilComplete(jobId);

      if (result.status === 'completed') {
        // Reload emotion avatars
        await loadEmotionAvatars(false, targetAvatarId);
      } else {
        setError(result.errorMessage || 'Generation failed');
      }

      setGenerating(null);
    } catch (err: any) {
      setError(err.message || 'Failed to generate emotions');
      setGenerating(null);
    }
  };

  const handleGenerateAll = async () => {
    try {
      const targetAvatarId = avatarId;
      setGeneratingAll(true);
      setError(null);

      const { jobId } = await imageGenerationService.generateAvatarEmotions(targetAvatarId);
      const result = await imageGenerationService.pollJobUntilComplete(jobId, () => {
        if (refreshInFlightRef.current) return;
        refreshInFlightRef.current = true;
        return loadEmotionAvatars(true, targetAvatarId).finally(() => {
          refreshInFlightRef.current = false;
        });
      });

      if (result.status === 'completed') {
        await loadEmotionAvatars(true, targetAvatarId);
      } else {
        setError(result.errorMessage || 'Generation failed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate emotions');
    } finally {
      setGeneratingAll(false);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <Typography variant="h6">Emotion Avatars</Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<MagicIcon />}
          onClick={handleGenerateAll}
          disabled={generating !== null || generatingAll || !avatarId}
        >
          {generatingAll ? 'Generating...' : 'Generate/Update All'}
        </Button>
      </div>

      {error && (
        <Typography color="error" style={errorStyle}>
          {error}
        </Typography>
      )}

      {loading ? (
        <div style={loadingStyle}>
          <CircularProgress />
        </div>
      ) : (
        <Grid container spacing={0.2}>
          {emotionLabels.map((label) => {
            const match = emotions.find((e) => (e.emotion || '').toLowerCase() === label);
            return (
              <Grid item xs={4} key={label}>
                <Card sx={{ p: 0.2, borderRadius: 1 }}>
                  {match ? (
                    <CardMedia
                      component="img"
                      image={match.thumbnailDataUrl || buildThumbnailUrl(match.imageUrl)}
                      alt={match.emotion || label}
                      sx={{
                        width: tileSize,
                        height: tileSize,
                        mx: 'auto',
                        objectFit: 'cover',
                        borderRadius: 1.5,
                      }}
                    />
                  ) : (
                    <div
                      style={{
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
                    </div>
                  )}
                  <CardContent sx={{ p: 0.2, pt: 0.2, '&:last-child': { pb: 0.2 } }}>
                    <Typography
                      variant="caption"
                      textAlign="center"
                      display="block"
                      sx={{ fontSize: '0.55rem', lineHeight: 1 }}
                    >
                      {label}
                    </Typography>
                    <Button
                      size="small"
                      fullWidth
                      variant={match ? 'outlined' : 'contained'}
                      startIcon={<MagicIcon />}
                      onClick={() => handleGenerateEmotion(label)}
                      disabled={generating !== null || generatingAll || !avatarId}
                      sx={{
                        mt: 0.2,
                        minHeight: 20,
                        px: 0.25,
                        fontSize: '0.55rem',
                        lineHeight: 1,
                        '& .MuiButton-startIcon': {
                          marginLeft: 2,
                          marginRight: 2,
                          '& > *:first-of-type': { fontSize: 14 },
                        },
                      }}
                    >
                      {generating === label ? 'Generating...' : match ? 'Update' : 'Generate'}
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </div>
  );
};
