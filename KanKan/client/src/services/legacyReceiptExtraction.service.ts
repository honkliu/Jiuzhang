import { parseDateInput } from '@/utils/date';
import { photoService, type BatchExtractResult, type PhotoDto } from '@/services/photo.service';
import {
  receiptService,
  type CreateReceiptRequest,
  type ReceiptDto,
  type ReceiptExtractionResult,
  type ReceiptType,
  type UpdateReceiptRequest,
} from '@/services/receipt.service';

export const RECEIPT_OCR_PROMPT = `仔细识别图像中的文字、公式或抽取票据、证件、表单中的信息，注意这些票据你应该认识，因此你要根据你的知识来判断和提取正确的信息。注意票据有可能是中国，有可能是国外的，因此要在返回的md和json中要包含货币单位和交税信息等。请输出两部分，用===JSON===分隔：第一部分是Markdown格式的票据内容，用于展示,格式等于或接近图像中的文字格式，放在<OMD1></OMD1><OMD2></OMD2>...之间。第二部分：JSON格式的原始提取数据，忠实反映图像中识别到的所有字段和数据，不要遗漏任何信息，内容放在<JMD1></JMD1><JMD2></JMD2>...之间。因为一个照片里面可能会有多个receipts，<OMD>对应于receipt的数量。如果只有一个收据，则只有一个<OMD1></OMD1><JMD1></JMD1>，依次类推<OMD>和<JMD>要对应，内容不要翻译，要对应于原文。`;

export const RECEIPT_MAP_PROMPT = `根据以下OCR提取的票据数据，判断这是医疗票据还是购物票据还是其他类型，然后映射到我们的数据Schema，返回纯JSON数组，不要包含代码块标记。

OCR部分可能会按 <OMD1></OMD1><JMD1></JMD1><OMD2></OMD2><JMD2></JMD2> 这样的编号结构返回多张票据。你必须把每个 JMDn 当作一张独立 receipt 来理解，并输出顶层 JSON 数组，数组顺序必须与 JMD 的编号顺序一致。
绝对不要把不同 JMD 编号的内容合并成一个对象。即使是同一家医院、同一个病案号、同一个人，只要是不同日期、不同页块、不同 receipt，也必须拆成不同对象。

如果一张照片里包含多张票据、多个日期、多个就诊记录、多个文档页块，必须按“每一张独立票据/每一个独立就诊日期”拆成数组里的多条记录，绝对不要把不同日期或不同票据内容合并到同一个对象里。
如果原始OCR里已经有 visits、documents、receipts、pages 等多条结构，也必须展开成顶层 JSON 数组后再返回。
同一家医院、同一个病案号也不能合并，只要 receiptDate / visit_date / 就诊日期 不同，就必须拆成不同对象。

分类你要根据正式通用的名称进行分类，不要自己发明。

Schema字段说明：
1. 通用字段：
{
  type: "Shopping" | "Medical",
  category: string,
  currency: string,
  receiptDate: string,
  notes: string
}

2. 购物票据可返回这些字段：
{
  merchantName: string,
  totalAmount: number,
  taxAmount: number,
  items: [{ name, quantity, unit, unitPrice, totalPrice }]
}

3. 医疗票据可返回这些字段：
{
  hospitalName: string,
  department: string,
  doctorName: string,
  patientName: string,
  outpatientNumber: string,
  medicalInsuranceNumber: string,
  insuranceType: string,
  diagnosisText: string,
  medications: [{ name, dosage, frequency, days, quantity, price }],
  labResults: [{ name, value, unit, referenceRange, status }]
}

4. 只有医疗类别明确是 PaymentReceipt / 缴费票据 / 结算票据 时，才允许返回这些金额字段：
{
  totalAmount: number,
  medicalInsuranceFundPayment: number,
  personalSelfPay: number,
  otherPayments: number,
  personalAccountPayment: number,
  personalOutOfPocket: number,
  cashPayment: number,
  items: [{ name, quantity, unit, unitPrice, totalPrice, category }]
}

5. 对于 PaymentReceipt / 收费票据 / 结算票据，如果原文里有收费项目明细，必须逐条完整返回到 items 中，不允许只保留前几条，不允许汇总成 notes，不允许省略尾部项目。即使有 20 条、30 条，也要把图片里能看到的每一条都按顺序返回。

6. 对于 LabResult、ImagingResult、Diagnosis、Prescription、DischargeNote 等非缴费医疗文档，如果原文没有明确收费/结算金额，不要猜测，不要补 0，不要返回 totalAmount 或任何支付拆分字段。`;

