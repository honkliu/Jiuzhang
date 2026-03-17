import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Chip,
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
import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';

const BoxAny = Box as any;

export const InviteCodesPage: React.FC = () => {
  const user = useSelector((state: any) => state.auth?.user);
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
      setError('Failed to load registration requests');
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
    <BoxAny sx={{ p: 3, maxWidth: 700, mx: 'auto' }}>
      <BoxAny sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Registration Requests</Typography>
        <Button size="small" startIcon={<RefreshIcon />} onClick={loadCodes} disabled={loading}>
          Refresh
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
                <TableCell>Email</TableCell>
                <TableCell>Code</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {codes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ color: 'text.secondary', py: 3 }}>
                    No registration requests
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
                        label={c.status === 'registered' ? 'Registered' : 'Pending'}
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
  );
};
