import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Container,
  Typography,
  TextField,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Button,
  CircularProgress,
  useMediaQuery,
} from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store';
import { contactService, User, FriendRequest } from '@/services/contact.service';
import { adminService } from '@/services/admin.service';
import { AppHeader } from '@/components/Shared/AppHeader';
import { UserAvatar } from '@/components/Shared/UserAvatar';
import { useLanguage } from '@/i18n/LanguageContext';
import { WA_AVATAR_URL, WA_USER_ID } from '@/utils/chatParticipants';
import { appPageContainerSx, appPageTitleSx } from '@/styles/appLayout';
import { ConfirmDialog } from '@/components/Shared/ConfirmDialog';

// Work around TS2590 (“union type too complex”) from MUI Box typings in some TS versions.
const BoxAny = Box as any;
const compactAvatarSx = { width: 40, height: 40 };
const compactListItemSx = {
  position: 'relative',
  py: 0.5,
  pl: 2.5,
  pr: 0.5,
  '& .MuiListItemSecondaryAction-root': {
    right: 8,
  },
  '&.MuiListItem-divider': {
    borderBottom: 'none',
  },
  '&.MuiListItem-divider::after': {
    content: '""',
    position: 'absolute',
    left: 76,
    right: 0,
    bottom: 0,
    borderBottom: '1px solid',
    borderColor: 'divider',
    opacity: 0.7,
  },
};
const compactActionButtonSx = {
  minWidth: 0,
  px: 1.1,
  py: 0.25,
  whiteSpace: 'nowrap',
};
const compactListSx = {
  py: 0,
  mb: 0,
};
const compactSubtitleSx = {
  display: 'block',
  fontSize: 12,
  lineHeight: 1.45,
  pb: '1px',
};
const compactSectionTitleSx = {
  mt: 1,
  mb: 0.375,
  px: 0.5,
  display: 'flex',
  alignItems: 'center',
};

const SectionHeader: React.FC<{ title: string }> = ({ title }) => {
  return (
    <BoxAny sx={compactSectionTitleSx}>
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5, whiteSpace: 'nowrap', fontWeight: 500 }}>
        {title}
      </Typography>
    </BoxAny>
  );
};

type ContactConfirmation = {
  kind: 'remove' | 'delete' | 'disable' | 'enable';
  userId: string;
  name: string;
};

