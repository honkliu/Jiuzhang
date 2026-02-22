import React from 'react';
import {
  AppBar,
  Toolbar,
  Box,
  Button,
  Typography,
  IconButton,
  Badge,
  Menu,
  MenuItem,
  Divider,
  CircularProgress,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Logout as LogoutIcon,
  Notifications as NotificationsIcon,
  Menu as MenuIcon,
  Close as CloseIcon,
  MoreVert as MoreVertIcon,
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import { authService } from '@/services/auth.service';
import { contactService } from '@/services/contact.service';
import { useLanguage } from '@/i18n/LanguageContext';
import { fetchNotifications, fetchUnreadNotificationCount } from '@/store/notificationsSlice';
import { clearChat, upsertParticipantProfile } from '@/store/chatSlice';
import { updateUser } from '@/store/authSlice';
import { UserAvatar } from '@/components/Shared/UserAvatar';
import { GeneratedAvatarPicker } from '@/components/Avatar/GeneratedAvatarPicker';
import { formatDistanceToNow } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';

// Work around TS2590 (“union type too complex”) from MUI Box typings in some TS versions.
const BoxAny = Box as any;

const navItems = [
  { label: 'Chats', path: '/chats' },
  { label: 'Contacts', path: '/contacts' },
  { label: 'Pa', path: '/pa' },
  { label: 'Profile', path: '/profile' },
];

interface AppHeaderProps {
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ onToggleSidebar, sidebarOpen }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const { unreadCount: unreadNotifications, items, loading, error } = useSelector(
    (state: RootState) => state.notifications
  );
  const { t, toggleLanguage, language } = useLanguage();
  const [notificationsAnchorEl, setNotificationsAnchorEl] = React.useState<null | HTMLElement>(null);
  const [navAnchorEl, setNavAnchorEl] = React.useState<null | HTMLElement>(null);
  const [avatarAnchorEl, setAvatarAnchorEl] = React.useState<null | HTMLElement>(null);

  const notificationsOpen = Boolean(notificationsAnchorEl);
  const navOpen = Boolean(navAnchorEl);
  const avatarPickerOpen = Boolean(avatarAnchorEl);

  const handleOpenNotifications = (e: React.MouseEvent<HTMLElement>) => {
    setNotificationsAnchorEl(e.currentTarget);
    dispatch(fetchUnreadNotificationCount());
    dispatch(fetchNotifications({ limit: 25 }));
  };

  const handleCloseNotifications = () => {
    setNotificationsAnchorEl(null);
  };

  const handleOpenNav = (e: React.MouseEvent<HTMLElement>) => {
    setNavAnchorEl(e.currentTarget);
  };

  const handleCloseNav = () => {
    setNavAnchorEl(null);
  };

  const handleOpenAvatarPicker = (e: React.MouseEvent<HTMLElement>) => {
    setAvatarAnchorEl(e.currentTarget);
  };

  const handleCloseAvatarPicker = () => {
    setAvatarAnchorEl(null);
  };

  const handleSelectAvatar = async (avatarImageId: string, avatarUrl: string) => {
    if (!user) return;

    try {
      const sourceAvatarImageId = user.avatarImageId ?? avatarImageId;
      const updated = await contactService.updateProfile({
        avatarUrl,
        avatarImageId: sourceAvatarImageId,
      });
      dispatch(updateUser(updated));
      dispatch(
        upsertParticipantProfile({
          userId: updated.id,
          displayName: updated.displayName,
          avatarUrl: updated.avatarUrl,
          gender: updated.gender,
        })
      );

      const accessToken = authService.getAccessToken();
      if (accessToken) {
        authService.saveAuth(accessToken, { ...user, ...updated });
      }
    } catch (error) {
      console.error('Failed to update avatar selection', error);
    }
  };

  const formatWhen = (iso: string) => {
    try {
      return formatDistanceToNow(new Date(iso), {
        addSuffix: true,
        locale: language === 'zh' ? zhCN : enUS,
      });
    } catch {
      return '';
    }
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch {
      authService.clearAuth();
    }
    // Clear Redux state
    dispatch(clearChat());
    navigate('/login');
  };

  const showChatToggle = location.pathname.startsWith('/chats') && Boolean(onToggleSidebar);

  return (
    <AppBar position="fixed" color="default" elevation={0} sx={{ pt: 'env(safe-area-inset-top)' }}>
      <Toolbar sx={{ gap: 1.5, minHeight: { xs: 56, sm: 64 } }}>
        <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1, minWidth: 0 }}>
          {showChatToggle && isMobile && (
            <IconButton
              onClick={onToggleSidebar}
              title="Toggle chat list"
              size="small"
              edge="start"
            >
              {sidebarOpen ? <CloseIcon /> : <MenuIcon />}
            </IconButton>
          )}
          <Typography
            variant="subtitle1"
            fontWeight="bold"
            sx={{ mr: 1, whiteSpace: 'nowrap', fontSize: { xs: '0.95rem', sm: '1rem' } }}
          >
            {t('appName')}
          </Typography>
          <BoxAny sx={{ display: { xs: 'none', md: 'flex' }, gap: 1, overflow: 'hidden' }}>
            {navItems.map((item) => (
              <Button
                key={item.path}
                color={location.pathname.startsWith(item.path) ? 'primary' : 'inherit'}
                onClick={() => navigate(item.path)}
              >
                {t(item.label)}
              </Button>
            ))}
          </BoxAny>
        </BoxAny>

        <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 0.5 }}>
            {isMobile ? (
              <IconButton onClick={handleOpenAvatarPicker} title="Choose mood" size="small" sx={{ p: 0 }}>
                <UserAvatar
                  src={user?.avatarUrl}
                  gender={user?.gender}
                  variant="rounded"
                  sx={{ width: 32, height: 32 }}
                />
              </IconButton>
            ) : (
              <UserAvatar
                src={user?.avatarUrl}
                gender={user?.gender}
                variant="rounded"
                sx={{ width: 32, height: 32 }}
              />
            )}
            <BoxAny sx={{ display: { xs: 'none', sm: 'flex' }, flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
              <Typography
                variant="subtitle2"
                fontWeight="bold"
                sx={{
                  maxWidth: 160,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user?.displayName || ''}
              </Typography>
              <IconButton onClick={handleOpenAvatarPicker} title="Choose mood" size="small" sx={{ p: 0, minWidth: 0, ml: '-2px' }}>
                <Typography component="span" sx={{ fontSize: '0.7rem', fontWeight: 700, lineHeight: 1, color: 'text.secondary' }}>
                  ...
                </Typography>
              </IconButton>
            </BoxAny>
          </BoxAny>

          {isMobile && (
            <IconButton onClick={handleOpenNav} title={t('nav.menu')}>
              <MoreVertIcon />
            </IconButton>
          )}
          <Button onClick={toggleLanguage} variant="outlined" size="small">
            {language === 'en' ? '中文' : 'EN'}
          </Button>
          <IconButton title={t('nav.notifications')} onClick={handleOpenNotifications}>
            <Badge
              color="error"
              badgeContent={unreadNotifications > 99 ? '99+' : unreadNotifications}
              invisible={unreadNotifications <= 0}
            >
              <NotificationsIcon />
            </Badge>
          </IconButton>
          <IconButton onClick={handleLogout} title={t('nav.logout')}>
            <LogoutIcon />
          </IconButton>
        </BoxAny>

        <Menu
          anchorEl={navAnchorEl}
          open={navOpen}
          onClose={handleCloseNav}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          {navItems.map((item) => (
            <MenuItem
              key={item.path}
              selected={location.pathname.startsWith(item.path)}
              onClick={() => {
                handleCloseNav();
                navigate(item.path);
              }}
            >
              {t(item.label)}
            </MenuItem>
          ))}
        </Menu>

        <Menu
          anchorEl={notificationsAnchorEl}
          open={notificationsOpen}
          onClose={handleCloseNotifications}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          PaperProps={{
            sx: {
              width: 420,
              maxWidth: '92vw',
              maxHeight: '70vh',
            },
          }}
        >
          <BoxAny sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle1" fontWeight="bold">
              {t('nav.notifications')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {unreadNotifications > 0 ? `${unreadNotifications} ${t('nav.unread')}` : t('nav.allCaughtUp')}
            </Typography>
          </BoxAny>
          <Divider />

          {loading ? (
            <BoxAny sx={{ px: 2, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CircularProgress size={20} />
            </BoxAny>
          ) : error ? (
            <BoxAny sx={{ px: 2, py: 2 }}>
              <Typography variant="body2" color="error.main">
                {error}
              </Typography>
            </BoxAny>
          ) : items.length === 0 ? (
            <BoxAny sx={{ px: 2, py: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {t('nav.noNotifications')}
              </Typography>
            </BoxAny>
          ) : (
            items.slice(0, 25).map((n) => (
              <BoxAny
                key={n.id}
                onClick={handleCloseNotifications}
                role="menuitem"
                tabIndex={0}
                sx={{
                  px: 2,
                  py: 1.25,
                  cursor: 'pointer',
                  bgcolor: n.isRead ? 'transparent' : 'rgba(211, 47, 47, 0.04)',
                  '&:hover': { bgcolor: 'action.hover' },
                  display: 'flex',
                  gap: 1,
                }}
              >
                <BoxAny
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    bgcolor: n.isRead ? 'transparent' : 'error.main',
                    mt: 0.75,
                    flexShrink: 0,
                  }}
                />
                <BoxAny sx={{ minWidth: 0, flexGrow: 1 }}>
                  <BoxAny sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <Typography
                      variant="body2"
                      fontWeight={n.isRead ? 500 : 700}
                      sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {n.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                      {formatWhen(n.createdAt)}
                    </Typography>
                  </BoxAny>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {n.body}
                  </Typography>
                </BoxAny>
              </BoxAny>
            ))
          )}
        </Menu>
      </Toolbar>

      <GeneratedAvatarPicker
        anchorEl={avatarAnchorEl}
        open={avatarPickerOpen}
        onClose={handleCloseAvatarPicker}
        avatarImageId={user?.avatarImageId}
        currentAvatarUrl={user?.avatarUrl}
        onSelect={handleSelectAvatar}
      />
    </AppBar>
  );
};
