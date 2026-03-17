import React, { useEffect, useMemo, useState } from 'react';
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
  Stack,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Delete as DeleteIcon, ThumbUpAltOutlined as ThumbUpIcon, ThumbUpAlt as ThumbUpFilledIcon, ChatBubbleOutline as CommentIcon, Close as CloseIcon } from '@mui/icons-material';
import { AppHeader } from '@/components/Shared/AppHeader';
import { UserAvatar } from '@/components/Shared/UserAvatar';
import { momentService, Moment } from '../../services/moment.service';
import { contactService, User } from '@/services/contact.service';
import { mediaService } from '@/services/media.service';
import { ImageLightbox } from '@/components/Shared/ImageLightbox';
import { ImageHoverPreview } from '@/components/Shared/ImageHoverPreview';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { useLanguage } from '@/i18n/LanguageContext';
import { useSettings } from '@/settings/SettingsContext';

// Work around TS2590 ("union type too complex") from MUI Box typings in some TS versions.
const BoxAny = Box as any;

export const MomentsPage: React.FC = () => {
  const { t } = useLanguage();
  const { formatDateTime } = useSettings();
  const theme = useTheme();
  const isHoverCapable = useMediaQuery('(hover: hover) and (pointer: fine)');
  const { user } = useSelector((state: RootState) => state.auth);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [contacts, setContacts] = useState<User[]>([]);
  const [text, setText] = useState('');
  const [pendingImages, setPendingImages] = useState<Array<{ file: File; previewUrl: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [commentOpenFor, setCommentOpenFor] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{
    images: string[];
    index: number;
    groups?: Array<{ sourceUrl: string; messageId: string; canEdit: boolean }>;
    groupIndex?: number;
  } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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

  const loadContacts = async () => {
    try {
      const data = await contactService.getContacts();
      setContacts(data);
    } catch {
      // Ignore contact errors to keep moments available.
    }
  };

  useEffect(() => {
    loadMoments();
    loadContacts();
  }, []);

  const friendIdSet = useMemo(() => new Set(contacts.map((contact) => contact.id)), [contacts]);

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

  const handleRemovePendingImage = (index: number) => {
    setPendingImages((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const next = prev.filter((_, idx) => idx !== index);
      URL.revokeObjectURL(prev[index].previewUrl);
      return next;
    });
  };

  const handleClearPendingImages = () => {
    pendingImages.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setPendingImages([]);
  };

  const buildMomentGroups = (moment: Moment, urls: string[]) => {
    const isOwner = moment.userId === user?.id;
    const isFriend = friendIdSet.has(moment.userId);
    const canEdit = isOwner || isFriend;
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
      setCommentOpenFor(null);
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
            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
              <Button variant="outlined" onClick={handlePickImages} disabled={posting}>
                {t('moments.addImages')}
              </Button>
              {pendingImages.length > 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
                  {t('moments.imagesSelected')} {pendingImages.length}
                </Typography>
              ) : null}
              {pendingImages.length > 0 ? (
                <Button variant="text" onClick={handleClearPendingImages} disabled={posting}>
                  {t('moments.clearImages')}
                </Button>
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
                    sx={{ position: 'relative' }}
                  >
                    <BoxAny
                      component="img"
                      src={item.previewUrl}
                      alt={t('moments.imagePreview')}
                      sx={{
                        width: '100%',
                        maxHeight: 200,
                        objectFit: 'contain',
                        borderRadius: 2,
                        border: '1px solid rgba(15, 23, 42, 0.12)',
                        display: 'block',
                      }}
                    />
                    <IconButton
                      size="small"
                      aria-label={t('moments.removeImage')}
                      onClick={() => handleRemovePendingImage(idx)}
                      sx={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        bgcolor: 'rgba(15, 23, 42, 0.65)',
                        color: 'white',
                        '&:hover': { bgcolor: 'rgba(15, 23, 42, 0.85)' },
                      }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </BoxAny>
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
          moments.map((moment) => {
            const isLiked = moment.likes?.some((l) => l.userId === user?.id);
            return (
            <Card key={moment.id} sx={{ mb: 2, borderRadius: 0, transform: 'scale(0.9)', transformOrigin: 'top center' }}>
              <CardHeader
                avatar={
                  <UserAvatar
                    src={moment.userAvatar}
                    fallbackText={moment.userName}
                    previewMode={isHoverCapable ? 'hover' : 'tap'}
                    closePreviewOnClick
                  />
                }
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
              <CardContent sx={{ pt: 0, '&:last-child': { pb: 1.5 } }}>
                <Typography sx={{ mb: 1 }}>{moment.content?.text}</Typography>
                {moment.content?.mediaUrls?.length ? (
                  <BoxAny
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 0.5,
                      mt: 1,
                    }}
                  >
                    {moment.content.mediaUrls.map((url: string, idx: number) => (
                      <ImageHoverPreview
                        key={`${moment.id}-${url}-${idx}`}
                        src={url}
                        alt={t('moments.image')}
                        openOnHover={isHoverCapable}
                        openOnLongPress={!isHoverCapable}
                        openOnTap={false}
                      >
                        {(previewProps) => (
                          <BoxAny
                            {...previewProps}
                            component="img"
                            src={url}
                            alt={t('moments.image')}
                            tabIndex={0}
                            onContextMenu={(event: React.MouseEvent<HTMLElement>) => {
                              event.preventDefault();
                            }}
                            onClick={(event: React.MouseEvent<HTMLElement>) => {
                              const urls = moment.content?.mediaUrls || [];
                              setLightbox({
                                images: urls,
                                index: idx,
                                groups: buildMomentGroups(moment, urls),
                                groupIndex: idx,
                              });
                            }}
                            sx={{
                              height: 112,
                              width: 'auto',
                              maxWidth: '100%',
                              objectFit: 'cover',
                              borderRadius: 0,
                              border: '1px solid rgba(15, 23, 42, 0.12)',
                              cursor: 'pointer',
                              transition: 'opacity 0.15s',
                              '&:hover': { opacity: 0.85 },
                              WebkitTouchCallout: 'none',
                              WebkitUserSelect: 'none',
                              userSelect: 'none',
                            }}
                          />
                        )}
                      </ImageHoverPreview>
                    ))}
                  </BoxAny>
                ) : null}

                {/* Likes display */}
                {moment.likes?.length > 0 && (
                  <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                    <ThumbUpFilledIcon sx={{ fontSize: 14, color: 'primary.main' }} />
                    <Typography variant="caption" color="text.secondary">
                      {moment.likes.map((l) => l.userName).join(', ')}
                    </Typography>
                  </BoxAny>
                )}

                {/* Comments display */}
                {moment.comments.length > 0 && (
                  <BoxAny sx={{ mt: 0.5, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 1, px: 1, py: 0.5 }}>
                    {moment.comments.map((c) => (
                      <Typography key={c.id} variant="body2" sx={{ py: 0.25 }}>
                        <Typography component="span" variant="body2" fontWeight={600} color="primary.main">
                          {c.userName}
                        </Typography>
                        {': '}
                        {c.text}
                      </Typography>
                    ))}
                  </BoxAny>
                )}

                {/* Inline comment input (shown when user clicks Comment) */}
                {commentOpenFor === moment.id && (
                  <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ mt: 1 }}>
                    <TextField
                      autoFocus
                      fullWidth
                      size="small"
                      multiline
                      maxRows={6}
                      placeholder={t('moments.addComment')}
                      value={commentDrafts[moment.id] || ''}
                      onChange={(e) =>
                        setCommentDrafts((prev) => ({ ...prev, [moment.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleAddComment(moment.id);
                        }
                      }}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1 } }}
                    />
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => handleAddComment(moment.id)}
                      disabled={actionLoading === moment.id}
                      sx={{ minWidth: 'auto', px: 1.5, whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                      {t('moments.post')}
                    </Button>
                  </Stack>
                )}

                {/* Like + Comment buttons */}
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                  <Button
                    size="small"
                    startIcon={isLiked ? <ThumbUpFilledIcon /> : <ThumbUpIcon />}
                    onClick={() => handleToggleLike(moment.id)}
                    disabled={actionLoading === moment.id}
                  >
                    {moment.likes?.length || 0}
                  </Button>
                  <Button
                    size="small"
                    startIcon={<CommentIcon />}
                    onClick={() => setCommentOpenFor(commentOpenFor === moment.id ? null : moment.id)}
                    disabled={actionLoading === moment.id}
                  >
                    {moment.comments?.length || 0}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
            );
          })
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
