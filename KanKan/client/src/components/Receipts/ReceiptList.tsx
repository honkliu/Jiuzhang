import React, { useState, useMemo } from 'react';
import {
  Box, Typography, Paper, Collapse, Dialog, DialogContent, Checkbox,
} from '@mui/material';
import {
  ShoppingCart as ShoppingIcon,
  Restaurant as RestaurantIcon,
  LocalGroceryStore as GroceryIcon,
  MoreHoriz as OtherIcon,
  Image as ImageIcon,
  TrendingDown as CheapIcon,
} from '@mui/icons-material';
import type { ReceiptDto } from '@/services/receipt.service';
import { useLanguage } from '@/i18n/LanguageContext';
import { formatDateZhCN } from '@/utils/date';

const BoxAny = Box as any;

const categoryIcons: Record<string, React.ReactNode> = {
  Supermarket: <GroceryIcon fontSize="small" sx={{ color: '#27ae60' }} />,
  Restaurant: <RestaurantIcon fontSize="small" sx={{ color: '#e67e22' }} />,
  OnlineShopping: <ShoppingIcon fontSize="small" color="primary" />,
};

const categoryColors: Record<string, string> = {
  Supermarket: '#e8f5e9',
  Restaurant: '#fff3e0',
  OnlineShopping: '#e3f2fd',
};

/** Strip quantity/unit suffixes for fuzzy matching: "海天酱油 500ml" → "海天酱油" */
const normalizeItemName = (name: string): string =>
  name.replace(/\s*\d+\s*(ml|l|g|kg|枚|袋|片|粒|瓶|盒|支|颗|包)\s*$/i, '')
    .replace(/\s*(Grande|Tall|Venti)\s*$/i, '')
    .trim();

interface ItemHistoryEntry {
  merchantName: string;
  date: string;
  unitPrice?: number;
  totalPrice?: number;
  quantity?: number;
  receiptId: string;
  currency?: string;
}

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

interface ReceiptListProps {
  receipts: ReceiptDto[];
  allReceipts: ReceiptDto[];
  checkedIds?: Set<string>;
  onToggleChecked?: (id: string) => void;
  onSelect: (r: ReceiptDto) => void;
}

const colSx = {
  name: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const,
  qty: { width: 40, textAlign: 'right', flexShrink: 0 } as const,
  price: { width: 56, textAlign: 'right', flexShrink: 0 } as const,
  total: { width: 64, textAlign: 'right', flexShrink: 0, fontWeight: 600 } as const,
};

