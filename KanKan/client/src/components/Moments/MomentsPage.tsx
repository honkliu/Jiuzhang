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
import { mediaService } from '@/services/media.service';
import { ImageLightbox } from '@/components/Shared/ImageLightbox';
import { ImageHoverPreview } from '@/components/Shared/ImageHoverPreview';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { useLanguage } from '@/i18n/LanguageContext';
import { useSettings } from '@/settings/SettingsContext';

// Work around TS2590 (“union type too complex”) from MUI Box typings in some TS versions.
const BoxAny = Box as any;

export const MomentsPage: React.FC = () => {
  const { t } = useLanguage();
  const { formatDateTime } = useSettings();
  const { user } = useSelector((state: RootState) => state.auth);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [text, setText] = useState('');
  const [pendingImages, setPendingImages] = useState<Array<{ file: File; previewUrl: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{
    images: string[];
    index: number;
    groups?: Array<{ sourceUrl: string; messageId: string; canEdit: boolean }>;
    groupIndex?: number;
  } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const imageClickTimerRef = React.useRef<number | null>(null);

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
    if (!text.trim() && pendingImages.length === 0) return;

    setPosting(true);
    setError('');
    try {
      let uploadedUrls: string[] = [];
      if (pendingImages.length > 0) {
        const uploads = await Promise.all(pendingImages.map((item) => mediaService.upload(item.file)));
        uploadedUrls = uploads.map((item) => item.url).filter(Boolean);
      }

      await momentService.createMoment({
        text: text.trim() || undefined,
        mediaUrls: uploadedUrls.length > 0 ? uploadedUrls : undefined,
        visibility: 'public',
      });

      setText('');
      pendingImages.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setPendingImages([]);
      await loadMoments();
    } catch (err: any) {
      setError(err.message || t('moments.postFailed'));
    } finally {
      setPosting(false);
    }
  };

  const handlePickImages = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const images = files.filter((file) => file.type.startsWith('image/'));
    const next = images.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setPendingImages((prev) => [...prev, ...next]);
    event.target.value = '';
  };

  const buildMomentGroups = (moment: Moment, urls: string[]) => {
    const canEdit = moment.userId === user?.id;
    return urls.map((url, idx) => ({
      sourceUrl: url,
      messageId: `moment:${moment.id}:${idx}`,
      canEdit,
    }));
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
            <BoxAny
              component="input"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              title={t('moments.addImages')}
              aria-label={t('moments.addImages')}
              sx={{ display: 'none' }}
              onChange={handleFilesSelected}
            />
            <TextField
              fullWidth
              label={t('moments.whatsOnMind')}
              value={text}
              onChange={(e) => setText(e.target.value)}
              multiline
              minRows={3}
              sx={{ mb: 2 }}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
              <Button variant="outlined" onClick={handlePickImages} disabled={posting}>
                {t('moments.addImages')}
              </Button>
              {pendingImages.length > 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
                  {t('moments.imagesSelected')} {pendingImages.length}
                </Typography>
              ) : null}
            </Stack>
            {pendingImages.length > 0 ? (
              <BoxAny
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
                  gap: 1,
                  mb: 2,
                }}
              >
                {pendingImages.map((item, idx) => (
                  <BoxAny
                    key={`${item.previewUrl}-${idx}`}
                    component="img"
                    src={item.previewUrl}
                    alt={t('moments.imagePreview')}
                    sx={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      objectFit: 'cover',
                      borderRadius: 2,
                      border: '1px solid rgba(15, 23, 42, 0.12)',
                    }}
                  />
                ))}
              </BoxAny>
            ) : null}
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
                subheader={formatDateTime(moment.createdAt)}
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
                {moment.content?.mediaUrls?.length ? (
                  <BoxAny
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                      gap: 1,
                      mt: 1,
                    }}
                  >
                    {moment.content.mediaUrls.map((url: string, idx: number) => (
                      <ImageHoverPreview
                        key={`${moment.id}-${url}-${idx}`}
                        src={url}
                        alt={t('moments.image')}
                        openOnHover={false}
                        openOnLongPress={false}
                        openOnDoubleClick
                        closeOnTriggerClickWhenOpen
                      >
                        {(previewProps) => (
                          <BoxAny
                            {...previewProps}
                            component="img"
                            src={url}
                            alt={t('moments.image')}
                            onClick={(event: React.MouseEvent<HTMLElement>) => {
                              previewProps.onClick?.(event);
                              if (event.defaultPrevented) return;
                              if (imageClickTimerRef.current) {
                                window.clearTimeout(imageClickTimerRef.current);
                              }
                              imageClickTimerRef.current = window.setTimeout(() => {
                                const urls = moment.content?.mediaUrls || [];
                                setLightbox({
                                  images: urls,
                                  index: idx,
                                  groups: buildMomentGroups(moment, urls),
                                  groupIndex: idx,
                                });
                                imageClickTimerRef.current = null;
                              }, 220);
                            }}
                            onDoubleClick={(event: React.MouseEvent<HTMLElement>) => {
                              if (imageClickTimerRef.current) {
                                window.clearTimeout(imageClickTimerRef.current);
                                imageClickTimerRef.current = null;
                              }
                              previewProps.onDoubleClick?.(event);
                            }}
                            sx={{
                              width: '100%',
                              aspectRatio: '1 / 1',
                              objectFit: 'cover',
                              borderRadius: 2,
                              border: '1px solid rgba(15, 23, 42, 0.12)',
                              cursor: 'pointer',
                            }}
                          />
                        )}
                      </ImageHoverPreview>
                    ))}
                  </BoxAny>
                ) : null}

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
      {lightbox ? (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          groups={lightbox.groups}
          initialGroupIndex={lightbox.groupIndex}
          open
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </BoxAny>
  );
};
