import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Tabs, Tab, Fab, CircularProgress, Alert,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { AppHeader } from '@/components/Shared/AppHeader';
import { ReceiptList } from './ReceiptList';
import { MedicalVisitTimeline } from './MedicalVisitTimeline';
import { ReceiptCapture } from './ReceiptCapture';
import { ReceiptDetail } from './ReceiptDetail';
import { receiptService, type ReceiptDto, type ReceiptVisitDto } from '@/services/receipt.service';
import { useLanguage } from '@/i18n/LanguageContext';

const BoxAny = Box as any;

export const ReceiptsPage: React.FC = () => {
  const { t } = useLanguage();
  const [tab, setTab] = useState(0); // 0=Shopping, 1=Medical
  const [receipts, setReceipts] = useState<ReceiptDto[]>([]);
  const [visits, setVisits] = useState<ReceiptVisitDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [captureOpen, setCaptureOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptDto | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 0) {
        const data = await receiptService.list('Shopping');
        setReceipts(data);
      } else {
        const data = await receiptService.listVisits();
        setVisits(data);
        const medReceipts = await receiptService.list('Medical');
        setReceipts(medReceipts);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleTabChange = (_: any, newVal: number) => {
    setTab(newVal);
    setSelectedReceipt(null);
  };

  const handleCaptured = () => {
    setCaptureOpen(false);
    loadData();
  };

  const handleDelete = async (id: string) => {
    try {
      await receiptService.delete(id);
      setSelectedReceipt(null);
      loadData();
    } catch { /* ignore */ }
  };

  if (selectedReceipt) {
    return (
      <>
        <AppHeader />
        <ReceiptDetail
          receipt={selectedReceipt}
          onBack={() => { setSelectedReceipt(null); loadData(); }}
          onDelete={() => handleDelete(selectedReceipt.id)}
        />
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <BoxAny sx={{ maxWidth: 960, mx: 'auto', px: { xs: 1, sm: 2 }, pt: 2, pb: 10 }}>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
          {t('receipts.title')}
        </Typography>

        <Tabs
          value={tab}
          onChange={handleTabChange}
          sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label={t('receipts.shopping')} />
          <Tab label={t('receipts.medical')} />
        </Tabs>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {loading ? (
          <BoxAny sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </BoxAny>
        ) : tab === 0 ? (
          <ReceiptList
            receipts={receipts}
            onSelect={setSelectedReceipt}
          />
        ) : (
          <MedicalVisitTimeline
            visits={visits}
            unlinkedReceipts={receipts.filter(r => !r.visitId)}
            onSelectReceipt={setSelectedReceipt}
            onRefresh={loadData}
          />
        )}

        <Fab
          color="primary"
          sx={{ position: 'fixed', bottom: 24, right: 24 }}
          onClick={() => setCaptureOpen(true)}
        >
          <AddIcon />
        </Fab>

        <ReceiptCapture
          open={captureOpen}
          defaultType={tab === 0 ? 'Shopping' : 'Medical'}
          visits={visits}
          onClose={() => setCaptureOpen(false)}
          onCaptured={handleCaptured}
        />
      </BoxAny>
    </>
  );
};
