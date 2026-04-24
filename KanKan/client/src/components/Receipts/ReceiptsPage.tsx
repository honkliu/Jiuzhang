import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Tabs, Tab, CircularProgress, Alert, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem,
  ListItemButton, ListItemText, ListItemIcon, Checkbox, Chip, Paper,
} from '@mui/material';
import { Photo as PhotoIcon, AutoAwesome } from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AppHeader } from '@/components/Shared/AppHeader';
import { ReceiptList } from './ReceiptList';
import { MedicalVisitTimeline } from './MedicalVisitTimeline';
import { ReceiptDetail } from './ReceiptDetail';
import { BatchExtractDialog } from './BatchExtractDialog';
import PhotoAlbumPage from '../Photos/PhotoAlbumPage';
import { receiptService, type ReceiptDto } from '@/services/receipt.service';
import { photoService, type PhotoDto } from '@/services/photo.service';
import { chatService } from '@/services/chat.service';
import { signalRService } from '@/services/signalr.service';
import { useLanguage } from '@/i18n/LanguageContext';
import { WA_USER_ID } from '@/utils/chatParticipants';
import { formatDateZhCN, parseDateInput } from '@/utils/date';
import { setActiveChat, fetchMessages } from '@/store/chatSlice';
import type { RootState, AppDispatch } from '@/store';

const BoxAny = Box as any;

const shouldShowMedicalAmount = (receipt: ReceiptDto) => receipt.category === 'PaymentReceipt';

