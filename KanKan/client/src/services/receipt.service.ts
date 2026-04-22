import apiClient from '@/utils/api';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ReceiptType = 'Shopping' | 'Medical';

export type ShoppingCategory = 'Supermarket' | 'Restaurant' | 'OnlineShopping' | 'Other';
export type MedicalCategory =
  | 'Registration' | 'Diagnosis' | 'Prescription' | 'LabResult'
  | 'ImagingResult' | 'PaymentReceipt' | 'DischargeNote' | 'Other';

export interface ReceiptLineItem {
  name: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  totalPrice?: number;
  category?: string;
}

export interface MedicationItem {
  name: string;
  dosage?: string;
  frequency?: string;
  days?: number;
  quantity?: number;
  price?: number;
}

export interface LabResultItem {
  name: string;
  value?: string;
  unit?: string;
  referenceRange?: string;
  status?: string; // Normal, High, Low, Abnormal
}

export interface ReceiptExtractionResult {
  type?: string;
  category?: string;
  merchantName?: string;
  hospitalName?: string;
  department?: string;
  doctorName?: string;
  patientName?: string;
  totalAmount?: number;
  taxAmount?: number;
  currency?: string;
  receiptDate?: string;
  outpatientNumber?: string;
  medicalInsuranceNumber?: string;
  insuranceType?: string;
  medicalInsuranceFundPayment?: number;
  personalSelfPay?: number;
  otherPayments?: number;
  personalAccountPayment?: number;
  personalOutOfPocket?: number;
  cashPayment?: number;
  notes?: string;
  diagnosisText?: string;
  imagingFindings?: string;
  items?: ReceiptLineItem[];
  medications?: MedicationItem[];
  labResults?: LabResultItem[];
}

