import React, { useState, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Box, TextField, MenuItem, Typography, IconButton, Stepper, Step, StepLabel,
} from '@mui/material';
import {
  CameraAlt as CameraIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { receiptService, type ReceiptType, type ReceiptVisitDto, type CreateReceiptRequest } from '@/services/receipt.service';
import { useLanguage } from '@/i18n/LanguageContext';

const BoxAny = Box as any;

const shoppingCategories = ['Supermarket', 'Restaurant', 'OnlineShopping', 'Other'];
const medicalCategories = [
  'Registration', 'Diagnosis', 'Prescription', 'LabResult',
  'ImagingResult', 'PaymentReceipt', 'DischargeNote', 'Other',
];

interface ReceiptCaptureProps {
  open: boolean;
  defaultType: ReceiptType;
  visits: ReceiptVisitDto[];
  onClose: () => void;
  onCaptured: () => void;
}

export const ReceiptCapture: React.FC<ReceiptCaptureProps> = ({
  open, defaultType, visits, onClose, onCaptured,
}) => {
  const { t } = useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [type, setType] = useState<ReceiptType>(defaultType);
  const [category, setCategory] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [uploading, setUploading] = useState(false);

  // Form fields
  const [merchantName, setMerchantName] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [department, setDepartment] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [patientName, setPatientName] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [receiptDate, setReceiptDate] = useState('');
  const [visitId, setVisitId] = useState('');
  const [notes, setNotes] = useState('');
  const [diagnosisText, setDiagnosisText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const categories = type === 'Shopping' ? shoppingCategories : medicalCategories;

  const reset = () => {
    setStep(0); setType(defaultType); setCategory(''); setImageUrl(''); setImagePreview('');
    setMerchantName(''); setHospitalName(''); setDepartment(''); setDoctorName('');
    setPatientName(''); setTotalAmount(''); setReceiptDate(''); setVisitId('');
    setNotes(''); setDiagnosisText('');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImagePreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const url = await receiptService.uploadImage(file);
      setImageUrl(url);
      setStep(1);
    } catch { /* ignore */ }
    finally { setUploading(false); }
  };

  const handleSubmit = async () => {
    if (!imageUrl || !category) return;
    setSubmitting(true);
    try {
      const req: CreateReceiptRequest = {
        type,
        category,
        imageUrl,
        receiptDate: receiptDate || undefined,
        notes: notes || undefined,
        totalAmount: totalAmount ? parseFloat(totalAmount) : undefined,
      };
      if (type === 'Shopping') {
        req.merchantName = merchantName || undefined;
      } else {
        req.hospitalName = hospitalName || undefined;
        req.department = department || undefined;
        req.doctorName = doctorName || undefined;
        req.patientName = patientName || undefined;
        req.visitId = visitId || undefined;
        req.diagnosisText = diagnosisText || undefined;
      }
      await receiptService.create(req);
      reset();
      onCaptured();
    } catch { /* ignore */ }
    finally { setSubmitting(false); }
  };

  const handleClose = () => { reset(); onClose(); };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {t('receipts.capture.title')}
        <IconButton onClick={handleClose}><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: '8px !important' }}>
        <Stepper activeStep={step} sx={{ mb: 3 }}>
          <Step><StepLabel>{t('receipts.capture.step1')}</StepLabel></Step>
          <Step><StepLabel>{t('receipts.capture.step2')}</StepLabel></Step>
        </Stepper>

        {step === 0 && (
          <BoxAny sx={{ textAlign: 'center', py: 3 }}>
            {imagePreview ? (
              <BoxAny component="img" src={imagePreview}
                sx={{ maxWidth: '100%', maxHeight: 300, borderRadius: 2, mb: 2 }} />
            ) : (
              <BoxAny sx={{
                border: '2px dashed', borderColor: 'divider', borderRadius: 3,
                py: 6, px: 2, mb: 2,
              }}>
                <CameraIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                <Typography color="text.secondary">{t('receipts.capture.hint')}</Typography>
              </BoxAny>
            )}
            <input
              ref={fileRef} type="file" accept="image/*" capture="environment"
              style={{ display: 'none' }} onChange={handleFileChange}
            />
            <BoxAny sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              <Button variant="contained" startIcon={<CameraIcon />}
                onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? t('common.loading') : t('receipts.capture.takePhoto')}
              </Button>
            </BoxAny>
          </BoxAny>
        )}

        {step === 1 && (
          <BoxAny sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Type & Category */}
            <TextField select label={t('receipts.capture.type')} value={type}
              onChange={e => { setType(e.target.value as ReceiptType); setCategory(''); }} fullWidth>
              <MenuItem value="Shopping">{t('receipts.shopping')}</MenuItem>
              <MenuItem value="Medical">{t('receipts.medical')}</MenuItem>
            </TextField>
            <TextField select label={t('receipts.capture.category')} value={category}
              onChange={e => setCategory(e.target.value)} fullWidth>
              {categories.map(c => (
                <MenuItem key={c} value={c}>{t(`receipts.cat.${c}`)}</MenuItem>
              ))}
            </TextField>

            {/* Common fields */}
            <TextField label={t('receipts.detail.date')} type="date" value={receiptDate}
              onChange={e => setReceiptDate(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
            <TextField label={t('receipts.capture.amount')} type="number" value={totalAmount}
              onChange={e => setTotalAmount(e.target.value)} fullWidth
              InputProps={{ startAdornment: <Typography sx={{ mr: 0.5 }}>¥</Typography> }} />

            {/* Shopping fields */}
            {type === 'Shopping' && (
              <TextField label={t('receipts.detail.merchant')} value={merchantName}
                onChange={e => setMerchantName(e.target.value)} fullWidth />
            )}

            {/* Medical fields */}
            {type === 'Medical' && (
              <>
                <TextField label={t('receipts.medical.hospitalName')} value={hospitalName}
                  onChange={e => setHospitalName(e.target.value)} fullWidth />
                <TextField label={t('receipts.medical.department')} value={department}
                  onChange={e => setDepartment(e.target.value)} fullWidth />
                <TextField label={t('receipts.medical.doctor')} value={doctorName}
                  onChange={e => setDoctorName(e.target.value)} fullWidth />
                <TextField label={t('receipts.medical.patientName')} value={patientName}
                  onChange={e => setPatientName(e.target.value)} fullWidth />
                {visits.length > 0 && (
                  <TextField select label={t('receipts.medical.linkVisit')} value={visitId}
                    onChange={e => setVisitId(e.target.value)} fullWidth>
                    <MenuItem value="">{t('receipts.medical.noVisitLink')}</MenuItem>
                    {visits.map(v => (
                      <MenuItem key={v.id} value={v.id}>
                        {v.hospitalName || '?'} - {v.visitDate ? new Date(v.visitDate).toLocaleDateString('zh-CN') : '?'}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
                {(category === 'Diagnosis' || category === 'DischargeNote') && (
                  <TextField label={t('receipts.medical.diagnosis')} value={diagnosisText}
                    onChange={e => setDiagnosisText(e.target.value)} fullWidth multiline rows={3} />
                )}
              </>
            )}

            <TextField label={t('receipts.detail.notes')} value={notes}
              onChange={e => setNotes(e.target.value)} fullWidth multiline rows={2} />
          </BoxAny>
        )}
      </DialogContent>

      <DialogActions>
        {step === 1 && (
          <Button onClick={() => setStep(0)}>{t('common.prev')}</Button>
        )}
        <Button onClick={handleClose}>{t('common.cancel')}</Button>
        {step === 1 && (
          <Button variant="contained" onClick={handleSubmit} disabled={!category || submitting}>
            {submitting ? t('common.loading') : t('common.save')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
