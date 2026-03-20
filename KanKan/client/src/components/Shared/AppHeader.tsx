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
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import { authService } from '@/services/auth.service';
import { contactService } from '@/services/contact.service';
import { useLanguage } from '@/i18n/LanguageContext';
import { fetchNotifications, fetchUnreadNotificationCount, markAllReadLocal } from '@/store/notificationsSlice';
import { notificationService } from '@/services/notification.service';
import { clearChat, upsertParticipantProfile } from '@/store/chatSlice';
import { updateUser } from '@/store/authSlice';
import { UserAvatar } from '@/components/Shared/UserAvatar';
import { GeneratedAvatarPicker } from '@/components/Avatar/GeneratedAvatarPicker';
import { useSettings } from '@/settings/SettingsContext';

// Work around TS2590 (“union type too complex”) from MUI Box typings in some TS versions.
const BoxAny = Box as any;

const navItems = [
  { label: 'Chats', path: '/chats', adminOnly: false },
  { label: 'Contacts', path: '/contacts', adminOnly: false },
  { label: 'Pa', path: '/pa', adminOnly: false },
  { label: 'Profile', path: '/profile', adminOnly: false },
  { label: '家谱', path: '/family', adminOnly: true },
  { label: '验证码', path: '/admin', adminOnly: true },
];

const headerNavButtonSx = {
  minWidth: 'auto',
  px: { xs: 0.8, sm: 1.1 },
  py: { xs: 0.35, md: 0.5 },
  fontSize: { xs: '0.82rem', sm: '0.88rem', md: '0.92rem' },
  whiteSpace: 'nowrap',
  borderRadius: 2,
  boxShadow: 'none',
  border: 'none',
  background: 'transparent',
  '&:hover': {
    boxShadow: 'none',
    background: 'rgba(15, 23, 42, 0.06)',
  },
};

interface AppHeaderProps {
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
}

