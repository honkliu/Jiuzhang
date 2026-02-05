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
import { mediaService } from '@/services/media.service';
import { UserAvatar } from '@/components/Shared/UserAvatar';

export const ProfilePage: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [gender, setGender] = useState<'male' | 'female'>((user?.gender as any) || 'male');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      try {
        const currentUser = await contactService.getCurrentUser();
        setDisplayName(currentUser.displayName || '');
        setBio(currentUser.bio || '');
        setAvatarUrl(currentUser.avatarUrl || '');
        setGender((currentUser.gender as any) || 'male');
        dispatch(updateUser(currentUser));
      } catch (err: any) {
        setError(err.message || 'Failed to load profile');
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
      const updated = await contactService.updateProfile({ displayName, bio, avatarUrl, gender });
      dispatch(updateUser(updated));
      setMessage('Profile updated successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarSelected = async (file: File | null) => {
    if (!file) return;
    try {
      setUploading(true);
      setError('');
      const upload = await mediaService.upload(file);
      setAvatarUrl(upload.url);
      setMessage('Avatar uploaded. Click Save Changes to apply.');
    } catch (err: any) {
      setError(err.message || 'Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppHeader />
      <Container sx={{ py: 3, pt: 10 }} maxWidth="sm">
        <Typography variant="h5" fontWeight="bold" gutterBottom>
          Profile
        </Typography>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
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
                sx={{ width: 72, height: 72 }}
              />
              <Stack spacing={1}>
                <Button
                  variant="outlined"
                  component="label"
                  disabled={uploading || saving}
                >
                  {uploading ? <CircularProgress size={18} /> : 'Upload Avatar'}
                  <input
                    hidden
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleAvatarSelected(e.target.files?.[0] || null)}
                  />
                </Button>
                <Button
                  variant="text"
                  disabled={uploading || saving || !avatarUrl}
                  onClick={() => setAvatarUrl('')}
                >
                  Remove Avatar
                </Button>
              </Stack>
            </Stack>

            <TextField
              fullWidth
              label="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              multiline
              minRows={3}
              sx={{ mb: 2 }}
            />

            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Gender
              </Typography>
              <ToggleButtonGroup
                value={gender}
                exclusive
                onChange={(_, next) => {
                  if (next === 'male' || next === 'female') setGender(next);
                }}
                size="small"
              >
                <ToggleButton value="male">Male</ToggleButton>
                <ToggleButton value="female">Female</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Button variant="contained" onClick={handleSave} disabled={saving}>
              {saving ? <CircularProgress size={24} /> : 'Save Changes'}
            </Button>
          </>
        )}
      </Container>
    </Box>
  );
};
