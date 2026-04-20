import React, { useState } from 'react';
import {
  Box, Typography, IconButton, Paper,
  Dialog, DialogContent, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Delete as DeleteIcon,
  ZoomIn as ZoomIcon,
} from '@mui/icons-material';
import type { ReceiptDto } from '@/services/receipt.service';
import { useLanguage } from '@/i18n/LanguageContext';

const BoxAny = Box as any;

// ── Shared styles mimicking Chinese hospital document paper ────────────────
const reportPaperSx = {
  borderRadius: 0,
  border: '1px solid #333',
  mb: 2,
  overflow: 'hidden',
  boxShadow: 'none',
  bgcolor: '#fff',
};

const reportHeaderSx = {
  textAlign: 'center' as const,
  borderBottom: '2px solid #333',
  py: 1.5,
  px: 2,
};

const reportTitleSx = {
  fontWeight: 800,
  fontSize: '1.15rem',
  letterSpacing: 4,
  color: '#111',
};

const reportSubtitleSx = {
  fontSize: '0.78rem',
  color: '#555',
  mt: 0.3,
};

const infoGridSx = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr auto 1fr',
  gap: '2px 8px',
  px: 2,
  py: 1,
  borderBottom: '1px solid #ccc',
  fontSize: '0.82rem',
};

const labelSx = {
  color: '#555',
  whiteSpace: 'nowrap' as const,
  fontSize: '0.82rem',
  py: 0.2,
};

const valueSx = {
  borderBottom: '1px dotted #999',
  minWidth: 60,
  fontSize: '0.82rem',
  py: 0.2,
};

// Table cell style matching real hospital report tables
const thCellSx = {
  fontWeight: 700,
  fontSize: '0.78rem',
  color: '#333',
  borderBottom: '2px solid #333',
  borderRight: '1px solid #ddd',
  py: 0.6,
  px: 1,
  whiteSpace: 'nowrap' as const,
  bgcolor: '#f7f7f7',
};

const tdCellSx = {
  fontSize: '0.82rem',
  borderBottom: '1px solid #eee',
  borderRight: '1px solid #eee',
  py: 0.5,
  px: 1,
};

// ── Component ──────────────────────────────────────────────────────────────

interface ReceiptDetailProps {
  receipt: ReceiptDto;
  onBack: () => void;
  onDelete: () => void;
}

