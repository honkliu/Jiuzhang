import React, { useState, useRef } from 'react';
import { Box, Typography, LinearProgress, List, ListItem, ListItemText, Chip } from '@mui/material';
import { CloudUpload, CheckCircle, Error as ErrorIcon } from '@mui/icons-material';
import * as exifr from 'exifr';
import { photoService, type PhotoDto } from '@/services/photo.service';
import { useLanguage } from '@/i18n/LanguageContext';

interface PhotoUploaderProps {
  onComplete?: (photos: PhotoDto[]) => void;
  maxFiles?: number;
}

const PhotoUploader: React.FC<PhotoUploaderProps> = ({ onComplete, maxFiles = 20 }) => {
  const { t } = useLanguage();
  const [files, setFiles] = useState<Array<{ file: File; status: 'pending' | 'uploading' | 'done' | 'error'; error?: string }>>([]);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (fileList: FileList) => {
    const newFiles: typeof files = [];
    for (let i = 0; i < Math.min(fileList.length, maxFiles); i++) {
      newFiles.push({ file: fileList[i], status: 'pending' });
    }
    setFiles(prev => [...prev, ...newFiles]);
    await uploadAll(newFiles);
  };

  const uploadAll = async (fileList: typeof files) => {
    const uploadedPhotos: PhotoDto[] = [];

    for (const f of fileList) {
      if (f.status === 'done') continue;
      f.status = 'uploading';
      setFiles([...fileList]);

      try {
        const metadata = await readImageMetadata(f.file);
        const uploaded = await photoService.upload(f.file, {
          capturedDate: metadata.capturedDate,
          width: metadata.width,
          height: metadata.height,
        });
        uploadedPhotos.push(uploaded);
        f.status = 'done';
        setProgress(Math.round((fileList.filter(x => x.status === 'done').length / fileList.length) * 100));
      } catch (e: unknown) {
        f.status = 'error';
        f.error = (e as Error).message;
      }
      setFiles([...fileList]);
    }

    if (uploadedPhotos.length > 0 && onComplete) {
      onComplete(uploadedPhotos);
    }
  };

  const readImageMetadata = (file: File): Promise<{ capturedDate?: string; width?: number; height?: number }> => {
    const fallbackCapturedDate = file.lastModified ? new Date(file.lastModified).toISOString() : undefined;
    const readDimensions = new Promise<{ width?: number; height?: number }>((resolve) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();

      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({});
      };

      image.src = objectUrl;
    });

    const readCapturedDate = (async () => {
      try {
        const metadata = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate', 'ModifyDate']);
        const rawDate = metadata?.DateTimeOriginal ?? metadata?.CreateDate ?? metadata?.ModifyDate;
        if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) {
          return rawDate.toISOString();
        }
      } catch {
        // Fall back to the file timestamp when EXIF metadata is missing or unreadable.
      }

      return fallbackCapturedDate;
    })();

    return Promise.all([readDimensions, readCapturedDate]).then(([dimensions, capturedDate]) => ({
      ...dimensions,
      capturedDate,
    }));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const statusIcon = (status: string) => {
    if (status === 'done') return <CheckCircle sx={{ fontSize: 16 }} />;
    if (status === 'error') return <ErrorIcon sx={{ fontSize: 16 }} />;
    return <Box sx={{ width: 16 }} />;
  };

  const statusColor = (status: string) => {
    if (status === 'done') return 'success';
    if (status === 'error') return 'error';
    if (status === 'uploading') return 'warning';
    return 'default';
  };

  const statusLabel = (status: string) => {
    if (status === 'done') return t('photos.uploader.success');
    if (status === 'error') return t('photos.uploader.error');
    if (status === 'uploading') return t('photos.uploader.uploading');
    return t('photos.uploader.pending');
  };

  return (
    <Box>
      <Box
        sx={{
          border: '2px dashed #ccc', borderRadius: 2, p: 4,
          textAlign: 'center', cursor: 'pointer', bgcolor: 'rgba(7,193,96,0.04)',
          '&:hover': { bgcolor: 'rgba(7,193,96,0.08)' },
        }}
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <CloudUpload sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
        <Typography variant="body1" fontWeight={500}>{t('photos.uploader.dropHint')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('photos.uploader.supportHint').replace('{max}', String(maxFiles))}</Typography>
        <input ref={inputRef} type="file" multiple accept="image/*" style={{ display: 'none' }}
          onChange={(e) => e.target.files && handleFiles(e.target.files)} />
      </Box>
      {files.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <LinearProgress variant="determinate" value={progress} sx={{ mb: 1, borderRadius: 1 }} />
          <List dense>
            {files.map((f, i) => (
              <ListItem key={i} sx={{ px: 0 }}>
                <ListItemText primary={f.file.name} secondary={`${(f.file.size / 1024).toFixed(1)} KB`} />
                <Chip
                  icon={statusIcon(f.status)}
                  label={statusLabel(f.status)}
                  color={statusColor(f.status) as 'success' | 'error' | 'warning' | 'default'}
                  size="small"
                />
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Box>
  );
};

export default PhotoUploader;
