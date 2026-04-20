import React, { useState, useMemo } from 'react';
import {
  Box, Typography, Paper, IconButton, Chip, Collapse, Button, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  LocalHospital as HospitalIcon,
  Add as AddIcon,
  Assignment as RegIcon,
  MedicalServices as DiagIcon,
  Medication as RxIcon,
  Science as LabIcon,
  CameraAlt as ImageIcon,
  Receipt as PayIcon,
  Description as NoteIcon,
  TrendingDown as CheapIcon,
} from '@mui/icons-material';
import type { ReceiptDto, ReceiptVisitDto } from '@/services/receipt.service';
import { receiptService } from '@/services/receipt.service';
import { useLanguage } from '@/i18n/LanguageContext';

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

interface MedHistoryEntry {
  source: string; // hospital or merchant name
  date: string;
  price?: number;
  dosage?: string;
  frequency?: string;
  value?: string; // for lab results
  unit?: string;
  referenceRange?: string;
  status?: string;
}

interface MedicalVisitTimelineProps {
  visits: ReceiptVisitDto[];
  unlinkedReceipts: ReceiptDto[];
  allReceipts: ReceiptDto[];
  onSelectReceipt: (r: ReceiptDto) => void;
  onRefresh: () => void;
}

export const MedicalVisitTimeline: React.FC<MedicalVisitTimelineProps> = ({
  visits, unlinkedReceipts, allReceipts, onSelectReceipt, onRefresh,
}) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedMed, setExpandedMed] = useState<string | null>(null);
  const [expandedLab, setExpandedLab] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newVisit, setNewVisit] = useState({ hospitalName: '', department: '', patientName: '', visitDate: '' });

  const toggle = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  // Build medication history index
  const medHistoryMap = useMemo(() => {
    const map = new Map<string, MedHistoryEntry[]>();
    for (const r of allReceipts) {
      const source = r.hospitalName || r.merchantName || '';
      const date = r.receiptDate ? new Date(r.receiptDate).toLocaleDateString('zh-CN') : '';
      for (const med of r.medications) {
        const key = med.name;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({
          source, date, price: med.price,
          dosage: med.dosage, frequency: med.frequency,
        });
      }
    }
    return map;
  }, [allReceipts]);

  // Build lab result history index
  const labHistoryMap = useMemo(() => {
    const map = new Map<string, MedHistoryEntry[]>();
    for (const r of allReceipts) {
      const source = r.hospitalName || '';
      const date = r.receiptDate ? new Date(r.receiptDate).toLocaleDateString('zh-CN') : '';
      for (const lab of r.labResults) {
        const key = lab.name;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({
          source, date, value: lab.value, unit: lab.unit,
          referenceRange: lab.referenceRange, status: lab.status,
        });
      }
    }
    return map;
  }, [allReceipts]);

  const hasMedHistory = (name: string) => (medHistoryMap.get(name)?.length || 0) > 1;
  const hasLabHistory = (name: string) => (labHistoryMap.get(name)?.length || 0) > 1;

  const handleMedClick = (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    if (!hasMedHistory(name)) return;
    setExpandedMed(prev => prev === name ? null : name);
  };

  const handleLabClick = (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    if (!hasLabHistory(name)) return;
    setExpandedLab(prev => prev === name ? null : name);
  };

  const handleCreateVisit = async () => {
    try {
      await receiptService.createVisit({
        hospitalName: newVisit.hospitalName || undefined,
        department: newVisit.department || undefined,
        patientName: newVisit.patientName || undefined,
        visitDate: newVisit.visitDate || undefined,
      });
      setCreateOpen(false);
      setNewVisit({ hospitalName: '', department: '', patientName: '', visitDate: '' });
      onRefresh();
    } catch { /* ignore */ }
  };

  const sortedReceipts = (receipts: ReceiptDto[]) =>
    [...receipts].sort((a, b) =>
      categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category)
    );

  return (
    <BoxAny>
      <BoxAny sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          {t('receipts.medical.visits')} ({visits.length})
        </Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          {t('receipts.medical.newVisit')}
        </Button>
      </BoxAny>

      {visits.length === 0 && unlinkedReceipts.length === 0 && (
        <BoxAny sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <HospitalIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
          <Typography>{t('receipts.medical.empty')}</Typography>
        </BoxAny>
      )}

      {visits.map((visit) => {
        const isOpen = expanded[visit.id] !== false; // default open
        const sorted = sortedReceipts(visit.receipts);
        const totalAmount = sorted.reduce((s, r) => s + (r.totalAmount || 0), 0);

        return (
          <Paper key={visit.id} sx={{ mb: 2, borderRadius: 3, overflow: 'hidden' }}>
            <BoxAny
              sx={{ display: 'flex', alignItems: 'center', p: 2, cursor: 'pointer',
                bgcolor: 'rgba(7,193,96,0.06)' }}
              onClick={() => toggle(visit.id)}
            >
              <HospitalIcon color="primary" sx={{ mr: 1.5 }} />
              <BoxAny sx={{ flex: 1 }}>
                <Typography fontWeight={700}>
                  {visit.hospitalName || t('receipts.medical.unknownHospital')}
                </Typography>
                <BoxAny sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  {visit.department && (
                    <Typography variant="caption" color="text.secondary">{visit.department}</Typography>
                  )}
                  {visit.visitDate && (
                    <Typography variant="caption" color="text.secondary">
                      {new Date(visit.visitDate).toLocaleDateString('zh-CN')}
                    </Typography>
                  )}
                  {visit.patientName && (
                    <Typography variant="caption" color="text.secondary">
                      {t('receipts.medical.patient')}: {visit.patientName}
                    </Typography>
                  )}
                </BoxAny>
              </BoxAny>
              <BoxAny sx={{ textAlign: 'right', mr: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {sorted.length} {t('receipts.medical.documents')}
                </Typography>
                {totalAmount > 0 && (
                  <Typography variant="body2" color="error.main" fontWeight={600}>
                    ¥{totalAmount.toFixed(2)}
                  </Typography>
                )}
              </BoxAny>
              <IconButton size="small">
                {isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </BoxAny>

            <Collapse in={isOpen}>
              <BoxAny sx={{ px: 2, pb: 2 }}>
                {/* Timeline */}
                {sorted.map((receipt, idx) => (
                  <BoxAny
                    key={receipt.id}
                    sx={{
                      display: 'flex', alignItems: 'flex-start', gap: 1.5,
                      pl: 2, py: 1, cursor: 'pointer', borderRadius: 2,
                      position: 'relative',
                      '&:hover': { bgcolor: 'rgba(0,0,0,0.03)' },
                      '&::before': idx < sorted.length - 1 ? {
                        content: '""', position: 'absolute', left: 10, top: 32,
                        bottom: -8, width: 2, bgcolor: 'divider',
                      } : undefined,
                    }}
                    onClick={() => onSelectReceipt(receipt)}
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
                          label={t(`receipts.cat.${receipt.category}`)}
                          size="small"
                          sx={{ bgcolor: categoryColors[receipt.category] || '#f5f5f5' }}
                        />
                        {receipt.totalAmount != null && (
                          <Typography variant="body2" color="error.main" fontWeight={600}>
                            ¥{receipt.totalAmount.toFixed(2)}
                          </Typography>
                        )}
                      </BoxAny>
                      {receipt.doctorName && (
                        <Typography variant="caption" color="text.secondary">
                          {t('receipts.medical.doctor')}: {receipt.doctorName}
                        </Typography>
                      )}
                      {receipt.diagnosisText && (
                        <Typography variant="caption" display="block" color="text.secondary" noWrap>
                          {receipt.diagnosisText}
                        </Typography>
                      )}

                      {/* Medications — clickable for history */}
                      {receipt.medications.length > 0 && (
                        <BoxAny sx={{ mt: 0.3 }}>
                          {receipt.medications.map((med, mi) => {
                            const clickable = hasMedHistory(med.name);
                            const isExp = expandedMed === med.name;
                            return (
                              <BoxAny key={mi}>
                                <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      ...(clickable ? {
                                        color: 'primary.main', cursor: 'pointer',
                                        textDecoration: isExp ? 'underline' : 'none',
                                        '&:hover': { textDecoration: 'underline' },
                                      } : { color: 'text.secondary' }),
                                    }}
                                    onClick={clickable ? (e) => handleMedClick(e, med.name) : undefined}
                                  >
                                    {med.name}
                                  </Typography>
                                  {med.price != null && (
                                    <Typography variant="caption" color="text.secondary">
                                      ¥{med.price.toFixed(2)}
                                    </Typography>
                                  )}
                                </BoxAny>
                                <Collapse in={isExp}>
                                  <MedHistoryPanel entries={medHistoryMap.get(med.name) || []} currentSource={receipt.hospitalName || ''} />
                                </Collapse>
                              </BoxAny>
                            );
                          })}
                        </BoxAny>
                      )}

                      {/* Lab results — clickable for history */}
                      {receipt.labResults.length > 0 && (
                        <BoxAny sx={{ mt: 0.3 }}>
                          {receipt.labResults.map((lab, li) => {
                            const clickable = hasLabHistory(lab.name);
                            const isExp = expandedLab === lab.name;
                            const isAbnormal = lab.status && lab.status !== 'Normal';
                            return (
                              <BoxAny key={li}>
                                <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      ...(clickable ? {
                                        color: 'primary.main', cursor: 'pointer',
                                        textDecoration: isExp ? 'underline' : 'none',
                                        '&:hover': { textDecoration: 'underline' },
                                      } : { color: 'text.secondary' }),
                                    }}
                                    onClick={clickable ? (e) => handleLabClick(e, lab.name) : undefined}
                                  >
                                    {lab.name}
                                  </Typography>
                                  <Typography variant="caption" sx={{
                                    color: isAbnormal ? 'error.main' : 'text.secondary',
                                    fontWeight: isAbnormal ? 600 : 400,
                                  }}>
                                    {lab.value}{lab.unit ? ` ${lab.unit}` : ''}
                                    {lab.status === 'High' ? ' ↑' : lab.status === 'Low' ? ' ↓' : ''}
                                  </Typography>
                                </BoxAny>
                                <Collapse in={isExp}>
                                  <LabHistoryPanel entries={labHistoryMap.get(lab.name) || []} />
                                </Collapse>
                              </BoxAny>
                            );
                          })}
                        </BoxAny>
                      )}
                    </BoxAny>
                    {receipt.imageUrl && (
                      <Typography
                        variant="caption"
                        color="primary"
                        sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' }, display: 'inline-flex', alignItems: 'center', gap: 0.3, flexShrink: 0 }}
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          window.open(receipt.imageUrl, '_blank');
                        }}
                      >
                        <ImageIcon sx={{ fontSize: 14 }} />
                        原图
                      </Typography>
                    )}
                  </BoxAny>
                ))}
                {sorted.length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    {t('receipts.medical.noDocuments')}
                  </Typography>
                )}
              </BoxAny>
            </Collapse>
          </Paper>
        );
      })}

      {/* Unlinked medical receipts */}
      {unlinkedReceipts.length > 0 && (
        <Paper sx={{ mb: 2, borderRadius: 3, p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            {t('receipts.medical.unlinked')} ({unlinkedReceipts.length})
          </Typography>
          {unlinkedReceipts.map(r => (
            <BoxAny
              key={r.id}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, cursor: 'pointer',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.03)' }, borderRadius: 1, px: 1 }}
              onClick={() => onSelectReceipt(r)}
            >
              {categoryIcons[r.category] || <NoteIcon fontSize="small" />}
              <Typography variant="body2" sx={{ flex: 1 }}>
                {r.hospitalName || t(`receipts.cat.${r.category}`)}
              </Typography>
              {r.receiptDate && (
                <Typography variant="caption" color="text.secondary">
                  {new Date(r.receiptDate).toLocaleDateString('zh-CN')}
                </Typography>
              )}
            </BoxAny>
          ))}
        </Paper>
      )}

      {/* Create Visit Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('receipts.medical.newVisit')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label={t('receipts.medical.hospitalName')}
            value={newVisit.hospitalName}
            onChange={e => setNewVisit(v => ({ ...v, hospitalName: e.target.value }))}
            fullWidth
          />
          <TextField
            label={t('receipts.medical.department')}
            value={newVisit.department}
            onChange={e => setNewVisit(v => ({ ...v, department: e.target.value }))}
            fullWidth
          />
          <TextField
            label={t('receipts.medical.patientName')}
            value={newVisit.patientName}
            onChange={e => setNewVisit(v => ({ ...v, patientName: e.target.value }))}
            fullWidth
          />
          <TextField
            label={t('receipts.medical.visitDateLabel')}
            type="date"
            value={newVisit.visitDate}
            onChange={e => setNewVisit(v => ({ ...v, visitDate: e.target.value }))}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleCreateVisit}>{t('common.confirm')}</Button>
        </DialogActions>
      </Dialog>
    </BoxAny>
  );
};

/** Medication history panel — shows price comparison across sources */
const MedHistoryPanel: React.FC<{ entries: MedHistoryEntry[]; currentSource: string }> = ({ entries, currentSource }) => {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const prices = sorted.map(e => e.price ?? Infinity);
  const minPrice = Math.min(...prices);

  return (
    <BoxAny
      sx={{
        ml: 1, my: 0.3, pl: 1.5, borderLeft: '2px solid', borderColor: 'warning.light',
        bgcolor: 'rgba(255, 152, 0, 0.04)', borderRadius: '0 4px 4px 0', py: 0.3,
      }}
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
            <Typography variant="caption" color="text.secondary" sx={{ width: 80, flexShrink: 0 }}>
              {entry.date}
            </Typography>
            <Typography variant="caption" sx={{
              flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontWeight: isCurrent ? 600 : 400,
              color: isCurrent ? 'text.primary' : 'text.secondary',
            }}>
              {entry.source}
            </Typography>
            {entry.dosage && (
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                {entry.dosage}
              </Typography>
            )}
            {entry.price != null && (
              <Typography variant="caption" sx={{
                flexShrink: 0, fontWeight: 600,
                color: isCheapest ? 'success.main' : 'text.secondary',
                display: 'inline-flex', alignItems: 'center', gap: 0.3,
              }}>
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

/** Lab result history panel — shows value trend across visits */
const LabHistoryPanel: React.FC<{ entries: MedHistoryEntry[] }> = ({ entries }) => {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <BoxAny
      sx={{
        ml: 1, my: 0.3, pl: 1.5, borderLeft: '2px solid', borderColor: 'info.light',
        bgcolor: 'rgba(33, 150, 243, 0.04)', borderRadius: '0 4px 4px 0', py: 0.3,
      }}
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
    >
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 0.2, display: 'block' }}>
        检验趋势 ({sorted.length}次)
      </Typography>
      {sorted.map((entry, i) => {
        const isAbnormal = entry.status && entry.status !== 'Normal';
        const arrow = entry.status === 'High' ? ' ↑' : entry.status === 'Low' ? ' ↓' : '';
        return (
          <BoxAny key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ width: 80, flexShrink: 0 }}>
              {entry.date}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {entry.source}
            </Typography>
            <Typography variant="caption" sx={{
              flexShrink: 0, fontWeight: 600,
              color: isAbnormal ? 'error.main' : 'success.main',
            }}>
              {entry.value}{entry.unit ? ` ${entry.unit}` : ''}{arrow}
            </Typography>
            {entry.referenceRange && (
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                ({entry.referenceRange})
              </Typography>
            )}
          </BoxAny>
        );
      })}
    </BoxAny>
  );
};