export const ReceiptDetail: React.FC<ReceiptDetailProps> = ({ receipt, onBack, onDelete }) => {
  const { t } = useLanguage();
  const [imageOpen, setImageOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState('');

  const openImage = (url: string) => { setSelectedImage(url); setImageOpen(true); };
  const isMedical = receipt.type === 'Medical';
  const dateStr = receipt.receiptDate ? new Date(receipt.receiptDate).toLocaleDateString('zh-CN') : '';

  return (
    <BoxAny sx={{ maxWidth: 800, mx: 'auto', px: { xs: 1, sm: 2 }, pt: 2, pb: 4 }}>
      {/* Navigation */}
      <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={onBack}><BackIcon /></IconButton>
        <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
          {receipt.merchantName || receipt.hospitalName || t(`receipts.cat.${receipt.category}`)}
        </Typography>
        <IconButton color="error" onClick={onDelete}><DeleteIcon /></IconButton>
      </BoxAny>

      {/* Original photo — tap to zoom */}
      {receipt.imageUrl && (
        <Paper
          sx={{ borderRadius: 2, overflow: 'hidden', mb: 2, cursor: 'pointer', position: 'relative', boxShadow: 1 }}
          onClick={() => openImage(receipt.imageUrl)}
        >
          <BoxAny component="img" src={receipt.imageUrl}
            sx={{ width: '100%', maxHeight: 300, objectFit: 'contain', display: 'block', bgcolor: '#fafafa' }} />
          <BoxAny sx={{ position: 'absolute', bottom: 8, right: 8, bgcolor: 'rgba(0,0,0,0.5)', borderRadius: '50%', p: 0.5 }}>
            <ZoomIcon sx={{ color: 'white' }} fontSize="small" />
          </BoxAny>
        </Paper>
      )}

      {/* Additional photos */}
      {receipt.additionalImageUrls.length > 0 && (
        <BoxAny sx={{ display: 'flex', gap: 1, mb: 2, overflowX: 'auto' }}>
          {receipt.additionalImageUrls.map((url, i) => (
            <BoxAny key={i} component="img" src={url}
              sx={{ width: 72, height: 72, borderRadius: 1, objectFit: 'cover', cursor: 'pointer', flexShrink: 0, border: '1px solid #ddd' }}
              onClick={() => openImage(url)}
            />
          ))}
        </BoxAny>
      )}

      {/* ── Structured data rendered in hospital-document style ── */}
      {isMedical ? (
        <MedicalDocument receipt={receipt} dateStr={dateStr} t={t} />
      ) : (
        <ShoppingDocument receipt={receipt} dateStr={dateStr} t={t} />
      )}

      {/* Image zoom dialog */}
      <Dialog open={imageOpen} onClose={() => setImageOpen(false)} maxWidth="lg">
        <DialogContent sx={{ p: 0 }}>
          <BoxAny component="img" src={selectedImage} sx={{ width: '100%', display: 'block' }} />
        </DialogContent>
      </Dialog>
    </BoxAny>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// Medical document — renders like real Chinese hospital printouts
// ════════════════════════════════════════════════════════════════════════════

const MedicalDocument: React.FC<{
  receipt: ReceiptDto;
  dateStr: string;
  t: (k: string) => string;
}> = ({ receipt, dateStr, t }) => {
  const cat = receipt.category;

  return (
    <>
      {/* ── 检验报告单 (Lab Result) ── */}
      {(cat === 'LabResult' && receipt.labResults.length > 0) && (
        <Paper sx={reportPaperSx}>
          <BoxAny sx={reportHeaderSx}>
            <Typography sx={reportTitleSx}>
              {receipt.hospitalName || '医院'}
            </Typography>
            <Typography sx={{ ...reportTitleSx, mt: 0.5 }}>
              检 验 报 告 单
            </Typography>
            <Typography sx={reportSubtitleSx}>Laboratory Test Report</Typography>
          </BoxAny>

          {/* Patient info grid — mimics the real top-of-report layout */}
          <BoxAny sx={infoGridSx}>
            <Typography sx={labelSx}>姓　名</Typography>
            <Typography sx={valueSx}>{receipt.patientName || '—'}</Typography>
            <Typography sx={labelSx}>科　室</Typography>
            <Typography sx={valueSx}>{receipt.department || '—'}</Typography>

            <Typography sx={labelSx}>送检医生</Typography>
            <Typography sx={valueSx}>{receipt.doctorName || '—'}</Typography>
            <Typography sx={labelSx}>报告日期</Typography>
            <Typography sx={valueSx}>{dateStr || '—'}</Typography>
          </BoxAny>

          {/* Results table — matches real 检验报告 */}
          <TableContainer>
            <Table size="small" sx={{ '& td, & th': { borderColor: '#ddd' } }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={thCellSx}>检验项目</TableCell>
                  <TableCell sx={thCellSx} align="center">结果</TableCell>
                  <TableCell sx={thCellSx} align="center">标志</TableCell>
                  <TableCell sx={thCellSx} align="center">单位</TableCell>
                  <TableCell sx={thCellSx} align="center">参考范围</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {receipt.labResults.map((lab, i) => {
                  const isAbnormal = lab.status && lab.status !== 'Normal';
                  const arrow = lab.status === 'High' ? '↑' : lab.status === 'Low' ? '↓' : '';
                  return (
                    <TableRow key={i} sx={isAbnormal ? { bgcolor: '#fff8f8' } : undefined}>
                      <TableCell sx={tdCellSx}>{lab.name}</TableCell>
                      <TableCell sx={{ ...tdCellSx, fontWeight: isAbnormal ? 700 : 400, color: isAbnormal ? '#c00' : '#111' }} align="center">
                        {lab.value || '—'}
                      </TableCell>
                      <TableCell sx={{ ...tdCellSx, color: '#c00', fontWeight: 700, fontSize: '1rem' }} align="center">
                        {arrow}
                      </TableCell>
                      <TableCell sx={tdCellSx} align="center">{lab.unit || ''}</TableCell>
                      <TableCell sx={tdCellSx} align="center">{lab.referenceRange || ''}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Footer */}
          <BoxAny sx={{ display: 'flex', justifyContent: 'space-between', px: 2, py: 1.5, borderTop: '1px solid #ccc', fontSize: '0.78rem', color: '#777' }}>
            <span>审核者：___________</span>
            <span>检验者：___________</span>
            <span>打印时间：{dateStr}</span>
          </BoxAny>
        </Paper>
      )}

      {/* ── 诊断报告 / 出院小结 (Diagnosis / Discharge) ── */}
      {(cat === 'Diagnosis' || cat === 'DischargeNote') && (
        <Paper sx={reportPaperSx}>
          <BoxAny sx={reportHeaderSx}>
            <Typography sx={reportTitleSx}>
              {receipt.hospitalName || '医院'}
            </Typography>
            <Typography sx={{ ...reportTitleSx, mt: 0.5 }}>
              {cat === 'Diagnosis' ? '诊 断 证 明 书' : '出 院 小 结'}
            </Typography>
          </BoxAny>

          <BoxAny sx={infoGridSx}>
            <Typography sx={labelSx}>姓　名</Typography>
            <Typography sx={valueSx}>{receipt.patientName || '—'}</Typography>
            <Typography sx={labelSx}>科　室</Typography>
            <Typography sx={valueSx}>{receipt.department || '—'}</Typography>
            <Typography sx={labelSx}>主治医师</Typography>
            <Typography sx={valueSx}>{receipt.doctorName || '—'}</Typography>
            <Typography sx={labelSx}>日　期</Typography>
            <Typography sx={valueSx}>{dateStr || '—'}</Typography>
          </BoxAny>

          <BoxAny sx={{ px: 2, py: 2, minHeight: 120 }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, mb: 0.5 }}>诊断内容：</Typography>
            <Typography sx={{ fontSize: '0.85rem', lineHeight: 2, whiteSpace: 'pre-wrap', borderBottom: '1px dotted #999', pb: 1 }}>
              {receipt.diagnosisText || ''}
            </Typography>
          </BoxAny>

          <BoxAny sx={{ display: 'flex', justifyContent: 'flex-end', px: 2, py: 1.5, borderTop: '1px solid #ccc' }}>
            <BoxAny sx={{ textAlign: 'center', fontSize: '0.78rem', color: '#555' }}>
              <div>医师签名：___________</div>
              <div style={{ marginTop: 4 }}>{dateStr}</div>
            </BoxAny>
          </BoxAny>
        </Paper>
      )}

      {/* ── 处方笺 (Prescription) ── */}
      {cat === 'Prescription' && receipt.medications.length > 0 && (
        <Paper sx={reportPaperSx}>
          <BoxAny sx={reportHeaderSx}>
            <Typography sx={reportTitleSx}>
              {receipt.hospitalName || '医院'}
            </Typography>
            <Typography sx={{ ...reportTitleSx, mt: 0.5, color: '#333' }}>
              处　方　笺
            </Typography>
            <Typography sx={reportSubtitleSx}>Prescription</Typography>
          </BoxAny>

          <BoxAny sx={infoGridSx}>
            <Typography sx={labelSx}>姓　名</Typography>
            <Typography sx={valueSx}>{receipt.patientName || '—'}</Typography>
            <Typography sx={labelSx}>科　室</Typography>
            <Typography sx={valueSx}>{receipt.department || '—'}</Typography>
            <Typography sx={labelSx}>临床诊断</Typography>
            <Typography sx={valueSx}>{receipt.diagnosisText || '—'}</Typography>
            <Typography sx={labelSx}>日　期</Typography>
            <Typography sx={valueSx}>{dateStr || '—'}</Typography>
          </BoxAny>

          {/* Big R℞ symbol + medication list */}
          <BoxAny sx={{ px: 2, py: 1.5 }}>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'serif', color: '#333', mb: 1 }}>
              R℞
            </Typography>
            {receipt.medications.map((med, i) => (
              <BoxAny key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.6, borderBottom: '1px dotted #ccc' }}>
                <BoxAny>
                  <Typography sx={{ fontSize: '0.88rem', fontWeight: 600 }}>
                    {i + 1}. {med.name}
                  </Typography>
                  <Typography sx={{ fontSize: '0.78rem', color: '#666', ml: 2 }}>
                    {[
                      med.dosage ? `用量 ${med.dosage}` : '',
                      med.frequency ? `${med.frequency}` : '',
                      med.days ? `${med.days}天` : '',
                      med.quantity != null ? `×${med.quantity}` : '',
                    ].filter(Boolean).join('　')}
                  </Typography>
                </BoxAny>
                {med.price != null && (
                  <Typography sx={{ fontSize: '0.85rem', color: '#333', whiteSpace: 'nowrap', alignSelf: 'flex-start' }}>
                    ¥{med.price.toFixed(2)}
                  </Typography>
                )}
              </BoxAny>
            ))}
          </BoxAny>

          <BoxAny sx={{ display: 'flex', justifyContent: 'space-between', px: 2, py: 1.5, borderTop: '1px solid #ccc', fontSize: '0.78rem', color: '#555' }}>
            <span>医师：{receipt.doctorName || '___________'}</span>
            <span>药师审核：___________</span>
          </BoxAny>
        </Paper>
      )}

      {/* ── 影像报告 (Imaging) ── */}
      {cat === 'ImagingResult' && (
        <Paper sx={reportPaperSx}>
          <BoxAny sx={reportHeaderSx}>
            <Typography sx={reportTitleSx}>{receipt.hospitalName || '医院'}</Typography>
            <Typography sx={{ ...reportTitleSx, mt: 0.5 }}>影 像 检 查 报 告</Typography>
          </BoxAny>

          <BoxAny sx={infoGridSx}>
            <Typography sx={labelSx}>姓　名</Typography>
            <Typography sx={valueSx}>{receipt.patientName || '—'}</Typography>
            <Typography sx={labelSx}>科　室</Typography>
            <Typography sx={valueSx}>{receipt.department || '—'}</Typography>
            <Typography sx={labelSx}>检查日期</Typography>
            <Typography sx={valueSx}>{dateStr || '—'}</Typography>
            <Typography sx={labelSx}>报告医师</Typography>
            <Typography sx={valueSx}>{receipt.doctorName || '—'}</Typography>
          </BoxAny>

          <BoxAny sx={{ px: 2, py: 2, minHeight: 100 }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, mb: 0.5 }}>检查所见：</Typography>
            <Typography sx={{ fontSize: '0.85rem', lineHeight: 2, whiteSpace: 'pre-wrap' }}>
              {receipt.imagingFindings || ''}
            </Typography>
          </BoxAny>
          {receipt.diagnosisText && (
            <BoxAny sx={{ px: 2, pb: 2 }}>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, mb: 0.5 }}>诊断意见：</Typography>
              <Typography sx={{ fontSize: '0.85rem', lineHeight: 2, whiteSpace: 'pre-wrap' }}>
                {receipt.diagnosisText}
              </Typography>
            </BoxAny>
          )}

          <BoxAny sx={{ display: 'flex', justifyContent: 'flex-end', px: 2, py: 1.5, borderTop: '1px solid #ccc', fontSize: '0.78rem', color: '#555' }}>
            <span>报告医师：{receipt.doctorName || '___________'}　　审核医师：___________</span>
          </BoxAny>
        </Paper>
      )}

      {/* ── 挂号单 (Registration) ── */}
      {cat === 'Registration' && (
        <Paper sx={reportPaperSx}>
          <BoxAny sx={reportHeaderSx}>
            <Typography sx={reportTitleSx}>{receipt.hospitalName || '医院'}</Typography>
            <Typography sx={{ ...reportTitleSx, mt: 0.5 }}>挂 号 单</Typography>
          </BoxAny>
          <BoxAny sx={{ ...infoGridSx, gridTemplateColumns: 'auto 1fr' }}>
            <Typography sx={labelSx}>姓　名</Typography>
            <Typography sx={valueSx}>{receipt.patientName || '—'}</Typography>
            <Typography sx={labelSx}>科　室</Typography>
            <Typography sx={valueSx}>{receipt.department || '—'}</Typography>
            <Typography sx={labelSx}>医　生</Typography>
            <Typography sx={valueSx}>{receipt.doctorName || '—'}</Typography>
            <Typography sx={labelSx}>日　期</Typography>
            <Typography sx={valueSx}>{dateStr || '—'}</Typography>
            {receipt.totalAmount != null && (
              <>
                <Typography sx={labelSx}>挂号费</Typography>
                <Typography sx={{ ...valueSx, fontWeight: 700 }}>¥{receipt.totalAmount.toFixed(2)}</Typography>
              </>
            )}
          </BoxAny>
          {receipt.notes && (
            <BoxAny sx={{ px: 2, py: 1.5 }}>
              <Typography sx={{ fontSize: '0.82rem', color: '#555' }}>{receipt.notes}</Typography>
            </BoxAny>
          )}
        </Paper>
      )}

      {/* ── 收费收据 (Payment Receipt) ── */}
      {cat === 'PaymentReceipt' && (
        <Paper sx={reportPaperSx}>
          <BoxAny sx={reportHeaderSx}>
            <Typography sx={reportTitleSx}>{receipt.hospitalName || '医院'}</Typography>
            <Typography sx={{ ...reportTitleSx, mt: 0.5 }}>门 诊 收 费 票 据</Typography>
            <Typography sx={reportSubtitleSx}>Outpatient Payment Receipt</Typography>
          </BoxAny>
          <BoxAny sx={infoGridSx}>
            <Typography sx={labelSx}>姓　名</Typography>
            <Typography sx={valueSx}>{receipt.patientName || '—'}</Typography>
            <Typography sx={labelSx}>科　室</Typography>
            <Typography sx={valueSx}>{receipt.department || '—'}</Typography>
            <Typography sx={labelSx}>日　期</Typography>
            <Typography sx={valueSx}>{dateStr || '—'}</Typography>
            <Typography sx={labelSx}></Typography>
            <Typography sx={valueSx}></Typography>
          </BoxAny>

          {/* itemized charges if available */}
          {receipt.items.length > 0 && (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={thCellSx}>收费项目</TableCell>
                    <TableCell sx={thCellSx} align="right">金额(元)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {receipt.items.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell sx={tdCellSx}>{item.name}</TableCell>
                      <TableCell sx={tdCellSx} align="right">
                        {item.totalPrice != null ? `¥${item.totalPrice.toFixed(2)}` : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {receipt.totalAmount != null && (
            <BoxAny sx={{ display: 'flex', justifyContent: 'flex-end', px: 2, py: 1.5, borderTop: '2px solid #333' }}>
              <Typography sx={{ fontSize: '1.1rem', fontWeight: 800 }}>
                合计：¥{receipt.totalAmount.toFixed(2)}
              </Typography>
            </BoxAny>
          )}
        </Paper>
      )}

      {/* ── Generic fallback for Other category ── */}
      {cat === 'Other' && (
        <GenericInfoCard receipt={receipt} dateStr={dateStr} t={t} />
      )}

      {/* Notes (if present, across all categories) */}
      {receipt.notes && cat !== 'Registration' && (
        <Paper sx={{ ...reportPaperSx, border: '1px solid #ddd' }}>
          <BoxAny sx={{ px: 2, py: 1.5 }}>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, mb: 0.5 }}>备注</Typography>
            <Typography sx={{ fontSize: '0.82rem', color: '#555', whiteSpace: 'pre-wrap' }}>{receipt.notes}</Typography>
          </BoxAny>
        </Paper>
      )}
    </>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// Shopping receipt — looks like a thermal printer receipt
// ════════════════════════════════════════════════════════════════════════════

const ShoppingDocument: React.FC<{
  receipt: ReceiptDto;
  dateStr: string;
  t: (k: string) => string;
}> = ({ receipt, dateStr, t }) => (
  <Paper sx={{
    borderRadius: 0, border: '1px dashed #aaa', mb: 2, boxShadow: 'none',
    bgcolor: '#fffff8', fontFamily: '"Courier New", "Noto Sans SC", monospace',
    maxWidth: 400, mx: 'auto',
  }}>
    {/* Store header */}
    <BoxAny sx={{ textAlign: 'center', py: 2, borderBottom: '1px dashed #aaa' }}>
      <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: 2 }}>
        {receipt.merchantName || t('receipts.detail.merchant')}
      </Typography>
      <Typography sx={{ fontSize: '0.72rem', color: '#777' }}>
        {t(`receipts.cat.${receipt.category}`)}
      </Typography>
    </BoxAny>

    {/* Date */}
    <BoxAny sx={{ px: 2, py: 0.8, borderBottom: '1px dashed #ccc', fontSize: '0.78rem', color: '#555' }}>
      日期：{dateStr || '—'}
    </BoxAny>

    {/* Line items */}
    {receipt.items.length > 0 && (
      <BoxAny sx={{ px: 2, py: 1 }}>
        <BoxAny sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, fontSize: '0.72rem', color: '#888', borderBottom: '1px solid #eee', pb: 0.3 }}>
          <span>商品名称</span>
          <BoxAny sx={{ display: 'flex', gap: 3 }}>
            <span>数量</span>
            <span>单价</span>
            <span style={{ minWidth: 56, textAlign: 'right' }}>小计</span>
          </BoxAny>
        </BoxAny>
        {receipt.items.map((item, i) => (
          <BoxAny key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.3, fontSize: '0.82rem' }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
            <BoxAny sx={{ display: 'flex', gap: 2, flexShrink: 0, ml: 1 }}>
              <span style={{ width: 32, textAlign: 'right' }}>{item.quantity ?? ''}{item.unit || ''}</span>
              <span style={{ width: 48, textAlign: 'right' }}>{item.unitPrice != null ? `¥${item.unitPrice.toFixed(2)}` : ''}</span>
              <span style={{ width: 56, textAlign: 'right', fontWeight: 600 }}>
                {item.totalPrice != null ? `¥${item.totalPrice.toFixed(2)}` : ''}
              </span>
            </BoxAny>
          </BoxAny>
        ))}
      </BoxAny>
    )}

    {/* Total */}
    <BoxAny sx={{ borderTop: '2px dashed #666', mx: 2, mt: 0.5 }} />
    {receipt.totalAmount != null && (
      <BoxAny sx={{ display: 'flex', justifyContent: 'space-between', px: 2, py: 1, fontSize: '1.05rem', fontWeight: 800 }}>
        <span>合计</span>
        <span>¥{receipt.totalAmount.toFixed(2)}</span>
      </BoxAny>
    )}
    <BoxAny sx={{ borderBottom: '1px dashed #aaa', mx: 2 }} />

    {/* Footer */}
    {receipt.notes && (
      <BoxAny sx={{ px: 2, py: 1, fontSize: '0.75rem', color: '#777' }}>
        {receipt.notes}
      </BoxAny>
    )}
    <BoxAny sx={{ textAlign: 'center', py: 1, fontSize: '0.72rem', color: '#aaa' }}>
      * * * 谢谢惠顾 * * *
    </BoxAny>
  </Paper>
);

