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
import { authService } from '@/services/auth.service';

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
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
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

  const handleChangePassword = async () => {
    setPasswordSaving(true);
    setError('');
    setMessage('');

    try {
      if (newPassword.length < 8) {
        setError(t('auth.register.passwordLength'));
        return;
      }

      if (currentPassword === newPassword) {
        setError(t('profile.newPasswordDifferent'));
        return;
      }

      const result = await authService.changePassword({
        currentPassword,
        newPassword,
      });

      setCurrentPassword('');
      setNewPassword('');
      setMessage(result.message || t('profile.passwordChanged'));
    } catch (err: any) {
      setError(err.message || t('profile.passwordChangeFailed'));
    } finally {
      setPasswordSaving(false);
    }
  };


  return (
    <BoxAny sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppHeader />
      <Container sx={{ py: 3, pt: 10 }} maxWidth="sm">

        {loading ? (
          <BoxAny sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </BoxAny>
        ) : (
          <>
            <BoxAny
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '160px minmax(0, 1fr)' },
                gap: { xs: 2, md: 3 },
                alignItems: 'start',
                mb: 3,
              }}
            >
              <Stack spacing={1.5} alignItems={{ xs: 'center', md: 'flex-start' }}>
                <Typography variant="h5" fontWeight="bold" sx={{ alignSelf: { xs: 'stretch', md: 'flex-start' } }}>
                  {t('profile.title')}
                </Typography>
                <UserAvatar
                  src={avatarUrl}
                  gender={gender}
                  variant="rounded"
                  sx={{ width: 128, height: 128 }}
                />
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

              <BoxAny>
                <ZodiacAvatarPicker
                  disabled={saving}
                  value={avatarImageId ?? undefined}
                  onChange={async (selectedAvatarImageId, imageUrl) => {
                    setAvatarUrl(imageUrl);
                    setAvatarImageId(selectedAvatarImageId);
                    setMessage(t('profile.zodiacSelected'));
                  }}
                />
              </BoxAny>
            </BoxAny>

            <BoxAny sx={{ mt: 3, mb: 2 }}>
              {user?.id && avatarImageId && (
                <EmotionAvatarGallery userId={user.id} avatarId={avatarImageId} />
              )}
            </BoxAny>

            <TextField
              fullWidth
              label={t('profile.bio')}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              multiline
              minRows={3}
              sx={{ mb: 2 }}
            />

            <BoxAny
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) auto auto' },
                gap: 1.5,
                alignItems: 'center',
                mb: 1,
              }}
            >
              <TextField
                fullWidth
                label={t('profile.displayName')}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                size="small"
              />

              <ToggleButtonGroup
                value={gender}
                exclusive
                onChange={(_, next) => {
                  if (next === 'male' || next === 'female') setGender(next);
                }}
                size="small"
                sx={{
                  justifySelf: { xs: 'stretch', md: 'start' },
                  '& .MuiToggleButton-root': {
                    minWidth: 56,
                    px: 2,
                    whiteSpace: 'nowrap',
                  },
                }}
              >
                <ToggleButton value="male">{t('profile.male')}</ToggleButton>
                <ToggleButton value="female">{t('profile.female')}</ToggleButton>
              </ToggleButtonGroup>

              <Button
                variant="contained"
                onClick={handleSave}
                disabled={saving}
                sx={{
                  minWidth: { xs: '100%', md: 128 },
                  height: 40,
                  justifySelf: { xs: 'stretch', md: 'end' },
                }}
              >
                {saving ? <CircularProgress size={24} /> : '保存'}
              </Button>
            </BoxAny>

            <BoxAny sx={{ mt: 4, pt: 3, borderTop: '1px solid', borderColor: 'divider' }}>
              <BoxAny
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                  mb: 2,
                }}
              >
                <Typography variant="h6">
                  {t('profile.changePassword')}
                </Typography>

                <Button
                  variant="outlined"
                  onClick={handleChangePassword}
                  disabled={passwordSaving}
                  sx={{ minWidth: { xs: 96, md: 128 }, height: 40, flexShrink: 0 }}
                >
                  {passwordSaving ? <CircularProgress size={24} /> : '修改'}
                </Button>
              </BoxAny>

              <BoxAny
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                  gap: 1.5,
                  alignItems: 'start',
                }}
              >
                <TextField
                  fullWidth
                  size="small"
                  type="password"
                  label={t('profile.currentPassword')}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />

                <TextField
                  fullWidth
                  size="small"
                  type="password"
                  label={t('profile.newPassword')}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  helperText={t('auth.register.passwordHint')}
                />
              </BoxAny>
            </BoxAny>

            <BoxAny sx={{ mt: 3 }}>
              {error && (
                <Alert severity="error" sx={{ mb: message ? 1.5 : 0 }}>
                  {error}
                </Alert>
              )}
              {message && (
                <Alert severity="success">
                  {message}
                </Alert>
              )}
            </BoxAny>
          </>
        )}
      </Container>
    </BoxAny>
  );
};