export const AppHeader: React.FC<AppHeaderProps> = () => {
  const theme = useTheme();
  const isCompactNav = useMediaQuery(theme.breakpoints.down('md'));
  const isHoverCapable = useMediaQuery('(hover: hover) and (pointer: fine)');
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const { unreadCount: unreadNotifications, items, loading, error } = useSelector(
    (state: RootState) => state.notifications
  );
  const { t, toggleLanguage, language } = useLanguage();
  const { formatDateTime } = useSettings();
  const [notificationsAnchorEl, setNotificationsAnchorEl] = React.useState<null | HTMLElement>(null);
  const [navAnchorEl, setNavAnchorEl] = React.useState<null | HTMLElement>(null);
  const [avatarAnchorEl, setAvatarAnchorEl] = React.useState<null | HTMLElement>(null);
  const notificationsOpen = Boolean(notificationsAnchorEl);
  const navOpen = Boolean(navAnchorEl);
  const avatarPickerOpen = Boolean(avatarAnchorEl);
  const leftNavRef = React.useRef<HTMLDivElement | null>(null);
  const titleRef = React.useRef<HTMLDivElement | null>(null);
  const measureMoreButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const measureButtonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const availableNavItems = navItems.filter((item) => {
    if (item.path === '/family') return Boolean(user?.canViewFamilyTree);
    return !item.adminOnly || user?.isAdmin;
  });
  const [compactVisibleCount, setCompactVisibleCount] = React.useState(0);

  React.useLayoutEffect(() => {
    const measure = () => {
      const leftNavWidth = leftNavRef.current?.offsetWidth ?? 0;
      const titleWidth = titleRef.current?.offsetWidth ?? 0;

      if (leftNavWidth === 0) {
        setCompactVisibleCount(0);
        return;
      }

      const gapAfterTitle = 12;
      const navAreaWidth = Math.max(0, leftNavWidth - titleWidth - gapAfterTitle);
      const buttonGap = 4;
      const moreButtonWidth = (measureMoreButtonRef.current?.offsetWidth ?? 32) + buttonGap;
      const widths = availableNavItems.map((_, index) => {
        const width = measureButtonRefs.current[index]?.offsetWidth ?? 0;
        return width + buttonGap;
      });

      let used = 0;
      let visibleCount = 0;

      for (let index = 0; index < widths.length; index += 1) {
        const remaining = widths.length - (index + 1);
        const reserveForMore = remaining > 0 ? moreButtonWidth : 0;

        if (used + widths[index] + reserveForMore > navAreaWidth) {
          break;
        }

        used += widths[index];
        visibleCount += 1;
      }

      setCompactVisibleCount(visibleCount);
    };

    measure();

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => measure())
      : null;

    if (resizeObserver) {
      if (leftNavRef.current) resizeObserver.observe(leftNavRef.current);
      if (titleRef.current) resizeObserver.observe(titleRef.current);
    }

    window.addEventListener('resize', measure);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [availableNavItems, language]);

  const compactVisibleNavItems = availableNavItems.slice(0, compactVisibleCount);
  const compactOverflowNavItems = availableNavItems.slice(compactVisibleCount);

  // Poll unread count on page navigation and periodically
  React.useEffect(() => {
    dispatch(fetchUnreadNotificationCount());
    const interval = setInterval(() => {
      dispatch(fetchUnreadNotificationCount());
    }, 30000);
    return () => clearInterval(interval);
  }, [location.pathname]);

  const handleOpenNotifications = (e: React.MouseEvent<HTMLElement>) => {
    setNotificationsAnchorEl(e.currentTarget);
    dispatch(fetchNotifications({ limit: 25 }));

    // Mark all as read when opening the panel
    if (unreadNotifications > 0) {
      notificationService.markAllRead().then(() => {
        dispatch(markAllReadLocal());
      }).catch(() => {});
    }
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

  const handleSelectAvatar = async (
    avatarImageId: string,
    avatarUrl: string,
    sourceAvatarImageId?: string | null
  ) => {
    if (!user) return;

    try {
      const resolvedSourceId = sourceAvatarImageId || user.avatarImageId || avatarImageId;
      const updated = await contactService.updateProfile({
        avatarUrl,
        avatarImageId: resolvedSourceId,
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
    return formatDateTime(iso, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
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

  return (
    <AppBar position="fixed" color="default" elevation={0} sx={{ pt: 'env(safe-area-inset-top)' }}>
      <Toolbar sx={{ gap: 1.25, minHeight: { xs: 53, sm: 61 }, py: 0.25 }}>
        <BoxAny ref={leftNavRef} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1, minWidth: 0 }}>
          <Typography
            variant="subtitle1"
            fontWeight="bold"
            ref={titleRef}
            sx={{ mr: 0.5, whiteSpace: 'nowrap', fontSize: { xs: '0.95rem', sm: '1rem' } }}
          >
            {t('appName')}
          </Typography>
          <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: isCompactNav ? 0.5 : 1, minWidth: 0, overflow: 'hidden' }}>
            {compactVisibleNavItems.map((item) => (
              <Button
                key={item.path}
                color={location.pathname.startsWith(item.path) ? 'primary' : 'inherit'}
                size={isCompactNav ? 'small' : 'medium'}
                onClick={() => navigate(item.path)}
                sx={{
                  ...headerNavButtonSx,
                  px: isCompactNav ? headerNavButtonSx.px : 1.5,
                  py: isCompactNav ? headerNavButtonSx.py : 0.5,
                  fontSize: isCompactNav ? headerNavButtonSx.fontSize : '0.92rem',
                  color: location.pathname.startsWith(item.path) ? 'primary.main' : 'text.primary',
                  fontWeight: location.pathname.startsWith(item.path) ? 700 : 500,
                }}
              >
                {t(item.label)}
              </Button>
            ))}
          </BoxAny>
          {compactOverflowNavItems.length > 0 && (
            <IconButton onClick={handleOpenNav} title={t('nav.menu')} sx={{ p: 0.25 }}>
              <ExpandMoreIcon sx={{ fontSize: '1.1rem' }} />
            </IconButton>
          )}
        </BoxAny>

        <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mr: 0.25 }}>
            <BoxAny sx={{ display: 'inline-flex' }}>
              <UserAvatar
                src={user?.avatarUrl}
                gender={user?.gender}
                variant="rounded"
                previewMode={isHoverCapable ? 'hover' : 'tap'}
                closePreviewOnClick
                sx={{ width: 48, height: 48 }}
              />
            </BoxAny>
            <BoxAny
              sx={{
                display: { xs: 'flex', sm: 'flex' },
                flexDirection: 'column',
                alignItems: 'flex-start',
                minWidth: 0,
                cursor: 'pointer',
              }}
              role="button"
              tabIndex={0}
              onClick={handleOpenAvatarPicker}
              onKeyDown={(event: React.KeyboardEvent<HTMLElement>) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleOpenAvatarPicker(event as any);
                }
              }}
            >
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
              <IconButton
                onClick={handleOpenAvatarPicker}
                title={t('nav.chooseMood')}
                size="small"
                sx={{ p: 0.5, minWidth: 0, ml: 0.25, bgcolor: 'rgba(7, 193, 96, 0.12)' }}
              >
                <ExpandMoreIcon sx={{ fontSize: '1.05rem', color: 'primary.main' }} />
              </IconButton>
            </BoxAny>
          </BoxAny>

          <Button onClick={toggleLanguage} variant="outlined" size="small" sx={{ minWidth: 36, px: 0.75 }}>
            {language === 'en' ? '中文' : 'EN'}
          </Button>
          <IconButton
            title={t('nav.notifications')}
            onClick={handleOpenNotifications}
            sx={{ p: 0.6 }}
          >
            <Badge
              color="error"
              badgeContent={unreadNotifications > 99 ? '99+' : unreadNotifications}
              invisible={unreadNotifications <= 0}
            >
              <NotificationsIcon sx={{ fontSize: '1.1rem' }} />
            </Badge>
          </IconButton>
          <IconButton onClick={handleLogout} title={t('nav.logout')} sx={{ p: 0.6 }}>
            <LogoutIcon sx={{ fontSize: '1.1rem' }} />
          </IconButton>
        </BoxAny>

        <Menu
          anchorEl={navAnchorEl}
          open={navOpen}
          onClose={handleCloseNav}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          PaperProps={{
            sx: {
              background: '#f5f7fb',
              border: '1px solid rgba(15, 23, 42, 0.08)',
            },
          }}
        >
          {compactOverflowNavItems.map((item) => (
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

        <BoxAny
          aria-hidden
          sx={{
            position: 'absolute',
            visibility: 'hidden',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            height: 0,
            overflow: 'hidden',
          }}
        >
          {availableNavItems.map((item, index) => (
            <Button
              key={`measure-${item.path}`}
              size={isCompactNav ? 'small' : 'medium'}
              ref={(element: HTMLButtonElement | null) => {
                measureButtonRefs.current[index] = element;
              }}
              sx={{
                ...headerNavButtonSx,
                px: isCompactNav ? headerNavButtonSx.px : 1.5,
                py: isCompactNav ? headerNavButtonSx.py : 0.5,
                fontSize: isCompactNav ? headerNavButtonSx.fontSize : '0.92rem',
              }}
            >
              {t(item.label)}
            </Button>
          ))}
          <IconButton ref={measureMoreButtonRef} sx={{ p: 0.25 }}>
            <ExpandMoreIcon sx={{ fontSize: '1.1rem' }} />
          </IconButton>
        </BoxAny>

        <Menu
          anchorEl={notificationsAnchorEl}
          open={notificationsOpen}
          onClose={handleCloseNotifications}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          PaperProps={{
            sx: {
              background: '#f5f7fb',
              border: '1px solid rgba(15, 23, 42, 0.08)',
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