const BatchPhotoListItem: React.FC<{
  photo: PhotoDto;
  selected: boolean;
  onToggle: (photoId: string) => void;
}> = ({ photo, selected, onToggle }) => {
  const imageUrl = photoService.getImageUrl(photo);
  const photoLabel = photoService.getDisplayLabel(photo);

  return (
    <ListItem disablePadding>
      <ListItemButton
        onClick={() => onToggle(photo.id)}
        sx={{
          gap: 1.5,
          py: 1.25,
          px: 1.5,
          borderRadius: '10px',
          mb: 1,
          alignItems: 'center',
          border: selected ? '1px solid rgba(7,193,96,0.4)' : '1px solid rgba(15,23,42,0.08)',
          background: selected ? 'rgba(7,193,96,0.08)' : 'rgba(255,255,255,0.92)',
          '&:hover': {
            background: selected ? 'rgba(7,193,96,0.12)' : 'rgba(15,23,42,0.03)',
          },
        }}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          <Checkbox
            edge="start"
            checked={selected}
            tabIndex={-1}
            disableRipple
          />
        </ListItemIcon>
        <Box sx={{ width: 64, height: 64, borderRadius: 2, overflow: 'hidden', flexShrink: 0, bgcolor: 'rgba(15,23,42,0.06)' }}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={photoLabel}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : null}
        </Box>
        <ListItemText
          primary={
            <Typography variant="body2" fontWeight={600} noWrap>
              {photoLabel}
            </Typography>
          }
          secondary={
            <Box sx={{ mt: 0.5, display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip size="small" label={`${Math.max(1, Math.round(photo.fileSize / 1024))} KB`} variant="outlined" />
              <Chip size="small" label="待提取" color="warning" variant="outlined" />
              <Typography variant="caption" color="text.secondary">
                上传于 {new Date(photo.uploadedAt).toLocaleDateString('zh-CN')}
              </Typography>
            </Box>
          }
        />
      </ListItemButton>
    </ListItem>
  );
};

const currencySymbol = (currency?: string): string => {
  const normalized = currency?.trim().toUpperCase();
  switch (normalized) {
    case '$':
    case 'US$':
    case 'USD': return '$';
    case '€':
    case 'EUR': return '€';
    case '£':
    case 'GBP': return '£';
    case '￥':
    case 'JPY': return '¥';
    case 'RMB':
    case 'CNY':
    default:
      return '¥';
  }
};

const hasMeaningfulMedicalDetails = (receipt: ReceiptDto): boolean => (
  (receipt.items?.length ?? 0) > 0
  || (receipt.medications?.length ?? 0) > 0
  || (receipt.labResults?.length ?? 0) > 0
  || (receipt.diagnosisText ?? '').trim().length > 0
  || (receipt.outpatientNumber ?? '').trim().length > 0
  || (receipt.insuranceType ?? '').trim().length > 0
  || (receipt.medicalInsuranceNumber ?? '').trim().length > 0
  || receipt.medicalInsuranceFundPayment != null
  || receipt.personalAccountPayment != null
  || receipt.personalSelfPay != null
  || receipt.personalOutOfPocket != null
  || receipt.cashPayment != null
  || receipt.otherPayments != null
);

const summarizeRawText = (rawText?: string): string[] => {
  if (!rawText?.trim()) return [];
  const cleaned = rawText
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return [];
  return [`原始票据摘要: ${cleaned.slice(0, 400)}${cleaned.length > 400 ? '...' : ''}`];
};

const getMedicalReceiptTitle = (receipt: ReceiptDto): string => {
  switch (receipt.category) {
    case 'Registration':
      return '挂号单';
    case 'Diagnosis':
      return '诊断证明书';
    case 'Prescription':
      return '处方笺';
    case 'LabResult':
      return '检验报告单';
    case 'ImagingResult':
      return '影像检查报告';
    case 'PaymentReceipt':
      return '门诊收费票据';
    case 'DischargeNote':
      return '出院小结';
    default:
      return receipt.category || '医疗票据';
  }
};

const serializeMedicalReceipt = (receipt: ReceiptDto): string[] => {
  const date = formatDateZhCN(receipt.receiptDate);
  const sym = currencySymbol(receipt.currency);
  const lines: string[] = [
    `【${receipt.hospitalName || '未知医院'}】${getMedicalReceiptTitle(receipt)} ${date}`.trim(),
  ];

  const pushIfPresent = (label: string, value?: string) => {
    if (value?.trim()) lines.push(`${label}: ${value.trim()}`);
  };

  switch (receipt.category) {
    case 'Registration':
      pushIfPresent('姓名', receipt.patientName);
      pushIfPresent('科室', receipt.department);
      pushIfPresent('医生', receipt.doctorName);
      pushIfPresent('日期', date && date !== '—' ? date : undefined);
      break;
    case 'Diagnosis':
    case 'DischargeNote':
      pushIfPresent('姓名', receipt.patientName);
      pushIfPresent('科室', receipt.department);
      pushIfPresent('主治医师', receipt.doctorName);
      pushIfPresent('日期', date && date !== '—' ? date : undefined);
      pushIfPresent('诊断内容', receipt.diagnosisText);
      break;
    case 'Prescription':
      pushIfPresent('姓名', receipt.patientName);
      pushIfPresent('科室', receipt.department);
      pushIfPresent('临床诊断', receipt.diagnosisText);
      pushIfPresent('日期', date && date !== '—' ? date : undefined);
      if (receipt.medications.length > 0) {
        lines.push('处方明细:');
        receipt.medications.forEach((med, index) => {
          const desc = [
            med.dosage ? `用量 ${med.dosage}` : '',
            med.frequency || '',
            med.days ? `${med.days}天` : '',
            med.quantity != null ? `×${med.quantity}` : '',
            med.price != null ? `${sym}${med.price.toFixed(2)}` : '',
          ].filter(Boolean).join(' / ');
          lines.push(desc ? `${index + 1}. ${med.name}: ${desc}` : `${index + 1}. ${med.name}`);
        });
      }
      pushIfPresent('医师', receipt.doctorName);
      break;
    case 'LabResult':
      pushIfPresent('姓名', receipt.patientName);
      pushIfPresent('科室', receipt.department);
      pushIfPresent('送检医生', receipt.doctorName);
      pushIfPresent('报告日期', date && date !== '—' ? date : undefined);
      if (receipt.labResults.length > 0) {
        lines.push('检验结果:');
        receipt.labResults.forEach((lab) => {
          const arrow = lab.status === 'High' ? ' ↑' : lab.status === 'Low' ? ' ↓' : '';
          const value = lab.value ? `${lab.value}${lab.unit ? ` ${lab.unit}` : ''}${arrow}` : '—';
          const ref = lab.referenceRange ? ` (参考范围 ${lab.referenceRange})` : '';
          lines.push(`- ${lab.name}: ${value}${ref}`);
        });
      }
      break;
    case 'ImagingResult':
      pushIfPresent('姓名', receipt.patientName);
      pushIfPresent('科室', receipt.department);
      pushIfPresent('检查日期', date && date !== '—' ? date : undefined);
      pushIfPresent('报告医师', receipt.doctorName);
      pushIfPresent('检查所见', receipt.imagingFindings);
      pushIfPresent('诊断意见', receipt.diagnosisText);
      break;
    case 'PaymentReceipt':
      pushIfPresent('姓名', receipt.patientName);
      pushIfPresent('科室', receipt.department);
      pushIfPresent('日期', date && date !== '—' ? date : undefined);
      pushIfPresent('门诊号', receipt.outpatientNumber);
      pushIfPresent('医保类型', receipt.insuranceType);
      pushIfPresent('医保编号', receipt.medicalInsuranceNumber);
      if (receipt.items.length > 0) {
        lines.push('收费明细:');
        receipt.items.forEach((item) => {
          const amount = item.totalPrice != null ? `${sym}${item.totalPrice.toFixed(2)}` : '—';
          lines.push(`- ${item.name}: ${amount}`);
        });
      }
      if (shouldShowMedicalAmount(receipt) && receipt.totalAmount != null) lines.push(`合计: ${sym}${receipt.totalAmount.toFixed(2)}`);
      {
        const paymentBreakdown = [
          receipt.medicalInsuranceFundPayment != null ? `医保统筹支付 ${sym}${receipt.medicalInsuranceFundPayment.toFixed(2)}` : '',
          receipt.personalAccountPayment != null ? `个人账户支付 ${sym}${receipt.personalAccountPayment.toFixed(2)}` : '',
          receipt.personalSelfPay != null ? `个人自付 ${sym}${receipt.personalSelfPay.toFixed(2)}` : '',
          receipt.personalOutOfPocket != null ? `个人自费 ${sym}${receipt.personalOutOfPocket.toFixed(2)}` : '',
          receipt.cashPayment != null ? `现金支付 ${sym}${receipt.cashPayment.toFixed(2)}` : '',
          receipt.otherPayments != null ? `其他支付 ${sym}${receipt.otherPayments.toFixed(2)}` : '',
        ].filter(Boolean);
        if (paymentBreakdown.length > 0) lines.push(`支付拆分: ${paymentBreakdown.join('；')}`);
      }
      break;
    default:
      pushIfPresent('姓名', receipt.patientName);
      pushIfPresent('科室', receipt.department);
      pushIfPresent('医生', receipt.doctorName);
      pushIfPresent('日期', date && date !== '—' ? date : undefined);
      pushIfPresent('诊断', receipt.diagnosisText);
      pushIfPresent('检查所见', receipt.imagingFindings);
      if (receipt.items.length > 0) {
        lines.push('明细:');
        receipt.items.forEach((item) => lines.push(`- ${item.name}`));
      }
      break;
  }

  if (receipt.notes?.trim()) lines.push(`备注: ${receipt.notes.trim()}`);
  if (!hasMeaningfulMedicalDetails(receipt)) lines.push(...summarizeRawText(receipt.rawText));
  lines.push('');
  return lines;
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
      const date = formatDateZhCN(r.receiptDate);
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
      lines.push(...serializeMedicalReceipt(r));
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
  const location = useLocation();
  const dispatch = useDispatch<AppDispatch>();
  const chats = useSelector((state: RootState) => state.chat.chats);
  const [tab, setTab] = useState(0); // 0=Shopping, 1=Medical, 2=Photos
  const [shoppingReceipts, setShoppingReceipts] = useState<ReceiptDto[]>([]);
  const [medicalReceipts, setMedicalReceipts] = useState<ReceiptDto[]>([]);
  const [allReceipts, setAllReceipts] = useState<ReceiptDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptDto | null>(null);
  const [askingWa, setAskingWa] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  // Batch extract from photo album
  const [batchPhotoSelectOpen, setBatchPhotoSelectOpen] = useState(false);
  const [allPhotos, setAllPhotos] = useState<PhotoDto[]>([]);
  const [batchSelectedPhotoIds, setBatchSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [batchSelectedPhotos, setBatchSelectedPhotos] = useState<PhotoDto[]>([]);
  const [batchExtractOpen, setBatchExtractOpen] = useState(false);
  const [hasOpenedPhotoAlbum, setHasOpenedPhotoAlbum] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const view = searchParams.get('view');
    if (view === 'photos') {
      setTab(2);
    }
  }, [location.search]);

  useEffect(() => {
    if (tab === 2) {
      setHasOpenedPhotoAlbum(true);
    }
  }, [tab]);

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
      const parsedDate = parseDateInput(r.receiptDate);
      if (!parsedDate) continue;
      events.push({
        id: r.id,
        date: parsedDate,
        type: 'shopping',
        label: r.merchantName || '购物',
      });
    }

    // Medical: deduplicate by hospital+date (one dot per group)
    const seenMedical = new Set<string>();
    for (const r of medicalReceipts) {
      if (!r.receiptDate) continue;
      const parsedDate = parseDateInput(r.receiptDate);
      if (!parsedDate) continue;
      const key = `${r.hospitalName || ''}|${formatDateZhCN(r.receiptDate)}`;
      if (seenMedical.has(key)) continue;
      seenMedical.add(key);
      events.push({
        id: r.id,
        date: parsedDate,
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

  const handleDelete = async (id: string) => {
    try {
      await receiptService.delete(id);
      setSelectedReceipt(null);
      loadData();
    } catch { /* ignore */ }
  };

  // Batch extract photo selection handlers
  const handleBatchPhotoSelect = useCallback(async () => {
    try {
      const photos = await photoService.list();
      setAllPhotos(photos);
      setBatchPhotoSelectOpen(true);
    } catch (e) {
      console.error('Failed to load photos:', e);
    }
  }, []);

  const handleBatchPhotoToggle = useCallback((photoId: string) => {
    setBatchSelectedPhotoIds(prev => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }, []);

  const handleBatchPhotoStartExtract = useCallback(() => {
    setBatchPhotoSelectOpen(false);
    const selected = allPhotos.filter(p => batchSelectedPhotoIds.has(p.id));
    setBatchSelectedPhotos(selected);
    setBatchExtractOpen(true);
  }, [allPhotos, batchSelectedPhotoIds]);

  const handleBatchExtractSaved = useCallback(() => {
    setBatchExtractOpen(false);
    setBatchSelectedPhotoIds(new Set());
    setBatchSelectedPhotos([]);
    loadData();
  }, [loadData]);

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
      <BoxAny sx={{ maxWidth: 960, mx: 'auto', px: { xs: 1, sm: 2 }, pt: { xs: 8, sm: 9 }, pb: 10 }}>
        <Paper sx={{
          p: { xs: 0.25, sm: 0.5 },
          mb: tab === 2 ? 0 : 1.25,
          borderRadius: tab === 2 ? '10px 10px 0 0' : '10px',
          background: '#ffffff',
          position: 'sticky',
          top: { xs: 64, sm: 72 },
          zIndex: 6,
          boxShadow: '0 8px 24px rgba(15,23,42,0.08)',
        }}>
          <Tabs
            value={tab}
            onChange={handleTabChange}
            variant="fullWidth"
            sx={{
              minHeight: 36,
              borderBottom: 1,
              borderColor: 'divider',
              '& .MuiTabs-flexContainer': {
                minHeight: 36,
              },
            }}
          >
            <Tab
              label={t('receipts.shopping')}
              sx={{ minHeight: 36, py: 0, px: 1, textTransform: 'none' }}
            />
            <Tab
              label={t('receipts.medical')}
              sx={{ minHeight: 36, py: 0, px: 1, textTransform: 'none' }}
            />
            <Tab
              icon={<PhotoIcon fontSize="small" />}
              iconPosition="start"
              label="图片集合"
              sx={{ minHeight: 36, py: 0, px: 1, textTransform: 'none', '& .MuiTab-iconWrapper': { mr: 0.5 } }}
            />
          </Tabs>

          {tab !== 2 && (
            <BoxAny sx={{ pt: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.75, flexWrap: 'wrap' }}>
              <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                <Button size="small" sx={{ minHeight: 28, px: 1.1 }} onClick={toggleAllChecked} disabled={loading}>
                  {(() => {
                    const ids = tab === 0
                      ? shoppingReceipts.map(r => r.id)
                      : medicalReceipts.map(r => r.id);
                    return ids.length > 0 && ids.every(id => checkedIds.has(id)) ? '取消全选' : '全选';
                  })()}
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<AutoAwesome />}
                  sx={{ minHeight: 28, px: 1.1 }}
                  disabled={askingWa || loading || checkedIds.size === 0}
                  onClick={handleAskWa}
                >
                  {askingWa ? '发送中...' : `Ask ${t('Wa')} (${checkedIds.size})`}
                </Button>
              </BoxAny>
            </BoxAny>
          )}
        </Paper>

        {/* Unified horizontal timeline */}
        {!loading && tab !== 2 && timelineEvents.length > 0 && (
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

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {loading ? (
          <BoxAny sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </BoxAny>
        ) : (
          <>
            <BoxAny sx={{ display: tab === 0 ? 'block' : 'none' }}>
              <ReceiptList
                receipts={shoppingReceipts}
                allReceipts={allReceipts}
                checkedIds={checkedIds}
                onToggleChecked={toggleChecked}
                onSelect={setSelectedReceipt}
              />
            </BoxAny>
            <BoxAny sx={{ display: tab === 1 ? 'block' : 'none' }}>
              <MedicalVisitTimeline
                medicalReceipts={medicalReceipts}
                allReceipts={allReceipts}
                checkedIds={checkedIds}
                onToggleChecked={toggleChecked}
                onSelectReceipt={setSelectedReceipt}
              />
            </BoxAny>
            {hasOpenedPhotoAlbum && (
              <BoxAny sx={{ display: tab === 2 ? 'block' : 'none' }}>
                <PhotoAlbumPage embedded title="票夹图片集合" onOpenReceipt={setSelectedReceipt} onReceiptsChanged={loadData} />
              </BoxAny>
            )}
          </>
        )}

        {/* Batch Photo Select Dialog */}
        <Dialog open={batchPhotoSelectOpen} onClose={() => setBatchPhotoSelectOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PhotoIcon />
              选择照片进行 OCR 提取
              {batchSelectedPhotoIds.size > 0 && (
                <Chip label={`${batchSelectedPhotoIds.size} 已选`} color="primary" size="small" />
              )}
            </Box>
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              请选择要提取的原始照片。已提取过的照片也可以再次提取；一对一场景下会覆盖原票据。
            </Typography>
            {allPhotos.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                没有可提取的照片
              </Typography>
            ) : (
              <List sx={{ maxHeight: 400, overflow: 'auto' }}>
                {allPhotos.map((photo) => (
                  <BatchPhotoListItem
                    key={photo.id}
                    photo={photo}
                    selected={batchSelectedPhotoIds.has(photo.id)}
                    onToggle={handleBatchPhotoToggle}
                  />
                ))}
              </List>
            )}
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setBatchPhotoSelectOpen(false)}>取消</Button>
            <Button variant="contained"
              onClick={handleBatchPhotoStartExtract}
              disabled={batchSelectedPhotoIds.size === 0}
              startIcon={<AutoAwesome />}>
              开始提取 ({batchSelectedPhotoIds.size})
            </Button>
          </DialogActions>
        </Dialog>

        {/* Batch Extract Dialog */}
        <BatchExtractDialog
          open={batchExtractOpen}
          selectedPhotoIds={Array.from(batchSelectedPhotoIds)}
          selectedPhotos={batchSelectedPhotos}
          onClose={() => {
            setBatchExtractOpen(false);
            setBatchSelectedPhotoIds(new Set());
            setBatchSelectedPhotos([]);
          }}
          onSaved={handleBatchExtractSaved}
        />
      </BoxAny>
    </>
  );
};