const medicalPaymentCategoryHints = ['缴费', '收费', '结算', '发票', '票据'];

const DEDUP_DATE_WINDOW_DAYS = 30;
const shoppingCategories = ['Supermarket', 'Restaurant', 'OnlineShopping', 'Other'];
const medicalCategories = [
  'Registration', 'Diagnosis', 'Prescription', 'LabResult',
  'ImagingResult', 'PaymentReceipt', 'DischargeNote', 'Other',
];

export type ExtractedReceiptDraft = ReceiptExtractionResult & {
  rawText?: string;
  rawJson?: string;
};

type DedupEvaluationResult = {
  duplicateCount: number;
  toCreate: ExtractedReceiptDraft[];
};

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

const buildDedupPrompt = (newOcrText: string, existingOcrText: string) => `判断以下两张票据是否是同一张票据（即重复录入）。
只需要回答一个JSON：{"isDuplicate": true} 或 {"isDuplicate": false}
不要解释，只返回JSON。

新票据OCR文本：
${newOcrText}

已有票据OCR文本：
${existingOcrText}`;

const getReceiptDedupCandidate = (receipt: ExtractedReceiptDraft, fallbackRawText: string, fallbackRawJson: string) => {
  const values: Array<{ text?: string }> = [
    { text: receipt.rawText },
    { text: receipt.rawJson },
    { text: fallbackRawText },
    { text: fallbackRawJson },
  ];

  for (const value of values) {
    const trimmed = value.text?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return '';
};

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

  return datedCandidates.length > 0 ? [...datedCandidates, ...undatedCandidates] : receipts.filter(r => !!r.rawText);
};

