import React, { useState, useRef } from 'react';
import { Button, CircularProgress, Typography, Avatar, Box } from '@mui/material';
import { CloudUpload as UploadIcon } from '@mui/icons-material';
import { avatarService } from '@/services/avatar.service';
import { ImageHoverPreview } from '@/components/Shared/ImageHoverPreview';
import { ImageCropDialog } from '@/components/Avatar/ImageCropDialog';
import { useLanguage } from '@/i18n/LanguageContext';

interface AvatarUploadProps {
  onUploadSuccess?: (avatarImageId: string, imageUrl: string) => void;
  currentAvatarUrl?: string;
  showPreview?: boolean;
}

export const AvatarUpload: React.FC<AvatarUploadProps> = ({
  onUploadSuccess,
  currentAvatarUrl,
  showPreview = true,
}) => {
  const { t } = useLanguage();
  const BoxAny = Box as any;
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentAvatarUrl || null);
  const [error, setError] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onloadend = () => {
      setCropSrc(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  const handleCropConfirm = async (croppedFile: File) => {
    setCropSrc(null);

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(croppedFile);

    try {
      setUploading(true);
      setError(null);
      const result = await avatarService.uploadAvatar(croppedFile);
      if (onUploadSuccess) {
        onUploadSuccess(result.avatarImageId, result.imageUrl);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  const handleCropCancel = () => {
    setCropSrc(null);
  };

  return (
    <BoxAny sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      {showPreview && (
        <ImageHoverPreview src={previewUrl} alt="Avatar preview">
          {(previewProps) => (
            <BoxAny {...previewProps} sx={{ display: 'inline-flex' }}>
              <Avatar
                src={previewUrl || undefined}
                sx={{ width: 120, height: 120, border: '2px solid #e0e0e0' }}
              />
            </BoxAny>
          )}
        </ImageHoverPreview>
      )}

      <BoxAny
        component="input"
        type="file"
        ref={fileInputRef}
        accept="image/*"
        title={t('profile.uploadAvatar')}
        aria-label={t('profile.uploadAvatar')}
        sx={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      <Button
        variant="contained"
        startIcon={uploading ? <CircularProgress size={20} color="inherit" /> : <UploadIcon />}
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? t('profile.uploadingAvatar') : t('profile.uploadAvatar')}
      </Button>

      {error && (
        <Typography color="error" variant="caption">
          {error}
        </Typography>
      )}

      <ImageCropDialog
        open={Boolean(cropSrc)}
        imageSrc={cropSrc || ''}
        onConfirm={handleCropConfirm}
        onCancel={handleCropCancel}
      />
    </BoxAny>
  );
};
