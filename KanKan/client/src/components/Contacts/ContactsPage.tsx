import React, { useEffect, useState } from 'react';
import {
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
import { WA_USER_ID } from '@/utils/chatParticipants';

// Work around TS2590 (“union type too complex”) from MUI Box typings in some TS versions.
const BoxAny = Box as any;
const compactAvatarSx = { width: 42, height: 42 };
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
    left: 20,
    right: 0,
    bottom: 0,
    borderBottom: '1px solid',
    borderColor: 'divider',
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
const compactSectionTitleSx = {
  mt: 0.25,
  mb: 0.25,
  display: 'flex',
  alignItems: 'center',
  gap: 0.75,
};
const compactSectionLineSx = {
  height: '1px',
  bgcolor: 'divider',
};

const SectionHeader: React.FC<{ title: string }> = ({ title }) => {
  return (
    <BoxAny sx={compactSectionTitleSx}>
      <BoxAny sx={{ ...compactSectionLineSx, width: 14, flex: '0 0 14px' }} />
      <Typography variant="subtitle2" fontWeight="bold" sx={{ lineHeight: 1.2, whiteSpace: 'nowrap' }}>
        {title}
      </Typography>
      <BoxAny sx={{ ...compactSectionLineSx, flex: 1, minWidth: 0 }} />
    </BoxAny>
  );
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

  const loadUsers = async () => {
    setLoading(true);
    try {
      const [allUsers, contactsData, requestsData] = await Promise.all([
        contactService.getAllUsers(),
        contactService.getContacts(),
        contactService.getFriendRequests(),
      ]);
      setUsers(allUsers);
      setContacts(contactsData);
      setRequests(requestsData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length >= 2) {
      setLoading(true);
      try {
        const results = await contactService.searchUsers(query);
        setUsers(results);
      } finally {
        setLoading(false);
      }
    } else if (query.length === 0) {
      loadUsers();
    }
  };

  const handleAddFriend = async (userId: string) => {
    setActionLoading(userId);
    try {
      await contactService.sendFriendRequest(userId);
      await loadUsers();
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveFriend = async (userId: string) => {
    const confirmed = window.confirm(t('contacts.removeConfirm'));
    if (!confirmed) return;

    setActionLoading(userId);
    try {
      await contactService.removeFriend(userId);
      await loadUsers();
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async (userId: string, displayName?: string) => {
    const label = displayName || userId;
    const confirmed = window.confirm(
      t('contacts.deleteUserConfirm')
        .replace('{name}', label)
    );
    if (!confirmed) return;

    setActionLoading(userId);
    try {
      await adminService.deleteUser(userId);
      await loadUsers();
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleDisabled = async (user: User) => {
    const label = user.displayName || user.id;
    const actionLabel = user.isDisabled ? t('contacts.enable') : t('contacts.disable');
    const confirmed = window.confirm(
      t('contacts.toggleDisableConfirm')
        .replace('{action}', actionLabel)
        .replace('{name}', label)
    );
    if (!confirmed) return;

    setActionLoading(user.id);
    try {
      if (user.isDisabled) {
        await adminService.enableUser(user.id);
      } else {
        await adminService.disableUser(user.id);
      }
      await loadUsers();
    } finally {
      setActionLoading(null);
    }
  };

  const handleAccept = async (fromUserId: string) => {
    setActionLoading(fromUserId);
    try {
      await contactService.acceptFriendRequest(fromUserId);
      await loadUsers();
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (fromUserId: string) => {
    setActionLoading(fromUserId);
    try {
      await contactService.rejectFriendRequest(fromUserId);
      await loadUsers();
    } finally {
      setActionLoading(null);
    }
  };

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
        avatarUrl: '/zodiac/zodiac_01_r1c1.png',
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

  return (
    <BoxAny sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppHeader />
      <Container sx={{ py: 2, flexGrow: 1, pt: 10 }} maxWidth="md">
        <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
          <Typography variant="h6" fontWeight="bold" sx={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}>
            {t('contacts.title')}
          </Typography>

          <TextField
            fullWidth
            size="small"
            placeholder={t('common.searchUsers')}
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            sx={{ flex: '1 1 auto', minWidth: 0 }}
          />
        </BoxAny>

        {loading ? (
          <BoxAny sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </BoxAny>
        ) : (
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
                          disabled={actionLoading === req.fromUserId}
                          sx={compactActionButtonSx}
                        >
                          {t('contacts.accept')}
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleReject(req.fromUserId)}
                          disabled={actionLoading === req.fromUserId}
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
                            disabled={actionLoading === req.fromUserId}
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
                            disabled={actionLoading === req.fromUserId}
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
                      primary={<Typography fontWeight={600} variant="body2">{req.fromUser.displayName}</Typography>}
                      secondary={req.fromUser.domain || ''}
                      slotProps={{
                        primary: { noWrap: true },
                        secondary: { noWrap: true, sx: { fontSize: 12, lineHeight: 1.2 } },
                      }}
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
                  slotProps={{ primary: { sx: { my: 0 } } }}
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
                        disabled={actionLoading === user.id}
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
                          disabled={actionLoading === user.id}
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
                          disabled={actionLoading === user.id}
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
                        user.domain
                          ? `${user.domain} · ${t('contacts.friend')}`
                          : t('contacts.friend')
                      }
                      slotProps={{
                        primary: { sx: { my: 0 } },
                        secondary: { noWrap: true, sx: { fontSize: 12, lineHeight: 1.2 } },
                      }}
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
                        disabled={actionLoading === user.id}
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
                          disabled={actionLoading === user.id}
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
                          disabled={actionLoading === user.id}
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
                      secondary={user.domain || ''}
                      slotProps={{
                        primary: { sx: { my: 0 } },
                        secondary: { noWrap: true, sx: { fontSize: 12, lineHeight: 1.2 } },
                      }}
                    />
                  </ListItem>
                ))}
              </List>
              </>
            )}
          </>
        )}
      </Container>
    </BoxAny>
  );
};
