import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Container,
  Typography,
  TextField,
  Button,
  Card,
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
import { UserProfilePopover } from '@/components/Shared/UserProfilePopover';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { useLanguage } from '@/i18n/LanguageContext';

// Work around TS2590 ("union type too complex") from MUI Box typings in some TS versions.
const BoxAny = Box as any;

const momentCardSx = {
  borderRadius: 0,
};

const momentImageSx = {
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
};

const momentAvatarSize = 44;
const momentMetaRowHeight = 20;

const momentContentSurfaceSx = {
  borderRadius: '0px',
  backgroundColor: 'rgba(15, 23, 42, 0.04)',
};

const composerActionButtonSx = {
  minWidth: 96,
  height: 36,
  px: 2,
};

const momentFeedbackButtonSx = {
  minHeight: 28,
  px: 0.5,
  py: 0.25,
};

const momentDeleteButtonSx = {
  width: 24,
  height: 24,
  p: 0.25,
};

type MomentMediaGridProps = {
  momentId: string;
  mediaUrls: string[];
  imageAlt: string;
  isHoverCapable: boolean;
  onOpenImage: (index: number) => void;
  onRemoveImage?: (index: number) => void;
};

const MomentMediaGrid: React.FC<MomentMediaGridProps> = ({
  momentId,
  mediaUrls,
  imageAlt,
  isHoverCapable,
  onOpenImage,
  onRemoveImage,
}) => {
  if (!mediaUrls.length) return null;

  return (
    <BoxAny
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 0.5,
        mt: 1,
      }}
    >
      {mediaUrls.map((url, idx) => (
        <BoxAny key={`${momentId}-${url}-${idx}`} sx={{ position: 'relative' }}>
          <ImageHoverPreview
            src={url}
            alt={imageAlt}
            openOnHover={isHoverCapable}
            openOnLongPress={!isHoverCapable}
            openOnTap={false}
          >
            {(previewProps) => (
              <BoxAny
                {...previewProps}
                component="img"
                src={url}
                alt={imageAlt}
                tabIndex={0}
                onContextMenu={(event: React.MouseEvent<HTMLElement>) => {
                  event.preventDefault();
                }}
                onClick={() => onOpenImage(idx)}
                sx={momentImageSx}
              />
            )}
          </ImageHoverPreview>
          {onRemoveImage ? (
            <IconButton
              size="small"
              aria-label={imageAlt}
              onClick={(event) => {
                event.stopPropagation();
                onRemoveImage(idx);
              }}
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
          ) : null}
        </BoxAny>
      ))}
    </BoxAny>
  );
};

type MomentCardLayoutProps = {
  avatar: React.ReactNode;
  meta: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
};

const MomentCardLayout: React.FC<MomentCardLayoutProps> = ({ avatar, meta, action, children }) => (
  <BoxAny
    sx={{
      display: 'grid',
      gridTemplateColumns: `${momentAvatarSize}px minmax(0, 1fr) auto`,
      gridTemplateRows: `${momentMetaRowHeight}px auto`,
      gridTemplateAreas: `
        "avatar meta action"
        "avatar body body"
      `,
      columnGap: 1.5,
      rowGap: 0,
      alignItems: 'start',
    }}
  >
    <BoxAny sx={{ gridArea: 'avatar' }}>{avatar}</BoxAny>
    <BoxAny sx={{ gridArea: 'meta', minWidth: 0, lineHeight: 1.2, alignSelf: 'start' }}>{meta}</BoxAny>
    {action ? <BoxAny sx={{ gridArea: 'action', justifySelf: 'end' }}>{action}</BoxAny> : null}
    <BoxAny sx={{ gridArea: 'body', minWidth: 0, mt: '4px' }}>{children}</BoxAny>
  </BoxAny>
);

const formatMomentTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');

  return `${year}/${month}/${day} ${hours}:${minutes}`;
};

