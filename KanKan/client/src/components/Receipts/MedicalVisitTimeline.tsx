import React, { useState, useMemo } from 'react';
import {
  Box, Typography, Paper, IconButton, Chip, Collapse, Checkbox,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  LocalHospital as HospitalIcon,
  Assignment as RegIcon,
  MedicalServices as DiagIcon,
  Medication as RxIcon,
  Science as LabIcon,
  CameraAlt as ImageIcon,
  Receipt as PayIcon,
  Description as NoteIcon,
  TrendingDown as CheapIcon,
} from '@mui/icons-material';
import type { ReceiptDto } from '@/services/receipt.service';
import { useLanguage } from '@/i18n/LanguageContext';
import { formatDateZhCN } from '@/utils/date';

const BoxAny = Box as any;

const categoryOrder = [
  'Registration', 'Diagnosis', 'Prescription', 'LabResult',
  'ImagingResult', 'PaymentReceipt', 'DischargeNote', 'Other',
];

const categoryIcons: Record<string, React.ReactNode> = {
  Registration: <RegIcon fontSize="small" color="primary" />,
  Diagnosis: <DiagIcon fontSize="small" color="secondary" />,
  Prescription: <RxIcon fontSize="small" sx={{ color: '#e67e22' }} />,
  LabResult: <LabIcon fontSize="small" sx={{ color: '#2980b9' }} />,
  ImagingResult: <ImageIcon fontSize="small" sx={{ color: '#8e44ad' }} />,
  PaymentReceipt: <PayIcon fontSize="small" sx={{ color: '#c0392b' }} />,
  DischargeNote: <NoteIcon fontSize="small" sx={{ color: '#27ae60' }} />,
};

const categoryColors: Record<string, string> = {
  Registration: '#e8f5e9',
  Diagnosis: '#e3f2fd',
  Prescription: '#fff3e0',
  LabResult: '#e1f5fe',
  ImagingResult: '#f3e5f5',
  PaymentReceipt: '#fce4ec',
  DischargeNote: '#e8f5e9',
};

const paymentSummaryCellSx = {
  minWidth: 0,
} as const;

const paymentSummaryLabelSx = {
  fontSize: '0.72rem',
  color: 'text.secondary',
  lineHeight: 1.2,
} as const;

const paymentSummaryValueSx = {
  fontSize: '0.8rem',
  color: 'text.primary',
  fontWeight: 600,
  lineHeight: 1.35,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
} as const;

const renderSummaryField = (label: string, value?: string) => {
  if (!value?.trim()) return null;
  return (
    <BoxAny sx={paymentSummaryCellSx}>
      <Typography sx={paymentSummaryLabelSx}>{label}</Typography>
      <Typography sx={paymentSummaryValueSx}>{value.trim()}</Typography>
    </BoxAny>
  );
};

const renderAmountField = (label: string, value?: number) => {
  if (value == null) return null;
  return (
    <BoxAny sx={paymentSummaryCellSx}>
      <Typography sx={paymentSummaryLabelSx}>{label}</Typography>
      <Typography sx={paymentSummaryValueSx}>¥{value.toFixed(2)}</Typography>
    </BoxAny>
  );
};

interface MedHistoryEntry {
  source: string;
  date: string;
  price?: number;
  dosage?: string;
  frequency?: string;
}

interface HospitalGroup {
  key: string;
  hospitalName: string;
  date: string;
  receipts: ReceiptDto[];
  totalAmount: number;
}

interface MedicalVisitTimelineProps {
  medicalReceipts: ReceiptDto[];
  allReceipts: ReceiptDto[];
  checkedIds?: Set<string>;
  onToggleChecked?: (id: string) => void;
  onSelectReceipt: (r: ReceiptDto) => void;
}

const shouldShowMedicalAmount = (receipt: ReceiptDto) => receipt.category === 'PaymentReceipt';

