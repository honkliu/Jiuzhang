import React, { useEffect, useId, useRef, useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { useLanguage } from '@/i18n/LanguageContext';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  failureMessage: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  color?: 'error' | 'primary';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel,
  failureMessage,
  onConfirm,
  onClose,
  color = 'error',
}) => {
  const { t } = useLanguage();
  const titleId = useId();
  const descriptionId = useId();
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (open) setFailed(false);
  }, [open]);

  const handleClose = () => {
    if (!pendingRef.current) onClose();
  };

  const handleConfirm = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setFailed(false);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error('Confirmed action failed:', error);
      setFailed(true);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      disableEscapeKeyDown={pending}
      maxWidth="xs"
      fullWidth
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent aria-busy={pending}>
        <DialogContentText id={descriptionId} sx={{ whiteSpace: 'pre-line' }}>
          {description}
        </DialogContentText>
        {failed && <Alert severity="error" sx={{ mt: 2 }}>{failureMessage}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={handleClose} disabled={pending}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="contained"
          color={color}
          onClick={handleConfirm}
          disabled={pending}
          startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
