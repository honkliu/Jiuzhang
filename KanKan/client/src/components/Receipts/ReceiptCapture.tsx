import React, { useState, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Box, TextField, MenuItem, Typography, IconButton, Stepper, Step, StepLabel,
  CircularProgress, Alert, Checkbox, Chip,
} from '@mui/material';
import {
  CameraAlt as CameraIcon,
  Close as CloseIcon,
  AutoAwesome as ExtractIcon,
} from '@mui/icons-material';
import {
  receiptService,
  type ReceiptType,
  type CreateReceiptRequest,
  type ReceiptExtractionResult,
} from '@/services/receipt.service';
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
  onClose: () => void;
  onCaptured: () => void;
}

export const ReceiptCapture: React.FC<ReceiptCaptureProps> = ({
  open, defaultType, onClose, onCaptured,
}) => {
  const { t } = useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0); // 0=photo, 1=extracting, 2=review/edit
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');

  // Extracted receipts (multiple from one image)
  const [extractedReceipts, setExtractedReceipts] = useState<ReceiptExtractionResult[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  // Manual form (for single receipt editing or manual entry)
  const [type, setType] = useState<ReceiptType>(defaultType);
  const [category, setCategory] = useState('');
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
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [ocrText, setOcrText] = useState(''); // raw OCR text from extraction

  const categories = type === 'Shopping' ? shoppingCategories : medicalCategories;

  const reset = () => {
    setStep(0); setType(defaultType); setCategory(''); setImageUrl(''); setImagePreview('');
    setMerchantName(''); setHospitalName(''); setDepartment(''); setDoctorName('');
    setPatientName(''); setTotalAmount(''); setReceiptDate(''); setVisitId('');
    setNotes(''); setDiagnosisText('');
    setExtractedReceipts([]); setSelectedIndices(new Set()); setEditingIndex(null);
    setExtractError(''); setOcrText('');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImagePreview(URL.createObjectURL(file));
    setUploading(true);
    setExtractError('');
    try {
      const url = await receiptService.uploadImage(file);
      setImageUrl(url);
      // Auto-extract
      setStep(1);
      setExtracting(true);
      try {
        const { ocrText: rawOcr, receipts: results } = await receiptService.extractFromImage(url);
        setOcrText(rawOcr);
        setExtractedReceipts(results);
        setSelectedIndices(new Set(results.map((_, i) => i)));
        setStep(2);
      } catch (err: any) {
        setExtractError(err?.message || '识别失败，请手动填写');
        // Fall back to manual entry
        setStep(2);
        setExtractedReceipts([]);
      } finally {
        setExtracting(false);
      }
    } catch {
      setExtractError('图片上传失败');
    } finally {
      setUploading(false);
    }
  };

  const toggleSelected = (idx: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const loadToForm = (r: ReceiptExtractionResult, idx: number) => {
    setEditingIndex(idx);
    setType((r.type as ReceiptType) || defaultType);
    setCategory(r.category || '');
    setMerchantName(r.merchantName || '');
    setHospitalName(r.hospitalName || '');
    setDepartment(r.department || '');
    setDoctorName(r.doctorName || '');
    setPatientName(r.patientName || '');
    setTotalAmount(r.totalAmount != null ? String(r.totalAmount) : '');
    setReceiptDate(r.receiptDate || '');
    setNotes(r.notes || '');
    setDiagnosisText(r.diagnosisText || '');
    setStep(3); // edit form
  };

  const saveEditBack = () => {
    if (editingIndex != null && editingIndex < extractedReceipts.length) {
      const updated = [...extractedReceipts];
      updated[editingIndex] = {
        ...updated[editingIndex],
        type, category, merchantName, hospitalName, department, doctorName,
        patientName, totalAmount: totalAmount ? parseFloat(totalAmount) : undefined,
        receiptDate: receiptDate || undefined, notes: notes || undefined,
        diagnosisText: diagnosisText || undefined,
      };
      setExtractedReceipts(updated);
    }
    setEditingIndex(null);
    setStep(2);
  };

  const buildRequest = (r: ReceiptExtractionResult): CreateReceiptRequest => ({
    type: (r.type as ReceiptType) || defaultType,
    category: r.category || 'Other',
    imageUrl,
    rawText: ocrText || undefined,
    receiptDate: r.receiptDate || undefined,
    notes: r.notes || undefined,
    totalAmount: r.totalAmount,
    currency: r.currency || 'CNY',
    merchantName: r.merchantName || undefined,
    hospitalName: r.hospitalName || undefined,
    department: r.department || undefined,
    doctorName: r.doctorName || undefined,
    patientName: r.patientName || undefined,
    diagnosisText: r.diagnosisText || undefined,
    imagingFindings: r.imagingFindings || undefined,
    items: r.items || undefined,
    medications: r.medications || undefined,
    labResults: r.labResults || undefined,
  });

  const handleSubmitAll = async () => {
    setSubmitting(true);
    try {
      if (extractedReceipts.length > 0) {
        const toSubmit = extractedReceipts.filter((_, i) => selectedIndices.has(i));

        // Check for duplicates if we have OCR text
        if (ocrText) {
          const allExisting = await receiptService.list();
          const existingOcrTexts = allExisting
            .map(er => er.rawText)
            .filter((t): t is string => !!t);
          if (existingOcrTexts.length > 0) {
            const isDuplicate = await receiptService.checkDuplicate(ocrText, existingOcrTexts);
            if (isDuplicate) {
              setExtractError('该票据已存在，跳过重复录入');
              setSubmitting(false);
              return;
            }
          }
        }

        for (const r of toSubmit) {
          await receiptService.create(buildRequest(r));
        }
      } else {
        // Manual entry (no extraction results)
        const req: CreateReceiptRequest = {
          type, category, imageUrl,
          receiptDate: receiptDate || undefined,
          notes: notes || undefined,
          totalAmount: totalAmount ? parseFloat(totalAmount) : undefined,
          merchantName: merchantName || undefined,
          hospitalName: hospitalName || undefined,
          department: department || undefined,
          doctorName: doctorName || undefined,
          patientName: patientName || undefined,
          visitId: visitId || undefined,
          diagnosisText: diagnosisText || undefined,
        };
        await receiptService.create(req);
      }
      reset();
      onCaptured();
    } catch { /* ignore */ }
    finally { setSubmitting(false); }
  };

  const handleClose = () => { reset(); onClose(); };

  const receiptLabel = (r: ReceiptExtractionResult, i: number) => {
    const name = r.merchantName || r.hospitalName || `票据 ${i + 1}`;
    const amt = r.totalAmount != null ? ` ¥${r.totalAmount.toFixed(2)}` : '';
    return `${name}${amt}`;
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {t('receipts.capture.title')}
        <IconButton onClick={handleClose}><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: '8px !important' }}>
        <Stepper activeStep={step === 3 ? 2 : step} sx={{ mb: 3 }}>
          <Step><StepLabel>{t('receipts.capture.step1')}</StepLabel></Step>
          <Step><StepLabel>识别中</StepLabel></Step>
          <Step><StepLabel>确认</StepLabel></Step>
        </Stepper>

        {/* Step 0: Take photo */}
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

        {/* Step 1: Extracting */}
        {step === 1 && (
          <BoxAny sx={{ textAlign: 'center', py: 6 }}>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography color="text.secondary">
              <ExtractIcon sx={{ verticalAlign: 'middle', mr: 0.5 }} />
              正在识别票据内容...
            </Typography>
          </BoxAny>
        )}

        {/* Step 2: Review extracted receipts */}
        {step === 2 && (
          <BoxAny>
            {extractError && <Alert severity="warning" sx={{ mb: 2 }}>{extractError}</Alert>}

            {extractedReceipts.length > 0 ? (
              <>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  识别到 {extractedReceipts.length} 张票据，请确认：
                </Typography>
                {extractedReceipts.map((r, i) => (
                  <BoxAny
                    key={i}
                    sx={{
                      display: 'flex', alignItems: 'flex-start', gap: 1, p: 1.5, mb: 1,
                      border: '1px solid', borderColor: selectedIndices.has(i) ? 'primary.main' : 'divider',
                      borderRadius: 2, bgcolor: selectedIndices.has(i) ? 'rgba(25,118,210,0.04)' : 'transparent',
                    }}
                  >
                    <Checkbox
                      size="small"
                      checked={selectedIndices.has(i)}
                      onChange={() => toggleSelected(i)}
                      sx={{ p: 0, mt: 0.2 }}
                    />
                    <BoxAny sx={{ flex: 1, minWidth: 0 }}>
                      <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          label={r.type === 'Medical' ? '医疗' : '购物'}
                          size="small"
                          color={r.type === 'Medical' ? 'primary' : 'success'}
                          variant="outlined"
                        />
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {receiptLabel(r, i)}
                        </Typography>
                      </BoxAny>
                      {r.category && (
                        <Typography variant="caption" color="text.secondary">
                          {t(`receipts.cat.${r.category}`)} {r.receiptDate || ''}
                        </Typography>
                      )}
                      {r.items && r.items.length > 0 && (
                        <Typography variant="caption" color="text.secondary" display="block" noWrap>
                          {r.items.map(it => it.name).join('、')}
                        </Typography>
                      )}
                      {r.medications && r.medications.length > 0 && (
                        <Typography variant="caption" color="text.secondary" display="block" noWrap>
                          {r.medications.map(m => m.name).join('、')}
                        </Typography>
                      )}
                    </BoxAny>
                    <Button size="small" onClick={() => loadToForm(r, i)}>编辑</Button>
                  </BoxAny>
                ))}
              </>
            ) : (
              /* No extraction — show manual form */
              <ManualForm
                type={type} setType={setType}
                category={category} setCategory={setCategory}
                categories={categories}
                merchantName={merchantName} setMerchantName={setMerchantName}
                hospitalName={hospitalName} setHospitalName={setHospitalName}
                department={department} setDepartment={setDepartment}
                doctorName={doctorName} setDoctorName={setDoctorName}
                patientName={patientName} setPatientName={setPatientName}
                totalAmount={totalAmount} setTotalAmount={setTotalAmount}
                receiptDate={receiptDate} setReceiptDate={setReceiptDate}
                visitId={visitId} setVisitId={setVisitId}
                visits={[]}
                notes={notes} setNotes={setNotes}
                diagnosisText={diagnosisText} setDiagnosisText={setDiagnosisText}
                t={t}
              />
            )}
          </BoxAny>
        )}

        {/* Step 3: Edit single extracted receipt */}
        {step === 3 && (
          <ManualForm
            type={type} setType={setType}
            category={category} setCategory={setCategory}
            categories={categories}
            merchantName={merchantName} setMerchantName={setMerchantName}
            hospitalName={hospitalName} setHospitalName={setHospitalName}
            department={department} setDepartment={setDepartment}
            doctorName={doctorName} setDoctorName={setDoctorName}
            patientName={patientName} setPatientName={setPatientName}
            totalAmount={totalAmount} setTotalAmount={setTotalAmount}
            receiptDate={receiptDate} setReceiptDate={setReceiptDate}
            visitId={visitId} setVisitId={setVisitId}
            visits={[]}
            notes={notes} setNotes={setNotes}
            diagnosisText={diagnosisText} setDiagnosisText={setDiagnosisText}
            t={t}
          />
        )}
      </DialogContent>

      <DialogActions>
        {step === 2 && extractedReceipts.length === 0 && (
          <Button onClick={() => setStep(0)}>{t('common.prev')}</Button>
        )}
        {step === 2 && extractedReceipts.length > 0 && (
          <Button onClick={() => setStep(0)}>{t('common.prev')}</Button>
        )}
        {step === 3 && (
          <Button onClick={saveEditBack}>返回列表</Button>
        )}
        <Button onClick={handleClose}>{t('common.cancel')}</Button>
        {step === 2 && (
          <Button
            variant="contained"
            onClick={handleSubmitAll}
            disabled={submitting || (extractedReceipts.length > 0 ? selectedIndices.size === 0 : !category)}
          >
            {submitting ? t('common.loading') : (
              extractedReceipts.length > 0
                ? `保存 ${selectedIndices.size} 张票据`
                : t('common.save')
            )}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

/** Reusable manual form fields */
const ManualForm: React.FC<{
  type: ReceiptType; setType: (v: ReceiptType) => void;
  category: string; setCategory: (v: string) => void;
  categories: string[];
  merchantName: string; setMerchantName: (v: string) => void;
  hospitalName: string; setHospitalName: (v: string) => void;
  department: string; setDepartment: (v: string) => void;
  doctorName: string; setDoctorName: (v: string) => void;
  patientName: string; setPatientName: (v: string) => void;
  totalAmount: string; setTotalAmount: (v: string) => void;
  receiptDate: string; setReceiptDate: (v: string) => void;
  visitId: string; setVisitId: (v: string) => void;
  visits: Array<{ id: string; hospitalName?: string; visitDate?: string }>;
  notes: string; setNotes: (v: string) => void;
  diagnosisText: string; setDiagnosisText: (v: string) => void;
  t: (k: string) => string;
}> = ({
  type, setType, category, setCategory, categories,
  merchantName, setMerchantName,
  hospitalName, setHospitalName, department, setDepartment,
  doctorName, setDoctorName, patientName, setPatientName,
  totalAmount, setTotalAmount, receiptDate, setReceiptDate,
  visitId, setVisitId, visits, notes, setNotes,
  diagnosisText, setDiagnosisText, t,
}) => {
  const BoxAny = Box as any;
  return (
    <BoxAny sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
      <TextField label={t('receipts.detail.date')} type="date" value={receiptDate}
        onChange={e => setReceiptDate(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
      <TextField label={t('receipts.capture.amount')} type="number" value={totalAmount}
        onChange={e => setTotalAmount(e.target.value)} fullWidth
        InputProps={{ startAdornment: <Typography sx={{ mr: 0.5 }}>¥</Typography> }} />
      {type === 'Shopping' && (
        <TextField label={t('receipts.detail.merchant')} value={merchantName}
          onChange={e => setMerchantName(e.target.value)} fullWidth />
      )}
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
  );
};
