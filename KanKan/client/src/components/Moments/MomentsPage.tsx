import React, { useEffect, useState } from 'react';
import {
  Box,
  Container,
  Typography,
  TextField,
  Button,
  Card,
  CardHeader,
  CardContent,
  CircularProgress,
  Alert,
} from '@mui/material';
import { AppHeader } from '@/components/Shared/AppHeader';
import { UserAvatar } from '@/components/Shared/UserAvatar';
import { momentService, Moment } from '../../services/moment.service';

// Work around TS2590 (“union type too complex”) from MUI Box typings in some TS versions.
const BoxAny = Box as any;

export const MomentsPage: React.FC = () => {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [text, setText] = useState('');
  const [mediaUrls, setMediaUrls] = useState('');
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  const loadMoments = async () => {
    setLoading(true);
    try {
      const data = await momentService.getMoments();
      setMoments(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load moments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMoments();
  }, []);

  const handlePost = async () => {
    if (!text.trim() && !mediaUrls.trim()) return;

    setPosting(true);
    setError('');
    try {
      const urls = mediaUrls
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean);

      await momentService.createMoment({
        text: text.trim() || undefined,
        mediaUrls: urls.length > 0 ? urls : undefined,
        visibility: 'public',
      });

      setText('');
      setMediaUrls('');
      await loadMoments();
    } catch (err: any) {
      setError(err.message || 'Failed to post moment');
    } finally {
      setPosting(false);
    }
  };

  return (
    <BoxAny sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppHeader />
      <Container sx={{ py: 3, pt: 10 }} maxWidth="md">
        <Typography variant="h5" fontWeight="bold" gutterBottom>
          Pa
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <TextField
              fullWidth
              label="What's on your mind?"
              value={text}
              onChange={(e) => setText(e.target.value)}
              multiline
              minRows={3}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Media URLs (comma separated)"
              value={mediaUrls}
              onChange={(e) => setMediaUrls(e.target.value)}
              sx={{ mb: 2 }}
            />
            <Button variant="contained" onClick={handlePost} disabled={posting}>
              {posting ? <CircularProgress size={24} /> : 'Post'}
            </Button>
          </CardContent>
        </Card>

        {loading ? (
          <BoxAny sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </BoxAny>
        ) : moments.length === 0 ? (
          <Typography color="text.secondary">No posts yet.</Typography>
        ) : (
          moments.map((moment) => (
            <Card key={moment.id} sx={{ mb: 2 }}>
              <CardHeader
                avatar={<UserAvatar src={moment.userAvatar} fallbackText={moment.userName} />}
                title={moment.userName}
                subheader={new Date(moment.createdAt).toLocaleString()}
              />
              <CardContent>
                <Typography sx={{ mb: 1 }}>{moment.content?.text}</Typography>
                {moment.content?.mediaUrls?.map((url: string) => (
                  <Typography key={url} variant="body2" color="text.secondary">
                    {url}
                  </Typography>
                ))}
              </CardContent>
            </Card>
          ))
        )}
      </Container>
    </BoxAny>
  );
};
