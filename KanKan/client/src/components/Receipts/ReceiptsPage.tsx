import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { receiptService, type ReceiptDto } from '@/services/receipt.service';
import { chatService } from '@/services/chat.service';
import { signalRService } from '@/services/signalr.service';
import { useLanguage } from '@/i18n/LanguageContext';
import { WA_USER_ID } from '@/utils/chatParticipants';
import { setActiveChat, fetchMessages } from '@/store/chatSlice';
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

interface TimelineEvent {
  id: string;
  date: Date;
  type: 'shopping' | 'medical';
  label: string; // merchant or hospital
  subLabel?: string; // date string
}

export const ReceiptsPage: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const chats = useSelector((state: RootState) => state.chat.chats);
  const [tab, setTab] = useState(0); // 0=Shopping, 1=Medical
  const [shoppingReceipts, setShoppingReceipts] = useState<ReceiptDto[]>([]);
  const [medicalReceipts, setMedicalReceipts] = useState<ReceiptDto[]>([]);
  const [allReceipts, setAllReceipts] = useState<ReceiptDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [captureOpen, setCaptureOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptDto | null>(null);
  const [askingWa, setAskingWa] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const receipts = tab === 0 ? shoppingReceipts : medicalReceipts;

  const toggleChecked = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllChecked = () => {
    if (tab === 0) {
      const allIds = shoppingReceipts.map(r => r.id);
      const allSelected = allIds.every(id => checkedIds.has(id));
      setCheckedIds(prev => {
        const next = new Set(prev);
        allIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
        return next;
      });
    } else {
      const allIds = medicalReceipts.map(r => r.id);
      const allSelected = allIds.every(id => checkedIds.has(id));
      setCheckedIds(prev => {
        const next = new Set(prev);
        allIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
        return next;
      });
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [shopping, medical] = await Promise.all([
        receiptService.list('Shopping'),
        receiptService.list('Medical'),
      ]);
      setShoppingReceipts(shopping);
      setMedicalReceipts(medical);
      setAllReceipts([...shopping, ...medical]);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Build unified timeline events
  const timelineEvents = useMemo((): TimelineEvent[] => {
    const events: TimelineEvent[] = [];

    for (const r of shoppingReceipts) {
      if (!r.receiptDate) continue;
      events.push({
        id: r.id,
        date: new Date(r.receiptDate),
        type: 'shopping',
        label: r.merchantName || '购物',
      });
    }

    // Medical: deduplicate by hospital+date (one dot per group)
    const seenMedical = new Set<string>();
    for (const r of medicalReceipts) {
      if (!r.receiptDate) continue;
      const key = `${r.hospitalName || ''}|${new Date(r.receiptDate).toLocaleDateString('zh-CN')}`;
      if (seenMedical.has(key)) continue;
      seenMedical.add(key);
      events.push({
        id: r.id,
        date: new Date(r.receiptDate),
        type: 'medical',
        label: r.hospitalName || '就诊',
      });
    }

    events.sort((a, b) => a.date.getTime() - b.date.getTime());
    return events;
  }, [shoppingReceipts, medicalReceipts]);

  const handleTimelineDotClick = (event: TimelineEvent) => {
    if (event.type === 'shopping') {
      setTab(0);
      // Find and select the receipt
      const receipt = shoppingReceipts.find(r => r.id === event.id);
      if (receipt) setSelectedReceipt(receipt);
    } else {
      setTab(1);
      // For visits, just switch tab (visit will be visible)
    }
  };

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
    if (askingWa) return;
    setAskingWa(true);
    try {
      const type = tab === 0 ? 'Shopping' : 'Medical';
      let selectedData: ReceiptDto[];
      if (tab === 0) {
        selectedData = shoppingReceipts.filter(r => checkedIds.has(r.id));
      } else {
        selectedData = medicalReceipts.filter(r => checkedIds.has(r.id));
      }
      if (selectedData.length === 0) {
        setError('请先选择要分析的票据');
        setAskingWa(false);
        return;
      }
      const text = serializeReceipts(selectedData, type);

      let waChat = chats.find(c =>
        c.participants?.some(p => p.userId === WA_USER_ID)
      );
      if (!waChat) {
        waChat = await chatService.createChat({
          participantIds: [WA_USER_ID],
          chatType: 'direct',
        });
      }

      // Navigate to chat first, wait for ChatWindow to mount and join SignalR group, then send
      dispatch(setActiveChat(waChat));
      dispatch(fetchMessages({ chatId: waChat.id }));
      navigate('/chats');

      await new Promise(resolve => setTimeout(resolve, 2000));

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
          allReceipts={allReceipts}
          onBack={() => { setSelectedReceipt(null); }}
          onDelete={() => handleDelete(selectedReceipt.id)}
        />
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <BoxAny sx={{ maxWidth: 960, mx: 'auto', px: { xs: 1, sm: 2 }, pt: { xs: 9, sm: 10 }, pb: 10 }}>
        {/* Ask Wa + select all */}
        <BoxAny sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1, mb: 1 }}>
          <Button size="small" onClick={toggleAllChecked} disabled={loading}>
            {(() => {
              const ids = tab === 0
                ? shoppingReceipts.map(r => r.id)
                : medicalReceipts.map(r => r.id);
              return ids.length > 0 && ids.every(id => checkedIds.has(id)) ? '取消全选' : '全选';
            })()}
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AskIcon />}
            disabled={askingWa || loading || checkedIds.size === 0}
            onClick={handleAskWa}
          >
            {askingWa ? '发送中...' : `Ask ${t('Wa')} (${checkedIds.size})`}
          </Button>
        </BoxAny>

        {/* Unified horizontal timeline */}
        {!loading && timelineEvents.length > 0 && (
          <BoxAny sx={{
            display: 'flex', alignItems: 'center', mb: 2, px: 1, py: 1,
            overflowX: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
          }}>
            {timelineEvents.map((evt, idx) => {
              const dateStr = `${evt.date.getMonth() + 1}/${evt.date.getDate()}`;
              const yearStr = `${evt.date.getFullYear()}`;
              const showYear = idx === 0 || timelineEvents[idx - 1].date.getFullYear() !== evt.date.getFullYear();
              const dotColor = evt.type === 'shopping' ? '#27ae60' : '#2980b9';
              const dotBorderColor = evt.type === 'shopping' ? '#a3d9a5' : '#7ec8e3';
              return (
                <React.Fragment key={`${evt.type}-${evt.id}`}>
                  {idx > 0 && (
                    <BoxAny sx={{ flex: 1, minWidth: 20, height: 2, bgcolor: 'rgba(0,0,0,0.12)' }} />
                  )}
                  <BoxAny
                    sx={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      cursor: 'pointer', flexShrink: 0, px: 0.5,
                      '&:hover .tl-dot': { transform: 'scale(1.3)' },
                    }}
                    onClick={() => handleTimelineDotClick(evt)}
                  >
                    {showYear && (
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', mb: 0.2 }}>
                        {yearStr}
                      </Typography>
                    )}
                    {!showYear && <BoxAny sx={{ height: 16 }} />}
                    <BoxAny
                      className="tl-dot"
                      sx={{
                        width: 10, height: 10, borderRadius: '50%',
                        bgcolor: dotColor, border: '2px solid', borderColor: dotBorderColor,
                        transition: 'transform 0.15s',
                      }}
                    />
                    <Typography variant="caption" sx={{ fontSize: '0.65rem', mt: 0.2, whiteSpace: 'nowrap', color: 'text.secondary' }}>
                      {dateStr}
                    </Typography>
                    <Typography variant="caption" sx={{
                      fontSize: '0.6rem', whiteSpace: 'nowrap', color: 'text.secondary',
                      maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center',
                    }}>
                      {evt.label}
                    </Typography>
                  </BoxAny>
                </React.Fragment>
              );
            })}
          </BoxAny>
        )}

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
            receipts={shoppingReceipts}
            allReceipts={allReceipts}
            checkedIds={checkedIds}
            onToggleChecked={toggleChecked}
            onSelect={setSelectedReceipt}
          />
        ) : (
          <MedicalVisitTimeline
            medicalReceipts={medicalReceipts}
            allReceipts={allReceipts}
            checkedIds={checkedIds}
            onToggleChecked={toggleChecked}
            onSelectReceipt={setSelectedReceipt}
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
          onClose={() => setCaptureOpen(false)}
          onCaptured={handleCaptured}
        />
      </BoxAny>
    </>
  );
};
