import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Box, Container, Paper, Tab, Tabs } from '@mui/material';
import { AppHeader } from '@/components/Shared/AppHeader';
import { useLanguage } from '@/i18n/LanguageContext';
import adminHelpEn from './admin-help.en.md?raw';
import adminHelpZh from './admin-help.zh.md?raw';
import userHelpEn from './user-help.en.md?raw';
import userHelpZh from './user-help.zh.md?raw';

const BoxAny = Box as any;

const markdownSx = {
  color: 'text.primary',
  fontSize: 15,
  lineHeight: 1.72,
  '& h1': {
    fontSize: { xs: 24, sm: 30 },
    lineHeight: 1.2,
    mt: 0,
    mb: 2.25,
    letterSpacing: 0,
  },
  '& h2': {
    fontSize: { xs: 18, sm: 20 },
    lineHeight: 1.3,
    mt: 3,
    mb: 1,
    letterSpacing: 0,
  },
  '& p': {
    my: 0.8,
  },
  '& ul': {
    mt: 0.75,
    mb: 1.25,
    pl: 2.5,
  },
  '& ol': {
    mt: 0.75,
    mb: 1.25,
    pl: 3,
  },
  '& li::marker': {
    color: 'text.secondary',
    fontWeight: 600,
  },
  '& li': {
    mb: 0.35,
  },
  '& code': {
    px: 0.5,
    py: 0.15,
    borderRadius: '4px',
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    fontSize: '0.92em',
  },
};

export const HelpPage: React.FC = () => {
  const [tab, setTab] = useState(0);
  const { language } = useLanguage();
  const helpContent = language === 'zh'
    ? [userHelpZh, adminHelpZh]
    : [userHelpEn, adminHelpEn];
  const tabLabels = language === 'zh'
    ? ['用户', '管理员']
    : ['User', 'Admin'];
  const content = helpContent[tab] ?? helpContent[0];

  return (
    <>
      <AppHeader />
      <BoxAny sx={{ minHeight: '100vh', pt: { xs: 'calc(56px + 8px)', sm: 'calc(64px + 10px)' }, pb: 5, background: 'linear-gradient(180deg, rgba(239,246,255,0.95), rgba(255,250,240,0.9))' }}>
        <Container maxWidth="md">
          <Paper sx={{ p: { xs: 0.25, sm: 0.5 }, mb: 1.25, borderRadius: '10px', background: '#ffffff', boxShadow: '0 8px 24px rgba(15,23,42,0.08)' }}>
            <Tabs
              value={tab}
              onChange={(_, value) => setTab(value)}
              variant="fullWidth"
              sx={{
                minHeight: 36,
                borderBottom: 1,
                borderColor: 'divider',
                '& .MuiTabs-flexContainer': { minHeight: 36 },
              }}
            >
              <Tab label={tabLabels[0]} sx={{ minHeight: 36, py: 0, px: 1, textTransform: 'none' }} />
              <Tab label={tabLabels[1]} sx={{ minHeight: 36, py: 0, px: 1, textTransform: 'none' }} />
            </Tabs>
          </Paper>

          <Paper sx={{ p: { xs: 2.25, sm: 3 }, borderRadius: '10px', background: '#ffffff', boxShadow: '0 8px 24px rgba(15,23,42,0.08)' }}>
            <BoxAny sx={markdownSx}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </BoxAny>
          </Paper>
        </Container>
      </BoxAny>
    </>
  );
};

export default HelpPage;