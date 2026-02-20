import React, { useEffect, useState } from 'react';
import {
  Box,
  Container,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { AppHeader } from '@/components/Shared/AppHeader';
import { contactService } from '@/services/contact.service';
import { RootState, AppDispatch } from '@/store';
import { updateUser } from '@/store/authSlice';
import { UserAvatar } from '@/components/Shared/UserAvatar';
import { ZodiacAvatarPicker } from './ZodiacAvatarPicker';
import { useLanguage } from '@/i18n/LanguageContext';
import { AvatarUpload } from '@/components/Avatar/AvatarUpload';
import { EmotionAvatarGallery } from '@/components/Avatar/EmotionAvatarGallery';

// Work around TS2590 (“union type too complex”) from MUI Box typings in some TS versions.
const BoxAny = Box as any;

export const ProfilePage: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [avatarImageId, setAvatarImageId] = useState<string | null>(user?.avatarImageId ?? null);
  const [gender, setGender] = useState<'male' | 'female'>((user?.gender as any) || 'male');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { t } = useLanguage();

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      try {
        const currentUser = await contactService.getCurrentUser();
        setDisplayName(currentUser.displayName || '');
        setBio(currentUser.bio || '');
        setAvatarUrl(currentUser.avatarUrl || '');
        setAvatarImageId(currentUser.avatarImageId ?? null);
        setGender((currentUser.gender as any) || 'male');
        dispatch(updateUser(currentUser));
      } catch (err: any) {
        setError(err.message || t('profile.loadFailed'));
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [dispatch]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const updated = await contactService.updateProfile({
        displayName,
        bio,
        avatarUrl,
        avatarImageId,
        gender,
      });
      dispatch(updateUser(updated));
      setMessage(t('profile.updateSuccess'));
    } catch (err: any) {
      setError(err.message || t('profile.updateFailed'));
    } finally {
      setSaving(false);
    }
  };


  return (
    <BoxAny sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppHeader />
      <Container sx={{ py: 3, pt: 10 }} maxWidth="sm">
        <Typography variant="h5" fontWeight="bold" gutterBottom>
          {t('profile.title')}
        </Typography>

        {loading ? (
          <BoxAny sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </BoxAny>
        ) : (
          <>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            {message && (
              <Alert severity="success" sx={{ mb: 2 }}>
                {message}
              </Alert>
            )}

            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <UserAvatar
                src={avatarUrl}
                gender={gender}
                variant="rounded"
                sx={{ width: 128, height: 128 }}
              />
              <Stack spacing={1}>
                <AvatarUpload
                  currentAvatarUrl={avatarUrl}
                  showPreview={false}
                  onUploadSuccess={async (newAvatarImageId, imageUrl) => {
                    setAvatarImageId(newAvatarImageId);
                    setAvatarUrl(imageUrl);
                    setMessage(t('profile.avatarUploaded'));
                  }}
                />
              </Stack>
            </Stack>

            <BoxAny sx={{ mb: 2 }}>
              <ZodiacAvatarPicker
                disabled={uploading || saving}
                value={avatarImageId ?? undefined}
                onChange={async (selectedAvatarImageId, imageUrl) => {
                  setAvatarUrl(imageUrl);
                  setAvatarImageId(selectedAvatarImageId);
                  setMessage(t('profile.zodiacSelected'));
                }}
              />
            </BoxAny>

            <BoxAny sx={{ mt: 3, mb: 2 }}>
              <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
                AI Avatar Set
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Generate the fixed 3x3 emotion set (angry, smile, sad, etc.) for the selected avatar.
                Regenerating will replace the existing set.
              </Typography>

              {user?.id && avatarImageId && (
                <EmotionAvatarGallery userId={user.id} avatarId={avatarImageId} />
              )}
            </BoxAny>

            <TextField
              fullWidth
              label={t('profile.displayName')}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label={t('profile.bio')}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              multiline
              minRows={3}
              sx={{ mb: 2 }}
            />

            <BoxAny sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('profile.gender')}
              </Typography>
              <ToggleButtonGroup
                value={gender}
                exclusive
                onChange={(_, next) => {
                  if (next === 'male' || next === 'female') setGender(next);
                }}
                size="small"
              >
                <ToggleButton value="male">{t('profile.male')}</ToggleButton>
                <ToggleButton value="female">{t('profile.female')}</ToggleButton>
              </ToggleButtonGroup>
            </BoxAny>

            <Button variant="contained" onClick={handleSave} disabled={saving}>
              {saving ? <CircularProgress size={24} /> : t('profile.saveChanges')}
            </Button>
          </>
        )}
      </Container>
    </BoxAny>
  );
};
