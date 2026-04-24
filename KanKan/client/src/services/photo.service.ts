import apiClient from '@/utils/api';

export interface PhotoDto {
  id: string;
  ownerId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  filePath?: string;
  imageUrl?: string;
  uploadedAt: string;
  capturedDate?: string;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  cameraModel?: string;
  width?: number;
  height?: number;
  associatedReceiptIds: string[];
  tags: string[];
  notes?: string;
  // Phase 5: Photo album derived fields
  extractedReceiptCount?: number;
  lastOcrStatus?: string;
  photoReceiptDateIndex?: Record<string, string[]>;
  createdAt: string;
  updatedAt: string;
}

export interface PhotoUploadBatchResponse {
  photos: PhotoDto[];
  successCount: number;
  failCount: number;
  errors?: string[];
}

export interface AutoAssociateMatch {
  receiptId: string;
  receiptType: string;
  matchLevel: string;
  receiptAmount?: number;
  receiptDate?: string;
  hospitalName?: string;
  patientName?: string;
  outpatientNumber?: string;
}

export interface AutoAssociateResult {
  photoId: string;
  matched: boolean;
  receiptId?: string;
  matchLevel?: string;
}

export interface VisitDayStat {
  date: string;
  spending: number;
  receiptCount: number;
}

export interface VisitHospitalStat {
  hospitalName: string;
  totalSpending: number;
  receiptCount: number;
}

export interface VisitStatsResponse {
  totalSpending: number;
  totalVisits: number;
  totalReceipts: number;
  averagePerVisit: number;
  dailyStats: VisitDayStat[];
  hospitalStats: VisitHospitalStat[];
}

export interface BatchExtractJob {
  photoId: string;
  jobId: string;
  status: string;
  error?: string;
}

export interface BatchExtractResult {
  photoId: string;
  photoImageUrl?: string; // URL path to the photo for receipt.ImageUrl
  status: string; // Pending, Completed, Failed
  error?: string;
  savedReceiptCount?: number;
  newReceiptCount?: number;
  overwrittenReceiptCount?: number;
  savedReceiptIds?: string[];
  step1RawOcr?: string; // raw OCR output from vision model
  step2MappedJson?: string; // mapped schema JSON array
  parsedReceipts?: Array<{
    type: string;
    category: string;
    merchantName?: string;
    hospitalName?: string;
    department?: string;
    doctorName?: string;
    patientName?: string;
    medicalRecordNumber?: string;
    insuranceType?: string;
    diagnosisText?: string;
    totalAmount?: number;
    currency?: string;
    receiptDate?: string;
    notes?: string;
    rawText?: string;
    items?: Array<{ name: string; quantity?: number; unit?: string; unitPrice?: number; totalPrice?: number; category?: string }>;
    medications?: Array<{ name: string; dosage?: string; frequency?: string; days?: number; quantity?: number; price?: number }>;
    labResults?: Array<{ name: string; value?: string; unit?: string; referenceRange?: string; status?: string }>;
  }>;
}

export interface BatchExtractResponse {
  results: BatchExtractResult[];
}

export interface ConfirmedReceipt {
  photoId: string;
  receiptId?: string;
  sourcePhotoId?: string; // Phase 5: primary photo ID
  additionalPhotoIds?: string[]; // Phase 5: additional page photos
  type: string;
  category: string;
  merchantName?: string;
  hospitalName?: string;
  department?: string;
  doctorName?: string;
  patientName?: string;
  medicalRecordNumber?: string; // Phase 5: 病案号
  insuranceType?: string; // Phase 5: 医保类型
  diagnosisText?: string; // Phase 5: 诊断文本
  outpatientNumber?: string;
  totalAmount?: number;
  currency?: string;
  receiptDate?: string;
  notes?: string;
  items?: Array<{ name: string; quantity?: number; unit?: string; unitPrice?: number; totalPrice?: number; category?: string }>;
  medications?: Array<{ name: string; dosage?: string; frequency?: string; days?: number; quantity?: number; price?: number }>;
  labResults?: Array<{ name: string; value?: string; unit?: string; referenceRange?: string; status?: string }>;
}

export interface ConfirmedReceiptResponse {
  receiptId?: string;
  photoId: string;
  success: boolean;
  error?: string;
}

class PhotoService {
  getDisplayLabel(photo: Pick<PhotoDto, 'id' | 'capturedDate' | 'uploadedAt'>, fallbackIndex?: number): string {
    const sequenceLabel = fallbackIndex != null ? `照片 ${fallbackIndex + 1}` : '照片';
    const dateSource = photo.capturedDate ?? photo.uploadedAt;

    if (!dateSource) {
      return sequenceLabel;
    }

    const date = new Date(dateSource);
    if (Number.isNaN(date.getTime())) {
      return sequenceLabel;
    }

    const suffix = date.toLocaleDateString('zh-CN');
    return `${sequenceLabel} · ${suffix}`;
  }

  async list(): Promise<PhotoDto[]> {
    const res = await apiClient.get<PhotoDto[]>('/photos');
    return res.data;
  }

