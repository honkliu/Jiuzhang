import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
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
const statusTextColorMap = {
  warning: '#ed6c02',
  success: '#2e7d32',
  default: '#64748b',
} as const;

export const InviteCodesPage: React.FC = () => {
  const user = useSelector((state: any) => state.auth?.user);
  const { t } = useLanguage();
  const [codes, setCodes] = useState<{ email: string; code: string; purpose: string; createdAt: string; status: string }[]>([]);
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

  const getPurposeLabel = (purpose: string) => {
    return purpose === 'password_reset' ? t('admin.passwordReset') : t('admin.registration');
  };

  const getStatusLabel = (status: string) => {
    if (status === 'registered') return t('admin.registered');
    if (status === 'reset') return t('admin.reset');
    if (status === 'expired') return t('admin.expired');
    if (status === 'superseded') return t('admin.superseded');
    return t('admin.pending');
  };

  const getStatusColor = (status: string): 'success' | 'warning' | 'default' => {
    if (status === 'pending') return 'warning';
    if (status === 'registered' || status === 'reset') return 'success';
    return 'default';
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
            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                '&::-webkit-scrollbar': {
                  display: 'none',
                },
              }}
            >
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{t('admin.type')}</TableCell>
                    <TableCell>{t('admin.email')}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{t('admin.code')}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{t('admin.status')}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{t('admin.date')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {codes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 3 }}>
                        {t('admin.empty')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    codes.map((c, index) => (
                      <TableRow key={`${c.email}-${index}`}>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{getPurposeLabel(c.purpose)}</TableCell>
                        <TableCell>{c.email}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', fontFamily: '"Noto Sans SC", "PingFang SC", "Source Han Sans SC", sans-serif', fontWeight: 700, fontSize: '1.1rem' }}>
                          {c.code}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Typography
                            variant="body2"
                            sx={{
                              color: statusTextColorMap[getStatusColor(c.status)],
                              fontWeight: 600,
                            }}
                          >
                            {getStatusLabel(c.status)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary', fontSize: '0.85rem' }}>
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
