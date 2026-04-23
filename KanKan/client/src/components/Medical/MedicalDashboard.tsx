import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Chip,
  List, ListItem, ListItemText, Button, Stack,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, CircularProgress,
} from '@mui/material';
import { CalendarToday, AttachMoney, Description } from '@mui/icons-material';
import { photoService, type VisitStatsResponse, type AutoAssociateResult } from '@/services/photo.service';
import { receiptService, type ReceiptVisitDto } from '@/services/receipt.service';

const MedicalDashboard: React.FC = () => {
  const [stats, setStats] = useState<VisitStatsResponse | null>(null);
  const [visits, setVisits] = useState<ReceiptVisitDto[]>([]);
  const [autoResults, setAutoResults] = useState<AutoAssociateResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsRes, visitsRes] = await Promise.all([
        photoService.getVisitStats(),
        receiptService.listVisits(),
      ]);
      setStats(statsRes);
      setVisits(visitsRes);
    } catch (e) {
      console.error('Failed to load medical data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoAssociate = async () => {
    try {
      const results = await photoService.autoAssociate();
      setAutoResults(results);
    } catch (e) {
      console.error('Auto-associate failed:', e);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      {/* Stats Cards */}
      {stats && (
        <Paper sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>就诊统计</Typography>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
            <StatCard label="总支出" value={`¥${stats.totalSpending.toFixed(2)}`} icon={<AttachMoney />} />
            <StatCard label="就诊次数" value={stats.totalVisits} icon={<CalendarToday />} />
            <StatCard label="票据数量" value={stats.totalReceipts} icon={<Description />} />
            <StatCard label="平均每次" value={`¥${stats.averagePerVisit.toFixed(2)}`} icon={<AttachMoney />} />
          </Box>
        </Paper>
      )}

      {/* Auto-associate */}
      <Paper sx={{ p: 2, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight={600}>自动关联</Typography>
          <Button variant="contained" onClick={handleAutoAssociate}>开始关联</Button>
        </Box>
        {autoResults.length > 0 && (
          <List dense>
            {autoResults.map((r, i) => (
              <ListItem key={i} secondaryAction={
                <Chip label={r.matched ? r.matchLevel : '未匹配'} color={r.matched ? 'success' : 'default'} size="small" />
              }>
                <ListItemText
                  primary={`照片 ${r.photoId.slice(0, 8)}`}
                  secondary={r.matched ? `关联到票据 ${r.receiptId}` : '未找到匹配票据'}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Paper>

      {/* Hospital Statistics */}
      {stats && stats.hospitalStats.length > 0 && (
        <Paper sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>医院支出排行</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>医院</TableCell>
                  <TableCell align="right">支出</TableCell>
                  <TableCell align="right">票据数</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stats.hospitalStats.sort((a, b) => b.totalSpending - a.totalSpending).map((h) => (
                  <TableRow key={h.hospitalName}>
                    <TableCell>{h.hospitalName}</TableCell>
                    <TableCell align="right">¥{h.totalSpending.toFixed(2)}</TableCell>
                    <TableCell align="right">{h.receiptCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Visit Timeline */}
      {visits.length > 0 && (
        <Paper sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>就诊记录</Typography>
          <Stack spacing={2}>
            {visits.map((visit) => (
              <VisitSummary key={visit.id} visit={visit} />
            ))}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
};

const StatCard: React.FC<{ label: string; value: string | number; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <Paper sx={{ p: 2, flex: 1, minWidth: 120, borderRadius: 2 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
      {icon}
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
    <Typography variant="h5" fontWeight={700}>{value}</Typography>
  </Paper>
);

const VisitSummary: React.FC<{ visit: ReceiptVisitDto }> = ({ visit }) => {
  const totalAmount = visit.receipts.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
  return (
    <Paper sx={{ p: 2, borderRadius: 2 }}>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
          <CalendarToday />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            {visit.hospitalName || visit.department || '未命名就诊'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {visit.visitDate ? new Date(visit.visitDate).toLocaleDateString('zh-CN') : '日期未知'}
            {visit.patientName && ` · ${visit.patientName}`}
            {visit.doctorName && ` · ${visit.doctorName}`}
          </Typography>
        </Box>
        <Chip label={`¥${totalAmount.toFixed(2)}`} color="primary" variant="outlined" />
      </Box>
      {visit.receipts.length > 0 && (
        <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {visit.receipts.map((r) => (
            <Chip key={r.id} label={r.category} size="small" variant="outlined" />
          ))}
        </Box>
      )}
    </Paper>
  );
};

export default MedicalDashboard;