const normalizeReceiptDateForApi = (value?: string) => {
  const parsed = parseDateInput(value);
  if (!parsed) {
    return undefined;
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}T00:00:00`;
};

export const buildCreateReceiptRequestFromDraft = (
  imageUrl: string,
  receipt: ExtractedReceiptDraft,
  options?: { sourcePhotoId?: string; additionalPhotoIds?: string[] },
): CreateReceiptRequest => ({
  type: (receipt.type as ReceiptType) || 'Shopping',
  category: receipt.category || 'Other',
  imageUrl,
  sourcePhotoId: options?.sourcePhotoId,
  additionalPhotoIds: options?.additionalPhotoIds,
  rawText: receipt.rawText || undefined,
  receiptDate: normalizeReceiptDateForApi(receipt.receiptDate),
  notes: receipt.notes || undefined,
  totalAmount: receipt.totalAmount,
  taxAmount: receipt.taxAmount,
  currency: normalizeCurrencyCode(receipt.currency) || 'CNY',
  outpatientNumber: receipt.outpatientNumber || undefined,
  medicalInsuranceNumber: receipt.medicalInsuranceNumber || undefined,
  insuranceType: receipt.insuranceType || undefined,
  medicalInsuranceFundPayment: receipt.medicalInsuranceFundPayment,
  personalSelfPay: receipt.personalSelfPay,
  otherPayments: receipt.otherPayments,
  personalAccountPayment: receipt.personalAccountPayment,
  personalOutOfPocket: receipt.personalOutOfPocket,
  cashPayment: receipt.cashPayment,
  merchantName: receipt.merchantName || undefined,
  hospitalName: receipt.hospitalName || undefined,
  department: receipt.department || undefined,
  doctorName: receipt.doctorName || undefined,
  patientName: receipt.patientName || undefined,
  diagnosisText: receipt.diagnosisText || undefined,
  imagingFindings: receipt.imagingFindings || undefined,
  items: receipt.items || undefined,
  medications: receipt.medications || undefined,
  labResults: receipt.labResults || undefined,
});

const buildUpdateRequest = (receipt: ExtractedReceiptDraft): UpdateReceiptRequest => ({
  category: receipt.category || 'Other',
  merchantName: receipt.merchantName || undefined,
  hospitalName: receipt.hospitalName || undefined,
  department: receipt.department || undefined,
  doctorName: receipt.doctorName || undefined,
  patientName: receipt.patientName || undefined,
  totalAmount: receipt.totalAmount,
  taxAmount: receipt.taxAmount,
  currency: normalizeCurrencyCode(receipt.currency) || 'CNY',
  receiptDate: normalizeReceiptDateForApi(receipt.receiptDate),
  outpatientNumber: receipt.outpatientNumber || undefined,
  medicalInsuranceNumber: receipt.medicalInsuranceNumber || undefined,
  insuranceType: receipt.insuranceType || undefined,
  medicalInsuranceFundPayment: receipt.medicalInsuranceFundPayment,
  personalSelfPay: receipt.personalSelfPay,
  otherPayments: receipt.otherPayments,
  personalAccountPayment: receipt.personalAccountPayment,
  personalOutOfPocket: receipt.personalOutOfPocket,
  cashPayment: receipt.cashPayment,
  notes: receipt.notes || undefined,
  diagnosisText: receipt.diagnosisText || undefined,
  imagingFindings: receipt.imagingFindings || undefined,
  items: receipt.items || undefined,
  medications: receipt.medications || undefined,
  labResults: receipt.labResults || undefined,
});

export const evaluateReceiptDraftDedup = async (receipts: ExtractedReceiptDraft[], fallbackRawText: string, fallbackRawJson: string, imageUrl: string): Promise<DedupEvaluationResult> => {
  const allExisting = await receiptService.list();

  let duplicateCount = 0;
  const toCreate: ExtractedReceiptDraft[] = [];

  for (const [submitIndex, receipt] of receipts.entries()) {
    const dedupText = getReceiptDedupCandidate(receipt, fallbackRawText, fallbackRawJson);
    const comparedReceipts = filterDedupCandidates(receipt, allExisting);
    let isDuplicate = false;

    if (dedupText) {
      for (const existing of comparedReceipts) {
        if (!existing.rawText) continue;
        const dedupPrompt = buildDedupPrompt(dedupText, existing.rawText);
        const dedupResult = await receiptService.checkDuplicate(dedupText, [existing.rawText], dedupPrompt);
        if (dedupResult.isDuplicate) {
          isDuplicate = true;
          break;
        }
      }
    }

    if (isDuplicate) {
      duplicateCount += 1;
      continue;
    }

    toCreate.push(receipt);

    if (dedupText) {
      allExisting.push({
        id: `preview-${submitIndex}`,
        ownerId: '',
        type: (receipt.type as ReceiptType) || 'Shopping',
        category: receipt.category || 'Other',
        imageUrl,
        additionalImageUrls: [],
        rawText: dedupText,
        merchantName: receipt.merchantName,
        hospitalName: receipt.hospitalName,
        department: receipt.department,
        doctorName: receipt.doctorName,
        patientName: receipt.patientName,
        totalAmount: receipt.totalAmount,
        taxAmount: receipt.taxAmount,
        currency: normalizeCurrencyCode(receipt.currency) || 'CNY',
        receiptDate: receipt.receiptDate,
        outpatientNumber: receipt.outpatientNumber,
        medicalInsuranceNumber: receipt.medicalInsuranceNumber,
        insuranceType: receipt.insuranceType,
        medicalInsuranceFundPayment: receipt.medicalInsuranceFundPayment,
        personalSelfPay: receipt.personalSelfPay,
        otherPayments: receipt.otherPayments,
        personalAccountPayment: receipt.personalAccountPayment,
        personalOutOfPocket: receipt.personalOutOfPocket,
        cashPayment: receipt.cashPayment,
        notes: receipt.notes,
        tags: [],
        diagnosisText: receipt.diagnosisText,
        imagingFindings: receipt.imagingFindings,
        items: receipt.items || [],
        medications: receipt.medications || [],
        labResults: receipt.labResults || [],
        createdAt: '',
        updatedAt: '',
      });
    }
  }

  return { duplicateCount, toCreate };
};

const parseStep1Content = (step1Raw: string) => {
  try {
    const apiResp = JSON.parse(step1Raw || '{}');
    const msg = apiResp?.choices?.[0]?.message;
    return msg?.content || '';
  } catch {
    return step1Raw || '';
  }
};

export const parseExtractedReceipts = (step1Raw: string, step2Raw: string): { drafts: ExtractedReceiptDraft[]; markdown: string; rawJson: string } => {
  const step1Content = parseStep1Content(step1Raw);
  const parsedStep1 = parseOcrContent(step1Content);
  const fallbackCurrency =
    inferCurrencyFromText(parsedStep1.rawJson)
    || inferCurrencyFromText(parsedStep1.markdown)
    || inferCurrencyFromText(step1Content);

  const raw = JSON.parse(stripCodeFences(step2Raw || '[]'));
  const records = unwrapMappedRecords(raw);
  const markdownBlocks = parsedStep1.markdownBlocks.length > 0
    ? parsedStep1.markdownBlocks
    : splitMarkdownReceipts(parsedStep1.markdown);
  const rawJsonBlocks = parsedStep1.rawJsonBlocks;

  const normCategory = (category: string, type: string): string => {
    if (type === 'Medical') {
      const trimmed = category.trim();
      const map: Record<string, string> = {
        '检验报告单': 'LabResult', '检验报告': 'LabResult', '化验单': 'LabResult',
        '处方': 'Prescription', '处方单': 'Prescription',
        '挂号': 'Registration', '挂号单': 'Registration',
        '诊断': 'Diagnosis', '诊断书': 'Diagnosis',
        '影像': 'ImagingResult', '影像报告': 'ImagingResult', 'CT报告': 'ImagingResult',
        '缴费': 'PaymentReceipt', '收费单': 'PaymentReceipt', '发票': 'PaymentReceipt',
        '收费票据': 'PaymentReceipt', '收费收据': 'PaymentReceipt', '门诊收费票据': 'PaymentReceipt',
        '门诊收费收据': 'PaymentReceipt', '门诊缴费票据': 'PaymentReceipt', '门诊结算票据': 'PaymentReceipt',
        '医疗门诊收费票据': 'PaymentReceipt', '电子票据': 'PaymentReceipt',
        '出院': 'DischargeNote', '出院小结': 'DischargeNote',
      };
      if (map[trimmed]) return map[trimmed];
      if (medicalCategories.includes(trimmed)) return trimmed;
      if (medicalPaymentCategoryHints.some(hint => trimmed.includes(hint))) return 'PaymentReceipt';
      return 'Other';
    }
    return shoppingCategories.includes(category) ? category : 'Other';
  };

  const inferMedicalCategoryFromFields = (record: any, category: string): string => {
    if (category !== 'Other') return category;

    const hasLabResults = Array.isArray(record.labResults) && record.labResults.length > 0;
    if (hasLabResults) return 'LabResult';

    const hasMedications = Array.isArray(record.medications) && record.medications.length > 0;
    if (hasMedications) return 'Prescription';

    const hasImaging = !!String(record.imagingFindings || '').trim();
    if (hasImaging) return 'ImagingResult';

    const hasDiagnosis = !!String(record.diagnosisText || '').trim();

    const hasPaymentFields = [
      record.medicalInsuranceFundPayment,
      record.personalSelfPay,
      record.otherPayments,
      record.personalAccountPayment,
      record.personalOutOfPocket,
      record.cashPayment,
      record.totalAmount,
    ].some(value => parseAmount(value) != null);

    const hasChargeItems = Array.isArray(record.items) && record.items.length > 0;

    if (hasPaymentFields || hasChargeItems) return 'PaymentReceipt';
    if (hasDiagnosis) return 'Diagnosis';
    return category;
  };

  const normStatus = (value: string): string => {
    if (!value) return 'Normal';
    const lower = value.toLowerCase();
    if (value === '↑' || lower.includes('high') || lower.includes('偏高')) return 'High';
    if (value === '↓' || lower.includes('low') || lower.includes('偏低')) return 'Low';
    if (lower.includes('abnormal')) {
      if (lower.includes('high') || lower.includes('↑')) return 'High';
      if (lower.includes('low') || lower.includes('↓')) return 'Low';
      return 'Abnormal';
    }
    if (lower === 'normal' || lower === '' || lower.includes('正常')) return 'Normal';
    return value;
  };

  const drafts = records.map((record: any, index: number) => {
    const normalizedType = String(record.type || '');
    const baseCategory = normCategory(String(record.category || ''), normalizedType);
    const normalizedCategory = normalizedType === 'Medical'
      ? inferMedicalCategoryFromFields(record, baseCategory)
      : baseCategory;
    const isMedicalPaymentReceipt = normalizedType === 'Medical' && normalizedCategory === 'PaymentReceipt';
    const draft: ExtractedReceiptDraft = {
      type: normalizedType,
      category: normalizedCategory,
      merchantName: record.merchantName ? String(record.merchantName) : undefined,
      hospitalName: record.hospitalName ? String(record.hospitalName) : undefined,
      department: record.department ? String(record.department) : undefined,
      doctorName: record.doctorName ? String(record.doctorName) : undefined,
      patientName: record.patientName ? String(record.patientName) : undefined,
      totalAmount: record.totalAmount != null && (normalizedType !== 'Medical' || isMedicalPaymentReceipt)
        ? Number(record.totalAmount)
        : undefined,
      taxAmount: inferTaxAmount(record),
      currency: normalizeCurrencyCode(record.currency ? String(record.currency) : undefined) || fallbackCurrency,
      receiptDate: record.receiptDate ? String(record.receiptDate) : undefined,
      outpatientNumber: record.outpatientNumber ? String(record.outpatientNumber) : undefined,
      medicalInsuranceNumber: record.medicalInsuranceNumber ? String(record.medicalInsuranceNumber) : undefined,
      insuranceType: record.insuranceType ? String(record.insuranceType) : undefined,
      medicalInsuranceFundPayment: record.medicalInsuranceFundPayment != null && isMedicalPaymentReceipt ? Number(record.medicalInsuranceFundPayment) : undefined,
      personalSelfPay: record.personalSelfPay != null && isMedicalPaymentReceipt ? Number(record.personalSelfPay) : undefined,
      otherPayments: record.otherPayments != null && isMedicalPaymentReceipt ? Number(record.otherPayments) : undefined,
      personalAccountPayment: record.personalAccountPayment != null && isMedicalPaymentReceipt ? Number(record.personalAccountPayment) : undefined,
      personalOutOfPocket: record.personalOutOfPocket != null && isMedicalPaymentReceipt ? Number(record.personalOutOfPocket) : undefined,
      cashPayment: record.cashPayment != null && isMedicalPaymentReceipt ? Number(record.cashPayment) : undefined,
      notes: record.notes ? String(record.notes) : undefined,
      diagnosisText: record.diagnosisText ? String(record.diagnosisText) : undefined,
      imagingFindings: record.imagingFindings ? String(record.imagingFindings) : undefined,
      items: Array.isArray(record.items) ? record.items.map((item: any) => ({
        name: String(item.name || ''),
        quantity: item.quantity != null ? Number(item.quantity) : undefined,
        unit: item.unit ? String(item.unit) : undefined,
        unitPrice: item.unitPrice != null ? Number(item.unitPrice) : undefined,
        totalPrice: item.totalPrice != null ? Number(item.totalPrice) : undefined,
        category: item.category ? String(item.category) : undefined,
      })) : undefined,
      medications: Array.isArray(record.medications) ? record.medications.map((item: any) => ({
        name: String(item.name || ''),
        dosage: item.dosage ? String(item.dosage) : undefined,
        frequency: item.frequency ? String(item.frequency) : undefined,
        days: item.days != null ? Number(item.days) : undefined,
        quantity: item.quantity != null ? Number(item.quantity) : undefined,
        price: item.price != null ? Number(item.price) : undefined,
      })) : undefined,
      labResults: Array.isArray(record.labResults) ? record.labResults.map((item: any) => ({
        name: String(item.name || ''),
        value: item.value != null ? String(item.value) : undefined,
        unit: item.unit ? String(item.unit) : undefined,
        referenceRange: item.referenceRange ? String(item.referenceRange) : undefined,
        status: normStatus(item.status ? String(item.status) : ''),
      })) : undefined,
    };

    draft.rawText = pickMarkdownBlock(markdownBlocks, draft, index, records.length);
    draft.rawJson = pickRawJsonBlock(rawJsonBlocks, index, record);
    return draft;
  });

  return {
    drafts,
    markdown: parsedStep1.markdown,
    rawJson: parsedStep1.rawJson,
  };
};

export const extractReceiptDraftsFromImage = async (imageUrl: string) => {
  const extraction = await receiptService.extractFromImage(imageUrl, RECEIPT_OCR_PROMPT, RECEIPT_MAP_PROMPT);
  const parsed = parseExtractedReceipts(extraction.step1Raw || '', extraction.step2Raw || '[]');
  return {
    step1Raw: extraction.step1Raw || '',
    step2Raw: extraction.step2Raw || '',
    ...parsed,
  };
};

export const runLegacyReceiptExtractionForPhoto = async (photo: PhotoDto, signal?: AbortSignal): Promise<BatchExtractResult> => {
  const imageUrl = photoService.getImageUrl(photo);
  if (!imageUrl) {
    return {
      photoId: photo.id,
      status: 'Failed',
      error: 'Photo image URL not found',
      savedReceiptCount: 0,
      newReceiptCount: 0,
      overwrittenReceiptCount: 0,
      savedReceiptIds: [],
      parsedReceipts: [],
    };
  }

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  try {
    const extraction = await extractReceiptDraftsFromImage(imageUrl);
    const { drafts, markdown, rawJson } = extraction;

    let overwriteReceiptIds = photo.associatedReceiptIds;
    if (overwriteReceiptIds.length > 0) {
      const existingReceiptIds = new Set((await receiptService.list()).map(receipt => receipt.id));
      overwriteReceiptIds = overwriteReceiptIds.filter(id => existingReceiptIds.has(id));

      if (overwriteReceiptIds.length !== photo.associatedReceiptIds.length) {
        await photoService.update(photo.id, { associatedReceiptIds: overwriteReceiptIds });
      }
    }

    if (overwriteReceiptIds.length > 0 && overwriteReceiptIds.length === drafts.length) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const overwrittenResults: ReceiptDto[] = [];
      for (const [index, draft] of drafts.entries()) {
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        const receiptId = overwriteReceiptIds[index];
        const overwritten = await receiptService.update(receiptId, buildUpdateRequest(draft));
        overwrittenResults.push(overwritten);
      }

      return {
        photoId: photo.id,
        photoImageUrl: imageUrl,
        status: 'Completed',
        savedReceiptCount: overwrittenResults.length,
        newReceiptCount: 0,
        overwrittenReceiptCount: overwrittenResults.length,
        savedReceiptIds: overwrittenResults.map(receipt => receipt.id),
        step1RawOcr: extraction.step1Raw,
        step2MappedJson: extraction.step2Raw,
        parsedReceipts: drafts.map(draft => ({
          type: draft.type || 'Shopping',
          category: draft.category || 'Other',
          merchantName: draft.merchantName,
          hospitalName: draft.hospitalName,
          department: draft.department,
          doctorName: draft.doctorName,
          patientName: draft.patientName,
          medicalRecordNumber: undefined,
          insuranceType: draft.insuranceType,
          diagnosisText: draft.diagnosisText,
          totalAmount: draft.totalAmount,
          currency: draft.currency,
          receiptDate: draft.receiptDate,
          notes: draft.notes,
          rawText: draft.rawText,
          items: draft.items,
          medications: draft.medications,
          labResults: draft.labResults,
        })),
      };
    }

    const dedupEvaluation = await evaluateReceiptDraftDedup(drafts, markdown, rawJson, imageUrl);

    const savedReceiptIds: string[] = [];
    for (const draft of dedupEvaluation.toCreate) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const saved = await receiptService.create(buildCreateReceiptRequestFromDraft(imageUrl, draft, { sourcePhotoId: photo.id }));
      savedReceiptIds.push(saved.id);
    }

    return {
      photoId: photo.id,
      photoImageUrl: imageUrl,
      status: 'Completed',
      savedReceiptCount: savedReceiptIds.length,
      newReceiptCount: savedReceiptIds.length,
      overwrittenReceiptCount: 0,
      savedReceiptIds,
      step1RawOcr: extraction.step1Raw,
      step2MappedJson: extraction.step2Raw,
      parsedReceipts: drafts.map(draft => ({
        type: draft.type || 'Shopping',
        category: draft.category || 'Other',
        merchantName: draft.merchantName,
        hospitalName: draft.hospitalName,
        department: draft.department,
        doctorName: draft.doctorName,
        patientName: draft.patientName,
        medicalRecordNumber: undefined,
        insuranceType: draft.insuranceType,
        diagnosisText: draft.diagnosisText,
        totalAmount: draft.totalAmount,
        currency: draft.currency,
        receiptDate: draft.receiptDate,
        notes: draft.notes,
        rawText: draft.rawText,
        items: draft.items,
        medications: draft.medications,
        labResults: draft.labResults,
      })),
      error: dedupEvaluation.duplicateCount > 0 ? `Skipped ${dedupEvaluation.duplicateCount} duplicate receipts` : undefined,
    };
  } catch (error) {
    if ((error as { name?: string }).name === 'AbortError') {
      throw error;
    }

    return {
      photoId: photo.id,
      photoImageUrl: imageUrl,
      status: 'Failed',
      error: (error as { message?: string }).message || 'Legacy receipt extraction failed',
      savedReceiptCount: 0,
      newReceiptCount: 0,
      overwrittenReceiptCount: 0,
      savedReceiptIds: [],
      parsedReceipts: [],
    };
  }
};