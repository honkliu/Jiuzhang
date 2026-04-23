import React, { useState, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Button, Typography, Paper, IconButton, CircularProgress,
  Alert, Step, StepLabel, Stepper,
  Chip, TextField, Tabs, Tab,
} from '@mui/material';
import {
  Close as CloseIcon, CheckCircle as CheckIcon,
  AutoAwesome as ExtractIcon, ExpandMore as ExpandIcon,
  Restore as RestoreIcon,
} from '@mui/icons-material';
import {
  photoService,
  type BatchExtractResult,
  type PhotoDto,
} from '@/services/photo.service';

/** Receipt item in the confirmation step — user can edit these fields */
interface ConfirmReceipt {
  photoId: string;
  photoImageUrl?: string;
  type: string;
  category: string;
  merchantName?: string;
  hospitalName?: string;
  department?: string;
  doctorName?: string;
  patientName?: string;
  sourcePhotoId?: string; // Phase 5: primary photo ID
  additionalPhotoIds?: string[]; // Phase 5: additional page photos
  medicalRecordNumber?: string; // Phase 5: 病案号
  insuranceType?: string; // Phase 5: 医保类型
  diagnosisText?: string; // Phase 5: 诊断文本
  outpatientNumber?: string;
  totalAmount?: number;
  currency?: string;
  receiptDate?: string;
  notes?: string;
  rawText?: string;
  items?: Array<{ name: string; quantity?: number; unit?: string; unitPrice?: number; totalPrice?: number; category?: string }>;
  medications?: Array<{ name: string; dosage?: string; frequency?: string; days?: number; quantity?: number; price?: number }>;
  labResults?: Array<{ name: string; value?: string; unit?: string; referenceRange?: string; status?: string }>;
}

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
  const [step, setStep] = useState(0); // 0=preview, 1=extracting, 2=confirm, 3=done
  const [results, setResults] = useState<BatchExtractResult[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmReceipts, setConfirmReceipts] = useState<ConfirmReceipt[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [editingReceipt, setEditingReceipt] = useState<number | null>(null);

  const steps = ['选择照片', 'OCR 识别', '确认票据', '完成'];

  const handleStart = useCallback(async () => {
    if (selectedPhotoIds.length === 0) return;
    setStep(1);
    setErrors([]);

    try {
      const response = await photoService.batchExtract(selectedPhotoIds);
      setResults(response.results);

      // Flatten all parsed receipts into the confirm list
      const allReceipts: ConfirmReceipt[] = [];
      for (const r of response.results) {
        if (r.parsedReceipts) {
          for (const pr of r.parsedReceipts) {
            allReceipts.push({
              photoId: r.photoId,
              photoImageUrl: r.photoImageUrl,
              type: pr.type || 'Shopping',
              category: pr.category || '',
              merchantName: pr.merchantName,
              hospitalName: pr.hospitalName,
              department: pr.department,
              doctorName: pr.doctorName,
              patientName: pr.patientName,
              sourcePhotoId: r.photoId, // Phase 5: default to photoId
              medicalRecordNumber: pr.medicalRecordNumber, // Phase 5
              insuranceType: pr.insuranceType, // Phase 5
              diagnosisText: pr.diagnosisText, // Phase 5
              totalAmount: pr.totalAmount,
              currency: pr.currency || 'CNY',
              receiptDate: pr.receiptDate,
              notes: pr.notes,
              rawText: pr.rawText,
              items: pr.items,
              medications: pr.medications,
              labResults: pr.labResults,
            });
          }
        }
      }
      setConfirmReceipts(allReceipts);
      setStep(2);
    } catch (e: any) {
      setErrors([e?.message || 'Batch extract failed']);
      setStep(0);
    }
  }, [selectedPhotoIds]);

  const handleSave = async () => {
    try {
      const savedReceipts = confirmReceipts.filter(r => r.totalAmount != null && r.totalAmount! > 0);
      if (savedReceipts.length === 0) {
        setErrors(['没有有效的票据可以保存']);
        return;
      }

      await photoService.saveConfirmed(savedReceipts);
      setStep(3);
    } catch (e: any) {
      setErrors([e?.message || 'Save failed']);
    }
  };

  const handleReset = () => {
    setStep(0);
    setResults([]);
    setErrors([]);
    setConfirmReceipts([]);
    setActiveTab(0);
    setEditingReceipt(null);
  };

  const handleUpdateReceipt = (index: number, field: string, value: any) => {
    setConfirmReceipts(prev => {
      const next = [...prev];
      (next[index] as any)[field] = value;
      return next;
    });
  };

  const handleDiscardReceipt = (index: number) => {
    setConfirmReceipts(prev => prev.filter((_, i) => i !== index));
    if (editingReceipt === index) setEditingReceipt(null);
    else if (editingReceipt! > index) setEditingReceipt(editingReceipt! - 1);
  };

  const handlePhotoName = (photoId: string): string => {
    const photo = selectedPhotos.find(p => p.id === photoId);
    return photo?.fileName || photoId.slice(0, 12);
  };

  // Group receipts by photo for tab display
  const receiptsByPhoto: Record<string, Array<{ receipt: ConfirmReceipt; index: number }>> = {};
  confirmReceipts.forEach((r, i) => {
    if (!receiptsByPhoto[r.photoId]) receiptsByPhoto[r.photoId] = [];
    receiptsByPhoto[r.photoId].push({ receipt: r, index: i });
  });

  const handleClose = () => {
    if (step === 3) {
      onSaved();
    } else {
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ExtractIcon color="primary" />
            <Typography variant="h6">批量 OCR 提取</Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
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
              已选择 {selectedPhotoIds.length} 张照片,点击"开始提取"启动 OCR。
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {selectedPhotos.map((p) => (
                <Chip
                  key={p.id}
                  label={p.fileName}
                  size="small"
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
            <Typography variant="h6" sx={{ mb: 1 }}>OCR 识别中...</Typography>
            <Typography variant="body2" color="text.secondary">
              正在分析 {selectedPhotoIds.length} 张照片，请稍候...
            </Typography>
          </Box>
        )}

        {/* Step 2: Confirm receipts */}
        {step === 2 && (
          <Box>
            {errors.length > 0 && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {errors.map((e, i) => <div key={i}>{e}</div>)}
              </Alert>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                共提取 {confirmReceipts.length} 条票据
              </Typography>
              {editingReceipt !== null && (
                <Chip label="编辑中" size="small" color="info" />
              )}
            </Box>

            {/* Tabs by photo */}
            {Object.keys(receiptsByPhoto).length > 1 && (
              <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2 }}>
                {Object.keys(receiptsByPhoto).map((photoId) => (
                  <Tab
                    key={photoId}
                    label={handlePhotoName(photoId)}
                    data-photo-id={photoId}
                  />
                ))}
              </Tabs>
            )}

            {/* Receipt accordion */}
            <Box sx={{ maxHeight: 600, overflow: 'auto' }}>
              {(() => {
                const photoIds = Object.keys(receiptsByPhoto);
                const currentPhotoId = Object.keys(receiptsByPhoto)[activeTab] || photoIds[0];
                const currentReceipts = receiptsByPhoto[currentPhotoId] || [];

                if (currentReceipts.length === 0) return (
                  <Typography variant="body2" color="text.secondary">该照片无提取结果</Typography>
                );

                return currentReceipts.map(({ receipt, index }) => (
                  <ReceiptEditItem
                    key={index}
                    receipt={receipt}
                    isEditing={editingReceipt === index}
                    onToggleEdit={() => editingReceipt === index ? setEditingReceipt(null) : setEditingReceipt(index)}
                    onUpdate={(field: string, value: any) => handleUpdateReceipt(index, field, value)}
                    onDiscard={() => handleDiscardReceipt(index)}
                    photoName={handlePhotoName(receipt.photoId)}
                    photoImageUrl={receipt.photoImageUrl}
                  />
                ));
              })()}
            </Box>
          </Box>
        )}

        {/* Step 3: Done */}
        {step === 3 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CheckIcon color="success" sx={{ fontSize: 60, mb: 2 }} />
            <Typography variant="h6" sx={{ mb: 1 }}>票据已保存</Typography>
            <Typography variant="body2" color="text.secondary">
              成功保存 {confirmReceipts.length} 条票据到数据库
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        {step === 0 && (
          <>
            <Button onClick={onClose}>取消</Button>
            <Button variant="contained" startIcon={<ExtractIcon />} onClick={handleStart}>
              开始提取
            </Button>
          </>
        )}
        {step === 1 && (
          <Button onClick={handleReset}>取消</Button>
        )}
        {step === 2 && (
          <>
            <Button onClick={handleReset}>重新提取</Button>
            <Button variant="contained" startIcon={<CheckIcon />} onClick={handleSave}>
              确认保存 ({confirmReceipts.filter(r => r.totalAmount != null && r.totalAmount! > 0).length} 条)
            </Button>
          </>
        )}
        {step === 3 && (
          <Button variant="contained" onClick={onSaved}>完成</Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

/** Individual receipt edit item */
const ReceiptEditItem: React.FC<{
  receipt: ConfirmReceipt;
  isEditing: boolean;
  onToggleEdit: () => void;
  onUpdate: (field: string, value: any) => void;
  onDiscard: () => void;
  photoName: string;
  photoImageUrl?: string;
}> = ({ receipt, isEditing, onToggleEdit, onUpdate, onDiscard, photoName, photoImageUrl }) => {
  return (
    <Paper sx={{ mb: 1, borderRadius: 2, overflow: 'hidden' }}>
      <Box
        sx={{
          p: 2, display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer',
          bgcolor: receipt.totalAmount != null && receipt.totalAmount! > 0 ? 'rgba(7,193,96,0.03)' : 'rgba(255,0,0,0.03)',
        }}
        onClick={onToggleEdit}
      >
        {/* Photo thumbnail */}
        {photoImageUrl && (
          <img
            src={photoImageUrl}
            alt={photoName}
            style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 4 }}
          />
        )}
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Chip size="small" label={receipt.type} color="primary" variant="outlined" />
            {receipt.merchantName && (
              <Typography variant="body2" fontWeight={500}>{receipt.merchantName}</Typography>
            )}
            {receipt.hospitalName && (
              <Typography variant="body2" fontWeight={500}>{receipt.hospitalName}</Typography>
            )}
          </Box>
          <Typography variant="caption" color="text.secondary">
            {photoName}
            {receipt.totalAmount != null && ` • ¥${receipt.totalAmount}`}
            {receipt.receiptDate && ` • ${receipt.receiptDate}`}
          </Typography>
        </Box>
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); onToggleEdit(); }}>
          <ExpandIcon />
        </IconButton>
      </Box>

      {/* Expanded edit form */}
      {isEditing && (
        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Chip size="small" label={receipt.type} color="primary" />
            {receipt.category && <Chip size="small" label={receipt.category} variant="outlined" />}
            {receipt.type === 'Medical' && (
              <Chip size="small" label="医疗票据" color="warning" variant="outlined" />
            )}
          </Box>

          <TextField
            fullWidth label="类型" size="small"
            value={receipt.type}
            onChange={(e) => onUpdate('type', e.target.value)}
            sx={{ mb: 1 }}
          />

          <TextField
            fullWidth label="商户名称" size="small"
            value={receipt.merchantName || ''}
            onChange={(e) => onUpdate('merchantName', e.target.value)}
            sx={{ mb: 1 }}
          />

          <TextField
            fullWidth label="医院名称" size="small"
            value={receipt.hospitalName || ''}
            onChange={(e) => onUpdate('hospitalName', e.target.value)}
            sx={{ mb: 1 }}
          />

          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth label="金额" size="small" type="number"
              value={receipt.totalAmount ?? ''}
              onChange={(e) => onUpdate('totalAmount', parseFloat(e.target.value) || 0)}
            />
            <TextField
              fullWidth label="日期" size="small" type="date"
              value={receipt.receiptDate || ''}
              onChange={(e) => onUpdate('receiptDate', e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Box>

          {/* Phase 5: 医疗票据字段 */}
          {receipt.type === 'Medical' && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: 'primary.main' }}>医疗字段</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  fullWidth label="科室" size="small"
                  value={receipt.department || ''}
                  onChange={(e) => onUpdate('department', e.target.value)}
                />
                <TextField
                  fullWidth label="患者" size="small"
                  value={receipt.patientName || ''}
                  onChange={(e) => onUpdate('patientName', e.target.value)}
                />
              </Box>
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <TextField
                  fullWidth label="医生" size="small"
                  value={receipt.doctorName || ''}
                  onChange={(e) => onUpdate('doctorName', e.target.value)}
                />
                <TextField
                  fullWidth label="挂号号/就诊号" size="small"
                  value={receipt.outpatientNumber || ''}
                  onChange={(e) => onUpdate('outpatientNumber', e.target.value)}
                />
              </Box>
              <TextField
                fullWidth label="病案号" size="small"
                value={receipt.medicalRecordNumber || ''}
                onChange={(e) => onUpdate('medicalRecordNumber', e.target.value)}
                sx={{ mt: 1 }}
                helperText="病案号/住院号, 格式如 B2026001"
              />
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <TextField
                  fullWidth label="医保类型" size="small"
                  value={receipt.insuranceType || ''}
                  onChange={(e) => onUpdate('insuranceType', e.target.value)}
                  placeholder="城镇职工/居民/新农合/自费"
                />
              </Box>
              <TextField
                fullWidth label="诊断文本" size="small"
                multiline
                rows={2}
                value={receipt.diagnosisText || ''}
                onChange={(e) => onUpdate('diagnosisText', e.target.value)}
                sx={{ mt: 1 }}
              />
            </Box>
          )}

          {receipt.items && receipt.items.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" fontWeight={600}>商品明细 ({receipt.items.length})</Typography>
              <Box sx={{ maxHeight: 100, overflow: 'auto' }}>
                {receipt.items.map((item, i) => (
                  <Typography key={i} variant="caption" color="text.secondary" display="block">
                    - {item.name} {item.totalPrice != null ? `¥${item.totalPrice}` : ''}
                  </Typography>
                ))}
              </Box>
            </Box>
          )}

          {receipt.medications && receipt.medications.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" fontWeight={600}>药品明细 ({receipt.medications.length})</Typography>
              <Box sx={{ maxHeight: 100, overflow: 'auto' }}>
                {receipt.medications.map((med, i) => (
                  <Typography key={i} variant="caption" color="text.secondary" display="block">
                    - {med.name} {med.dosage ? `(${med.dosage})` : ''}
                  </Typography>
                ))}
              </Box>
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 1, mt: 2, justifyContent: 'flex-end' }}>
            <Button size="small" color="error" onClick={onDiscard}>丢弃</Button>
            <Button size="small" variant="contained" onClick={onToggleEdit}>完成编辑</Button>
          </Box>
        </Box>
      )}
    </Paper>
  );
};

export default BatchExtractDialog;
