import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Chip,
  Container,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Paper,
  CircularProgress,
} from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import { adminService } from '@/services/admin.service';
import { AppHeader } from '@/components/Shared/AppHeader';
import { useLanguage } from '@/i18n/LanguageContext';
import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';

const BoxAny = Box as any;

export const InviteCodesPage: React.FC = () => {
  const user = useSelector((state: any) => state.auth?.user);
  const { t } = useLanguage();
  const [codes, setCodes] = useState<{ email: string; code: string; createdAt: string; status: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user?.isAdmin) {
    return <Navigate to="/chats" replace />;
  }

  const loadCodes = async () => {
    setLoading(true);
    try {
      const data = await adminService.getInviteCodes();
      setCodes(data);
    } catch {
      setError(t('admin.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCodes();
  }, []);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  return (
    <BoxAny sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppHeader />
      <Container sx={{ py: 3, pt: 10 }} maxWidth="md">
        <BoxAny sx={{ maxWidth: 700, mx: 'auto' }}>
          <BoxAny sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h5">{t('admin.title')}</Typography>
            <Button size="small" startIcon={<RefreshIcon />} onClick={loadCodes} disabled={loading}>
              {t('admin.refresh')}
            </Button>
          </BoxAny>

          {error && (
            <Typography color="error" sx={{ mb: 1 }}>{error}</Typography>
          )}

          {loading ? (
            <BoxAny sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </BoxAny>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('admin.email')}</TableCell>
                    <TableCell>{t('admin.code')}</TableCell>
                    <TableCell>{t('admin.status')}</TableCell>
                    <TableCell>{t('admin.date')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {codes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ color: 'text.secondary', py: 3 }}>
                        {t('admin.empty')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    codes.map((c, index) => (
                      <TableRow key={`${c.email}-${index}`}>
                        <TableCell>{c.email}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1.1rem' }}>
                          {c.code}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={c.status === 'registered' ? t('admin.registered') : t('admin.pending')}
                            color={c.status === 'registered' ? 'success' : 'warning'}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                          {formatDate(c.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </BoxAny>
      </Container>
    </BoxAny>
  );
};