export const ContactsPage: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { t } = useLanguage();
  const isHoverCapable = useMediaQuery('(hover: hover) and (pointer: fine)');
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const currentUserId = currentUser?.id;
  const isAdmin = Boolean(currentUser?.isAdmin);
  const [users, setUsers] = useState<User[]>([]);
  const [contacts, setContacts] = useState<User[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ContactConfirmation | null>(null);
  const actionPendingRef = useRef(false);
  const loadVersionRef = useRef(0);
  const contactsVersionRef = useRef(0);

  const loadUsers = async (query = searchQuery) => {
    const version = ++loadVersionRef.current;
    const contactsVersion = ++contactsVersionRef.current;
    setLoading(true);
    setErrorKey(null);
    try {
      const [allUsers, contactsData, requestsData] = await Promise.all([
        query.length >= 2 ? contactService.searchUsers(query) : contactService.getAllUsers(),
        contactService.getContacts(),
        contactService.getFriendRequests(),
      ]);
      if (version === loadVersionRef.current) setUsers(allUsers);
      if (contactsVersion === contactsVersionRef.current) {
        setContacts(contactsData);
        setRequests(requestsData);
      }
    } catch (error) {
      console.error('Failed to load contacts:', error);
      if (version === loadVersionRef.current || contactsVersion === contactsVersionRef.current) {
        setErrorKey('contacts.loadFailed');
      }
    } finally {
      if (version === loadVersionRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    return () => {
      loadVersionRef.current += 1;
      contactsVersionRef.current += 1;
    };
  }, []);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length >= 2) {
      const version = ++loadVersionRef.current;
      setLoading(true);
      setErrorKey((current) => current === 'contacts.loadFailed' ? current : null);
      try {
        const results = await contactService.searchUsers(query);
        if (version === loadVersionRef.current) setUsers(results);
      } catch (error) {
        console.error('Failed to search contacts:', error);
        if (version === loadVersionRef.current) {
          setErrorKey((current) => current === 'contacts.loadFailed' ? current : 'contacts.searchFailed');
        }
      } finally {
        if (version === loadVersionRef.current) setLoading(false);
      }
    } else {
      await loadUsers(query);
    }
  };

  const runAction = async (userId: string, action: () => Promise<unknown>) => {
    if (actionPendingRef.current) return;
    actionPendingRef.current = true;
    setActionLoading(userId);
    setErrorKey(null);
    try {
      await action();
      await loadUsers();
    } catch (error) {
      console.error('Contact action failed:', error);
      setErrorKey('contacts.actionFailed');
    } finally {
      actionPendingRef.current = false;
      setActionLoading(null);
    }
  };

  const handleAddFriend = (userId: string) =>
    runAction(userId, () => contactService.sendFriendRequest(userId));

  const handleRemoveFriend = (userId: string) => {
    setConfirmation({ kind: 'remove', userId, name: userId });
  };

  const handleDeleteUser = (userId: string, displayName?: string) => {
    setConfirmation({ kind: 'delete', userId, name: displayName || userId });
  };

  const handleToggleDisabled = (user: User) => {
    setConfirmation({
      kind: user.isDisabled ? 'enable' : 'disable',
      userId: user.id,
      name: user.displayName || user.id,
    });
  };

  const handleConfirmedAction = async (target: ContactConfirmation) => {
    setActionLoading(target.userId);
    setErrorKey(null);
    try {
      switch (target.kind) {
        case 'remove':
          await contactService.removeFriend(target.userId);
          break;
        case 'delete':
          await adminService.deleteUser(target.userId);
          break;
        case 'enable':
          await adminService.enableUser(target.userId);
          break;
        case 'disable':
          await adminService.disableUser(target.userId);
          break;
      }
      await loadUsers();
    } finally {
      setActionLoading(null);
    }
  };

  const handleAccept = (fromUserId: string) =>
    runAction(fromUserId, () => contactService.acceptFriendRequest(fromUserId));

  const handleReject = (fromUserId: string) =>
    runAction(fromUserId, () => contactService.rejectFriendRequest(fromUserId));

  const confirmationLabel = confirmation
    ? t({
        remove: 'contacts.removeFriend',
        delete: 'contacts.deleteUser',
        enable: 'contacts.enable',
        disable: 'contacts.disable',
      }[confirmation.kind])
    : '';
  const confirmationDescription = !confirmation ? ''
    : confirmation.kind === 'remove' ? t('contacts.removeConfirm')
    : confirmation.kind === 'delete'
      ? t('contacts.deleteUserConfirm').replace('{name}', confirmation.name)
      : t('contacts.toggleDisableConfirm')
        .replace('{action}', confirmationLabel)
        .replace('{name}', confirmation.name);

  const assistantSource =
    users.find((user) => user.id === WA_USER_ID) ??
    contacts.find((user) => user.id === WA_USER_ID) ??
    requests.find((req) => req.fromUserId === WA_USER_ID)?.fromUser;

  const assistantUser = assistantSource
    ? { ...assistantSource, displayName: t('Wa') }
    : {
        id: WA_USER_ID,
        handle: 'assistant_1003',
        displayName: t('Wa'),
        avatarUrl: WA_AVATAR_URL,
        gender: 'male',
        bio: 'AI assistant',
        isOnline: true,
        lastSeen: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } satisfies User;

  const visibleContacts = contacts.filter((user) => user.id !== WA_USER_ID);
  const visibleRequests = requests.filter((req) => req.fromUserId !== WA_USER_ID);
  const isContact = (userId: string) => visibleContacts.some((c) => c.id === userId);
  const otherUsers = users.filter(
    (user) => user.id !== currentUserId && user.id !== WA_USER_ID && !isContact(user.id)
  );
  const getUserSubtitle = (user: User, suffix?: string) => {
    const primary = user.email || user.domain || '';
    return [primary, suffix].filter(Boolean).join(' · ');
  };

  return (
    <BoxAny sx={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <AppHeader />
      <Container sx={{ ...appPageContainerSx, flexGrow: 1 }} maxWidth="md">
        <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
          <Typography component="h1" variant="h6" sx={{ ...appPageTitleSx, flex: '0 0 auto', whiteSpace: 'nowrap' }}>
            {t('contacts.title')}
          </Typography>

          <TextField
            fullWidth
            size="small"
            placeholder={t('common.searchUsers')}
            value={searchQuery}
            disabled={Boolean(actionLoading)}
            onChange={(e) => handleSearch(e.target.value)}
            sx={{ flex: '1 1 auto', minWidth: 0 }}
          />
        </BoxAny>

        {errorKey && (
          <Alert
            severity="error"
            sx={{ mb: 2 }}
            action={errorKey !== 'contacts.actionFailed' ? (
              <Button
                color="inherit"
                size="small"
                disabled={loading}
                onClick={() => errorKey === 'contacts.searchFailed' ? handleSearch(searchQuery) : loadUsers()}
              >
                {t('common.retry')}
              </Button>
            ) : undefined}
          >
            {t(errorKey)}
          </Alert>
        )}

        {loading ? (
          <BoxAny sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </BoxAny>
        ) : errorKey === 'contacts.loadFailed' || errorKey === 'contacts.searchFailed' ? null : (
          <>
            {visibleRequests.length > 0 && (
              <>
                <SectionHeader title={t('contacts.friendRequests')} />
              <List dense sx={compactListSx}>
                {visibleRequests.map((req) => (
                  <ListItem
                    key={req.id}
                    divider
                    sx={compactListItemSx}
                    secondaryAction={
                      <BoxAny sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => handleAccept(req.fromUserId)}
                          disabled={Boolean(actionLoading)}
                          sx={compactActionButtonSx}
                        >
                          {t('contacts.accept')}
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleReject(req.fromUserId)}
                          disabled={Boolean(actionLoading)}
                          sx={compactActionButtonSx}
                        >
                          {t('contacts.reject')}
                        </Button>
                        {isAdmin && req.fromUserId !== currentUserId && (
                          <Button
                            size="small"
                            variant="outlined"
                            color={req.fromUser.isDisabled ? 'success' : 'warning'}
                            onClick={() => handleToggleDisabled(req.fromUser)}
                            disabled={Boolean(actionLoading)}
                            sx={compactActionButtonSx}
                          >
                            {req.fromUser.isDisabled ? t('contacts.enable') : t('contacts.disable')}
                          </Button>
                        )}
                        {isAdmin && req.fromUserId !== currentUserId && (
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            onClick={() => handleDeleteUser(req.fromUserId, req.fromUser.displayName)}
                            disabled={Boolean(actionLoading)}
                            sx={compactActionButtonSx}
                          >
                            {t('contacts.deleteUser')}
                          </Button>
                        )}
                      </BoxAny>
                    }
                  >
                    <ListItemAvatar>
                      <UserAvatar
                        src={req.fromUser.avatarUrl}
                        gender={req.fromUser.gender}
                        fallbackText={req.fromUser.displayName}
                        previewMode={isHoverCapable ? 'hover' : 'tap'}
                        closePreviewOnClick
                        sx={compactAvatarSx}
                      />
                    </ListItemAvatar>
                    <ListItemText
                      primary={<Typography fontWeight={600} variant="body2" noWrap>{req.fromUser.displayName}</Typography>}
                      secondary={<Typography noWrap sx={compactSubtitleSx}>{getUserSubtitle(req.fromUser)}</Typography>}
                    />
                  </ListItem>
                ))}
              </List>
              </>
            )}

            <SectionHeader title={t('contacts.system')} />
            <List dense sx={compactListSx}>
              <ListItem sx={compactListItemSx}>
                <ListItemAvatar>
                  <UserAvatar
                    src={assistantUser.avatarUrl}
                    gender={assistantUser.gender}
                    fallbackText={assistantUser.displayName}
                    previewMode={isHoverCapable ? 'hover' : 'tap'}
                    closePreviewOnClick
                    sx={compactAvatarSx}
                  />
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                      <Typography fontWeight={600} variant="body2" noWrap>{assistantUser.displayName}</Typography>
                      <Typography variant="caption" sx={{ color: 'info.main', whiteSpace: 'nowrap' }}>
                        {t('chat.new.alwaysAvailable')}
                      </Typography>
                    </BoxAny>
                  }
                  secondary={null}
                />
              </ListItem>
            </List>

            {visibleContacts.length > 0 && (
              <>
                <SectionHeader title={t('contacts.contacts')} />
              <List dense sx={compactListSx}>
                {visibleContacts.map((user, index) => (
                  <ListItem key={user.id} divider={index < visibleContacts.length - 1} sx={compactListItemSx} secondaryAction={
                    <BoxAny sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        onClick={() => handleRemoveFriend(user.id)}
                        disabled={Boolean(actionLoading)}
                        sx={compactActionButtonSx}
                      >
                        {t('contacts.removeFriend')}
                      </Button>
                      {isAdmin && user.id !== currentUserId && (
                        <Button
                          size="small"
                          variant="outlined"
                          color={user.isDisabled ? 'success' : 'warning'}
                          onClick={() => handleToggleDisabled(user)}
                          disabled={Boolean(actionLoading)}
                          sx={compactActionButtonSx}
                        >
                          {user.isDisabled ? t('contacts.enable') : t('contacts.disable')}
                        </Button>
                      )}
                      {isAdmin && user.id !== currentUserId && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          onClick={() => handleDeleteUser(user.id, user.displayName)}
                          disabled={Boolean(actionLoading)}
                          sx={compactActionButtonSx}
                        >
                          {t('contacts.deleteUser')}
                        </Button>
                      )}
                    </BoxAny>
                  }>
                    <ListItemAvatar>
                      <UserAvatar
                        src={user.avatarUrl}
                        gender={user.gender}
                        fallbackText={user.displayName}
                        previewMode={isHoverCapable ? 'hover' : 'tap'}
                        closePreviewOnClick
                        sx={compactAvatarSx}
                      />
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                          <Typography fontWeight={600} variant="body2" noWrap>{user.displayName}</Typography>
                          {user.isOnline && <Typography variant="caption" sx={{ color: 'success.main', whiteSpace: 'nowrap' }}>{t('contacts.online')}</Typography>}
                          {user.isDisabled && <Typography variant="caption" sx={{ color: 'warning.main', whiteSpace: 'nowrap' }}>{t('contacts.disabled')}</Typography>}
                        </BoxAny>
                      }
                      secondary={
                        <Typography noWrap sx={compactSubtitleSx}>{getUserSubtitle(user, t('contacts.friend'))}</Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>
              </>
            )}

            {otherUsers.length > 0 && (
              <>
                <SectionHeader title={t('contacts.others')} />
              <List dense sx={compactListSx}>
                {otherUsers.map((user, index) => (
                  <ListItem key={user.id} divider={index < otherUsers.length - 1} sx={compactListItemSx} secondaryAction={
                    <BoxAny sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleAddFriend(user.id)}
                        disabled={Boolean(actionLoading)}
                        sx={compactActionButtonSx}
                      >
                        {t('contacts.addFriend')}
                      </Button>
                      {isAdmin && user.id !== currentUserId && (
                        <Button
                          size="small"
                          variant="outlined"
                          color={user.isDisabled ? 'success' : 'warning'}
                          onClick={() => handleToggleDisabled(user)}
                          disabled={Boolean(actionLoading)}
                          sx={compactActionButtonSx}
                        >
                          {user.isDisabled ? t('contacts.enable') : t('contacts.disable')}
                        </Button>
                      )}
                      {isAdmin && user.id !== currentUserId && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          onClick={() => handleDeleteUser(user.id, user.displayName)}
                          disabled={Boolean(actionLoading)}
                          sx={compactActionButtonSx}
                        >
                          {t('contacts.deleteUser')}
                        </Button>
                      )}
                    </BoxAny>
                  }>
                    <ListItemAvatar>
                      <UserAvatar
                        src={user.avatarUrl}
                        gender={user.gender}
                        fallbackText={user.displayName}
                        previewMode={isHoverCapable ? 'hover' : 'tap'}
                        closePreviewOnClick
                        sx={compactAvatarSx}
                      />
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                          <Typography fontWeight={600} variant="body2" noWrap>{user.displayName}</Typography>
                          {user.isOnline && <Typography variant="caption" sx={{ color: 'success.main', whiteSpace: 'nowrap' }}>{t('contacts.online')}</Typography>}
                          {user.isDisabled && <Typography variant="caption" sx={{ color: 'warning.main', whiteSpace: 'nowrap' }}>{t('contacts.disabled')}</Typography>}
                        </BoxAny>
                      }
                      secondary={getUserSubtitle(user) ? <Typography noWrap sx={compactSubtitleSx}>{getUserSubtitle(user)}</Typography> : null}
                    />
                  </ListItem>
                ))}
              </List>
              </>
            )}
          </>
        )}
      </Container>
      {confirmation && (
        <ConfirmDialog
          open
          title={confirmationLabel}
          description={confirmationDescription}
          confirmLabel={confirmationLabel}
          failureMessage={t('contacts.actionFailed')}
          color={confirmation.kind === 'enable' ? 'primary' : 'error'}
          onConfirm={() => handleConfirmedAction(confirmation)}
          onClose={() => setConfirmation(null)}
        />
      )}
    </BoxAny>
  );
};