  async upload(file: File, metadata?: {
    capturedDate?: string;
    latitude?: number;
    longitude?: number;
    locationName?: string;
    cameraModel?: string;
    width?: number;
    height?: number;
    associatedReceiptIds?: string[];
    tags?: string[];
    notes?: string;
  }): Promise<PhotoDto> {
    const formData = new FormData();
    formData.append('file', file);
    if (metadata?.capturedDate) formData.append('capturedDate', metadata.capturedDate);
    if (metadata?.latitude != null) formData.append('latitude', String(metadata.latitude));
    if (metadata?.longitude != null) formData.append('longitude', String(metadata.longitude));
    if (metadata?.locationName) formData.append('locationName', metadata.locationName);
    if (metadata?.cameraModel) formData.append('cameraModel', metadata.cameraModel);
    if (metadata?.width != null) formData.append('width', String(metadata.width));
    if (metadata?.height != null) formData.append('height', String(metadata.height));
    metadata?.associatedReceiptIds?.forEach((id) => formData.append('associatedReceiptIds', id));
    metadata?.tags?.forEach((tag) => formData.append('tags', tag));
    if (metadata?.notes) formData.append('notes', metadata.notes);

    const res = await apiClient.post<PhotoDto>('/photos/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  }

  async downloadBlob(id: string): Promise<Blob> {
    const res = await apiClient.get<Blob>(`/photos/download/${id}`, { responseType: 'blob' });
    return res.data;
  }

  async getById(id: string): Promise<PhotoDto> {
    const res = await apiClient.get<PhotoDto>(`/photos/${id}`);
    return res.data;
  }

  async create(data: Record<string, unknown>): Promise<PhotoDto> {
    const res = await apiClient.post<PhotoDto>('/photos', data);
    return res.data;
  }

  async update(id: string, data: Record<string, unknown>): Promise<PhotoDto> {
    const res = await apiClient.put<PhotoDto>(`/photos/${id}`, data);
    return res.data;
  }

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/photos/${id}`);
  }

  async uploadBatch(photos: Array<{
    fileName: string;
    contentType: string;
    fileSize: number;
    base64Data: string;
    capturedDate?: string;
    latitude?: number;
    longitude?: number;
    locationName?: string;
    cameraModel?: string;
    width?: number;
    height?: number;
    associatedReceiptIds?: string[];
    tags?: string[];
    notes?: string;
  }>): Promise<PhotoUploadBatchResponse> {
    const res = await apiClient.post<PhotoUploadBatchResponse>('/photos/batch', { photos });
    return res.data;
  }

  async getByUploadDate(after?: string, before?: string, limit = 100): Promise<PhotoDto[]> {
    const params: Record<string, string | number> = { limit };
    if (after) params.after = after;
    if (before) params.before = before;
    const res = await apiClient.get<PhotoDto[]>('/photos/by-upload-date', { params });
    return res.data;
  }

  async getByCapturedDate(after?: string, before?: string, limit = 100): Promise<PhotoDto[]> {
    const params: Record<string, string | number> = { limit };
    if (after) params.after = after;
    if (before) params.before = before;
    const res = await apiClient.get<PhotoDto[]>('/photos/by-captured-date', { params });
    return res.data;
  }

  async getByReceiptId(receiptId: string): Promise<PhotoDto[]> {
    const res = await apiClient.get<PhotoDto[]>(`/photos/by-receipt/${receiptId}`);
    return res.data;
  }

  getDownloadUrl(id: string): string {
    return `/api/photos/download/${id}`;
  }

  getImageUrl(photo: Pick<PhotoDto, 'imageUrl' | 'filePath' | 'fileName'>): string | undefined {
    if (photo.imageUrl) {
      return photo.imageUrl;
    }

    if (photo.filePath) {
      const normalized = photo.filePath.replace(/\\/g, '/');
      const marker = '/wwwroot/';
      const markerIndex = normalized.toLowerCase().lastIndexOf(marker);
      if (markerIndex >= 0) {
        return '/' + normalized.slice(markerIndex + marker.length);
      }
    }

    return photo.fileName ? `/photos/${encodeURIComponent(photo.fileName)}` : undefined;
  }

  // Visit stats
  async getVisitStats(startDate?: string, endDate?: string): Promise<VisitStatsResponse> {
    const params: Record<string, string> = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    const res = await apiClient.get<VisitStatsResponse>('/visits/stats', { params });
    return res.data;
  }

  // Auto-associate
  async autoAssociate(): Promise<AutoAssociateResult[]> {
    const res = await apiClient.post<AutoAssociateResult[]>('/visits/auto-associate');
    return res.data;
  }

  // Relink
  async relink(sourceVisitId: string, targetVisitId: string): Promise<{ message: string }> {
    const res = await apiClient.post<{ message: string }>('/visits/relink', { sourceVisitId, targetVisitId });
    return res.data;
  }

  // Batch extract
  async batchExtract(photoIds: string[], signal?: AbortSignal): Promise<BatchExtractResponse> {
    const res = await apiClient.post<BatchExtractResponse>('/visits/batch-extract', { photoIds }, { signal });
    return res.data;
  }

  // Save confirmed receipts
  async saveConfirmed(receipts: ConfirmedReceipt[]): Promise<ConfirmedReceiptResponse[]> {
    const res = await apiClient.post<ConfirmedReceiptResponse[]>('/visits/save-confirmed', { receipts });
    return res.data;
  }

  // Phase 5: Medical record index lookup
  async getMedicalRecordIndex(medicalRecordNumber: string): Promise<{
    id: string;
    ownerId: string;
    medicalRecordNumber: string;
    hospitalName: string;
    patientName: string;
    insuranceType?: string;
    visitIds: string[];
    receiptIds: string[];
    createdAt: string;
    updatedAt: string;
  }> {
    const res = await apiClient.get(`/visits/medical-index/${encodeURIComponent(medicalRecordNumber)}`);
    return res.data;
  }

  // Phase 5: Update visit association
  async updateVisit(receiptId: string, data: {
    visitId?: string;
    sourcePhotoId?: string;
    additionalPhotoIds?: string[];
    medicalRecordNumber?: string;
  }): Promise<{ message: string; receiptId: string }> {
    const res = await apiClient.post('/visits/update-visit', { receiptId, ...data });
    return res.data;
  }
}

export const photoService = new PhotoService();
