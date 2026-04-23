import React, { useState, useRef } from 'react';
import { Box, Typography, LinearProgress, List, ListItem, ListItemText, Chip } from '@mui/material';
import { CloudUpload, CheckCircle, Error as ErrorIcon } from '@mui/icons-material';
import { photoService, type PhotoDto } from '@/services/photo.service';

interface PhotoUploaderProps {
  onComplete?: (photos: PhotoDto[]) => void;
  maxFiles?: number;
}

const PhotoUploader: React.FC<PhotoUploaderProps> = ({ onComplete, maxFiles = 20 }) => {
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
    const items: Array<{ fileName: string; contentType: string; fileSize: number; base64Data: string }> = [];

    for (const f of fileList) {
      if (f.status === 'done') continue;
      f.status = 'uploading';
      setFiles([...fileList]);

      try {
        const base64 = await readFileAsBase64(f.file);
        items.push({
          fileName: f.file.name,
          contentType: f.file.type || 'image/jpeg',
          fileSize: f.file.size,
          base64Data: base64,
        });
        f.status = 'done';
        setProgress(Math.round((fileList.filter(x => x.status === 'done').length / fileList.length) * 100));
      } catch (e: unknown) {
        f.status = 'error';
        f.error = (e as Error).message;
      }
      setFiles([...fileList]);
    }

    if (items.length > 0) {
      try {
        const result = await photoService.uploadBatch(items);
        if (onComplete) onComplete(result.photos);
      } catch (e: unknown) {
        for (const f of fileList) {
          if (f.status === 'done') {
            f.status = 'error';
            f.error = (e as Error).message;
          }
        }
        setFiles([...fileList]);
      }
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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
    if (status === 'done') return '上传成功';
    if (status === 'error') return '失败';
    if (status === 'uploading') return '上传中';
    return '等待中';
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
        <Typography variant="body1" fontWeight={500}>点击选择或拖拽照片到此处</Typography>
        <Typography variant="body2" color="text.secondary">支持 JPG/PNG/HEIC，最多 {maxFiles} 张</Typography>
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
