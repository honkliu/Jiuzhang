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
  type ReceiptDto,
  type ReceiptType,
  type CreateReceiptRequest,
  type ReceiptExtractionResult,
} from '@/services/receipt.service';
import { useLanguage } from '@/i18n/LanguageContext';
import { formatDateZhCN, parseDateInput } from '@/utils/date';

const OCR_PROMPT = `识别图像中的文字、公式或抽取票据、证件、表单中的信息，注意票据有可能是中国，有可能是国外的，因此要在返回的md和json中要包含货币单位和交税信息等。请输出两部分，用===JSON===分隔：第一部分是Markdown格式的票据内容，用于展示,格式等于或接近图像中的文字格式，放在<OMD1></OMD1><OMD2></OMD2>之间。第二部分：JSON格式的原始提取数据，忠实反映图像中识别到的所有字段和数据，不要遗漏任何信息，内容放在<JMD1></JMD1><JMD2></JMD2>之间。因为一个照片里面可能会有多个receipts，<OMD>对应于receipt的数量。<OMD>和<JMD>要对应，内容不要翻译，要对应于原文`;

const MAP_PROMPT = `根据以下OCR提取的票据数据，判断这是医疗票据还是购物票据还是其他类型，然后映射到我们的数据Schema，返回纯JSON数组，不要包含代码块标记。

OCR部分可能会按 <OMD1></OMD1><JMD1></JMD1><OMD2></OMD2><JMD2></JMD2> 这样的编号结构返回多张票据。你必须把每个 JMDn 当作一张独立 receipt 来理解，并输出顶层 JSON 数组，数组顺序必须与 JMD 的编号顺序一致。
绝对不要把不同 JMD 编号的内容合并成一个对象。即使是同一家医院、同一个病案号、同一个人，只要是不同日期、不同页块、不同 receipt，也必须拆成不同对象。

如果一张照片里包含多张票据、多个日期、多个就诊记录、多个文档页块，必须按“每一张独立票据/每一个独立就诊日期”拆成数组里的多条记录，绝对不要把不同日期或不同票据内容合并到同一个对象里。
如果原始OCR里已经有 visits、documents、receipts、pages 等多条结构，也必须展开成顶层 JSON 数组后再返回。
同一家医院、同一个病案号也不能合并，只要 receiptDate / visit_date / 就诊日期 不同，就必须拆成不同对象。

Schema字段说明：
{
  type: "Shopping" | "Medical",
  category: string,  // Shopping时: Supermarket, Restaurant, OnlineShopping, Other; Medical时: Registration, Diagnosis, Prescription, LabResult, ImagingResult, PaymentReceipt, DischargeNote, Other
  merchantName: string,
  hospitalName: string,
  department: string,
  doctorName: string,
  patientName: string,
  totalAmount: number,
  taxAmount: number,  // 税额；如果票据明确显示税额则填入，如果未单独显示但可由totalAmount减去商品小计推导，则填推导值，否则留空
  currency: string,  // 默认CNY
  receiptDate: string,  // YYYY-MM-DD
  outpatientNumber: string,
  medicalInsuranceNumber: string,
  insuranceType: string,
  medicalInsuranceFundPayment: number,
  personalSelfPay: number,
  otherPayments: number,
  personalAccountPayment: number,
  personalOutOfPocket: number,
  cashPayment: number,
  notes: string,  // 报告类型名称等
  diagnosisText: string,
  items: [{ name, quantity, unit, unitPrice, totalPrice }],
  medications: [{ name, dosage, frequency, days, quantity, price }],
  labResults: [{ name, value, unit, referenceRange, status }]  // value为纯数值去掉↑↓，status: High/Low/Normal
}`;

const DEDUP_DATE_WINDOW_DAYS = 30;

