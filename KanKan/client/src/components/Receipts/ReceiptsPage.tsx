import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Tabs, Tab, Fab, CircularProgress, Alert, Button,
} from '@mui/material';
import { Add as AddIcon, AutoAwesome as AskIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AppHeader } from '@/components/Shared/AppHeader';
import { ReceiptList } from './ReceiptList';
import { MedicalVisitTimeline } from './MedicalVisitTimeline';
import { ReceiptCapture } from './ReceiptCapture';
import { ReceiptDetail } from './ReceiptDetail';
import { receiptService, type ReceiptDto, type ReceiptVisitDto } from '@/services/receipt.service';
import { chatService } from '@/services/chat.service';
import { signalRService } from '@/services/signalr.service';
import { useLanguage } from '@/i18n/LanguageContext';
import { WA_USER_ID } from '@/utils/chatParticipants';
import { setActiveChat, fetchMessages, addMessage } from '@/store/chatSlice';
import type { RootState, AppDispatch } from '@/store';

const BoxAny = Box as any;

const currencySymbol = (currency?: string): string => {
  switch (currency) {
    case 'USD': return '$';
    case 'EUR': return '€';
    case 'GBP': return '£';
    case 'JPY': return '¥';
    case 'CNY': default: return '¥';
  }
};

/** Serialize receipts into structured text for Wa */
const serializeReceipts = (receipts: ReceiptDto[], type: 'Shopping' | 'Medical'): string => {
  if (type === 'Shopping') {
    const lines = [
      '以下是我的购物票据明细数据。请作为我的家庭财务顾问，帮我分析：',
      '1. 消费总览（总金额、笔数、时间跨度）',
      '2. 同类商品在不同商家的价格对比，哪里买最划算',
      '3. 消费习惯和趋势',
      '4. 省钱建议',
      '',
    ];
    for (const r of receipts) {
      const date = r.receiptDate ? new Date(r.receiptDate).toLocaleDateString('zh-CN') : '';
      const sym = currencySymbol(r.currency);
      lines.push(`【${r.merchantName || '未知商家'}】${date}`);
      if (r.items.length > 0) {
        lines.push('商品名称 | 数量 | 单价 | 小计');
        for (const item of r.items) {
          const qty = item.quantity != null ? `${item.quantity}${item.unit || ''}` : '';
          const up = item.unitPrice != null ? `${sym}${item.unitPrice.toFixed(2)}` : '';
          const tp = item.totalPrice != null ? `${sym}${item.totalPrice.toFixed(2)}` : '';
          lines.push(`${item.name} | ${qty} | ${up} | ${tp}`);
        }
      }
      if (r.totalAmount != null) {
        lines.push(`合计: ${sym}${r.totalAmount.toFixed(2)}`);
      }
      lines.push('');
    }
    return lines.join('\n');
  } else {
    const lines = [
      '以下是我的医疗票据明细数据。请作为我的健康顾问，帮我分析：',
      '1. 就诊概览（医院、科室、时间线）',
      '2. 用药分析（同类药物对比、不同来源的价格差异）',
      '3. 检验指标趋势（标注异常值的变化）',
      '4. 健康建议和注意事项',
      '',
    ];
    for (const r of receipts) {
      const date = r.receiptDate ? new Date(r.receiptDate).toLocaleDateString('zh-CN') : '';
      const sym = currencySymbol(r.currency);
      lines.push(`【${r.hospitalName || '未知医院'}】${r.department || ''} ${date}`);
      if (r.doctorName) lines.push(`医生: ${r.doctorName}`);
      if (r.patientName) lines.push(`患者: ${r.patientName}`);
      if (r.diagnosisText) lines.push(`诊断: ${r.diagnosisText}`);
      if (r.medications.length > 0) {
        lines.push('药品: ' + r.medications.map(m =>
          `${m.name}(${[m.dosage, m.frequency, m.days ? `${m.days}天` : '', m.price != null ? `${sym}${m.price.toFixed(2)}` : ''].filter(Boolean).join(', ')})`
        ).join('；'));
      }
      if (r.labResults.length > 0) {
        lines.push('检验: ' + r.labResults.map(l => {
          const flag = l.status === 'High' ? '↑' : l.status === 'Low' ? '↓' : '';
          return `${l.name} ${l.value}${l.unit || ''}${flag}(参考${l.referenceRange || ''})`;
        }).join('；'));
      }
      if (r.totalAmount != null) {
        lines.push(`费用: ${sym}${r.totalAmount.toFixed(2)}`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }
};

export const ReceiptsPage: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const chats = useSelector((state: RootState) => state.chat.chats);
  const [tab, setTab] = useState(0); // 0=Shopping, 1=Medical
  const [receipts, setReceipts] = useState<ReceiptDto[]>([]);
  const [allReceipts, setAllReceipts] = useState<ReceiptDto[]>([]);
  const [visits, setVisits] = useState<ReceiptVisitDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [captureOpen, setCaptureOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptDto | null>(null);
  const [askingWa, setAskingWa] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Always load all receipts for cross-referencing item history
      const [shopping, medical] = await Promise.all([
        receiptService.list('Shopping'),
        receiptService.list('Medical'),
      ]);
      setAllReceipts([...shopping, ...medical]);
      if (tab === 0) {
        setReceipts(shopping);
      } else {
        const data = await receiptService.listVisits();
        setVisits(data);
        setReceipts(medical);
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

  const handleAskWa = async () => {
    if (askingWa || receipts.length === 0) return;
    setAskingWa(true);
    try {
      const type = tab === 0 ? 'Shopping' : 'Medical';
      const text = serializeReceipts(receipts, type);

      // Find existing Wa chat or create one
      let waChat = chats.find(c =>
        c.participants?.some(p => p.userId === WA_USER_ID)
      );
      if (!waChat) {
        waChat = await chatService.createChat({
          participantIds: [WA_USER_ID],
          chatType: 'direct',
        });
      }

      // Navigate to chat first so SignalR joins the group
      dispatch(setActiveChat(waChat));
      dispatch(fetchMessages({ chatId: waChat.id }));
      navigate('/chats');

      // Wait for ChatWindow to mount and join the SignalR group
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Send via SignalR so the agent is triggered with the client in the group
      await signalRService.sendMessage({
        chatId: waChat.id,
        messageType: 'text',
        text,
      });
    } catch (e: any) {
      setError(e?.message || 'Failed to send to Wa');
    } finally {
      setAskingWa(false);
    }
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
      <BoxAny sx={{ maxWidth: 960, mx: 'auto', px: { xs: 1, sm: 2 }, pt: { xs: 9, sm: 10 }, pb: 10 }}>
        <BoxAny sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h5" fontWeight={700}>
            {t('receipts.title')}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AskIcon />}
            disabled={askingWa || loading || receipts.length === 0}
            onClick={handleAskWa}
          >
            {askingWa ? '发送中...' : `Ask ${t('Wa')}`}
          </Button>
        </BoxAny>

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
            allReceipts={allReceipts}
            onSelect={setSelectedReceipt}
          />
        ) : (
          <MedicalVisitTimeline
            visits={visits}
            unlinkedReceipts={receipts.filter(r => !r.visitId)}
            allReceipts={allReceipts}
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
