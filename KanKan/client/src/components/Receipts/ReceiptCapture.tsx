import React, { useEffect, useRef, useState } from 'react';
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
import {
  type ExtractedReceiptDraft,
  RECEIPT_MAP_PROMPT,
  RECEIPT_OCR_PROMPT,
  buildCreateReceiptRequestFromDraft,
  evaluateReceiptDraftDedup,
  extractReceiptDraftsFromImage,
} from '@/services/legacyReceiptExtraction.service';
import { useLanguage } from '@/i18n/LanguageContext';
import { formatDateZhCN } from '@/utils/date';

const BoxAny = Box as any;

const shoppingCategories = ['Supermarket', 'Restaurant', 'OnlineShopping', 'Other'];
const medicalCategories = [
  'Registration', 'Diagnosis', 'Prescription', 'LabResult',
  'ImagingResult', 'PaymentReceipt', 'DischargeNote', 'Other',
];

const normalizeCurrencyCode = (value?: string) => {
  const next = value?.trim();
  if (!next) return undefined;

  const upper = next.toUpperCase();
  switch (upper) {
    case '$':
    case 'US$':
    case 'USD':
      return 'USD';
    case '€':
    case 'EUR':
      return 'EUR';
    case '£':
    case 'GBP':
      return 'GBP';
    case '¥':
    case 'JPY':
    case 'JPYEN':
      return 'JPY';
    case '￥':
    case 'RMB':
    case 'CNY':
    case 'CNYEN':
      return 'CNY';
    default:
      return upper;
  }
};

const inferCurrencyFromText = (value?: string) => {
  const next = value?.trim();
  if (!next) return undefined;

  if (/(?:\bUSD\b|US\$|\$)/i.test(next)) return 'USD';
  if (/(?:\bEUR\b|€)/i.test(next)) return 'EUR';
  if (/(?:\bGBP\b|£)/i.test(next)) return 'GBP';
  if (/(?:\bJPY\b|日元)/i.test(next)) return 'JPY';
  if (/(?:\bCNY\b|\bRMB\b|人民币|元|￥)/i.test(next)) return 'CNY';

  return undefined;
};

const currencySymbol = (currency?: string) => {
  switch (normalizeCurrencyCode(currency)) {
    case 'USD': return '$';
    case 'EUR': return '€';
    case 'GBP': return '£';
    case 'JPY': return '¥';
    case 'CNY':
    default:
      return '¥';
  }
};

const parseAmount = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/[^0-9.-]/g, '');
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const inferTaxAmount = (record: any) => {
  const direct = [record.taxAmount, record.tax, record.salesTax, record.vat, record.gst]
    .map(parseAmount)
    .find((value): value is number => value != null && value >= 0);

  if (direct != null) return direct;

  const totalAmount = parseAmount(record.totalAmount);
  const items = Array.isArray(record.items) ? record.items : [];
  const subtotal = items.reduce((sum: number, item: any) => {
    const totalPrice = parseAmount(item?.totalPrice);
    if (totalPrice != null) return sum + totalPrice;

    const unitPrice = parseAmount(item?.unitPrice);
    const quantity = parseAmount(item?.quantity);
    if (unitPrice != null && quantity != null) return sum + (unitPrice * quantity);
    if (unitPrice != null) return sum + unitPrice;
    return sum;
  }, 0);

  if (totalAmount == null || subtotal <= 0) return undefined;

  const diff = roundMoney(totalAmount - subtotal);
  if (diff > 0 && diff <= totalAmount * 0.25) {
    return diff;
  }

  return undefined;
};

