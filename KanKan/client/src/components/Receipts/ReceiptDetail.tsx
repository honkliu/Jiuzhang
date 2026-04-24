import React, { useState, useMemo } from 'react';
import {
  Box, Typography, IconButton, Paper, Collapse,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Delete as DeleteIcon,
  ZoomIn as ZoomIcon,
  Description as InfoIcon,
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { ReceiptDto } from '@/services/receipt.service';
import { useLanguage } from '@/i18n/LanguageContext';
import { formatDateZhCN } from '@/utils/date';
import { ImageLightbox } from '@/components/Shared/ImageLightbox';

const BoxAny = Box as any;

const shouldShowMedicalAmount = (receipt: ReceiptDto) => receipt.category === 'PaymentReceipt';

const restorePipesInMath = () => {
  return (tree: any) => {
    const walk = (node: any) => {
      if (!node) return;
      if (node.type === 'inlineMath' || node.type === 'math') {
        if (typeof node.value === 'string') {
          node.value = node.value.replace(/\\\|/g, '|');
        }
      }
      if (Array.isArray(node.children)) {
        node.children.forEach(walk);
      }
    };

    walk(tree);
  };
};

const remarkPlugins = [remarkMath, remarkGfm, restorePipesInMath];
const rehypePlugins = [rehypeKatex];
const redTagPattern = /\[red\]([\s\S]*?)\[\/red\]/gi;

const escapePipesInMathForGfm = (input: string): string => {
  let out = '';
  let i = 0;
  let inMath = false;
  let mathDelim: '$' | '$$' = '$';

  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];

    if (!inMath) {
      if (ch === '\\' && next === '$') {
        out += input.slice(i, i + 2);
        i += 2;
        continue;
      }

      if (ch === '$') {
        if (next === '$') {
          inMath = true;
          mathDelim = '$$';
          out += '$$';
          i += 2;
          continue;
        }

        inMath = true;
        mathDelim = '$';
        out += '$';
        i += 1;
        continue;
      }

      out += ch;
      i += 1;
      continue;
    }

    if (ch === '\\' && next === '$') {
      out += input.slice(i, i + 2);
      i += 2;
      continue;
    }

    if (mathDelim === '$$' && ch === '$' && next === '$') {
      inMath = false;
      out += '$$';
      i += 2;
      continue;
    }

    if (mathDelim === '$' && ch === '$') {
      inMath = false;
      out += '$';
      i += 1;
      continue;
    }

    if (ch === '|') {
      out += '\\|';
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
};

const preserveBoundaryWhitespace = (value: string) => value.replace(/ /g, '\u00A0').replace(/\t/g, '\u00A0\u00A0\u00A0\u00A0');

const renderMarkdownFragment = (key: string, text: string, sx?: Record<string, unknown>) => {
  const leadingWhitespace = text.match(/^\s+/)?.[0] ?? '';
  const trailingWhitespace = text.match(/\s+$/)?.[0] ?? '';
  const startIndex = leadingWhitespace.length;
  const endIndex = trailingWhitespace.length > 0 ? text.length - trailingWhitespace.length : text.length;
  const coreText = text.slice(startIndex, endIndex);

  return (
    <BoxAny
      key={key}
      component="span"
      sx={{ whiteSpace: 'break-spaces', '& p': { margin: 0, display: 'inline' }, ...(sx || {}) }}
    >
      {leadingWhitespace ? preserveBoundaryWhitespace(leadingWhitespace) : null}
      {coreText ? (
        <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
          {escapePipesInMathForGfm(coreText)}
        </ReactMarkdown>
      ) : null}
      {trailingWhitespace ? preserveBoundaryWhitespace(trailingWhitespace) : null}
    </BoxAny>
  );
};

const renderMarkdownWithRedTags = (input: string) => {
  const matches = Array.from(input.matchAll(redTagPattern));
  if (matches.length === 0) {
    return (
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
        {escapePipesInMathForGfm(input)}
      </ReactMarkdown>
    );
  }

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;

  matches.forEach((match, index) => {
    const matchStart = match.index ?? 0;
    const matchEnd = matchStart + match[0].length;
    const innerText = match[1] ?? '';

    if (matchStart > lastIndex) {
      const plainText = input.slice(lastIndex, matchStart);
      if (plainText) {
        nodes.push(renderMarkdownFragment(`plain-${index}-${matchStart}`, plainText));
      }
    }

    nodes.push(renderMarkdownFragment(`red-${index}-${matchStart}`, innerText, { color: 'error.main', '& a': { color: 'inherit' } }));
    lastIndex = matchEnd;
  });

  if (lastIndex < input.length) {
    const trailingText = input.slice(lastIndex);
    if (trailingText) {
      nodes.push(renderMarkdownFragment(`plain-tail-${lastIndex}`, trailingText));
    }
  }

  return nodes;
};

const plainTextSx = {
  whiteSpace: 'pre-wrap' as const,
  '& .katex-display': { margin: '0.5em 0', overflowX: 'auto', overflowY: 'hidden' },
  '& .katex': { fontSize: '1.1em' },
  '& table': { width: '100%', borderCollapse: 'collapse', margin: '8px 0' },
  '& th, & td': { border: '1px solid rgba(0,0,0,0.1)', padding: '4px 8px', textAlign: 'left' },
  '& th': { backgroundColor: 'rgba(0,0,0,0.03)', fontWeight: 600 },
  '& code': { backgroundColor: 'rgba(0,0,0,0.05)', padding: '2px 4px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.9em' },
  '& pre': { backgroundColor: 'rgba(0,0,0,0.05)', padding: '8px 12px', borderRadius: '4px', overflowX: 'auto', margin: '8px 0' },
  '& pre code': { padding: 0, backgroundColor: 'transparent' },
};

const markdownSx = {
  whiteSpace: 'normal' as const,
  lineHeight: 1.6,
  '& .katex-display': { margin: '0.5em 0', overflowX: 'auto', overflowY: 'hidden' },
  '& .katex': { fontSize: '1.1em' },
  '& p': { margin: '0.4em 0' },
  '& p:first-of-type': { marginTop: 0 },
  '& p:last-of-type': { marginBottom: 0 },
  '& h1, & h2, & h3, & h4, & h5, & h6': { margin: '0.6em 0 0.3em' },
  '& h1': { fontSize: '1.3em' },
  '& h2': { fontSize: '1.15em' },
  '& h3': { fontSize: '1.05em' },
  '& ul, & ol': { paddingLeft: '1.5em', margin: '0.3em 0' },
  '& li': { margin: '0.15em 0' },
  '& li > p': { margin: 0, display: 'inline' },
  '& blockquote': { margin: '0.4em 0', paddingLeft: '0.75em', borderLeft: '3px solid rgba(0,0,0,0.15)', color: 'inherit' },
  '& table': { width: '100%', borderCollapse: 'collapse', margin: '0.5em 0' },
  '& th, & td': { border: '1px solid rgba(0,0,0,0.1)', padding: '4px 8px', textAlign: 'left' },
  '& th': { backgroundColor: 'rgba(0,0,0,0.03)', fontWeight: 600 },
  '& code': { backgroundColor: 'rgba(0,0,0,0.05)', padding: '2px 4px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.9em' },
  '& pre': { backgroundColor: 'rgba(0,0,0,0.05)', padding: '8px 12px', borderRadius: '4px', overflowX: 'auto', margin: '0.5em 0' },
  '& pre code': { padding: 0, backgroundColor: 'transparent' },
  '& hr': { border: 'none', borderTop: '1px solid rgba(0,0,0,0.1)', margin: '0.5em 0' },
};

const MarkdownOrPlainText: React.FC<{ text: string }> = ({ text }) => {
  return <BoxAny sx={markdownSx}>{renderMarkdownWithRedTags(text)}</BoxAny>;
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
  allReceipts?: ReceiptDto[];
  onBack: () => void;
  onDelete: () => void;
}

export const ReceiptDetail: React.FC<ReceiptDetailProps> = ({ receipt, allReceipts = [], onBack, onDelete }) => {
  const { t } = useLanguage();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [expandedLab, setExpandedLab] = useState<string | null>(null);
  const [showRawText, setShowRawText] = useState(Boolean(receipt.rawText));

  const receiptImages = useMemo(() => [receipt.imageUrl, ...receipt.additionalImageUrls].filter(Boolean), [receipt.additionalImageUrls, receipt.imageUrl]);
  const openImage = (url: string) => {
    const index = receiptImages.findIndex((item) => item === url);
    setLightboxIndex(index >= 0 ? index : 0);
  };

  // Build lab history map
  const labHistoryMap = useMemo(() => {
    const map = new Map<string, Array<{ source: string; date: string; value?: string; unit?: string; referenceRange?: string; status?: string }>>();
    for (const r of allReceipts) {
      const source = r.hospitalName || '';
      const date = formatDateZhCN(r.receiptDate);
      for (const lab of r.labResults) {
        if (!map.has(lab.name)) map.set(lab.name, []);
        map.get(lab.name)!.push({ source, date, value: lab.value, unit: lab.unit, referenceRange: lab.referenceRange, status: lab.status });
      }
    }
    return map;
  }, [allReceipts]);

  const hasLabHistory = (name: string) => (labHistoryMap.get(name)?.length || 0) > 1;
  const isMedical = receipt.type === 'Medical';
  const dateStr = formatDateZhCN(receipt.receiptDate);

  return (
    <BoxAny sx={{ maxWidth: 800, mx: 'auto', px: { xs: 1, sm: 2 }, pt: { xs: 9, sm: 10 }, pb: 4 }}>
      {/* Navigation */}
      <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={onBack} sx={{ bgcolor: 'rgba(0,0,0,0.04)', '&:hover': { bgcolor: 'rgba(0,0,0,0.08)' } }}>
          <BackIcon />
        </IconButton>
        <Typography variant="body2" color="text.secondary" sx={{ cursor: 'pointer' }} onClick={onBack}>
          返回
        </Typography>
        <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
          {receipt.merchantName || receipt.hospitalName || t(`receipts.cat.${receipt.category}`)}
        </Typography>
        <IconButton color="error" onClick={onDelete}><DeleteIcon /></IconButton>
      </BoxAny>

      {/* Original photo link + raw text link */}
      {(receipt.imageUrl || receipt.rawText) && (
        <BoxAny sx={{ mb: 1.5, display: 'flex', gap: 2 }}>
          {receipt.imageUrl && (
            <Typography
              variant="body2"
              color="primary"
              sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' }, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
              onClick={() => openImage(receipt.imageUrl)}
            >
              <ZoomIcon fontSize="small" />
              查看原图
            </Typography>
          )}
          {receipt.rawText && (
            <Typography
              variant="body2"
              color="primary"
              sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' }, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
              onClick={() => setShowRawText(prev => !prev)}
            >
              <InfoIcon fontSize="small" />
              {showRawText ? '收起详细信息' : '详细信息'}
            </Typography>
          )}
        </BoxAny>
      )}

      {/* Raw OCR text */}
      {showRawText && receipt.rawText && (
        <Paper sx={{ mb: 2, p: 2, bgcolor: '#fafafa', borderRadius: 2, border: '1px solid #eee', overflowX: 'auto' }}>
          <BoxAny sx={{
            fontSize: '0.85rem', lineHeight: 1.6,
          }}>
            <MarkdownOrPlainText text={receipt.rawText} />
          </BoxAny>
        </Paper>
      )}

      {/* Additional photo links */}
      {receipt.additionalImageUrls.length > 0 && (
        <BoxAny sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          {receipt.additionalImageUrls.map((url, i) => (
            <Typography
              key={i}
              variant="caption"
              color="primary"
              sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' }, display: 'inline-flex', alignItems: 'center', gap: 0.3 }}
              onClick={() => openImage(url)}
            >
              <ZoomIcon sx={{ fontSize: 14 }} />
              附图{i + 1}
            </Typography>
          ))}
        </BoxAny>
      )}

      {/* ── Structured data rendered in hospital-document style ── */}
      {isMedical ? (
        <MedicalDocument receipt={receipt} dateStr={dateStr} t={t}
          labHistoryMap={labHistoryMap} expandedLab={expandedLab}
          setExpandedLab={setExpandedLab} hasLabHistory={hasLabHistory} />
      ) : (
        <ShoppingDocument receipt={receipt} dateStr={dateStr} t={t} />
      )}

      {lightboxIndex !== null && receiptImages.length > 0 && (
        <ImageLightbox
          images={receiptImages}
          initialIndex={lightboxIndex}
          open
          onClose={() => setLightboxIndex(null)}
        />
      )}
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
  labHistoryMap: Map<string, Array<{ source: string; date: string; value?: string; unit?: string; referenceRange?: string; status?: string }>>;
  expandedLab: string | null;
  setExpandedLab: (v: string | null) => void;
  hasLabHistory: (name: string) => boolean;
}> = ({ receipt, dateStr, t, labHistoryMap, expandedLab, setExpandedLab, hasLabHistory }) => {
  const cat = receipt.category;
  const hasPaymentBreakdown = receipt.medicalInsuranceFundPayment != null
    || receipt.personalAccountPayment != null
    || receipt.personalSelfPay != null
    || receipt.personalOutOfPocket != null
    || receipt.cashPayment != null
    || receipt.otherPayments != null;

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
                  const clickable = hasLabHistory(lab.name);
                  const isExp = expandedLab === lab.name;
                  return (
                    <React.Fragment key={i}>
                      <TableRow
                        sx={{
                          ...(isAbnormal ? { bgcolor: '#fff8f8' } : undefined),
                          ...(clickable ? { cursor: 'pointer', '&:hover': { bgcolor: 'rgba(33,150,243,0.06)' } } : undefined),
                        }}
                        onClick={clickable ? () => setExpandedLab(isExp ? null : lab.name) : undefined}
                      >
                        <TableCell sx={{
                          ...tdCellSx,
                          ...(clickable ? { color: '#1976d2', textDecoration: isExp ? 'underline' : 'none' } : {}),
                        }}>
                          {lab.name}
                        </TableCell>
                        <TableCell sx={{ ...tdCellSx, fontWeight: isAbnormal ? 700 : 400, color: isAbnormal ? '#c00' : '#111' }} align="center">
                          {lab.value || '—'}
                        </TableCell>
                        <TableCell sx={{ ...tdCellSx, color: '#c00', fontWeight: 700, fontSize: '1rem' }} align="center">
                          {arrow}
                        </TableCell>
                        <TableCell sx={tdCellSx} align="center">{lab.unit || ''}</TableCell>
                        <TableCell sx={tdCellSx} align="center">{lab.referenceRange || ''}</TableCell>
                      </TableRow>
                      {clickable && (
                        <TableRow>
                          <TableCell colSpan={5} sx={{ p: 0, borderBottom: isExp ? undefined : 'none' }}>
                            <Collapse in={isExp}>
                              <BoxAny sx={{
                                mx: 1, my: 0.5, pl: 1.5, borderLeft: '2px solid', borderColor: '#64b5f6',
                                bgcolor: 'rgba(33,150,243,0.04)', borderRadius: '0 4px 4px 0', py: 0.5,
                              }}>
                                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#555', mb: 0.3 }}>
                                  检验趋势 ({labHistoryMap.get(lab.name)?.length || 0}次)
                                </Typography>
                                {(labHistoryMap.get(lab.name) || [])
                                  .sort((a, b) => a.date.localeCompare(b.date))
                                  .map((entry, ei) => {
                                    const entryAbnormal = entry.status && entry.status !== 'Normal';
                                    const entryArrow = entry.status === 'High' ? ' ↑' : entry.status === 'Low' ? ' ↓' : '';
                                    return (
                                      <BoxAny key={ei} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.1 }}>
                                        <Typography sx={{ fontSize: '0.75rem', color: '#888', width: 70, flexShrink: 0 }}>
                                          {entry.date}
                                        </Typography>
                                        <Typography sx={{ fontSize: '0.75rem', color: '#888', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {entry.source}
                                        </Typography>
                                        <Typography sx={{
                                          fontSize: '0.75rem', flexShrink: 0, fontWeight: 600,
                                          color: entryAbnormal ? '#c00' : '#2e7d32',
                                        }}>
                                          {entry.value}{entry.unit ? ` ${entry.unit}` : ''}{entryArrow}
                                        </Typography>
                                        {entry.referenceRange && (
                                          <Typography sx={{ fontSize: '0.7rem', color: '#aaa', flexShrink: 0 }}>
                                            ({entry.referenceRange})
                                          </Typography>
                                        )}
                                      </BoxAny>
                                    );
                                  })}
                              </BoxAny>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
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
              <BoxAny sx={{ mt: 0.5 }}>{dateStr}</BoxAny>
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
            {shouldShowMedicalAmount(receipt) && receipt.totalAmount != null && (
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
            <Typography sx={labelSx}>门诊号</Typography>
            <Typography sx={valueSx}>{receipt.outpatientNumber || '—'}</Typography>
            <Typography sx={labelSx}>医保类型</Typography>
            <Typography sx={valueSx}>{receipt.insuranceType || '—'}</Typography>
            <Typography sx={labelSx}>医保编号</Typography>
            <Typography sx={valueSx}>{receipt.medicalInsuranceNumber || '—'}</Typography>
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

          {hasPaymentBreakdown && (
            <BoxAny sx={{ px: 2, py: 1.5, borderTop: '1px solid #ddd' }}>
              <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, mb: 1 }}>支付拆分</Typography>
              {receipt.medicalInsuranceFundPayment != null && (
                <Typography sx={{ fontSize: '0.86rem', mb: 0.5 }}>医保统筹支付：¥{receipt.medicalInsuranceFundPayment.toFixed(2)}</Typography>
              )}
              {receipt.personalAccountPayment != null && (
                <Typography sx={{ fontSize: '0.86rem', mb: 0.5 }}>个人账户支付：¥{receipt.personalAccountPayment.toFixed(2)}</Typography>
              )}
              {receipt.personalSelfPay != null && (
                <Typography sx={{ fontSize: '0.86rem', mb: 0.5 }}>个人自付：¥{receipt.personalSelfPay.toFixed(2)}</Typography>
              )}
              {receipt.personalOutOfPocket != null && (
                <Typography sx={{ fontSize: '0.86rem', mb: 0.5 }}>个人自费：¥{receipt.personalOutOfPocket.toFixed(2)}</Typography>
              )}
              {receipt.cashPayment != null && (
                <Typography sx={{ fontSize: '0.86rem', mb: 0.5 }}>现金支付：¥{receipt.cashPayment.toFixed(2)}</Typography>
              )}
              {receipt.otherPayments != null && (
                <Typography sx={{ fontSize: '0.86rem' }}>其他支付：¥{receipt.otherPayments.toFixed(2)}</Typography>
              )}
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
}> = ({ receipt, dateStr, t }) => {
  const symbol = currencySymbol(receipt.currency);

  return (
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
            <BoxAny component="span" sx={{ minWidth: 56, textAlign: 'right' }}>小计</BoxAny>
          </BoxAny>
        </BoxAny>
        {receipt.items.map((item, i) => (
          <BoxAny key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.3, fontSize: '0.82rem' }}>
            <BoxAny component="span" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</BoxAny>
            <BoxAny sx={{ display: 'flex', gap: 2, flexShrink: 0, ml: 1 }}>
              <BoxAny component="span" sx={{ width: 32, textAlign: 'right' }}>{item.quantity ?? ''}{item.unit || ''}</BoxAny>
              <BoxAny component="span" sx={{ width: 48, textAlign: 'right' }}>{item.unitPrice != null ? `${symbol}${item.unitPrice.toFixed(2)}` : ''}</BoxAny>
              <BoxAny component="span" sx={{ width: 56, textAlign: 'right', fontWeight: 600 }}>
                {item.totalPrice != null ? `${symbol}${item.totalPrice.toFixed(2)}` : ''}
              </BoxAny>
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
        <span>{symbol}{receipt.totalAmount.toFixed(2)}</span>
      </BoxAny>
    )}
    {receipt.taxAmount != null && (
      <BoxAny sx={{ display: 'flex', justifyContent: 'space-between', px: 2, pb: 0.8, fontSize: '0.86rem', color: '#555' }}>
        <span>税额</span>
        <span>{symbol}{receipt.taxAmount.toFixed(2)}</span>
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
};

// ── Generic info card fallback ─────────────────────────────────────────────

const GenericInfoCard: React.FC<{
  receipt: ReceiptDto;
  dateStr: string;
  t: (k: string) => string;
}> = ({ receipt, dateStr }) => {
  const symbol = currencySymbol(receipt.currency);

  return (
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
        {shouldShowMedicalAmount(receipt) && receipt.totalAmount != null && (
          <><Typography sx={labelSx}>金额</Typography><Typography sx={{ ...valueSx, fontWeight: 700 }}>{symbol}{receipt.totalAmount.toFixed(2)}</Typography></>
        )}
        {receipt.taxAmount != null && (
          <><Typography sx={labelSx}>税额</Typography><Typography sx={valueSx}>{symbol}{receipt.taxAmount.toFixed(2)}</Typography></>
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
};