export const MomentsPage: React.FC = () => {
  const { t } = useLanguage();
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
  const [profilePopover, setProfilePopover] = useState<{ anchorEl: HTMLElement; userId: string } | null>(null);
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
  const draftMediaUrls = useMemo(() => pendingImages.map((item) => item.previewUrl), [pendingImages]);
  const draftAuthorName = user?.displayName || user?.handle || '';
  const draftTimestamp = formatMomentTimestamp(new Date().toISOString());

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
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Card sx={{ mb: 3, ...momentCardSx }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <MomentCardLayout
              avatar={
              <UserAvatar
                src={user?.avatarUrl}
                fallbackText={draftAuthorName}
                previewMode={isHoverCapable ? 'hover' : 'tap'}
                closePreviewOnClick
                sx={{ width: momentAvatarSize, height: momentAvatarSize }}
              />
              }
              meta={
                <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
                  <BoxAny component="span" sx={{ fontWeight: 600 }}>
                    {draftAuthorName}
                  </BoxAny>
                  <BoxAny component="span" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                    {` - ${draftTimestamp}`}
                  </BoxAny>
                </Typography>
              }
            >
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
            <BoxAny
              sx={{
                mb: 1,
                px: 0,
                pt: 0,
                pb: 0,
                ...momentContentSurfaceSx,
                transition: 'background-color 0.15s ease, box-shadow 0.15s ease',
                '&:focus-within': {
                  backgroundColor: 'rgba(15, 23, 42, 0.06)',
                },
              }}
            >
              <BoxAny
                component="textarea"
                value={text}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
                placeholder={t('moments.whatsOnMind')}
                rows={3}
                sx={{
                  width: '100%',
                  minHeight: 84,
                  border: 'none',
                  outline: 'none',
                  resize: 'vertical',
                  background: 'transparent',
                  color: 'inherit',
                  font: 'inherit',
                  fontSize: theme.typography.body1.fontSize,
                  lineHeight: theme.typography.body1.lineHeight,
                  p: 0,
                  m: 0,
                  display: 'block',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  '&::placeholder': {
                    color: theme.palette.text.secondary,
                    opacity: 1,
                  },
                }}
              />
            </BoxAny>

            <MomentMediaGrid
              momentId="draft"
              mediaUrls={draftMediaUrls}
              imageAlt={t('moments.imagePreview')}
              isHoverCapable={isHoverCapable}
              onOpenImage={(index) => setLightbox({ images: draftMediaUrls, index })}
              onRemoveImage={handleRemovePendingImage}
            />

            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1, flexWrap: 'wrap' }}>
              <Button variant="contained" onClick={handlePickImages} disabled={posting} sx={composerActionButtonSx}>
                {t('moments.addImages')}
              </Button>
              {pendingImages.length > 0 ? (
                <Button variant="text" onClick={handleClearPendingImages} disabled={posting}>
                  {t('moments.clearImages')}
                </Button>
              ) : null}
              <Button
                variant="contained"
                onClick={handlePost}
                disabled={posting || (!text.trim() && pendingImages.length === 0)}
                sx={composerActionButtonSx}
              >
                {posting ? <CircularProgress size={24} /> : t('moments.post')}
              </Button>
            </Stack>
            </MomentCardLayout>
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
            <Card key={moment.id} sx={{ mb: 2, ...momentCardSx }}>
              <CardContent sx={{ pt: 1.5, pb: 1, '&:last-child': { pb: 1 } }}>
                <MomentCardLayout
                  avatar={
                  <UserAvatar
                    src={moment.userAvatar}
                    fallbackText={moment.userName}
                    previewMode={isHoverCapable ? 'hover' : 'tap'}
                    closePreviewOnClick
                    sx={{ width: momentAvatarSize, height: momentAvatarSize }}
                  />
                  }
                  meta={
                    <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
                      <BoxAny
                        component="span"
                        sx={{ fontWeight: 600, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                        onClick={(e: React.MouseEvent<HTMLElement>) => setProfilePopover({ anchorEl: e.currentTarget, userId: moment.userId })}
                      >
                        {moment.userName}
                      </BoxAny>
                      <BoxAny component="span" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                        {` - ${formatMomentTimestamp(moment.createdAt)}`}
                      </BoxAny>
                    </Typography>
                  }
                  action={
                  moment.userId === user?.id ? (
                    <IconButton
                      aria-label={t('moments.delete')}
                      onClick={() => handleDelete(moment.id)}
                      disabled={actionLoading === moment.id}
                      size="small"
                      sx={momentDeleteButtonSx}
                    >
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  ) : null
                  }
                >
                <BoxAny
                  sx={{
                    mb: moment.content?.text || moment.content?.mediaUrls?.length ? 1 : 0,
                    px: 0,
                    pt: 0,
                    pb: 0,
                    ...momentContentSurfaceSx,
                  }}
                >
                  {moment.content?.text ? (
                    <Typography sx={{ mb: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {moment.content.text}
                    </Typography>
                  ) : null}
                  <MomentMediaGrid
                    momentId={moment.id}
                    mediaUrls={moment.content?.mediaUrls || []}
                    imageAlt={t('moments.image')}
                    isHoverCapable={isHoverCapable}
                    onOpenImage={(idx) => {
                      const urls = moment.content?.mediaUrls || [];
                      setLightbox({
                        images: urls,
                        index: idx,
                        groups: buildMomentGroups(moment, urls),
                        groupIndex: idx,
                      });
                    }}
                  />
                </BoxAny>

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
                  <BoxAny sx={{ mt: 0.5, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 0, px: 1, py: 0.5 }}>
                    {moment.comments.map((c) => (
                      <Typography key={c.id} variant="body2" sx={{ py: 0.25 }}>
                        <Typography
                          component="span"
                          variant="body2"
                          fontWeight={600}
                          color="primary.main"
                          sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                          onClick={(e: React.MouseEvent<HTMLElement>) => setProfilePopover({ anchorEl: e.currentTarget, userId: c.userId })}
                        >
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
                    sx={momentFeedbackButtonSx}
                  >
                    {moment.likes?.length || 0}
                  </Button>
                  <Button
                    size="small"
                    startIcon={<CommentIcon />}
                    onClick={() => setCommentOpenFor(commentOpenFor === moment.id ? null : moment.id)}
                    disabled={actionLoading === moment.id}
                    sx={momentFeedbackButtonSx}
                  >
                    {moment.comments?.length || 0}
                  </Button>
                </Stack>
                </MomentCardLayout>
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

      <UserProfilePopover
        userId={profilePopover?.userId ?? null}
        anchorEl={profilePopover?.anchorEl ?? null}
        open={!!profilePopover}
        onClose={() => setProfilePopover(null)}
        friendIds={friendIdSet}
        currentUserId={user?.id}
      />
    </BoxAny>
  );
};
