import React from 'react';
import {
  Box, Card, CardActionArea, CardMedia, CardContent, Typography, Chip, Grid,
} from '@mui/material';
import {
  ShoppingCart as ShoppingIcon,
  Restaurant as RestaurantIcon,
  LocalGroceryStore as GroceryIcon,
  MoreHoriz as OtherIcon,
} from '@mui/icons-material';
import type { ReceiptDto } from '@/services/receipt.service';
import { useLanguage } from '@/i18n/LanguageContext';

const BoxAny = Box as any;

const categoryIcons: Record<string, React.ReactNode> = {
  Supermarket: <GroceryIcon fontSize="small" />,
  Restaurant: <RestaurantIcon fontSize="small" />,
  OnlineShopping: <ShoppingIcon fontSize="small" />,
};

interface ReceiptListProps {
  receipts: ReceiptDto[];
  onSelect: (r: ReceiptDto) => void;
}

export const ReceiptList: React.FC<ReceiptListProps> = ({ receipts, onSelect }) => {
  const { t } = useLanguage();

  if (receipts.length === 0) {
    return (
      <BoxAny sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
        <Typography>{t('receipts.empty')}</Typography>
      </BoxAny>
    );
  }

  return (
    <Grid container spacing={2}>
      {receipts.map((r) => (
        <Grid item xs={12} sm={6} md={4} key={r.id}>
          <Card sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <CardActionArea onClick={() => onSelect(r)}>
              {r.imageUrl && (
                <CardMedia
                  component="img"
                  height="140"
                  image={r.imageUrl}
                  alt="receipt"
                  sx={{ objectFit: 'cover' }}
                />
              )}
              <CardContent>
                <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  {categoryIcons[r.category] || <OtherIcon fontSize="small" />}
                  <Typography variant="subtitle1" fontWeight={600} noWrap>
                    {r.merchantName || r.hospitalName || t(`receipts.cat.${r.category}`)}
                  </Typography>
                </BoxAny>
                {r.totalAmount != null && (
                  <Typography variant="h6" color="error.main" fontWeight={700}>
                    ¥{r.totalAmount.toFixed(2)}
                  </Typography>
                )}
                <BoxAny sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                  <Chip
                    label={t(`receipts.cat.${r.category}`)}
                    size="small"
                    variant="outlined"
                  />
                  <Typography variant="caption" color="text.secondary">
                    {r.receiptDate ? new Date(r.receiptDate).toLocaleDateString('zh-CN') : ''}
                  </Typography>
                </BoxAny>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
};
