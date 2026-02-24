import React, { useState } from 'react';
import {
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  Grid,
  Typography,
  LinearProgress,
  Box,
  Button,
} from '@mui/material';
import { AutoAwesome as MagicIcon, Close as CloseIcon } from '@mui/icons-material';
import { imageGenerationService } from '@/services/imageGeneration.service';

interface ImageVariationButtonProps {
  messageId: string;
  mediaUrl: string;
}

export const ImageVariationButton: React.FC<ImageVariationButtonProps> = ({ messageId, mediaUrl }) => {
  const BoxAny = Box as any;
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [variationUrls, setVariationUrls] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleOpen = async () => {
    setOpen(true);

    // Check if variations already exist
    try {
      const existingResults = await imageGenerationService.getResults(messageId, 'chat_image');
      if (existingResults.hasGenerations && Array.isArray(existingResults.results)) {
        setVariationUrls(existingResults.results as string[]);
        return;
      }
    } catch (err) {
      console.error('Failed to check existing variations', err);
    }
  };

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      setProgress(0);
      setError(null);

      const { jobId } = await imageGenerationService.generateChatImageVariations(messageId, mediaUrl, 9);

      // Poll for completion
      const result = await imageGenerationService.pollJobUntilComplete(jobId, (prog) => {
        setProgress(prog);
      });

      if (result.status === 'completed') {
        // Fetch the variations
        const newResults = await imageGenerationService.getResults(messageId, 'chat_image');
        setVariationUrls(Array.isArray(newResults.results) ? (newResults.results as string[]) : []);
        setProgress(100);
      } else {
        setError(result.errorMessage || 'Generation failed');
      }

      setGenerating(false);
    } catch (err: any) {
      setError(err.message || 'Failed to generate variations');
      setGenerating(false);
    }
  };

  return (
    <>
      <IconButton
        size="small"
        onClick={handleOpen}
        sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(255,255,255,0.8)' }}
      >
        <MagicIcon />
      </IconButton>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Image Variations
          <IconButton onClick={() => setOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent>
          {!variationUrls && !generating && (
            <BoxAny sx={{ textAlign: 'center', p: 4 }}>
              <Typography sx={{ mb: 2 }}>Generate AI variations of this image</Typography>
              <Button variant="contained" onClick={handleGenerate} sx={{ fontSize: 16 }}>
                Generate 9 Variations
              </Button>
            </BoxAny>
          )}

          {generating && (
            <BoxAny sx={{ p: 4 }}>
              <LinearProgress variant="determinate" value={progress} />
              <Typography variant="caption" sx={{ mt: 1, display: 'block', textAlign: 'center' }}>
                Generating variations... {progress}%
              </Typography>
            </BoxAny>
          )}

          {error && (
            <Typography color="error" sx={{ textAlign: 'center', p: 2 }}>
              {error}
            </Typography>
          )}

          {variationUrls && variationUrls.length > 0 && (
            <Grid container spacing={2}>
              {variationUrls.map((url, index) => (
                <Grid item xs={4} key={index}>
                  <BoxAny
                    component="img"
                    src={url}
                    alt={`Variation ${index + 1}`}
                    sx={{ width: '100%', height: 'auto', borderRadius: '4px', display: 'block' }}
                  />
                </Grid>
              ))}
            </Grid>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
