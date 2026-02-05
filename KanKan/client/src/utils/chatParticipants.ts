import type { Chat, Participant } from '@/services/chat.service';

export const WA_USER_ID = 'user_ai_wa';

export const isWaUserId = (userId?: string | null): boolean => {
  return !!userId && userId === WA_USER_ID;
};

export const getWaParticipant = (participants: Participant[] | undefined): Participant | undefined => {
  return (participants ?? []).find((p) => isWaUserId(p.userId));
};

export const getRealParticipants = (participants: Participant[] | undefined): Participant[] => {
  return (participants ?? []).filter((p) => !!p?.userId && !isWaUserId(p.userId));
};

export const getOtherRealParticipants = (chat: Chat, myUserId?: string | null): Participant[] => {
  return getRealParticipants(chat.participants).filter((p) => !myUserId || p.userId !== myUserId);
};

export const isRealGroupChat = (chat: Chat, myUserId?: string | null): boolean => {
  return getOtherRealParticipants(chat, myUserId).length >= 2;
};

export const getDirectDisplayParticipant = (
  chat: Chat,
  myUserId?: string | null
): Participant | undefined => {
  const others = getOtherRealParticipants(chat, myUserId);
  if (others.length > 0) return others[0];

  const wa = getWaParticipant(chat.participants);
  if (wa && (!myUserId || wa.userId !== myUserId)) return wa;

  return (chat.participants ?? []).find((p) => !myUserId || p.userId !== myUserId);
};