export interface ReceiptDto {
  id: string;
  ownerId: string;
  type: ReceiptType;
  category: string;
  imageUrl: string;
  additionalImageUrls: string[];
  rawText?: string;
  merchantName?: string;
  hospitalName?: string;
  department?: string;
  doctorName?: string;
  patientName?: string;
  totalAmount?: number;
  taxAmount?: number;
  currency: string;
  receiptDate?: string;
  outpatientNumber?: string;
  medicalInsuranceNumber?: string;
  insuranceType?: string;
  medicalInsuranceFundPayment?: number;
  personalSelfPay?: number;
  otherPayments?: number;
  personalAccountPayment?: number;
  personalOutOfPocket?: number;
  cashPayment?: number;
  notes?: string;
  tags: string[];
  visitId?: string;
  diagnosisText?: string;
  imagingFindings?: string;
  fhirResourceType?: string;
  items: ReceiptLineItem[];
  medications: MedicationItem[];
  labResults: LabResultItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptVisitDto {
  id: string;
  ownerId: string;
  hospitalName?: string;
  department?: string;
  visitDate?: string;
  patientName?: string;
  doctorName?: string;
  notes?: string;
  tags: string[];
  receipts: ReceiptDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptStatsDto {
  totalSpending: number;
  totalCount: number;
  spendingByCategory: Record<string, number>;
  countByCategory: Record<string, number>;
}

export interface CreateReceiptRequest {
  type: ReceiptType;
  category: string;
  imageUrl: string;
  additionalImageUrls?: string[];
  rawText?: string;
  merchantName?: string;
  hospitalName?: string;
  department?: string;
  doctorName?: string;
  patientName?: string;
  totalAmount?: number;
  taxAmount?: number;
  currency?: string;
  receiptDate?: string;
  outpatientNumber?: string;
  medicalInsuranceNumber?: string;
  insuranceType?: string;
  medicalInsuranceFundPayment?: number;
  personalSelfPay?: number;
  otherPayments?: number;
  personalAccountPayment?: number;
  personalOutOfPocket?: number;
  cashPayment?: number;
  notes?: string;
  tags?: string[];
  visitId?: string;
  diagnosisText?: string;
  imagingFindings?: string;
  items?: ReceiptLineItem[];
  medications?: MedicationItem[];
  labResults?: LabResultItem[];
}

export interface UpdateReceiptRequest {
  category?: string;
  merchantName?: string;
  hospitalName?: string;
  department?: string;
  doctorName?: string;
  patientName?: string;
  totalAmount?: number;
  taxAmount?: number;
  currency?: string;
  receiptDate?: string;
  outpatientNumber?: string;
  medicalInsuranceNumber?: string;
  insuranceType?: string;
  medicalInsuranceFundPayment?: number;
  personalSelfPay?: number;
  otherPayments?: number;
  personalAccountPayment?: number;
  personalOutOfPocket?: number;
  cashPayment?: number;
  notes?: string;
  tags?: string[];
  visitId?: string;
  diagnosisText?: string;
  imagingFindings?: string;
  items?: ReceiptLineItem[];
  medications?: MedicationItem[];
  labResults?: LabResultItem[];
  additionalImageUrls?: string[];
}

export interface CreateVisitRequest {
  hospitalName?: string;
  department?: string;
  visitDate?: string;
  patientName?: string;
  doctorName?: string;
  notes?: string;
  tags?: string[];
}

export interface UpdateVisitRequest {
  hospitalName?: string;
  department?: string;
  visitDate?: string;
  patientName?: string;
  doctorName?: string;
  notes?: string;
  tags?: string[];
}

export interface DedupCheckResult {
  isDuplicate: boolean;
  rawResponse?: string;
  parsedResponse?: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

class ReceiptService {
  // Receipts
  async list(type?: ReceiptType, category?: string): Promise<ReceiptDto[]> {
    const params: Record<string, string> = {};
    if (type) params.type = type;
    if (category) params.category = category;
    const res = await apiClient.get<ReceiptDto[]>('/receipts', { params });
    return res.data;
  }

  async get(id: string): Promise<ReceiptDto> {
    const res = await apiClient.get<ReceiptDto>(`/receipts/${id}`);
    return res.data;
  }

  async create(data: CreateReceiptRequest): Promise<ReceiptDto> {
    const res = await apiClient.post<ReceiptDto>('/receipts', data);
    return res.data;
  }

  async update(id: string, data: UpdateReceiptRequest): Promise<ReceiptDto> {
    const res = await apiClient.put<ReceiptDto>(`/receipts/${id}`, data);
    return res.data;
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/receipts/${id}`);
  }

  // Visits
  async listVisits(): Promise<ReceiptVisitDto[]> {
    const res = await apiClient.get<ReceiptVisitDto[]>('/receipts/visits');
    return res.data;
  }

  async getVisit(id: string): Promise<ReceiptVisitDto> {
    const res = await apiClient.get<ReceiptVisitDto>(`/receipts/visits/${id}`);
    return res.data;
  }

  async createVisit(data: CreateVisitRequest): Promise<ReceiptVisitDto> {
    const res = await apiClient.post<ReceiptVisitDto>('/receipts/visits', data);
    return res.data;
  }

  async updateVisit(id: string, data: UpdateVisitRequest): Promise<ReceiptVisitDto> {
    const res = await apiClient.put<ReceiptVisitDto>(`/receipts/visits/${id}`, data);
    return res.data;
  }

  async deleteVisit(id: string): Promise<void> {
    await apiClient.delete(`/receipts/visits/${id}`);
  }

  // Stats
  async getStats(type?: ReceiptType): Promise<ReceiptStatsDto> {
    const params: Record<string, string> = {};
    if (type) params.type = type;
    const res = await apiClient.get<ReceiptStatsDto>('/receipts/stats', { params });
    return res.data;
  }

  // Upload image (uses existing media endpoint)
  async uploadImage(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post<{ url: string }>('/media/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.url;
  }

  // Extract receipt data from image via vision model
  async extractFromImage(imageUrl: string, ocrPrompt?: string, mapPrompt?: string): Promise<{ step1Raw: string; step2Raw: string }> {
    const res = await apiClient.post<{ step1Raw: string; step2Raw: string }>('/receipts/extract', { imageUrl, ocrPrompt, mapPrompt });
    return res.data;
  }

  // Check if a new receipt is a duplicate of existing ones
  async checkDuplicate(newOcrText: string, existingOcrTexts: string[], dedupPrompt: string): Promise<DedupCheckResult> {
    const res = await apiClient.post<DedupCheckResult>('/receipts/check-duplicate', { newOcrText, existingOcrTexts, dedupPrompt });
    return res.data;
  }
}

export const receiptService = new ReceiptService();
