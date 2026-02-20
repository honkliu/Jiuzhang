import apiClient from '@/utils/api';

export interface GenerationJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  results?: {
    avatarImageIds?: string[];
    generatedUrls?: string[];
  };
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export interface GenerateResponse {
  jobId: string;
  status: string;
  message: string;
}

export interface AvatarResult {
  avatarImageId: string;
  emotion?: string;
  style?: string;
  imageUrl: string;
  sourceAvatarId: string;
  createdAt: string;
}

export interface ImageResult {
  sourceId: string;
  sourceType: 'avatar' | 'chat_image';
  hasGenerations: boolean;
  count: number;
  results: AvatarResult[] | string[];
}

class UnifiedImageGenerationService {
  /**
   * Unified generation endpoint for all image types
   */
  async generate(request: {
    sourceType: 'avatar' | 'chat_image';
    generationType: 'emotions' | 'styles' | 'variations' | 'custom';
    avatarId?: string;
    messageId?: string;
    mediaUrl?: string;
    emotion?: string;
    mode?: 'create' | 'replace';
    variationCount?: number;
    customPrompts?: string[];
  }): Promise<GenerateResponse> {
    const response = await apiClient.post<GenerateResponse>('/imagegeneration/generate', {
      sourceType: request.sourceType,
      generationType: request.generationType,
      avatarId: request.avatarId,
      messageId: request.messageId,
      mediaUrl: request.mediaUrl,
      emotion: request.emotion,
      mode: request.mode,
      variationCount: request.variationCount || 9,
      customPrompts: request.customPrompts,
    });

    return response.data;
  }

  /**
   * Generate avatar emotions
   */
  async generateAvatarEmotions(avatarId: string): Promise<GenerateResponse> {
    return this.generate({
      sourceType: 'avatar',
      generationType: 'emotions',
      avatarId,
    });
  }

  async generateAvatarEmotion(avatarId: string, emotion: string): Promise<GenerateResponse> {
    return this.generate({
      sourceType: 'avatar',
      generationType: 'emotions',
      avatarId,
      emotion,
      mode: 'replace',
    });
  }

  /**
   * Generate avatar styles
   */
  async generateAvatarStyles(avatarId: string, styles?: string[]): Promise<GenerateResponse> {
    return this.generate({
      sourceType: 'avatar',
      generationType: 'styles',
      avatarId,
      customPrompts: styles,
    });
  }

  /**
   * Generate chat image variations
   */
  async generateChatImageVariations(messageId: string, mediaUrl: string, count: number = 9): Promise<GenerateResponse> {
    return this.generate({
      sourceType: 'chat_image',
      generationType: 'variations',
      messageId,
      mediaUrl,
      variationCount: count,
    });
  }

  /**
   * Generate custom styles for chat image
   */
  async generateChatImageStyles(messageId: string, mediaUrl: string, styles: string[]): Promise<GenerateResponse> {
    return this.generate({
      sourceType: 'chat_image',
      generationType: 'custom',
      messageId,
      mediaUrl,
      customPrompts: styles,
    });
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<GenerationJob> {
    const response = await apiClient.get<GenerationJob>(`/imagegeneration/status/${jobId}`);
    return response.data;
  }

  /**
   * Get generated results (avatars or URLs)
   */
  async getResults(sourceId: string, sourceType: 'avatar' | 'chat_image'): Promise<ImageResult> {
    const response = await apiClient.get<ImageResult>(`/imagegeneration/results/${sourceId}`, {
      params: { sourceType },
    });
    return response.data;
  }

  /**
   * Poll job until complete with progress callback
   */
  async pollJobUntilComplete(jobId: string, onProgress?: (progress: number) => void): Promise<GenerationJob> {
    const maxAttempts = 60; // 60 * 3 seconds = 3 minutes
    let attempt = 0;

    while (attempt < maxAttempts) {
      const job = await this.getJobStatus(jobId);

      if (onProgress) {
        onProgress(job.progress);
      }

      if (job.status === 'completed' || job.status === 'failed') {
        return job;
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
      attempt++;
    }

    throw new Error('Job polling timed out');
  }
}

export const imageGenerationService = new UnifiedImageGenerationService();
