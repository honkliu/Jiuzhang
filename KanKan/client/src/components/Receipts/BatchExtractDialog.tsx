import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Button, Typography, Paper, IconButton, CircularProgress,
  Alert, Step, StepLabel, Stepper,
  Chip,
} from '@mui/material';
import {
  Close as CloseIcon, CheckCircle as CheckIcon,
  AutoAwesome as ExtractIcon,
  Restore as RestoreIcon,
} from '@mui/icons-material';
import {
  photoService,
  type BatchExtractResult,
  type PhotoDto,
} from '@/services/photo.service';
import { runLegacyReceiptExtractionForPhoto } from '@/services/legacyReceiptExtraction.service';

interface BatchExtractDialogProps {
  open: boolean;
  selectedPhotoIds: string[];
  selectedPhotos: PhotoDto[];
  onClose: () => void;
  onSaved: () => void;
}

export const BatchExtractDialog: React.FC<BatchExtractDialogProps> = ({
  open, selectedPhotoIds, selectedPhotos, onClose, onSaved,
}) => {
  const dialogPaperSx = {
    bgcolor: '#ffffff',
    backgroundImage: 'none',
  } as const;
  const [step, setStep] = useState(0); // 0=preview, 1=extracting, 2=done
  const [results, setResults] = useState<BatchExtractResult[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const steps = ['选择照片', '同步提取', '完成'];

  useEffect(() => {
    if (!open) {
      abortControllerRef.current = null;
      setStep(0);
      setResults([]);
      setErrors([]);
      setCurrentIndex(0);
    }
  }, [open]);

  const savedReceiptCount = useMemo(
    () => results.reduce((sum, result) => sum + (result.savedReceiptCount ?? 0), 0),
    [results],
  );

  const newReceiptCount = useMemo(
    () => results.reduce((sum, result) => sum + (result.newReceiptCount ?? 0), 0),
    [results],
  );

  const overwrittenReceiptCount = useMemo(
    () => results.reduce((sum, result) => sum + (result.overwrittenReceiptCount ?? 0), 0),
    [results],
  );

  const failedResults = useMemo(
    () => results.filter((result) => result.status === 'Failed' || result.status === 'Partial'),
    [results],
  );

  const isAbortError = (error: unknown) => {
    const candidate = error as { code?: string; name?: string; message?: string } | undefined;
    return candidate?.code === 'ERR_CANCELED' || candidate?.name === 'CanceledError' || candidate?.message === 'canceled';
  };

  const handleStart = useCallback(async () => {
    if (selectedPhotoIds.length === 0) return;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setStep(1);
    setResults([]);
    setErrors([]);
    setCurrentIndex(0);

    try {
      const nextResults: BatchExtractResult[] = [];

      for (const [index, photoId] of selectedPhotoIds.entries()) {
        setCurrentIndex(index + 1);

        const photo = selectedPhotos.find((item) => item.id === photoId);
        if (!photo) {
          nextResults.push({
            photoId,
            status: 'Failed',
            error: 'Photo not found',
            savedReceiptCount: 0,
            newReceiptCount: 0,
            overwrittenReceiptCount: 0,
            savedReceiptIds: [],
            parsedReceipts: [],
          });
          setResults([...nextResults]);
          continue;
        }

        const result = await runLegacyReceiptExtractionForPhoto(photo, abortController.signal);
        nextResults.push(result);
        setResults([...nextResults]);
      }

      setStep(2);
    } catch (e: unknown) {
      if (isAbortError(e)) {
        return;
      }

      const message = (e as { message?: string } | undefined)?.message || 'Batch extract failed';
      setErrors([message]);
      setStep(0);
    } finally {
      setCurrentIndex(0);
      abortControllerRef.current = null;
    }
  }, [selectedPhotoIds, selectedPhotos]);

  const currentPhoto = useMemo(
    () => (currentIndex > 0 ? selectedPhotos[currentIndex - 1] : null),
    [currentIndex, selectedPhotos],
  );

  const handleCancel = () => {
    if (step === 1) {
      abortControllerRef.current?.abort();
      onSaved();
      return;
    }

    if (step === 2) {
      onSaved();
      return;
    }

    onClose();
  };

  const handleClose = () => {
    handleCancel();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth PaperProps={{ sx: dialogPaperSx }}>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ExtractIcon color="primary" />
            <Typography variant="h6">同步提取票据</Typography>
          </Box>
          <IconButton onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Stepper activeStep={step} sx={{ mb: 3, pb: 1 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* Step 0: Preview selected photos */}
        {step === 0 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              已选择 {selectedPhotoIds.length} 张照片。系统会按顺序一张张处理，每张处理完成后立即写回数据库，再继续下一张。
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              如果中途取消，已经处理并落库的照片不会丢失；尚未开始的照片不会继续处理。
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {selectedPhotos.map((p, index) => (
                <Chip
                  key={p.id}
                  label={`${photoService.getDisplayLabel(p, index)}${(p.extractedReceiptCount ?? 0) > 0 ? ' · 再次提取' : ' · 首次提取'}`}
                  size="small"
                  color={(p.extractedReceiptCount ?? 0) > 0 ? 'warning' : 'default'}
                  variant="outlined"
                  sx={{ borderRadius: 1 }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Step 1: Extracting */}
        {step === 1 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CircularProgress size={50} sx={{ mb: 2 }} />
            <Typography variant="h6" sx={{ mb: 1 }}>
              {currentIndex > 0 ? `${currentIndex}/${selectedPhotoIds.length} 提取中...` : '同步提取中...'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              后端正在按顺序逐张处理 {selectedPhotoIds.length} 张照片。当前请求结束前，客户端会一直等待。
            </Typography>
            {currentPhoto ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                当前照片：{photoService.getDisplayLabel(currentPhoto, currentIndex - 1)}
              </Typography>
            ) : null}
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              现在取消时，已经完成的照片仍会保留在数据库中。
            </Typography>
            {results.length > 0 ? (
              <Box sx={{ mt: 1.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  已完成 {results.length}/{selectedPhotoIds.length}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  新写入 {newReceiptCount} 条，覆盖 {overwrittenReceiptCount} 条
                </Typography>
              </Box>
            ) : null}
          </Box>
        )}

        {/* Step 2: Done */}
        {step === 2 && (
          <Box>
            {errors.length > 0 && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {errors.map((e, i) => <div key={i}>{e}</div>)}
              </Alert>
            )}

            <Alert severity={failedResults.length === 0 ? 'success' : 'warning'} sx={{ mb: 2 }}>
              已处理 {results.length} 张照片，写回 {savedReceiptCount} 条票据。
              其中新写入 {newReceiptCount} 条，覆盖 {overwrittenReceiptCount} 条。
              {failedResults.length > 0 ? ` 其中 ${failedResults.length} 张存在失败或部分失败。` : ''}
            </Alert>

            <Box sx={{ display: 'grid', gap: 1.25 }}>
              {results.map((result) => {
                const photoIndex = selectedPhotos.findIndex((item) => item.id === result.photoId);
                const photo = photoIndex >= 0 ? selectedPhotos[photoIndex] : undefined;
                const label = photo ? photoService.getDisplayLabel(photo, photoIndex) : '照片';

                return (
                  <Paper key={result.photoId} sx={{ p: 1.5, borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
                      <Box>
                        <Typography variant="body2" fontWeight={600}>{label}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          状态: {result.status} · 识别 {result.parsedReceipts?.length ?? 0} 条 · 写回 {result.savedReceiptCount ?? 0} 条 · 新写入 {result.newReceiptCount ?? 0} 条 · 覆盖 {result.overwrittenReceiptCount ?? 0} 条
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        color={result.status === 'Completed' ? 'success' : result.status === 'Partial' ? 'warning' : 'error'}
                        label={result.status === 'Completed' ? '完成' : result.status === 'Partial' ? '部分完成' : '失败'}
                      />
                    </Box>
                    {result.error ? (
                      <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
                        {result.error}
                      </Typography>
                    ) : null}
                  </Paper>
                );
              })}
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        {step === 0 && (
          <>
            <Button onClick={handleCancel}>取消</Button>
            <Button variant="contained" startIcon={<ExtractIcon />} onClick={handleStart}>
              开始提取
            </Button>
          </>
        )}
        {step === 1 && (
          <Button color="warning" startIcon={<RestoreIcon />} onClick={handleCancel}>取消并刷新</Button>
        )}
        {step === 2 && (
          <Button variant="contained" startIcon={<CheckIcon />} onClick={onSaved}>完成</Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default BatchExtractDialog;
