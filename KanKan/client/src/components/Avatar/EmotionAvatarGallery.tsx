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
import { imageGenerationService, type AvatarResult } from '@/services/imageGeneration.service';

interface EmotionAvatarGalleryProps {
  userId: string;
  avatarId: string;
}

export const EmotionAvatarGallery: React.FC<EmotionAvatarGalleryProps> = ({ userId, avatarId }) => {
  const containerStyle: React.CSSProperties = { padding: 16 };
  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  };
  const errorStyle: React.CSSProperties = { marginBottom: 16 };
  const loadingStyle: React.CSSProperties = { display: 'flex', justifyContent: 'center', padding: 32 };

  const emotionLabels = ['angry', 'smile', 'sad', 'happy', 'crying', 'thinking', 'surprised', 'neutral', 'excited'];

  const [emotions, setEmotions] = useState<AvatarResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadEmotionAvatars();
  }, [userId, avatarId]);

  const loadEmotionAvatars = async (silent: boolean = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      if (!avatarId) {
        setEmotions([]);
        if (!silent) {
          setLoading(false);
        }
        return;
      }
      const results = await imageGenerationService.getResults(avatarId, 'avatar');
      const generated = Array.isArray(results.results) ? (results.results as AvatarResult[]) : [];
      setEmotions(generated);
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
      setGenerating(emotion);
      setError(null);

      const { jobId } = await imageGenerationService.generateAvatarEmotion(avatarId, emotion);

      // Poll for completion
      const result = await imageGenerationService.pollJobUntilComplete(jobId);

      if (result.status === 'completed') {
        // Reload emotion avatars
        await loadEmotionAvatars();
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
      setGeneratingAll(true);
      setError(null);

      const tasks = emotionLabels.map(async (label) => {
        const { jobId } = await imageGenerationService.generateAvatarEmotion(avatarId, label);
        const result = await imageGenerationService.pollJobUntilComplete(jobId);
        if (result.status === 'completed') {
          await loadEmotionAvatars(true);
        }
        return result;
      });

      const results = await Promise.allSettled(tasks);
      const failed = results.filter((result) =>
        result.status === 'rejected' || (result.status === 'fulfilled' && result.value.status !== 'completed'));

      if (failed.length > 0) {
        setError(`${failed.length} of ${emotionLabels.length} generations failed.`);
      }

      await loadEmotionAvatars(true);
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
        <Grid container spacing={2}>
          {emotionLabels.map((label) => {
            const match = emotions.find((e) => (e.emotion || '').toLowerCase() === label);
            return (
              <Grid item xs={4} key={label}>
                <Card>
                  {match ? (
                    <CardMedia
                      component="img"
                      height="140"
                      image={match.imageUrl}
                      alt={match.emotion || label}
                      sx={{ objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      style={{
                        height: 140,
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
                  <CardContent>
                    <Typography variant="caption" textAlign="center" display="block">
                      {label}
                    </Typography>
                    <Button
                      size="small"
                      fullWidth
                      variant={match ? 'outlined' : 'contained'}
                      startIcon={<MagicIcon />}
                      onClick={() => handleGenerateEmotion(label)}
                      disabled={generating !== null || generatingAll || !avatarId}
                      sx={{ mt: 1 }}
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