const buildDedupPrompt = (newOcrText: string, existingOcrText: string) => `判断以下两张票据是否是同一张票据（即重复录入）。
只需要回答一个JSON：{"isDuplicate": true} 或 {"isDuplicate": false}
不要解释，只返回JSON。

新票据OCR文本：
${newOcrText}

已有票据OCR文本：
${existingOcrText}`;

const BoxAny = Box as any;

const shoppingCategories = ['Supermarket', 'Restaurant', 'OnlineShopping', 'Other'];
const medicalCategories = [
  'Registration', 'Diagnosis', 'Prescription', 'LabResult',
  'ImagingResult', 'PaymentReceipt', 'DischargeNote', 'Other',
];

const stripCodeFences = (value: string) => {
  let next = value.trim();
  if (next.startsWith('```json')) next = next.slice(7);
  else if (next.startsWith('```')) next = next.slice(3);
  if (next.endsWith('```')) next = next.slice(0, -3);
  return next.trim();
};

const extractTaggedBlock = (input: string, tag: 'OMD' | 'JMD') => {
  const openTag = `<${tag}>`;
  const start = input.indexOf(openTag);
  if (start < 0) return null;

  const contentStart = start + openTag.length;
  const closingTags = [`</${tag}>`, `/${tag}>`];
  let end = -1;
  for (const closingTag of closingTags) {
    const candidate = input.indexOf(closingTag, contentStart);
    if (candidate >= 0 && (end < 0 || candidate < end)) {
      end = candidate;
    }
  }

  if (end < 0) {
    return input.substring(contentStart).trim();
  }

  return input.substring(contentStart, end).trim();
};

const extractNumberedTaggedBlocks = (input: string, tag: 'OMD' | 'JMD') => {
  const pattern = new RegExp(`<${tag}(\\d+)>([\\s\\S]*?)<\/${tag}\\1>`, 'g');
  const blocks: Array<{ index: number; content: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    const index = Number(match[1]);
    const content = match[2]?.trim() || '';
    if (Number.isFinite(index)) {
      blocks.push({ index, content });
    }
  }

  return blocks.sort((left, right) => left.index - right.index);
};

const combineRawJsonBlocks = (blocks: string[]) => {
  if (blocks.length === 0) return '';

  try {
    const parsed = blocks.map(block => JSON.parse(stripCodeFences(block)));
    return JSON.stringify(parsed, null, 2);
  } catch {
    return blocks.map(block => stripCodeFences(block)).join('\n\n');
  }
};

const parseOcrContent = (content: string) => {
  const numberedMarkdownBlocks = extractNumberedTaggedBlocks(content, 'OMD');
  const numberedJsonBlocks = extractNumberedTaggedBlocks(content, 'JMD');

  if (numberedMarkdownBlocks.length > 0 || numberedJsonBlocks.length > 0) {
    const markdownBlocks = numberedMarkdownBlocks.map(block => block.content);
    const rawJsonBlocks = numberedJsonBlocks.map(block => stripCodeFences(block.content));
    return {
      markdown: markdownBlocks.join('\n\n---\n\n'),
      rawJson: combineRawJsonBlocks(rawJsonBlocks),
      markdownBlocks,
      rawJsonBlocks,
    };
  }

  const markdown = extractTaggedBlock(content, 'OMD');
  const json = extractTaggedBlock(content, 'JMD');

  if (markdown !== null || json !== null) {
    return {
      markdown: markdown || '',
      rawJson: stripCodeFences(json || ''),
      markdownBlocks: markdown ? [markdown] : [],
      rawJsonBlocks: json ? [stripCodeFences(json)] : [],
    };
  }

  const jsonSep = content.indexOf('===JSON===');
  if (jsonSep >= 0) {
    const mdPart = content.substring(0, jsonSep).trim();
    return {
      markdown: mdPart.replace(/^===Markdown===\s*/, ''),
      rawJson: stripCodeFences(content.substring(jsonSep + '===JSON==='.length)),
      markdownBlocks: [mdPart.replace(/^===Markdown===\s*/, '')],
      rawJsonBlocks: [stripCodeFences(content.substring(jsonSep + '===JSON==='.length))],
    };
  }

  const cleaned = stripCodeFences(content);
  return {
    markdown: content,
    rawJson: cleaned,
    markdownBlocks: content.trim() ? [content] : [],
    rawJsonBlocks: cleaned ? [cleaned] : [],
  };
};

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