export const MedicalVisitTimeline: React.FC<MedicalVisitTimelineProps> = ({
  medicalReceipts, allReceipts, checkedIds, onToggleChecked, onSelectReceipt,
}) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedMed, setExpandedMed] = useState<string | null>(null);

  const shouldIgnoreSelectionClick = () => !!window.getSelection()?.toString().trim();

  const toggle = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  // Group receipts by hospital+date
  const groups = useMemo((): HospitalGroup[] => {
    const map = new Map<string, ReceiptDto[]>();
    for (const r of medicalReceipts) {
      const hospital = r.hospitalName || '未知医院';
      const date = formatDateZhCN(r.receiptDate);
      const key = `${hospital}|${date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    const result: HospitalGroup[] = [];
    for (const [key, receipts] of map) {
      const [hospitalName, date] = key.split('|');
      const sorted = [...receipts].sort((a, b) =>
        categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category)
      );
      result.push({
        key,
        hospitalName,
        date,
        receipts: sorted,
        totalAmount: sorted.reduce((sum, receipt) => (
          shouldShowMedicalAmount(receipt) ? sum + (receipt.totalAmount || 0) : sum
        ), 0),
      });
    }
    // Sort groups by date descending
    result.sort((a, b) => b.date.localeCompare(a.date));
    return result;
  }, [medicalReceipts]);

  // Build medication history index
  const medHistoryMap = useMemo(() => {
    const map = new Map<string, MedHistoryEntry[]>();
    for (const r of allReceipts) {
      const source = r.hospitalName || r.merchantName || '';
      const date = formatDateZhCN(r.receiptDate);
      for (const med of r.medications) {
        if (!map.has(med.name)) map.set(med.name, []);
        map.get(med.name)!.push({ source, date, price: med.price, dosage: med.dosage, frequency: med.frequency });
      }
    }
    return map;
  }, [allReceipts]);

  const hasMedHistory = (name: string) => (medHistoryMap.get(name)?.length || 0) > 1;

  const handleMedClick = (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    if (!hasMedHistory(name)) return;
    setExpandedMed(prev => prev === name ? null : name);
  };

  if (medicalReceipts.length === 0) {
    return (
      <BoxAny sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
        <Typography>暂无票据</Typography>
      </BoxAny>
    );
  }

  return (
    <BoxAny>
      {groups.map((group) => {
        const isOpen = expanded[group.key] !== false; // default open
        const allGroupIds = group.receipts.map(r => r.id);
        const allChecked = onToggleChecked && allGroupIds.every(id => checkedIds?.has(id));

        return (
          <Paper key={group.key} sx={{ mb: 2, borderRadius: '10px', overflow: 'hidden' }}>
            {/* Hospital header */}
            <BoxAny
              sx={{ display: 'flex', alignItems: 'center', p: 2, cursor: 'pointer', bgcolor: 'rgba(7,193,96,0.06)' }}
              onClick={() => toggle(group.key)}
            >
              {onToggleChecked && (
                <Checkbox
                  size="small"
                  checked={!!allChecked}
                  indeterminate={!allChecked && allGroupIds.some(id => checkedIds?.has(id))}
                  onClick={(e) => {
                    e.stopPropagation();
                    allGroupIds.forEach(id => onToggleChecked(id));
                  }}
                  sx={{ p: 0, mr: 1, flexShrink: 0 }}
                />
              )}
              <HospitalIcon color="primary" sx={{ mr: 1.5 }} />
              <BoxAny sx={{ flex: 1 }}>
                <Typography fontWeight={700}>{group.hospitalName}</Typography>
                <Typography variant="caption" color="text.secondary">{group.date}</Typography>
              </BoxAny>
              <BoxAny sx={{ textAlign: 'right', mr: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {group.receipts.length} 份单据
                </Typography>
                {group.totalAmount > 0 && (
                  <Typography variant="body2" color="error.main" fontWeight={600}>
                    ¥{group.totalAmount.toFixed(2)}
                  </Typography>
                )}
              </BoxAny>
              <IconButton size="small">
                {isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </BoxAny>

            {/* Receipts inside */}
            <Collapse in={isOpen}>
              <BoxAny sx={{ px: 2, pb: 2 }}>
                {group.receipts.map((receipt, idx) => (
                  <BoxAny
                    key={receipt.id}
                    sx={{
                      display: 'flex', alignItems: 'flex-start', gap: 1.5,
                      pl: 2, py: 1, cursor: 'pointer', borderRadius: 2,
                      position: 'relative',
                      '&:hover': { bgcolor: 'rgba(0,0,0,0.03)' },
                      '&::before': idx < group.receipts.length - 1 ? {
                        content: '""', position: 'absolute', left: 10, top: 32,
                        bottom: -8, width: 2, bgcolor: 'divider',
                      } : undefined,
                    }}
                    onClick={() => {
                      if (shouldIgnoreSelectionClick()) return;
                      onSelectReceipt(receipt);
                    }}
                  >
                    <BoxAny sx={{
                      width: 32, height: 32, borderRadius: '50%', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      bgcolor: categoryColors[receipt.category] || '#f5f5f5',
                      border: '2px solid', borderColor: 'divider', zIndex: 1,
                    }}>
                      {categoryIcons[receipt.category] || <NoteIcon fontSize="small" />}
                    </BoxAny>
                    <BoxAny sx={{ flex: 1, minWidth: 0 }}>
                      <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          label={
                            receipt.category === 'LabResult' && receipt.notes
                              ? receipt.notes
                              : t(`receipts.cat.${receipt.category}`)
                          }
                          size="small"
                          sx={{ bgcolor: categoryColors[receipt.category] || '#f5f5f5' }}
                        />
                        {shouldShowMedicalAmount(receipt) && receipt.totalAmount != null && (
                          <Typography variant="body2" color="error.main" fontWeight={600}>
                            ¥{receipt.totalAmount.toFixed(2)}
                          </Typography>
                        )}
                      </BoxAny>
                      {receipt.department && (
                        <Typography variant="caption" color="text.secondary">
                          科室: {receipt.department}
                        </Typography>
                      )}
                      {receipt.category === 'PaymentReceipt' && (
                        <BoxAny sx={{
                          mt: 0.6,
                          p: 1,
                          borderRadius: 1.5,
                          bgcolor: 'rgba(192,57,43,0.04)',
                          border: '1px solid rgba(192,57,43,0.10)',
                        }}>
                          <BoxAny sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' },
                            gap: 1,
                          }}>
                            {renderSummaryField('患者', receipt.patientName)}
                            {renderSummaryField('门诊号', receipt.outpatientNumber)}
                            {renderSummaryField('医保类型', receipt.insuranceType)}
                            {renderSummaryField('医保编号', receipt.medicalInsuranceNumber)}
                            {renderAmountField('合计', receipt.totalAmount)}
                            {renderAmountField('医保统筹', receipt.medicalInsuranceFundPayment)}
                            {renderAmountField('个人自付', receipt.personalSelfPay)}
                            {renderAmountField('个人自费', receipt.personalOutOfPocket)}
                          </BoxAny>
                          {receipt.items.length > 0 && (
                            <BoxAny sx={{ mt: 0.8 }}>
                              <Typography sx={{ ...paymentSummaryLabelSx, mb: 0.4 }}>收费项目</Typography>
                              <BoxAny sx={{
                                display: 'grid',
                                gridTemplateColumns: 'minmax(0, 1fr) auto',
                                columnGap: 1,
                                rowGap: 0.25,
                              }}>
                                {receipt.items.slice(0, 4).map((item, itemIndex) => (
                                  <React.Fragment key={itemIndex}>
                                    <Typography sx={{ fontSize: '0.78rem', color: 'text.primary', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {item.name}
                                    </Typography>
                                    <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', fontWeight: 600, textAlign: 'right' }}>
                                      {item.totalPrice != null ? `¥${item.totalPrice.toFixed(2)}` : '—'}
                                    </Typography>
                                  </React.Fragment>
                                ))}
                              </BoxAny>
                              {receipt.items.length > 4 && (
                                <Typography sx={{ ...paymentSummaryLabelSx, mt: 0.4 }}>
                                  另有 {receipt.items.length - 4} 项，点击查看完整票据
                                </Typography>
                              )}
                            </BoxAny>
                          )}
                        </BoxAny>
                      )}
                      {receipt.diagnosisText && (
                        <Typography variant="caption" display="block" color="text.secondary" noWrap>
                          诊断: {receipt.diagnosisText}
                        </Typography>
                      )}
                      {receipt.category === 'Registration' && receipt.patientName && (
                        <Typography variant="caption" display="block" color="text.secondary" noWrap>
                          患者: {receipt.patientName}
                        </Typography>
                      )}
                      {receipt.category === 'ImagingResult' && receipt.imagingFindings && (
                        <Typography variant="caption" display="block" color="text.secondary" noWrap>
                          所见: {receipt.imagingFindings}
                        </Typography>
                      )}
                      {(receipt.category === 'Diagnosis' || receipt.category === 'DischargeNote') && receipt.patientName && (
                        <Typography variant="caption" display="block" color="text.secondary" noWrap>
                          患者: {receipt.patientName}
                        </Typography>
                      )}

                      {/* Medications table */}
                      {receipt.medications.length > 0 && (
                        <BoxAny sx={{ mt: 0.3 }}>
                          <BoxAny sx={{ display: 'flex', gap: 0.5, pb: 0.2, borderBottom: '1px solid', borderColor: 'divider' }}>
                            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>药品名称</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ width: 50, textAlign: 'right', flexShrink: 0 }}>用量</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ width: 70, textAlign: 'right', flexShrink: 0 }}>频次</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ width: 40, textAlign: 'right', flexShrink: 0 }}>天数</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ width: 56, textAlign: 'right', flexShrink: 0 }}>价格</Typography>
                          </BoxAny>
                          {receipt.medications.map((med, mi) => {
                            const clickable = hasMedHistory(med.name);
                            const isExp = expandedMed === med.name;
                            return (
                              <BoxAny key={mi}>
                                <BoxAny sx={{ display: 'flex', gap: 0.5, py: 0.15 }}>
                                  <Typography variant="caption" sx={{
                                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    ...(clickable ? {
                                      color: 'primary.main', cursor: 'pointer',
                                      textDecoration: isExp ? 'underline' : 'none',
                                      '&:hover': { textDecoration: 'underline' },
                                    } : { color: 'text.secondary' }),
                                  }} onClick={clickable ? (e) => handleMedClick(e, med.name) : undefined}>
                                    {med.name}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary" sx={{ width: 50, textAlign: 'right', flexShrink: 0 }}>{med.dosage || ''}</Typography>
                                  <Typography variant="caption" color="text.secondary" sx={{ width: 70, textAlign: 'right', flexShrink: 0 }}>{med.frequency || ''}</Typography>
                                  <Typography variant="caption" color="text.secondary" sx={{ width: 40, textAlign: 'right', flexShrink: 0 }}>{med.days ? `${med.days}天` : ''}</Typography>
                                  <Typography variant="caption" color="text.secondary" sx={{ width: 56, textAlign: 'right', flexShrink: 0, fontWeight: 600 }}>{med.price != null ? `¥${med.price.toFixed(2)}` : ''}</Typography>
                                </BoxAny>
                                <Collapse in={isExp}>
                                  <MedHistoryPanel entries={medHistoryMap.get(med.name) || []} currentSource={receipt.hospitalName || ''} />
                                </Collapse>
                              </BoxAny>
                            );
                          })}
                        </BoxAny>
                      )}
                    </BoxAny>
                    {receipt.imageUrl && (
                      <Typography variant="caption" color="primary"
                        sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' }, display: 'inline-flex', alignItems: 'center', gap: 0.3, flexShrink: 0 }}
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); window.open(receipt.imageUrl, '_blank'); }}>
                        <ImageIcon sx={{ fontSize: 14 }} />
                        原图
                      </Typography>
                    )}
                  </BoxAny>
                ))}
              </BoxAny>
            </Collapse>
          </Paper>
        );
      })}
    </BoxAny>
  );
};

/** Medication history panel */
const MedHistoryPanel: React.FC<{ entries: MedHistoryEntry[]; currentSource: string }> = ({ entries, currentSource }) => {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const prices = sorted.map(e => e.price ?? Infinity);
  const minPrice = Math.min(...prices);

  return (
    <BoxAny
      sx={{ ml: 1, my: 0.3, pl: 1.5, borderLeft: '2px solid', borderColor: 'warning.light', bgcolor: 'rgba(255, 152, 0, 0.04)', borderRadius: '0 4px 4px 0', py: 0.3 }}
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
    >
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 0.2, display: 'block' }}>
        用药记录 ({sorted.length}次)
      </Typography>
      {sorted.map((entry, i) => {
        const isCheapest = entry.price != null && entry.price === minPrice && sorted.length > 1;
        const isCurrent = entry.source === currentSource;
        return (
          <BoxAny key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ width: 80, flexShrink: 0 }}>{entry.date}</Typography>
            <Typography variant="caption" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isCurrent ? 600 : 400, color: isCurrent ? 'text.primary' : 'text.secondary' }}>
              {entry.source}
            </Typography>
            {entry.dosage && <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>{entry.dosage}</Typography>}
            {entry.price != null && (
              <Typography variant="caption" sx={{ flexShrink: 0, fontWeight: 600, color: isCheapest ? 'success.main' : 'text.secondary', display: 'inline-flex', alignItems: 'center', gap: 0.3 }}>
                {isCheapest && <CheapIcon sx={{ fontSize: 12 }} />}
                ¥{entry.price.toFixed(2)}
              </Typography>
            )}
          </BoxAny>
        );
      })}
    </BoxAny>
  );
};