const toText = (value: unknown): string | undefined => {
  if (Array.isArray(value)) {
    const parts: string[] = value
      .map(item => toText(item))
      .filter((item): item is string => !!item);
    return parts.length > 0 ? parts.join('\n') : undefined;
  }
  if (typeof value === 'string') {
    const next = value.trim();
    return next || undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
};

const unwrapMappedRecords = (value: any): any[] => {
  if (Array.isArray(value)) {
    return value.flatMap(item => unwrapMappedRecords(item));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  if (Array.isArray(value.visits)) {
    const header = value.document_header ?? {};
    return value.visits.map((visit: any) => {
      const visitHeader = visit?.document_header ?? header;
      const visitInfo = visit?.visit_info ?? {};
      const clinical = visit?.clinical_data ?? {};
      const diagnosisText = toText(clinical.diagnosis);
      const treatmentText = toText(clinical.treatment_plan);
      const presentIllness = toText(clinical.present_illness);
      const chiefComplaint = toText(clinical.chief_complaint);
      const auxiliary = toText(clinical.auxiliary_examination);
      const notes = [
        toText(visitHeader.document_type),
        chiefComplaint,
        presentIllness,
        auxiliary,
        treatmentText,
      ].filter((item): item is string => !!item).join('\n');

      return {
        type: 'Medical',
        category: 'Diagnosis',
        hospitalName: toText(visitHeader.hospital_name),
        department: toText(visitInfo.department),
        doctorName: toText(clinical.physician_signature),
        patientName: toText(visitHeader.patient_name),
        currency: toText(value.currency),
        receiptDate: toText(visitInfo.visit_date),
        notes: notes || undefined,
        diagnosisText,
      };
    });
  }

  return [value];
};

const splitMarkdownReceipts = (markdown: string): string[] => {
  const normalized = markdown.trim();
  if (!normalized) return [];

  const blocks = normalized
    .split(/\n\s*---+\s*\n/g)
    .map(block => block.trim())
    .filter(Boolean);

  return blocks.length > 0 ? blocks : [normalized];
};

const normalizeMatchText = (value?: string) => value?.replace(/\s+/g, '').trim();

const pickMarkdownBlock = (blocks: string[], record: ReceiptExtractionResult, index: number, expectedCount: number): string | undefined => {
  if (blocks.length === 0) return undefined;
  if (blocks.length === 1) return expectedCount === 1 || index === 0 ? blocks[0] : undefined;
  if (blocks.length < expectedCount && index >= blocks.length) return undefined;

  const date = normalizeMatchText(record.receiptDate);
  const hospital = normalizeMatchText(record.hospitalName);
  const department = normalizeMatchText(record.department);
  const patient = normalizeMatchText(record.patientName);

  const scored = blocks.map((block, blockIndex) => {
    const compact = normalizeMatchText(block) || '';
    let score = 0;
    if (date && compact.includes(date)) score += 5;
    if (hospital && compact.includes(hospital)) score += 2;
    if (department && compact.includes(department)) score += 2;
    if (patient && compact.includes(patient)) score += 1;
    return { block, blockIndex, score };
  });

  const best = scored
    .sort((left, right) => right.score - left.score || left.blockIndex - right.blockIndex)[0];

  if (best && best.score > 0) return best.block;
  return blocks[index] || blocks[0];
};

const pickRawJsonBlock = (blocks: string[], index: number, record: any): string | undefined => {
  if (blocks.length === 0) {
    try {
      return JSON.stringify(record, null, 2);
    } catch {
      return undefined;
    }
  }

  return blocks[index] || blocks[0];
};

type DedupEvaluationResult = {
  selectedCount: number;
  duplicateCount: number;
  toCreate: ExtractedReceiptDraft[];
  debugOutput: string;
};

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
  const [extractError, setExtractError] = useState('');

  // Extracted receipts (multiple from one image)
  const [extractedReceipts, setExtractedReceipts] = useState<ExtractedReceiptDraft[]>([]);
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
  const [ocrText, setOcrText] = useState(''); // markdown for display
  const [rawJson, setRawJson] = useState(''); // raw JSON for dedup
  const [step1Raw, setStep1Raw] = useState('');
  const [step2Raw, setStep2Raw] = useState('');
  const [showDebugOutput, setShowDebugOutput] = useState(false);
  const [dedupDebugOutput, setDedupDebugOutput] = useState('');
  const [dedupDebugLoading, setDedupDebugLoading] = useState(false);
  const [dedupEvaluation, setDedupEvaluation] = useState<DedupEvaluationResult | null>(null);

  const categories = type === 'Shopping' ? shoppingCategories : medicalCategories;

  const reset = () => {
    setStep(0); setType(defaultType); setCategory(''); setImageUrl(''); setImagePreview('');
    setMerchantName(''); setHospitalName(''); setDepartment(''); setDoctorName('');
    setPatientName(''); setTotalAmount(''); setReceiptDate(''); setVisitId('');
    setNotes(''); setDiagnosisText('');
    setExtractedReceipts([]); setSelectedIndices(new Set()); setEditingIndex(null);
    setExtractError(''); setOcrText(''); setRawJson(''); setStep1Raw(''); setStep2Raw('');
    setShowDebugOutput(false); setDedupDebugOutput(''); setDedupDebugLoading(false);
    setDedupEvaluation(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImagePreview(URL.createObjectURL(file));
    setUploading(true);
    setExtractError('');
    setDedupDebugOutput('');
    setDedupEvaluation(null);
    try {
      const url = await receiptService.uploadImage(file);
      setImageUrl(url);
      // Auto-extract
      setStep(1);
      try {
        const result = await extractReceiptDraftsFromImage(url);
        setStep1Raw(result.step1Raw || '');
        setStep2Raw(result.step2Raw || '');
        setOcrText(result.markdown);
        setRawJson(result.rawJson);

        const parsed = result.drafts;
        setExtractedReceipts(parsed);
        setSelectedIndices(new Set(parsed.map((_, i) => i)));
        setStep(2);
      } catch (err: any) {
        const msg = err?.response?.data || err?.message || '识别失败，请手动填写';
        setExtractError(typeof msg === 'string' ? msg : JSON.stringify(msg));
        // Fall back to manual entry
        setStep(2);
        setExtractedReceipts([]);
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

  const loadToForm = (r: ExtractedReceiptDraft, idx: number) => {
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

  useEffect(() => {
    if (step !== 2 || extractedReceipts.length === 0) {
      setDedupEvaluation(null);
      setDedupDebugOutput('');
      setDedupDebugLoading(false);
      return;
    }

    const toSubmit = extractedReceipts.filter((_, i) => selectedIndices.has(i));
    if (toSubmit.length === 0) {
      setDedupEvaluation({ selectedCount: 0, duplicateCount: 0, toCreate: [], debugOutput: 'selectedCount: 0' });
      setDedupDebugOutput('selectedCount: 0');
      setDedupDebugLoading(false);
      return;
    }

    let cancelled = false;
    setDedupDebugLoading(true);
    setDedupEvaluation(null);

    (async () => {
      try {
        const result = await evaluateReceiptDraftDedup(toSubmit, ocrText, rawJson, imageUrl);
        if (cancelled) return;
        const debugOutput = [
          `selectedCount: ${toSubmit.length}`,
          `predictedCreateCount: ${result.toCreate.length}`,
          `duplicateCount: ${result.duplicateCount}`,
        ].join('\n');
        setDedupEvaluation({
          selectedCount: toSubmit.length,
          duplicateCount: result.duplicateCount,
          toCreate: result.toCreate,
          debugOutput,
        });
        setDedupDebugOutput(debugOutput);
      } finally {
        if (!cancelled) {
          setDedupDebugLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step, extractedReceipts, selectedIndices, ocrText, rawJson]);

  const handleToggleDebugOutput = () => {
    const next = !showDebugOutput;
    setShowDebugOutput(next);
  };

  const handleSubmitAll = async () => {
    setSubmitting(true);
    try {
      if (extractedReceipts.length > 0) {
        if (dedupDebugLoading) {
          setExtractError('正在执行去重，请稍候');
          setSubmitting(false);
          return;
        }

        if (!dedupEvaluation) {
          setExtractError('去重结果尚未就绪，请稍候');
          setSubmitting(false);
          return;
        }

        let savedCount = 0;
        for (const receipt of dedupEvaluation.toCreate) {
          await receiptService.create(buildCreateReceiptRequestFromDraft(imageUrl, receipt));
          savedCount += 1;
        }

        if (savedCount === 0 && dedupEvaluation.duplicateCount > 0) {
          setShowDebugOutput(true);
          setExtractError('所选票据都已存在，已跳过重复录入');
          setSubmitting(false);
          return;
        }

        if (dedupEvaluation.duplicateCount > 0) {
          setShowDebugOutput(true);
          setExtractError(`已跳过 ${dedupEvaluation.duplicateCount} 张重复票据，保存 ${savedCount} 张新票据`);
          onCaptured();
          setSubmitting(false);
          return;
        }

        if (showDebugOutput) {
          setExtractError(`已保存 ${savedCount} 张票据，去重调试信息已更新`);
          onCaptured();
          setSubmitting(false);
          return;
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
    const amt = r.totalAmount != null && r.totalAmount !== 0 ? ` ${currencySymbol(r.currency)}${r.totalAmount.toFixed(2)}` : '';
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
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              aria-label={t('receipts.capture.takePhoto')}
              onChange={handleFileChange}
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

            {/* Debug: Step 1 & 2 raw outputs */}
            <BoxAny sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ cursor: 'pointer' }}
                onClick={handleToggleDebugOutput}>
                🔍 调试信息（点击展开/收起）
              </Typography>
              <BoxAny sx={{ display: showDebugOutput ? 'block' : 'none' }}>
                <BoxAny component="pre" sx={{ mt: 1, p: 1, bgcolor: '#f5f5f5', borderRadius: 1, maxHeight: 500, overflow: 'auto', fontSize: '0.7rem', whiteSpace: 'pre-wrap', m: 0 }}>
{`===== Step 1 Input =====
${RECEIPT_OCR_PROMPT}

===== Step 1 Output =====
${step1Raw || ocrText || '(empty)'}

===== Step 2 Input =====
${RECEIPT_MAP_PROMPT}

以下是OCR提取的数据：
${rawJson !== '[]' ? rawJson : ocrText}

===== Step 2 Output =====
${step2Raw || JSON.stringify(extractedReceipts, null, 2) || '(empty)'}

===== Dedup Output =====
${dedupDebugLoading ? '(running...)' : (dedupDebugOutput || '(not run yet)')}`}
                </BoxAny>
              </BoxAny>
            </BoxAny>

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
            disabled={submitting || dedupDebugLoading || (extractedReceipts.length > 0 ? selectedIndices.size === 0 : !category)}
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
                  {v.hospitalName || '?'} - {formatDateZhCN(v.visitDate) || '?'}
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
