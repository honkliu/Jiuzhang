import React, { useState } from 'react';
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

interface MedicalVisitTimelineProps {
  visits: ReceiptVisitDto[];
  unlinkedReceipts: ReceiptDto[];
  onSelectReceipt: (r: ReceiptDto) => void;
  onRefresh: () => void;
}

export const MedicalVisitTimeline: React.FC<MedicalVisitTimelineProps> = ({
  visits, unlinkedReceipts, onSelectReceipt, onRefresh,
}) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [newVisit, setNewVisit] = useState({ hospitalName: '', department: '', patientName: '', visitDate: '' });

  const toggle = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

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
                      // Timeline line
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
                      {receipt.medications.length > 0 && (
                        <Typography variant="caption" display="block" color="text.secondary" noWrap>
                          {receipt.medications.map(m => m.name).join('、')}
                        </Typography>
                      )}
                    </BoxAny>
                    {receipt.imageUrl && (
                      <BoxAny
                        component="img"
                        src={receipt.imageUrl}
                        sx={{ width: 48, height: 48, borderRadius: 1, objectFit: 'cover', flexShrink: 0 }}
                      />
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
