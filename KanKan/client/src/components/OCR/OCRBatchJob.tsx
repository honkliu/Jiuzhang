import React, { useState } from 'react';
import {
  Box, Typography, Paper, Chip,
  Accordion, AccordionSummary, AccordionDetails,
  CircularProgress, Button, Stack,
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import { photoService, type BatchExtractResult } from '@/services/photo.service';

interface OCRBatchJobProps {
  photoIds: string[];
}

const OCRBatchJob: React.FC<OCRBatchJobProps> = ({ photoIds }) => {
  const [results, setResults] = useState<BatchExtractResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(0); // 0=idle, 1=extracting, 2=done

  const startExtract = async () => {
    setLoading(true);
    setActiveStep(1);
    try {
      const response = await photoService.batchExtract(photoIds);
      setResults(response.results);
      setActiveStep(2);
    } catch (e) {
      console.error('Failed to start OCR:', e);
      setActiveStep(0);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" fontWeight={600}>批量 OCR 识别</Typography>
        <Button
          variant="contained"
          onClick={startExtract}
          disabled={loading || activeStep === 1 || results.length > 0}
        >
          {activeStep === 1 ? '识别中...' : loading ? '启动中...' : `开始识别 (${photoIds.length})`}
        </Button>
      </Box>

      {activeStep === 0 && results.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          选择照片后，点击"开始识别"进行批量 OCR 提取。
        </Typography>
      )}

      {activeStep === 1 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress size={40} sx={{ mb: 1 }} />
          <Typography variant="body2">OCR 识别中...</Typography>
        </Box>
      )}

      {activeStep === 2 && (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {results.map((result) => (
            <ResultCard key={result.photoId} result={result} />
          ))}
        </Box>
      )}
    </Paper>
  );
};

const ResultCard: React.FC<{ result: BatchExtractResult }> = ({ result }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Paper sx={{ borderRadius: 2 }}>
      <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Chip
          label={result.status === 'Completed' ? '识别完成' : result.status === 'Failed' ? '失败' : '处理中'}
          color={result.status === 'Completed' ? 'success' : result.status === 'Failed' ? 'error' : 'warning'}
          size="small"
        />
        <Typography variant="caption" color="text.secondary">{result.photoId.slice(0, 8)}</Typography>
      </Box>
      <Accordion expanded={expanded} onChange={() => setExpanded(!expanded)}>
        <AccordionSummary expandIcon={<ExpandMore />}>查看详情</AccordionSummary>
        <AccordionDetails>
          {result.status === 'Completed' ? (
            <Stack spacing={1.5}>
              {result.parsedReceipts?.map((receipt, idx) => (
                <ReceiptPreview key={idx} receipt={receipt} photoId={result.photoId} photoImageUrl={result.photoImageUrl} />
              ))}
              {(!result.parsedReceipts || result.parsedReceipts.length === 0) && (
                <Typography variant="body2" color="text.secondary">无提取结果</Typography>
              )}
            </Stack>
          ) : result.status === 'Failed' ? (
            <Typography variant="body2" color="error">{result.error || '识别失败'}</Typography>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={20} />
              <Typography variant="body2">识别中...</Typography>
            </Box>
          )}
        </AccordionDetails>
      </Accordion>
    </Paper>
  );
};

const ReceiptPreview: React.FC<{
  receipt: { type: string; category: string; merchantName?: string; hospitalName?: string; totalAmount?: number; currency?: string; receiptDate?: string; notes?: string; items?: Array<{ name: string }> };
  photoId: string;
  photoImageUrl?: string;
}> = ({ receipt, photoId: _photoId }) => {
  return (
    <Box sx={{ p: 1.5, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 1 }}>
      <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
        <Chip label={receipt.type} size="small" variant="outlined" />
        {receipt.category && <Chip label={receipt.category} size="small" variant="outlined" />}
      </Box>
      <Typography variant="body2">{receipt.merchantName || receipt.hospitalName || '未识别'}</Typography>
      <Typography variant="caption" color="text.secondary">
        {receipt.totalAmount != null ? `${receipt.currency || 'CNY'} ${receipt.totalAmount}` : ''}
      </Typography>
      {receipt.items && receipt.items.length > 0 && (
        <Typography variant="caption" color="text.secondary">
          {receipt.items.length} 项商品
        </Typography>
      )}
    </Box>
  );
};

export default OCRBatchJob;
