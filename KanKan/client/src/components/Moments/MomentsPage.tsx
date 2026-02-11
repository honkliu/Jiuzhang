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
  IconButton,
  Divider,
  Stack,
} from '@mui/material';
import { Delete as DeleteIcon, ThumbUpAltOutlined as ThumbUpIcon, ChatBubbleOutline as CommentIcon } from '@mui/icons-material';
import { AppHeader } from '@/components/Shared/AppHeader';
import { UserAvatar } from '@/components/Shared/UserAvatar';
import { momentService, Moment } from '../../services/moment.service';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { useLanguage } from '@/i18n/LanguageContext';

// Work around TS2590 (“union type too complex”) from MUI Box typings in some TS versions.
const BoxAny = Box as any;

export const MomentsPage: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useSelector((state: RootState) => state.auth);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [text, setText] = useState('');
  const [mediaUrls, setMediaUrls] = useState('');
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadMoments = async () => {
    setLoading(true);
    try {
      const data = await momentService.getMoments();
      setMoments(data);
    } catch (err: any) {
      setError(err.message || t('moments.loadFailed'));
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
      setError(err.message || t('moments.postFailed'));
    } finally {
      setPosting(false);
    }
  };

  const updateMomentInState = (updated: Moment) => {
    setMoments((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  };

  const handleToggleLike = async (momentId: string) => {
    setActionLoading(momentId);
    try {
      const updated = await momentService.toggleLike(momentId);
      updateMomentInState(updated);
    } catch (err: any) {
      setError(err.message || t('moments.likeFailed'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddComment = async (momentId: string) => {
    const draft = (commentDrafts[momentId] || '').trim();
    if (!draft) return;
    setActionLoading(momentId);
    try {
      const updated = await momentService.addComment(momentId, draft);
      updateMomentInState(updated);
      setCommentDrafts((prev) => ({ ...prev, [momentId]: '' }));
    } catch (err: any) {
      setError(err.message || t('moments.commentFailed'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (momentId: string) => {
    const label = t('moments.deleteConfirm');
    if (!window.confirm(label)) return;
    setActionLoading(momentId);
    try {
      await momentService.deleteMoment(momentId);
      setMoments((prev) => prev.filter((m) => m.id !== momentId));
    } catch (err: any) {
      setError(err.message || t('moments.deleteFailed'));
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <BoxAny sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppHeader />
      <Container sx={{ py: 3, pt: 10 }} maxWidth="md">
        <Typography variant="h5" fontWeight="bold" gutterBottom>
          {t('Pa')}
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
              label={t('moments.whatsOnMind')}
              value={text}
              onChange={(e) => setText(e.target.value)}
              multiline
              minRows={3}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label={t('moments.mediaUrls')}
              value={mediaUrls}
              onChange={(e) => setMediaUrls(e.target.value)}
              sx={{ mb: 2 }}
            />
            <Button variant="contained" onClick={handlePost} disabled={posting}>
              {posting ? <CircularProgress size={24} /> : t('moments.post')}
            </Button>
          </CardContent>
        </Card>

        {loading ? (
          <BoxAny sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </BoxAny>
        ) : moments.length === 0 ? (
          <Typography color="text.secondary">{t('moments.empty')}</Typography>
        ) : (
          moments.map((moment) => (
            <Card key={moment.id} sx={{ mb: 2 }}>
              <CardHeader
                avatar={<UserAvatar src={moment.userAvatar} fallbackText={moment.userName} />}
                title={moment.userName}
                subheader={new Date(moment.createdAt).toLocaleString()}
                action={
                  moment.userId === user?.id ? (
                    <IconButton
                      aria-label={t('moments.delete')}
                      onClick={() => handleDelete(moment.id)}
                      disabled={actionLoading === moment.id}
                      size="small"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  ) : null
                }
              />
              <CardContent>
                <Typography sx={{ mb: 1 }}>{moment.content?.text}</Typography>
                {moment.content?.mediaUrls?.map((url: string) => (
                  <Typography key={url} variant="body2" color="text.secondary">
                    {url}
                  </Typography>
                ))}

                <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 2 }}>
                  <Button
                    size="small"
                    startIcon={<ThumbUpIcon />}
                    onClick={() => handleToggleLike(moment.id)}
                    disabled={actionLoading === moment.id}
                  >
                    {t('moments.like')} ({moment.likes?.length || 0})
                  </Button>
                  <Button size="small" startIcon={<CommentIcon />} disabled>
                    {t('moments.comment')} ({moment.comments?.length || 0})
                  </Button>
                </Stack>

                <Divider sx={{ my: 2 }} />

                {moment.comments.length > 0 && (
                  <Stack spacing={1} sx={{ mb: 2 }}>
                    {moment.comments.map((c) => (
                      <Stack key={c.id} direction="row" spacing={1} alignItems="flex-start">
                        <UserAvatar
                          src={c.userAvatar}
                          fallbackText={c.userName}
                          sx={{ width: 28, height: 28 }}
                        />
                        <BoxAny>
                          <Typography variant="body2" fontWeight={600}>
                            {c.userName}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {c.text}
                          </Typography>
                        </BoxAny>
                      </Stack>
                    ))}
                  </Stack>
                )}

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="stretch">
                  <TextField
                    fullWidth
                    size="small"
                    label={t('moments.addComment')}
                    value={commentDrafts[moment.id] || ''}
                    onChange={(e) =>
                      setCommentDrafts((prev) => ({ ...prev, [moment.id]: e.target.value }))
                    }
                  />
                  <Button
                    variant="outlined"
                    onClick={() => handleAddComment(moment.id)}
                    disabled={actionLoading === moment.id}
                  >
                    {t('moments.send')}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ))
        )}
      </Container>
    </BoxAny>
  );
};