// ── Generic info card fallback ─────────────────────────────────────────────

const GenericInfoCard: React.FC<{
  receipt: ReceiptDto;
  dateStr: string;
  t: (k: string) => string;
}> = ({ receipt, dateStr }) => (
  <Paper sx={{ ...reportPaperSx, border: '1px solid #ddd' }}>
    <BoxAny sx={{ px: 2, py: 2 }}>
      <BoxAny sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
        {receipt.hospitalName && (
          <><Typography sx={labelSx}>医院</Typography><Typography sx={valueSx}>{receipt.hospitalName}</Typography></>
        )}
        {receipt.department && (
          <><Typography sx={labelSx}>科室</Typography><Typography sx={valueSx}>{receipt.department}</Typography></>
        )}
        {receipt.doctorName && (
          <><Typography sx={labelSx}>医生</Typography><Typography sx={valueSx}>{receipt.doctorName}</Typography></>
        )}
        {receipt.patientName && (
          <><Typography sx={labelSx}>患者</Typography><Typography sx={valueSx}>{receipt.patientName}</Typography></>
        )}
        <Typography sx={labelSx}>日期</Typography>
        <Typography sx={valueSx}>{dateStr || '—'}</Typography>
        {receipt.totalAmount != null && (
          <><Typography sx={labelSx}>金额</Typography><Typography sx={{ ...valueSx, fontWeight: 700 }}>¥{receipt.totalAmount.toFixed(2)}</Typography></>
        )}
      </BoxAny>
      {receipt.diagnosisText && (
        <BoxAny sx={{ mt: 1.5 }}>
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, mb: 0.3 }}>诊断</Typography>
          <Typography sx={{ fontSize: '0.82rem', whiteSpace: 'pre-wrap' }}>{receipt.diagnosisText}</Typography>
        </BoxAny>
      )}
    </BoxAny>
  </Paper>
);
