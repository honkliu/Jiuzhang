import React, { useState, useRef } from 'react';
import { Button, CircularProgress, Typography, Avatar, Box } from '@mui/material';
import { CloudUpload as UploadIcon } from '@mui/icons-material';
import { avatarService } from '@/services/avatar.service';
import { ImageHoverPreview } from '@/components/Shared/ImageHoverPreview';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  };
  const avatarStyle: React.CSSProperties = {
    width: 120,
    height: 120,
    border: '2px solid #e0e0e0',
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload
    try {
      setUploading(true);
      setError(null);

      const result = await avatarService.uploadAvatar(file);

      if (onUploadSuccess) {
        onUploadSuccess(result.avatarImageId, result.imageUrl);
      }

      setUploading(false);
    } catch (err: any) {
      setError(err.message || 'Failed to upload avatar');
      setUploading(false);
    }
  };

  return (
    <div style={containerStyle}>
      {showPreview && (
        <ImageHoverPreview src={previewUrl} alt="Avatar preview">
          {(previewProps) => (
            <BoxAny {...previewProps} sx={{ display: 'inline-flex' }}>
              <Avatar
                src={previewUrl || undefined}
                style={avatarStyle}
              />
            </BoxAny>
          )}
        </ImageHoverPreview>
      )}

      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        style={{ display: 'none' }}
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
    </div>
  );
};