type ExtractedReceiptDraft = ReceiptExtractionResult & {
  rawText?: string;
  rawJson?: string;
};

type DedupTextCandidate = {
  text: string;
  source: 'receipt.rawText' | 'ocrText' | 'receipt.rawJson' | 'rawJson' | 'none';
};

type DedupEvaluationResult = {
  selectedCount: number;
  duplicateCount: number;
  toCreate: ExtractedReceiptDraft[];
  debugOutput: string;
};

const getReceiptDedupCandidate = (receipt: ExtractedReceiptDraft, fallbackRawText: string, fallbackRawJson: string): DedupTextCandidate => {
  const values: Array<{ text?: string; source: DedupTextCandidate['source'] }> = [
    { text: receipt.rawText, source: 'receipt.rawText' },
    { text: receipt.rawJson, source: 'receipt.rawJson' },
    { text: fallbackRawText, source: 'ocrText' },
    { text: fallbackRawJson, source: 'rawJson' },
  ];

  for (const value of values) {
    const trimmed = value.text?.trim();
    if (trimmed) {
      return { text: trimmed, source: value.source };
    }
  }

  return { text: '', source: 'none' };
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
        const result = await receiptService.extractFromImage(url, OCR_PROMPT, MAP_PROMPT);
        setStep1Raw(result.step1Raw || '');
        setStep2Raw(result.step2Raw || '');

        // Extract content from raw API response (step1Raw is full API JSON body)
        let s1 = '';
        try {
          const apiResp = JSON.parse(result.step1Raw || '{}');
          const msg = apiResp?.choices?.[0]?.message;
          s1 = msg?.content || '';
        } catch { s1 = result.step1Raw || ''; }

        const parsedStep1 = parseOcrContent(s1);
        const fallbackCurrency =
          inferCurrencyFromText(parsedStep1.rawJson)
          || inferCurrencyFromText(parsedStep1.markdown)
          || inferCurrencyFromText(s1);
        setOcrText(parsedStep1.markdown);
        setRawJson(parsedStep1.rawJson);

        // Parse Step 2: extract our schema JSON from mapping output
        let s2 = result.step2Raw || '[]';
        s2 = stripCodeFences(s2);

        let parsed: ExtractedReceiptDraft[] = [];
        try {
          const raw = JSON.parse(s2);
          const arr = unwrapMappedRecords(raw);
          const markdownBlocks = parsedStep1.markdownBlocks.length > 0
            ? parsedStep1.markdownBlocks
            : splitMarkdownReceipts(parsedStep1.markdown);
          const rawJsonBlocks = parsedStep1.rawJsonBlocks;

          // Normalize category from Chinese to our schema values
          const normCategory = (cat: string, type: string): string => {
            if (type === 'Medical') {
              const map: Record<string, string> = {
                '检验报告单': 'LabResult', '检验报告': 'LabResult', '化验单': 'LabResult',
                '处方': 'Prescription', '处方单': 'Prescription',
                '挂号': 'Registration', '挂号单': 'Registration',
                '诊断': 'Diagnosis', '诊断书': 'Diagnosis',
                '影像': 'ImagingResult', '影像报告': 'ImagingResult', 'CT报告': 'ImagingResult',
                '缴费': 'PaymentReceipt', '收费单': 'PaymentReceipt', '发票': 'PaymentReceipt',
                '出院': 'DischargeNote', '出院小结': 'DischargeNote',
              };
              return map[cat] || (medicalCategories.includes(cat) ? cat : 'Other');
            }
            return shoppingCategories.includes(cat) ? cat : 'Other';
          };

          // Normalize lab result status from arrows/text to High/Low/Normal
          const normStatus = (s: string): string => {
            if (!s) return 'Normal';
            const lower = s.toLowerCase();
            if (s === '↑' || lower.includes('high') || lower.includes('偏高')) return 'High';
            if (s === '↓' || lower.includes('low') || lower.includes('偏低')) return 'Low';
            if (lower.includes('abnormal')) {
              if (lower.includes('high') || lower.includes('↑')) return 'High';
              if (lower.includes('low') || lower.includes('↓')) return 'Low';
              return 'Abnormal';
            }
            if (lower === 'normal' || lower === '' || lower.includes('正常')) return 'Normal';
            return s;
          };

          parsed = arr.map((r: any, index: number) => {
            const mapped: ExtractedReceiptDraft = {
              type: String(r.type || ''),
              category: normCategory(String(r.category || ''), String(r.type || '')),
              merchantName: r.merchantName ? String(r.merchantName) : undefined,
              hospitalName: r.hospitalName ? String(r.hospitalName) : undefined,
              department: r.department ? String(r.department) : undefined,
              doctorName: r.doctorName ? String(r.doctorName) : undefined,
              patientName: r.patientName ? String(r.patientName) : undefined,
              totalAmount: r.totalAmount != null ? Number(r.totalAmount) : undefined,
              taxAmount: inferTaxAmount(r),
              currency: normalizeCurrencyCode(r.currency ? String(r.currency) : undefined) || fallbackCurrency,
              receiptDate: r.receiptDate ? String(r.receiptDate) : undefined,
              outpatientNumber: r.outpatientNumber ? String(r.outpatientNumber) : undefined,
              medicalInsuranceNumber: r.medicalInsuranceNumber ? String(r.medicalInsuranceNumber) : undefined,
              insuranceType: r.insuranceType ? String(r.insuranceType) : undefined,
              medicalInsuranceFundPayment: r.medicalInsuranceFundPayment != null ? Number(r.medicalInsuranceFundPayment) : undefined,
              personalSelfPay: r.personalSelfPay != null ? Number(r.personalSelfPay) : undefined,
              otherPayments: r.otherPayments != null ? Number(r.otherPayments) : undefined,
              personalAccountPayment: r.personalAccountPayment != null ? Number(r.personalAccountPayment) : undefined,
              personalOutOfPocket: r.personalOutOfPocket != null ? Number(r.personalOutOfPocket) : undefined,
              cashPayment: r.cashPayment != null ? Number(r.cashPayment) : undefined,
              notes: r.notes ? String(r.notes) : undefined,
              diagnosisText: r.diagnosisText ? String(r.diagnosisText) : undefined,
              items: Array.isArray(r.items) ? r.items.map((i: any) => ({
                name: String(i.name || ''), quantity: i.quantity != null ? Number(i.quantity) : undefined,
                unit: i.unit ? String(i.unit) : undefined, unitPrice: i.unitPrice != null ? Number(i.unitPrice) : undefined,
                totalPrice: i.totalPrice != null ? Number(i.totalPrice) : undefined,
              })) : undefined,
              medications: Array.isArray(r.medications) ? r.medications.map((m: any) => ({
                name: String(m.name || ''), dosage: m.dosage ? String(m.dosage) : undefined,
                frequency: m.frequency ? String(m.frequency) : undefined, days: m.days != null ? Number(m.days) : undefined,
                quantity: m.quantity != null ? Number(m.quantity) : undefined, price: m.price != null ? Number(m.price) : undefined,
              })) : undefined,
              labResults: Array.isArray(r.labResults) ? r.labResults.map((l: any) => ({
                name: String(l.name || ''), value: l.value != null ? String(l.value) : undefined,
                unit: l.unit ? String(l.unit) : undefined, referenceRange: l.referenceRange ? String(l.referenceRange) : undefined,
                status: normStatus(l.status ? String(l.status) : ''),
              })) : undefined,
            };

            mapped.rawText = pickMarkdownBlock(markdownBlocks, mapped, index, arr.length);
            mapped.rawJson = pickRawJsonBlock(rawJsonBlocks, index, r);
            return mapped;
          });
        } catch {
          setExtractError('Step 2 JSON解析失败');
        }
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

  const buildRequest = (r: ExtractedReceiptDraft): CreateReceiptRequest => ({
    type: (r.type as ReceiptType) || defaultType,
    category: r.category || 'Other',
    imageUrl,
    rawText: r.rawText || ocrText || undefined,
    // Store rawJson in notes-adjacent field — use rawText for dedup too
    receiptDate: r.receiptDate || undefined,
    notes: r.notes || undefined,
    totalAmount: r.totalAmount,
    taxAmount: r.taxAmount,
    currency: normalizeCurrencyCode(r.currency) || 'CNY',
    outpatientNumber: r.outpatientNumber || undefined,
    medicalInsuranceNumber: r.medicalInsuranceNumber || undefined,
    insuranceType: r.insuranceType || undefined,
    medicalInsuranceFundPayment: r.medicalInsuranceFundPayment,
    personalSelfPay: r.personalSelfPay,
    otherPayments: r.otherPayments,
    personalAccountPayment: r.personalAccountPayment,
    personalOutOfPocket: r.personalOutOfPocket,
    cashPayment: r.cashPayment,
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

  const isWithinDedupDateWindow = (left?: string, right?: string) => {
    const leftDate = parseDateInput(left);
    const rightDate = parseDateInput(right);
    if (!leftDate || !rightDate) return null;
    const diffDays = Math.abs(leftDate.getTime() - rightDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= DEDUP_DATE_WINDOW_DAYS;
  };

  const filterDedupCandidates = (receipt: ExtractedReceiptDraft, receipts: ReceiptDto[]) => {
    const datedCandidates: ReceiptDto[] = [];
    const undatedCandidates: ReceiptDto[] = [];

    for (const existing of receipts) {
      if (!existing.rawText) continue;
      const withinWindow = isWithinDedupDateWindow(receipt.receiptDate, existing.receiptDate);
      if (withinWindow === true) {
        datedCandidates.push(existing);
      } else if (withinWindow === null) {
        undatedCandidates.push(existing);
      }
    }

    return {
      comparedReceipts: datedCandidates.length > 0 ? [...datedCandidates, ...undatedCandidates] : receipts.filter(r => !!r.rawText),
      datedCandidates,
      undatedCandidates,
    };
  };

  const evaluateDedupForReceipts = async (receipts: ExtractedReceiptDraft[]): Promise<DedupEvaluationResult> => {
    const allExisting = await receiptService.list();

    let duplicateCount = 0;
    const toCreate: ExtractedReceiptDraft[] = [];
    const dedupLogs: string[] = [];

    for (const [submitIndex, r] of receipts.entries()) {
      const { text: dedupText, source: dedupSource } = getReceiptDedupCandidate(r, ocrText, rawJson);
      const { comparedReceipts, datedCandidates, undatedCandidates } = filterDedupCandidates(r, allExisting);
      const existingSnapshot = comparedReceipts
        .map(existing => existing.rawText)
        .filter((text): text is string => !!text);
      let isDuplicate = false;
      let matchedExistingIndex: number | null = null;
      let matchedExistingText = '';
      const dedupChecks: Array<{
        existingIndex: number;
        existingText: string;
        dedupPrompt: string;
        dedupRawResponse: string;
        dedupParsedResponse: string;
        llmResult: boolean;
      }> = [];

      if (dedupText && existingSnapshot.length > 0) {
        for (const [existingIndex, existing] of comparedReceipts.entries()) {
          if (!existing.rawText) continue;
          const existingText = existing.rawText;
          const dedupPrompt = buildDedupPrompt(dedupText, existingText);
          const dedupResult = await receiptService.checkDuplicate(dedupText, [existingText], dedupPrompt);
          const check = {
            existingIndex,
            existingReceiptId: existing.id,
            existingReceiptDate: existing.receiptDate || '',
            existingText,
            dedupPrompt,
            dedupRawResponse: dedupResult.rawResponse || '',
            dedupParsedResponse: dedupResult.parsedResponse || '',
            llmResult: dedupResult.isDuplicate,
          };
          dedupChecks.push(check);
          if (dedupResult.isDuplicate) {
            isDuplicate = true;
            matchedExistingIndex = existingIndex;
            matchedExistingText = existingText;
            break;
          }
        }
      }

      if (isDuplicate) {
        duplicateCount += 1;
      } else {
        toCreate.push(r);
      }

      dedupLogs.push(JSON.stringify({
        receiptIndex: submitIndex,
        receiptLabel: receiptLabel(r, submitIndex),
        dedupSource,
        dedupText,
        existingCountBefore: allExisting.filter(existing => !!existing.rawText).length,
        comparedCountAfterDateFilter: existingSnapshot.length,
        datedCandidateCount: datedCandidates.length,
        undatedCandidateCount: undatedCandidates.length,
        existingTextsBefore: existingSnapshot,
        dedupChecks,
        matchedExistingIndex,
        matchedExistingText,
        llmResult: isDuplicate,
        action: isDuplicate ? 'skip-duplicate' : 'create',
      }, null, 2));

      if (!isDuplicate && dedupText) {
        allExisting.push({
          id: `preview-${submitIndex}`,
          ownerId: '',
          type: (r.type as ReceiptType) || defaultType,
          category: r.category || 'Other',
          imageUrl,
          additionalImageUrls: [],
          rawText: dedupText,
          merchantName: r.merchantName,
          hospitalName: r.hospitalName,
          department: r.department,
          doctorName: r.doctorName,
          patientName: r.patientName,
          totalAmount: r.totalAmount,
          taxAmount: r.taxAmount,
          currency: normalizeCurrencyCode(r.currency) || 'CNY',
          receiptDate: r.receiptDate,
          outpatientNumber: r.outpatientNumber,
          medicalInsuranceNumber: r.medicalInsuranceNumber,
          insuranceType: r.insuranceType,
          medicalInsuranceFundPayment: r.medicalInsuranceFundPayment,
          personalSelfPay: r.personalSelfPay,
          otherPayments: r.otherPayments,
          personalAccountPayment: r.personalAccountPayment,
          personalOutOfPocket: r.personalOutOfPocket,
          cashPayment: r.cashPayment,
          notes: r.notes,
          tags: [],
          diagnosisText: r.diagnosisText,
          imagingFindings: r.imagingFindings,
          items: r.items || [],
          medications: r.medications || [],
          labResults: r.labResults || [],
          createdAt: '',
          updatedAt: '',
        });
      }
    }

    return {
      selectedCount: receipts.length,
      duplicateCount,
      toCreate,
      debugOutput: [
        `selectedCount: ${receipts.length}`,
        `predictedCreateCount: ${toCreate.length}`,
        `duplicateCount: ${duplicateCount}`,
        '',
        ...dedupLogs.map((entry, index) => `--- Receipt ${index + 1} ---\n${entry}`),
      ].join('\n'),
    };
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
        const result = await evaluateDedupForReceipts(toSubmit);
        if (cancelled) return;
        setDedupEvaluation(result);
        setDedupDebugOutput(result.debugOutput);
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
          await receiptService.create(buildRequest(receipt));
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
    const amt = r.totalAmount != null ? ` ${currencySymbol(r.currency)}${r.totalAmount.toFixed(2)}` : '';
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
${OCR_PROMPT}

===== Step 1 Output =====
${step1Raw || ocrText || '(empty)'}

===== Step 2 Input =====
${MAP_PROMPT}

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
