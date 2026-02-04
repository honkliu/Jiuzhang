import React from 'react';
import {
  AppBar,
  Toolbar,
  Box,
  Button,
  Avatar,
  Typography,
  IconButton,
} from '@mui/material';
import { Logout as LogoutIcon } from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { authService } from '@/services/auth.service';
import { useLanguage } from '@/i18n/LanguageContext';

const navItems = [
  { label: 'Chats', path: '/chats' },
  { label: 'Contacts', path: '/contacts' },
  { label: 'Pa', path: '/pa' },
  { label: 'Profile', path: '/profile' },
];

export const AppHeader: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSelector((state: RootState) => state.auth);
  const { t, toggleLanguage, language } = useLanguage();

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch {
      authService.clearAuth();
    }
    navigate('/login');
  };

  return (
    <AppBar position="fixed" color="default" elevation={0}>
      <Toolbar sx={{ gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1 }}>
          <Avatar src={user?.avatarUrl} variant="rounded" sx={{ width: 32, height: 32 }}>
            {user?.displayName?.[0]}
          </Avatar>
          <Typography variant="subtitle1" fontWeight="bold">
            {user?.displayName || t('appName')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, ml: 2 }}>
            {navItems.map((item) => (
              <Button
                key={item.path}
                color={location.pathname.startsWith(item.path) ? 'primary' : 'inherit'}
                onClick={() => navigate(item.path)}
              >
                {t(item.label)}
              </Button>
            ))}
          </Box>
        </Box>
        <Button onClick={toggleLanguage} variant="outlined" size="small">
          {language === 'en' ? '中文' : 'EN'}
        </Button>
        <IconButton onClick={handleLogout} title="Logout">
          <LogoutIcon />
        </IconButton>
      </Toolbar>
    </AppBar>
  );
};
