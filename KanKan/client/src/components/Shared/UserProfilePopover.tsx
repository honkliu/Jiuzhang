import React, { useState, useEffect } from 'react';
import {
  Box,
  CircularProgress,
  IconButton,
  Popover,
  Typography,
} from '@mui/material';
import { FiberManualRecord as OnlineIcon, PersonAdd as PersonAddIcon } from '@mui/icons-material';
import { contactService, User } from '@/services/contact.service';
import { UserAvatar } from '@/components/Shared/UserAvatar';
import { useLanguage } from '@/i18n/LanguageContext';

const BoxAny = Box as any;

interface UserProfilePopoverProps {
  userId: string | null;
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  friendIds?: Set<string>;
  currentUserId?: string;
}

export const UserProfilePopover: React.FC<UserProfilePopoverProps> = ({
  userId,
  anchorEl,
  open,
  onClose,
  friendIds,
  currentUserId,
}) => {
  const { t } = useLanguage();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open || !userId) {
      setProfile(null);
      setSent(false);
      return;
    }

    let active = true;
    setLoading(true);
    contactService.getUser(userId).then((data) => {
      if (active) setProfile(data);
    }).catch(() => {
      if (active) setProfile(null);
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [open, userId]);

  const isSelf = !!currentUserId && userId === currentUserId;
  const isFriend = !!userId && !!friendIds && friendIds.has(userId);
  const showAddFriend = !isSelf && !isFriend && !!profile;

  const activeDays = profile?.createdAt
    ? Math.max(1, Math.ceil((Date.now() - new Date(profile.createdAt).getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  const handleSendRequest = async () => {
    if (!userId || sending) return;
    setSending(true);
    try {
      await contactService.sendFriendRequest(userId);
      setSent(true);
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  return (
    <Popover
      open={open && !!anchorEl}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{
        paper: {
          sx: {
            width: 224,
            borderRadius: '10px',
            overflow: 'hidden',
            backgroundColor: '#ffffff',
            backgroundImage: 'none',
            backdropFilter: 'none',
            opacity: 1,
            boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
          },
        },
      }}
    >
      {loading ? (
        <BoxAny sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress size={28} />
        </BoxAny>
      ) : profile ? (
        <BoxAny sx={{ p: 1.5 }}>
          <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <UserAvatar
              src={profile.avatarUrl}
              gender={profile.gender}
              fallbackText={profile.displayName}
              variant="rounded"
              sx={{ width: 48, height: 48 }}
              previewMode="tap"
              closePreviewOnClick
            />
            <BoxAny sx={{ minWidth: 0, flexGrow: 1 }}>
              <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                <Typography
                  variant="subtitle2"
                  fontWeight={700}
                  noWrap
                  sx={{ color: isFriend ? '#2e7d32' : '#1565c0' }}
                >
                  {profile.displayName}
                </Typography>
                {profile.isOnline && (
                  <OnlineIcon sx={{ fontSize: 8, color: 'success.main', flexShrink: 0 }} />
                )}
                {profile.gender && (
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: '0.7rem', flexShrink: 0 }}>
                    {profile.gender === 'male' ? t('profile.male') : t('profile.female')}
                  </Typography>
                )}
                {activeDays !== null && (
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: '0.7rem', flexShrink: 0 }}>
                    {t('profile.activeDays').replace('{n}', String(activeDays))}
                  </Typography>
                )}
              </BoxAny>
              {profile.email && (
                <BoxAny sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    noWrap
                    title={profile.email}
                    sx={{ minWidth: 0, fontSize: '0.7rem' }}
                  >
                    {profile.email}
                  </Typography>
                </BoxAny>
              )}
            </BoxAny>
            {showAddFriend && (
              <IconButton
                size="small"
                onClick={handleSendRequest}
                disabled={sending}
                title={sent ? t('profile.requestSent') : t('profile.addFriend')}
                sx={{ color: sent ? 'success.main' : 'primary.main', flexShrink: 0 }}
              >
                {sending ? <CircularProgress size={16} /> : <PersonAddIcon fontSize="small" />}
              </IconButton>
            )}
          </BoxAny>
          {profile.bio && (
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {profile.bio}
            </Typography>
          )}
        </BoxAny>
      ) : (
        <BoxAny sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {t('profile.notFound')}
          </Typography>
        </BoxAny>
      )}
    </Popover>
  );
};