export const ReceiptList: React.FC<ReceiptListProps> = ({ receipts, allReceipts, checkedIds, onToggleChecked, onSelect }) => {
  const { t } = useLanguage();
  const [imageOpen, setImageOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState('');
  // Use "receiptId:itemIndex" as key so only the clicked instance expands
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Build item history index from all receipts
  const itemHistoryMap = useMemo(() => {
    const map = new Map<string, ItemHistoryEntry[]>();
    for (const r of allReceipts) {
      const merchant = r.merchantName || r.hospitalName || '';
      const date = formatDateZhCN(r.receiptDate);
      for (const item of r.items) {
        const key = normalizeItemName(item.name);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({
          merchantName: merchant,
          date,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          quantity: item.quantity,
          receiptId: r.id,
          currency: r.currency,
        });
      }
    }
    return map;
  }, [allReceipts]);

  const handleItemClick = (e: React.MouseEvent, receiptId: string, itemIndex: number, itemName: string) => {
    e.stopPropagation();
    const selectedText = window.getSelection()?.toString().trim();
    if (selectedText) return;

    const normalized = normalizeItemName(itemName);
    const history = itemHistoryMap.get(normalized);
    if (!history || history.length <= 1) return;
    const key = `${receiptId}:${itemIndex}`;
    setExpandedKey(prev => prev === key ? null : key);
  };

  const getItemHistory = (itemName: string): ItemHistoryEntry[] => {
    const key = normalizeItemName(itemName);
    const entries = itemHistoryMap.get(key) || [];
    return [...entries].sort((a, b) => a.date.localeCompare(b.date));
  };

  const hasHistory = (itemName: string): boolean => {
    const key = normalizeItemName(itemName);
    return (itemHistoryMap.get(key)?.length || 0) > 1;
  };

  const shouldIgnoreSelectionClick = () => !!window.getSelection()?.toString().trim();

  if (receipts.length === 0) {
    return (
      <BoxAny sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
        <Typography>暂无票据</Typography>
      </BoxAny>
    );
  }

  return (
    <BoxAny>
      <Paper sx={{ borderRadius: '10px', overflow: 'hidden' }}>
        {receipts.map((r, idx) => (
          <BoxAny
            key={r.id}
            sx={{
              display: 'flex', alignItems: 'flex-start', gap: 1.5,
              pl: 2, pr: 1.5, py: 1.2, cursor: 'pointer', borderRadius: 0,
              position: 'relative',
              borderBottom: idx < receipts.length - 1 ? '1px solid' : 'none',
              borderColor: 'divider',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.03)' },
            }}
            onClick={() => {
              if (shouldIgnoreSelectionClick()) return;
              onSelect(r);
            }}
          >
            {onToggleChecked && (
              <Checkbox
                size="small"
                checked={checkedIds?.has(r.id) || false}
                onClick={(e) => { e.stopPropagation(); onToggleChecked(r.id); }}
                sx={{ p: 0, flexShrink: 0 }}
              />
            )}
            <BoxAny sx={{
              width: 32, height: 32, borderRadius: '50%', display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              bgcolor: categoryColors[r.category] || '#f5f5f5',
              border: '2px solid', borderColor: 'divider', zIndex: 1,
            }}>
              {categoryIcons[r.category] || <OtherIcon fontSize="small" />}
            </BoxAny>
            <BoxAny sx={{ flex: 1, minWidth: 0 }}>
              {/* Header: merchant + date + image link */}
              <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" fontWeight={600} noWrap sx={{ flex: 1 }}>
                  {r.merchantName || t(`receipts.cat.${r.category}`)}
                  {r.imageUrl && (
                    <Typography
                      component="span"
                      variant="caption"
                      color="primary"
                      sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' }, ml: 0.5 }}
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        setSelectedImage(r.imageUrl);
                        setImageOpen(true);
                      }}
                    >
                      - 收据
                    </Typography>
                  )}
                </Typography>
                {r.receiptDate && (
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                    {formatDateZhCN(r.receiptDate)}
                  </Typography>
                )}
              </BoxAny>

              {/* Line items — 4 column table */}
              {r.items.length > 0 && (
                <BoxAny sx={{ mt: 0.5 }}>
                  {/* Header row */}
                  <BoxAny sx={{ display: 'flex', gap: 0.5, pb: 0.2, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary" sx={colSx.name}>商品名称</Typography>
                    <Typography variant="caption" color="text.secondary" sx={colSx.qty}>数量</Typography>
                    <Typography variant="caption" color="text.secondary" sx={colSx.price}>单价</Typography>
                    <Typography variant="caption" color="text.secondary" sx={colSx.total}>小计</Typography>
                  </BoxAny>
                  {/* Data rows */}
                  {r.items.map((item, i) => {
                    const rowKey = `${r.id}:${i}`;
                    const isExpanded = expandedKey === rowKey;
                    const clickable = hasHistory(item.name);
                    return (
                      <BoxAny key={i}>
                        <BoxAny sx={{ display: 'flex', gap: 0.5, py: 0.15 }}>
                          <Typography
                            variant="caption"
                            sx={{
                              ...colSx.name,
                              ...(clickable ? {
                                color: 'primary.main',
                                cursor: 'pointer',
                                textDecoration: isExpanded ? 'underline' : 'none',
                                '&:hover': { textDecoration: 'underline' },
                              } : {
                                color: 'text.secondary',
                              }),
                            }}
                            onClick={clickable ? (e) => handleItemClick(e, r.id, i, item.name) : undefined}
                          >
                            {item.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={colSx.qty}>
                            {item.quantity ?? ''}{item.unit || ''}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={colSx.price}>
                            {item.unitPrice != null ? `${currencySymbol(r.currency)}${item.unitPrice.toFixed(2)}` : ''}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={colSx.total}>
                            {item.totalPrice != null ? `${currencySymbol(r.currency)}${item.totalPrice.toFixed(2)}` : ''}
                          </Typography>
                        </BoxAny>
                        <Collapse in={isExpanded}>
                          <ItemHistoryPanel entries={getItemHistory(item.name)} currentReceiptId={r.id} />
                        </Collapse>
                      </BoxAny>
                    );
                  })}
                </BoxAny>
              )}

              {/* Total */}
              {r.totalAmount != null && (
                <BoxAny sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.3 }}>
                  <Typography variant="body2" color="error.main" fontWeight={700}>
                    合计 {currencySymbol(r.currency)}{r.totalAmount.toFixed(2)}
                  </Typography>
                </BoxAny>
              )}
            </BoxAny>
          </BoxAny>
        ))}
      </Paper>

      <Dialog open={imageOpen} onClose={() => setImageOpen(false)} maxWidth="lg">
        <DialogContent sx={{ p: 0 }}>
          <BoxAny component="img" src={selectedImage} sx={{ width: '100%', display: 'block' }} />
        </DialogContent>
      </Dialog>
    </BoxAny>
  );
};

/** Inline panel showing price history — same 4-column layout as item rows */
const ItemHistoryPanel: React.FC<{ entries: ItemHistoryEntry[]; currentReceiptId: string }> = ({ entries, currentReceiptId }) => {
  const prices = entries.map(e => e.unitPrice ?? e.totalPrice ?? Infinity);
  const minPrice = Math.min(...prices);

  return (
    <BoxAny
      sx={{
        my: 0.3, borderLeft: '2px solid', borderColor: 'primary.light',
        bgcolor: 'rgba(25, 118, 210, 0.04)', borderRadius: '0 4px 4px 0', py: 0.3, pl: 0.5,
      }}
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
    >
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 0.2, display: 'block', pl: 0.5 }}>
        购买记录 ({entries.length}次)
      </Typography>
      {entries.map((entry, i) => {
        const isCheapest = entry.unitPrice != null && entry.unitPrice === minPrice && entries.length > 1;
        const isCurrent = entry.receiptId === currentReceiptId;
        return (
          <BoxAny key={i} sx={{ display: 'flex', gap: 0.5, py: 0.1 }}>
            <Typography variant="caption" sx={{
              ...colSx.name,
              fontWeight: isCurrent ? 600 : 400,
              color: isCurrent ? 'text.primary' : 'text.secondary',
            }}>
              {entry.date} {entry.merchantName}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={colSx.qty}>
              {entry.quantity ?? ''}
            </Typography>
            <Typography variant="caption" sx={{
              ...colSx.price,
              color: isCheapest ? 'success.main' : 'text.secondary',
              fontWeight: isCheapest ? 600 : 400,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.3,
            }}>
              {isCheapest && <CheapIcon sx={{ fontSize: 10 }} />}
              {entry.unitPrice != null ? `${currencySymbol(entry.currency)}${entry.unitPrice.toFixed(2)}` : ''}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={colSx.total}>
              {entry.totalPrice != null ? `${currencySymbol(entry.currency)}${entry.totalPrice.toFixed(2)}` : ''}
            </Typography>
          </BoxAny>
        );
      })}
    </BoxAny>
  );
};
