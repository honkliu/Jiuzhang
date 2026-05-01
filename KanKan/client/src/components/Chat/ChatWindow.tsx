import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  TextField,
  Popper,
  Paper,
  Stack,
  Chip,
  Avatar,
  ClickAwayListener,
  SxProps,
  Theme,
  CircularProgress,
  ThemeProvider,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import EmojiPicker, { Categories, SuggestionMode, emojiByUnified, type EmojiClickData } from 'emoji-picker-react';
import { Virtuoso } from 'react-virtuoso';
import { createRoot, type Root } from 'react-dom/client';
import {
  ArrowBack as ArrowBackIcon,
  Send as SendIcon,
  EmojiEmotions as EmojiIcon,
  Menu as MenuIcon,
  AttachFile as AttachFileIcon,
  Edit as EditIcon,
  ViewInAr as ViewInArIcon,
  Forum as ForumIcon,
  Mic as MicIcon,
  StopCircle as StopCircleIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import { fetchMessages, addMessage, removeMessage, updateChat, setPendingMessage } from '@/store/chatSlice';
import { MessageBubble } from './MessageBubble';
import { signalRService } from '@/services/signalr.service';
import { chatService, type Chat, type Message } from '@/services/chat.service';
import { imageGenerationService } from '@/services/imageGeneration.service';
import { mediaService } from '@/services/media.service';
import { avatarService, type EmotionThumbnailResult } from '@/services/avatar.service';
import { contactService } from '@/services/contact.service';
import { UserAvatar } from '@/components/Shared/UserAvatar';
import { GroupAvatar } from '@/components/Shared/GroupAvatar';
import {
  getDirectDisplayParticipant,
  getOtherRealParticipants,
  getRealParticipants,
  isRealGroupChat,
  WA_USER_ID,
} from '@/utils/chatParticipants';
import { ChatRoom3D } from './ChatRoom3D';
import { ChatRoom2D } from './ChatRoom2D';
import { useLanguage } from '@/i18n/LanguageContext';

// Work around TS2590 (“union type too complex”) from MUI Box typings in some TS versions.
const BoxAny = Box as any;

const MAX_VOICE_DURATION_SECONDS = 60;
const EMOJI_SUGGESTED_LS_KEY = 'epr_suggested';
const CHAT_INPUT_DRAFT_PREFIX = 'kankan.chat.inputDraft:';
const MAX_RECENT_EMOJIS = 8;
const EMOJI_PICKER_WIDTH = 248;

const chatInputDraftKey = (chatId: string) => `${CHAT_INPUT_DRAFT_PREFIX}${chatId}`;

function readChatInputDraft(chatId: string) {
  try {
    const raw = window.localStorage.getItem(chatInputDraftKey(chatId));
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { text?: unknown };
    return typeof parsed.text === 'string' ? parsed.text : '';
  } catch { return ''; }
}

function writeChatInputDraft(chatId: string, text: string) {
  try {
    if (text.trim().length === 0) {
      window.localStorage.removeItem(chatInputDraftKey(chatId));
    } else {
      window.localStorage.setItem(chatInputDraftKey(chatId), JSON.stringify({ text, updatedAt: new Date().toISOString() }));
    }
  } catch {}
}

function clearChatInputDraft(chatId: string) {
  try { window.localStorage.removeItem(chatInputDraftKey(chatId)); } catch {}
}

const formatVoiceRecordingHint = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.min(MAX_VOICE_DURATION_SECONDS, seconds));
  return `${String(safeSeconds).padStart(2, '0')}/${MAX_VOICE_DURATION_SECONDS}`;
};

const readRecentEmojiUnifieds = () => {
  if (typeof window === 'undefined') return [] as string[];

  try {
    const raw = window.localStorage.getItem(EMOJI_SUGGESTED_LS_KEY);
    if (!raw) return [] as string[];

    const parsed = JSON.parse(raw) as Array<{ unified?: string }>;
    return parsed
      .map((item) => item.unified)
      .filter((value): value is string => Boolean(value))
      .slice(0, MAX_RECENT_EMOJIS);
  } catch {
    return [] as string[];
  }
};

const getAudioExtension = (mimeType: string) => {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('webm')) return 'webm';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('wav')) return 'wav';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  if (normalized.includes('mp4') || normalized.includes('m4a') || normalized.includes('aac')) return 'm4a';
  return 'webm';
};

const pickRecorderMimeType = () => {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
};

const VirtualizedMessageList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ style, ...props }, ref) => (
    <BoxAny
      {...props}
      ref={ref}
      sx={{
        ...style,
        padding: '12px 1px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%',
      }}
    />
  )
);
VirtualizedMessageList.displayName = 'VirtualizedMessageList';

const VirtualizedMessageScroller = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      {...props}
      ref={ref}
      className={className ? `${className} chat-window-scroll-hidden` : 'chat-window-scroll-hidden'}
    />
  )
);
VirtualizedMessageScroller.displayName = 'VirtualizedMessageScroller';

interface ChatWindowProps {
  onBack?: () => void;
  onToggleSidebar?: () => void;
  sx?: SxProps<Theme>;
}

interface LightboxGroup {
  sourceUrl: string;
  messageId: string;
  canEdit: boolean;
}

interface Chat2DSegment {
  type: 'text' | 'image' | 'video' | 'voice' | 'file';
  text?: string;
  url?: string;
  duration?: number;
  fileName?: string;
}

type ChatCommandId = '/w' | '/wa' | '/h' | '/b' | '/i' | '/r' | '/p' | '/a';

interface ChatMessagesProps {
  activeChat: Chat | null;
  user: any;
  loading: boolean;
  isRoom3D: boolean;
  isRoom2D: boolean;
  mergedMessages: Message[];
  chatTypingUsers: Array<{ userId: string; userName: string }>;
  leftParticipant: { displayName: string; avatarUrl: string; gender?: string } | null;
  rightParticipant: { displayName: string; avatarUrl: string; gender?: string } | null;
  left2D: { segments: Chat2DSegment[] };
  right2D: { segments: Chat2DSegment[] };
  leftAvatar: string;
  rightAvatar: string;
  imageGroups: LightboxGroup[];
  imageGroupIndexByUrl: Record<string, number>;
  imageGallery: { urls: string[]; indexById: Record<string, number> };
  imageGroupIndexByMessageId: Record<string, number>;
  /** Display names of all participants (real users), for @mention highlighting in bubbles. */
  participantNames: string[];
  messagesEndRef: React.RefObject<HTMLDivElement>;
  noMessagesText: string;
}

const ChatMessages: React.FC<ChatMessagesProps> = React.memo(({
  activeChat,
  user,
  loading,
  isRoom3D,
  isRoom2D,
  mergedMessages,
  chatTypingUsers,
  leftParticipant,
  rightParticipant,
  left2D,
  right2D,
  leftAvatar,
  rightAvatar,
  imageGroups,
  imageGroupIndexByUrl,
  imageGallery,
  imageGroupIndexByMessageId,
  participantNames,
  messagesEndRef,
  noMessagesText,
}) => {
  const { language } = useLanguage();
  if (!activeChat) return null;

  if (isRoom3D) {
    return (
      <BoxAny sx={{ flexGrow: 1, overflow: 'hidden', position: 'relative' }}>
        <ChatRoom3D chat={activeChat} me={user} messages={mergedMessages as any} typingUsers={chatTypingUsers} />
        {loading && mergedMessages.length === 0 ? (
          <BoxAny
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <CircularProgress />
          </BoxAny>
        ) : null}
      </BoxAny>
    );
  }

  if (isRoom2D) {
    return (
      <ChatRoom2D
        leftParticipant={leftParticipant}
        rightParticipant={rightParticipant}
        leftSegments={left2D.segments}
        rightSegments={right2D.segments}
        imageGroups={imageGroups}
        imageGroupIndexByUrl={imageGroupIndexByUrl}
      />
    );
  }

  if (loading && mergedMessages.length === 0) {
    return (
      <BoxAny sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress />
      </BoxAny>
    );
  }

  if (mergedMessages.length === 0) {
    return (
      <BoxAny sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Typography color="text.secondary">{noMessagesText}</Typography>
      </BoxAny>
    );
  }

  return (
    <BoxAny sx={{ flexGrow: 1, minHeight: 0 }}>
      <Virtuoso
        data={mergedMessages}
        followOutput="auto"
        computeItemKey={(_, message) => message.id}
        style={{ height: '100%', width: '100%' }}
        components={{
          Scroller: VirtualizedMessageScroller,
          List: VirtualizedMessageList,
          Footer: () => <div ref={messagesEndRef} />,
        }}
        itemContent={(index, message) => {
          const prevMessage = index > 0 ? mergedMessages[index - 1] : null;
          const showAvatar = !prevMessage || prevMessage.senderId !== message.senderId;

          // Show time separator if 5+ min gap or first message
          let timeSeparator: string | null = null;
          const curTime = new Date(message.timestamp).getTime();
          const prevTime = prevMessage ? new Date(prevMessage.timestamp).getTime() : 0;
          if (!prevMessage || curTime - prevTime >= 5 * 60 * 1000) {
            const d = new Date(message.timestamp);
            const now = new Date();
            const isToday = d.toDateString() === now.toDateString();
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const isYesterday = d.toDateString() === yesterday.toDateString();
            const isZh = language === 'zh';
            const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            if (isToday) {
              timeSeparator = time;
            } else if (isYesterday) {
              timeSeparator = isZh ? `昨天 ${time}` : `Yesterday ${time}`;
            } else {
              if (isZh) {
                timeSeparator = `${d.getMonth() + 1}月${d.getDate()}日 ${time}`;
              } else {
                timeSeparator = `${d.toLocaleDateString('en', { month: 'short', day: 'numeric' })} ${time}`;
              }
            }
          }

          return (
            <MessageBubble
              message={message}
              isOwn={message.senderId === user?.id}
              showAvatar={showAvatar}
              timeSeparator={timeSeparator}
              imageGallery={imageGallery.urls}
              imageIndex={imageGallery.indexById[message.id]}
              imageGroups={imageGroups}
              imageGroupIndex={imageGroupIndexByMessageId[message.id]}
              mentionableNames={participantNames}
            />
          );
        }}
      />
    </BoxAny>
  );
});

interface ChatInputPanelProps {
  activeChatId: string | null;
  sending: boolean;
  uploading: boolean;
  isRecordingVoice: boolean;
  recordingSeconds: number;
  chatCommands: Array<{ id: ChatCommandId; description: string; example: string }>;
  /** Other real participants in the active chat — fed to the @-mention picker for /p. */
  mentionCandidates: Array<{ userId: string; displayName: string; avatarUrl: string }>;
  onSendMessage: (raw: string) => Promise<boolean>;
  onFileSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onStartVoiceRecording: () => Promise<void>;
  onStopVoiceRecording: () => void;
  onCancelVoiceRecording: () => void;
  t: (key: string) => string;
}

const ChatInputPanel: React.FC<ChatInputPanelProps> = React.memo(({
  activeChatId,
  sending,
  uploading,
  isRecordingVoice,
  recordingSeconds,
  chatCommands,
  mentionCandidates,
  onSendMessage,
  onFileSelected,
  onStartVoiceRecording,
  onStopVoiceRecording,
  onCancelVoiceRecording,
  t,
}) => {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null);
  const draftDebounceRef = useRef<number | null>(null);
  const lastDraftRef = useRef<string>('');
  const lastDraftSentAtRef = useRef<number>(0);
  const skipDraftSaveRef = useRef(false);
  const selectionStartRef = useRef<number | null>(null);
  const selectionEndRef = useRef<number | null>(null);
  const [messageText, setMessageText] = useState('');
  const [commandSelectedIndex, setCommandSelectedIndex] = useState(0);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [recentEmojiUnifieds, setRecentEmojiUnifieds] = useState<string[]>([]);

  // Command mode is active when the input either starts with a slash or
  // begins with `@name ` followed by a slash command (so `@bob /p hug` and
  // `/p @bob hug` both put the input in command mode and surface helpers).
  const isCommandMode =
    messageText.startsWith('/')
    || /^@\S+\s+\//.test(messageText)
    || /^@[^\s]*$/.test(messageText); // typing a leading @ while preparing a command
  const commandToken = (() => {
    if (!isCommandMode) return null;
    // Find the slash token if present; otherwise null (user is still typing
    // the leading mention before they've entered the slash).
    const m = messageText.match(/(^|\s)(\/[a-zA-Z]*)(?=\s|$)/);
    return m ? m[2] : null;
  })();

  const commandSuggestions = (() => {
    if (!isCommandMode) return [];
    // Only suggest slash commands once the user has actually typed a `/`.
    // While they're still typing a leading `@mention` (no slash yet), the
    // mention picker handles autocompletion; showing every slash command as
    // a generic prefix match here is more noise than help.
    if (!commandToken) return [];
    return chatCommands.filter((c) => c.id.startsWith(commandToken));
  })();

  useEffect(() => {
    setCommandSelectedIndex(0);
  }, [commandToken]);

  // @-mention autocomplete. Active in any text — slash-command or plain
  // chat — so users can type "@bob can you..." and pick from a list. The
  // /p handler interprets the same `@token` for image pairing; for plain
  // messages the mention is purely cosmetic (highlighted in bubbles).
  //
  // Exception: when the command is /a (add user to group), the picker would
  // mislead — /a's whole purpose is to bring in someone NOT in the chat,
  // so listing existing members is the wrong set. We just suppress it.
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const mentionState = (() => {
    if (mentionCandidates.length === 0) return null;
    if (commandToken === '/a') return null;
    const caret = selectionStartRef.current ?? messageText.length;
    const before = messageText.slice(0, caret);
    const m = before.match(/(^|\s)@([^\s@]*)$/);
    if (!m) return null;
    const token = m[2];
    const tokenStart = caret - token.length - 1; // includes the '@'
    const lower = token.toLowerCase();
    const matches = mentionCandidates.filter((p) =>
      token === '' || p.displayName.toLowerCase().includes(lower)
    );
    if (matches.length === 0) return null;
    return { token, tokenStart, caret, matches };
  })();

  const mentionAllState = (() => {
    if (mentionCandidates.length === 0) return null;
    if (commandToken === '/a') return null;
    const caret = selectionStartRef.current ?? messageText.length;
    const before = messageText.slice(0, caret);
    const m = before.match(/(^|\s)@@$/);
    if (!m) return null;
    return { tokenStart: caret - 2, caret };
  })();

  useEffect(() => {
    setMentionSelectedIndex(0);
  }, [mentionState?.token, mentionState?.matches.length]);

  useEffect(() => {
    skipDraftSaveRef.current = true;
    setMessageText(activeChatId ? readChatInputDraft(activeChatId) : '');
    setIsEmojiPickerOpen(false);
  }, [activeChatId]);

  useEffect(() => {
    if (skipDraftSaveRef.current) {
      skipDraftSaveRef.current = false;
      return;
    }
    if (!activeChatId) return;
    writeChatInputDraft(activeChatId, messageText);
  }, [activeChatId, messageText]);

  useEffect(() => {
    if (isRecordingVoice) {
      setIsEmojiPickerOpen(false);
    }
  }, [isRecordingVoice]);

  useEffect(() => {
    if (!isEmojiPickerOpen) return;
    setRecentEmojiUnifieds(readRecentEmojiUnifieds());
  }, [isEmojiPickerOpen]);

  useEffect(() => {
    return () => {
      if (draftDebounceRef.current) {
        window.clearTimeout(draftDebounceRef.current);
        draftDebounceRef.current = null;
      }
    };
  }, []);

  const scheduleDraftSend = useCallback((text: string) => {
    if (!activeChatId) return;

    const sendDraft = () => {
      if (lastDraftRef.current === text) return;
      lastDraftRef.current = text;
      lastDraftSentAtRef.current = Date.now();
      signalRService.sendDraftChanged(activeChatId, text);
    };

    if (draftDebounceRef.current) {
      window.clearTimeout(draftDebounceRef.current);
    }

    sendDraft();
    draftDebounceRef.current = null;
  }, [activeChatId]);

  const handlePickFile = useCallback(() => {
    if (uploading || sending || isRecordingVoice) return;
    fileInputRef.current?.click();
  }, [isRecordingVoice, uploading, sending]);

  const syncSelection = useCallback((target?: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (!target) return;
    selectionStartRef.current = target.selectionStart ?? null;
    selectionEndRef.current = target.selectionEnd ?? null;
  }, []);

  const handleTextFieldSelection = useCallback((event: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    syncSelection(event.currentTarget);
  }, [syncSelection]);

  const handleEmojiButtonClick = useCallback(() => {
    if (isRecordingVoice) return;
    setIsEmojiPickerOpen((open) => !open);
  }, [isRecordingVoice]);

  const insertEmojiIntoMessage = useCallback((emoji: string) => {
    const input = inputRef.current;
    const start = selectionStartRef.current ?? messageText.length;
    const end = selectionEndRef.current ?? start;
    const nextValue = `${messageText.slice(0, start)}${emoji}${messageText.slice(end)}`;
    const nextCursor = start + emoji.length;

    setMessageText(nextValue);
    if (activeChatId) {
      scheduleDraftSend(nextValue);
    }

    selectionStartRef.current = nextCursor;
    selectionEndRef.current = nextCursor;

    window.requestAnimationFrame(() => {
      if (!input) return;
      input.focus();
      input.setSelectionRange(nextCursor, nextCursor);
    });
  }, [activeChatId, messageText, scheduleDraftSend]);

  const handleEmojiClick = useCallback((emojiData: EmojiClickData) => {
    setRecentEmojiUnifieds((prev) => {
      const next = [emojiData.unified, ...prev.filter((value) => value !== emojiData.unified)];
      return next.slice(0, MAX_RECENT_EMOJIS);
    });
    insertEmojiIntoMessage(emojiData.emoji);
  }, [insertEmojiIntoMessage]);

  const applyMention = useCallback(
    (candidate: { displayName: string }) => {
      if (!mentionState) return;
      const before = messageText.slice(0, mentionState.tokenStart);
      const after = messageText.slice(mentionState.caret);
      // Replace `@partial` with `@FullName ` (trailing space for the prompt).
      const inserted = `@${candidate.displayName} `;
      const nextValue = `${before}${inserted}${after}`;
      const nextCaret = before.length + inserted.length;
      setMessageText(nextValue);
      if (activeChatId) {
        scheduleDraftSend(nextValue);
      }
      selectionStartRef.current = nextCaret;
      selectionEndRef.current = nextCaret;
      window.requestAnimationFrame(() => {
        const input = inputRef.current;
        if (!input) return;
        input.focus();
        input.setSelectionRange(nextCaret, nextCaret);
      });
    },
    [activeChatId, messageText, mentionState, scheduleDraftSend]
  );

  const applyMentionAll = useCallback(() => {
    if (!mentionAllState || mentionCandidates.length === 0) return;
    const before = messageText.slice(0, mentionAllState.tokenStart);
    const after = messageText.slice(mentionAllState.caret);
    const inserted = `${mentionCandidates.map((candidate) => `@${candidate.displayName}`).join(' ')} `;
    const nextValue = `${before}${inserted}${after}`;
    const nextCaret = before.length + inserted.length;
    setMessageText(nextValue);
    if (activeChatId) {
      scheduleDraftSend(nextValue);
    }
    selectionStartRef.current = nextCaret;
    selectionEndRef.current = nextCaret;
    window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(nextCaret, nextCaret);
    });
  }, [activeChatId, mentionAllState, mentionCandidates, messageText, scheduleDraftSend]);

  const handleRecentEmojiClick = useCallback((emoji: string, unified: string) => {
    setRecentEmojiUnifieds((prev) => {
      const next = [unified, ...prev.filter((value) => value !== unified)];
      return next.slice(0, MAX_RECENT_EMOJIS);
    });
    insertEmojiIntoMessage(emoji);
  }, [insertEmojiIntoMessage]);

  const handleVoiceButtonClick = useCallback(async () => {
    if (isRecordingVoice) {
      onStopVoiceRecording();
      return;
    }

    if (uploading || sending) return;
    await onStartVoiceRecording();
  }, [isRecordingVoice, onStartVoiceRecording, onStopVoiceRecording, sending, uploading]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const nextValue = e.target.value;
    const nativeEvent = e.nativeEvent as InputEvent | undefined;
    const inputType = nativeEvent?.inputType || '';
    const isInsertion = inputType.startsWith('insert') || inputType === '';

    if (isInsertion && (nextValue === '/p' || nextValue === '/p ')) {
      applyCommandDraftText('/p');
      return;
    }

    setMessageText(nextValue);
    syncSelection(e.target);
    if (activeChatId) {
      scheduleDraftSend(nextValue);
    }
  };

  const getCommandDraftText = useCallback((commandId: ChatCommandId) => {
    if (commandId === '/p') {
      return `${commandId} ${t('chat.command.template.p')}`;
    }

    return `${commandId} `;
  }, [t]);

  const applyCommandDraftText = useCallback((commandId: ChatCommandId) => {
    const nextValue = getCommandDraftText(commandId);
    setMessageText(nextValue);
    if (activeChatId) {
      scheduleDraftSend(nextValue);
    }

    const cursor = nextValue.length;
    selectionStartRef.current = cursor;
    selectionEndRef.current = cursor;

    window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(cursor, cursor);
    });
  }, [activeChatId, getCommandDraftText, scheduleDraftSend]);

  const handleKeyPress = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const raw = messageText;
      if (!raw.trim()) return;
      setMessageText('');
      const ok = await onSendMessage(raw);
      if (ok && activeChatId) clearChatInputDraft(activeChatId);
      if (!ok) setMessageText(raw);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && isEmojiPickerOpen) {
      setIsEmojiPickerOpen(false);
      return;
    }

    if (mentionAllState && (e.key === 'Tab' || e.key === 'Enter')) {
      e.preventDefault();
      applyMentionAll();
      return;
    }

    // @-mention picker takes priority when active — its arrow/Enter/Tab keys
    // navigate candidates instead of the command palette below.
    if (mentionState) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionSelectedIndex((i) => Math.min(i + 1, mentionState.matches.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        const choice = mentionState.matches[mentionSelectedIndex] ?? mentionState.matches[0];
        if (choice) {
          e.preventDefault();
          applyMention(choice);
          return;
        }
      }
      if (e.key === 'Escape') {
        // Cancel: collapse the picker by inserting a space, breaking the @token.
        return;
      }
    }

    if (!isCommandMode || commandSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCommandSelectedIndex((i) => Math.min(i + 1, commandSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCommandSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const next = commandSuggestions[commandSelectedIndex] ?? commandSuggestions[0];
      applyCommandDraftText(next.id);
    }
  };

  return (
    <>
      <BoxAny
        component="input"
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        title={t('chat.attach')}
        aria-label={t('chat.attach')}
        sx={{ display: 'none' }}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          onFileSelected(event);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
      />
      <BoxAny sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.375 }}>
        <IconButton
          ref={emojiButtonRef}
          size="small"
          onClick={handleEmojiButtonClick}
          disabled={isRecordingVoice}
          title={t('chat.emoji')}
          aria-label={t('chat.emoji')}
          sx={{ p: 0.5, color: 'primary.main' }}
        >
          <EmojiIcon />
        </IconButton>
        <IconButton
          size="small"
          onClick={handlePickFile}
          disabled={uploading || sending || isRecordingVoice}
          title={t('chat.attach')}
          aria-label={t('chat.attach')}
          sx={{ p: 0.5, color: 'primary.main' }}
        >
          {uploading ? <CircularProgress size={18} /> : <AttachFileIcon />}
        </IconButton>
        <IconButton
          size="small"
          onClick={handleVoiceButtonClick}
          disabled={uploading || sending}
          title={isRecordingVoice ? t('chat.voice.stop') : t('chat.voice.record')}
          aria-label={isRecordingVoice ? t('chat.voice.stop') : t('chat.voice.record')}
          sx={{ p: 0.5, color: isRecordingVoice ? 'error.main' : 'primary.main' }}
        >
          {isRecordingVoice ? <StopCircleIcon /> : <MicIcon />}
        </IconButton>
        {isRecordingVoice ? (
          <IconButton
            size="small"
            onClick={onCancelVoiceRecording}
            title={t('chat.voice.cancel')}
            aria-label={t('chat.voice.cancel')}
            sx={{ p: 0.5 }}
          >
            <CloseIcon />
          </IconButton>
        ) : null}
        <TextField
          inputRef={inputRef}
          fullWidth
          multiline
          maxRows={4}
          placeholder={isRecordingVoice ? formatVoiceRecordingHint(recordingSeconds) : t('chat.typeMessage')}
          value={messageText}
          onChange={handleChange}
          onKeyPress={handleKeyPress}
          onKeyDown={handleKeyDown}
          disabled={isRecordingVoice}
          size="small"
          inputProps={{
            onSelect: handleTextFieldSelection,
            onClick: handleTextFieldSelection,
            onKeyUp: handleTextFieldSelection,
          }}
          InputProps={{
            sx: {
              alignItems: 'flex-start',
              '& textarea': {
                paddingTop: '6px !important',
                paddingBottom: '0px !important',
                lineHeight: 1.25,
                boxSizing: 'border-box',
              },
            },
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: '8px',
              bgcolor: 'grey.100',
              py: 0,
              paddingLeft: '8px !important',
              paddingRight: '8px !important',
            },
          }}
        />
        {isEmojiPickerOpen ? (
          <Popper
            open
            anchorEl={emojiButtonRef.current}
            placement="top-start"
            sx={{ zIndex: 1300 }}
          >
            <ClickAwayListener onClickAway={() => setIsEmojiPickerOpen(false)}>
              <Paper
                elevation={6}
                sx={{
                  mb: 1,
                  overflow: 'hidden',
                  bgcolor: '#ffffff',
                  width: `${EMOJI_PICKER_WIDTH}px`,
                  maxWidth: `${EMOJI_PICKER_WIDTH}px`,
                  borderRadius: '10px',
                  '& .EmojiPickerReact': {
                    '--epr-horizontal-padding': '8px',
                    '--epr-header-padding': '8px var(--epr-horizontal-padding)',
                    '--epr-picker-border-radius': '10px',
                    '--epr-category-navigation-button-size': '20px',
                    '--epr-category-label-height': '0px',
                    '--epr-category-label-padding': '0',
                    '--epr-emoji-size': '24px',
                    '--epr-emoji-padding': '4px',
                  },
                  '& .epr-body': {
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                  },
                  '& .epr-body::-webkit-scrollbar': {
                    display: 'none',
                    width: 0,
                    height: 0,
                  },
                  '& .epr-emoji-category-label': {
                    display: 'none',
                  },
                  '& .epr-emoji-category-content': {
                    marginTop: 0,
                    marginLeft: 'auto',
                    marginRight: 'auto',
                    width: 'calc(100% - 16px)',
                    gridTemplateColumns: 'repeat(auto-fit, var(--epr-emoji-fullsize))',
                    justifyContent: 'center',
                  },
                  '& .epr-emoji-category + .epr-emoji-category .epr-emoji-category-content': {
                    borderTop: '1px solid',
                    borderColor: 'divider',
                    marginTop: '6px',
                    paddingTop: '6px',
                  },
                }}
              >
                {recentEmojiUnifieds.length > 0 ? (
                  <BoxAny
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      width: '100%',
                      maxWidth: '100%',
                      boxSizing: 'border-box',
                      px: '8px',
                      py: 0.5,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      overflowX: 'auto',
                      scrollbarWidth: 'none',
                      msOverflowStyle: 'none',
                      '&::-webkit-scrollbar': {
                        display: 'none',
                        width: 0,
                        height: 0,
                      },
                    }}
                  >
                    {recentEmojiUnifieds.map((unified) => {
                      const emojiData = emojiByUnified(unified);
                      const emoji = emojiData ? String.fromCodePoint(...unified.split('-').map((code) => parseInt(code, 16))) : '';
                      if (!emoji) return null;

                      return (
                        <IconButton
                          key={unified}
                          size="small"
                          onClick={() => handleRecentEmojiClick(emoji, unified)}
                          title={t('chat.emoji')}
                          aria-label={t('chat.emoji')}
                          sx={{
                            flex: '0 0 auto',
                            fontSize: 20,
                            width: 30,
                            height: 30,
                          }}
                        >
                          <BoxAny component="span" sx={{ lineHeight: 1 }}>{emoji}</BoxAny>
                        </IconButton>
                      );
                    })}
                  </BoxAny>
                ) : null}
                <EmojiPicker
                  onEmojiClick={handleEmojiClick}
                  autoFocusSearch={false}
                  searchDisabled
                  suggestedEmojisMode={SuggestionMode.RECENT}
                  lazyLoadEmojis
                  skinTonesDisabled
                  previewConfig={{ showPreview: false }}
                  categories={[
                    { category: Categories.SMILEYS_PEOPLE, name: 'Smileys & People' },
                    { category: Categories.ANIMALS_NATURE, name: 'Animals & Nature' },
                    { category: Categories.FOOD_DRINK, name: 'Food & Drink' },
                    { category: Categories.TRAVEL_PLACES, name: 'Travel & Places' },
                    { category: Categories.ACTIVITIES, name: 'Activities' },
                    { category: Categories.OBJECTS, name: 'Objects' },
                    { category: Categories.SYMBOLS, name: 'Symbols' },
                    { category: Categories.FLAGS, name: 'Flags' },
                  ]}
                  width={EMOJI_PICKER_WIDTH}
                  height={210}
                />
              </Paper>
            </ClickAwayListener>
          </Popper>
        ) : null}
        {mentionState ? (
          <Popper
            open
            anchorEl={inputRef.current}
            placement="top-start"
            sx={{ zIndex: 1301 }}
          >
            <Paper
              elevation={6}
              sx={{
                width: 'fit-content',
                maxWidth: 'calc(100vw - 32px)',
                mb: 1,
                px: 0.5,
                py: 0.5,
              }}
            >
              <Stack spacing={0.25}>
                {mentionState.matches.map((p, idx) => (
                  <BoxAny
                    key={p.userId}
                    onMouseEnter={() => setMentionSelectedIndex(idx)}
                    onMouseDown={(event: React.MouseEvent) => {
                      // Use mousedown so the input keeps focus.
                      event.preventDefault();
                      applyMention(p);
                    }}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      px: 1,
                      py: 0.5,
                      borderRadius: 1,
                      cursor: 'pointer',
                      bgcolor: idx === mentionSelectedIndex ? 'action.selected' : 'transparent',
                    }}
                  >
                    <Avatar src={p.avatarUrl} sx={{ width: 22, height: 22 }} />
                    <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                      {p.displayName}
                    </Typography>
                  </BoxAny>
                ))}
              </Stack>
            </Paper>
          </Popper>
        ) : null}
        {isCommandMode && commandSuggestions.length > 0 && !mentionState ? (
          <Popper
            open
            anchorEl={inputRef.current}
            placement="top-start"
            sx={{ zIndex: 1300 }}
          >
            <Paper
              elevation={6}
              sx={{
                width: 'fit-content',
                maxWidth: 'calc(100vw - 32px)',
                mb: 1,
                px: 1,
                py: 0.75,
              }}
            >
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                {commandSuggestions.map((c, idx) => (
                  <Chip
                    key={c.id}
                    size="small"
                    label={c.id}
                    color={idx === commandSelectedIndex ? 'primary' : 'default'}
                    variant={idx === commandSelectedIndex ? 'filled' : 'outlined'}
                    onMouseEnter={() => setCommandSelectedIndex(idx)}
                    onClick={() => applyCommandDraftText(c.id)}
                    sx={{ fontFamily: 'monospace' }}
                  />
                ))}
              </Stack>
            </Paper>
          </Popper>
        ) : null}
        <IconButton
          size="small"
          color="primary"
          onClick={async () => {
            const raw = messageText;
            if (!raw.trim()) return;
            setMessageText('');
            const ok = await onSendMessage(raw);
            if (ok && activeChatId) clearChatInputDraft(activeChatId);
            if (!ok) setMessageText(raw);
          }}
          disabled={!messageText.trim() || sending || uploading || isRecordingVoice}
          sx={{ p: 0.5 }}
        >
          <SendIcon />
        </IconButton>
      </BoxAny>
    </>
  );
});

export const ChatWindow: React.FC<ChatWindowProps> = ({ onBack, onToggleSidebar, sx }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { activeChat, messages, typingUsers, loading, drafts, pendingMessage } = useSelector(
    (state: RootState) => state.chat
  );
  const { user } = useSelector((state: RootState) => state.auth);
  const { t } = useLanguage();
  const theme = useTheme();
  const isHoverCapable = useMediaQuery('(hover: hover) and (pointer: fine)');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isRoom3D, setIsRoom3D] = useState(false);
  const [isRoom2D, setIsRoom2D] = useState(false);
  const [otherAvatarImageId, setOtherAvatarImageId] = useState<string | null>(null);
  const [otherLiveAvatarUrl, setOtherLiveAvatarUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRootHostRef = useRef<HTMLDivElement | null>(null);
  const inputRootRef = useRef<Root | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef<number>(0);
  const recordingCancelledRef = useRef(false);

  const setInputHost = useCallback((node: HTMLDivElement | null) => {
    if (node === inputRootHostRef.current) return;
    if (inputRootRef.current) {
      inputRootRef.current.unmount();
      inputRootRef.current = null;
    }
    inputRootHostRef.current = node;
    if (node) {
      inputRootRef.current = createRoot(node);
    }
  }, []);

  const chatMessages = activeChat ? messages[activeChat.id] || [] : [];
  const chatTypingUsers = activeChat ? typingUsers[activeChat.id] || [] : [];
  const chatDrafts = activeChat ? drafts[activeChat.id] || {} : {};

  const draftMessages = useMemo(() => {
    if (!activeChat) return [];
    return Object.entries(chatDrafts)
      .filter(([userId]) => userId !== user?.id)
      .map(([userId, draft]) => {
        const participant = activeChat.participants.find((p) => p.userId === userId);
        return {
          id: `draft_${activeChat.id}_${userId}`,
          chatId: activeChat.id,
          senderId: userId,
          senderName: participant?.displayName || draft.userName,
          senderAvatar: participant?.avatarUrl || '',
          messageType: 'text',
          text: draft.text,
          timestamp: new Date().toISOString(),
          deliveredTo: [],
          readBy: [],
          reactions: {},
          isDeleted: false,
        };
      });
  }, [activeChat, chatDrafts, user?.id]);

  const mergedMessages = useMemo(
    () => [...chatMessages, ...draftMessages],
    [chatMessages, draftMessages]
  );

  const getMessageImageUrl = (msg: Message): string => {
    const content = (msg as any)?.content;
    return msg.mediaUrl || msg.thumbnailUrl || content?.mediaUrl || content?.thumbnailUrl || '';
  };

  const imageGallery = useMemo(() => {
    const urls: string[] = [];
    const indexById: Record<string, number> = {};

    mergedMessages.forEach((msg) => {
      if (msg.messageType !== 'image') return;
      const url = getMessageImageUrl(msg);
      if (!url) return;
      indexById[msg.id] = urls.length;
      urls.push(url);
    });

    return { urls, indexById };
  }, [mergedMessages]);

  const imageGroups = useMemo<LightboxGroup[]>(() => {
    if (!mergedMessages.length) return [];

    return mergedMessages
      .filter((msg) => msg.messageType === 'image' && !msg.id.startsWith('draft_'))
      .map((msg) => ({
        sourceUrl: getMessageImageUrl(msg),
        messageId: msg.id,
        canEdit: true,
      }))
      .filter((group) => Boolean(group.sourceUrl));
  }, [mergedMessages, user?.id]);

  const imageGroupIndexByMessageId = useMemo(() => {
    const map: Record<string, number> = {};
    imageGroups.forEach((group, index) => {
      map[group.messageId] = index;
    });
    return map;
  }, [imageGroups]);

  const imageGroupIndexByUrl = useMemo(() => {
    const map: Record<string, number> = {};
    imageGroups.forEach((group, index) => {
      map[group.sourceUrl] = index;
    });
    return map;
  }, [imageGroups]);

  const room3DStorageKey = activeChat ? `kankan.chat.3d:${activeChat.id}` : null;
  const room2DStorageKey = activeChat ? `kankan.chat.2d:${activeChat.id}` : null;

  useEffect(() => {
    if (!room3DStorageKey) return;
    const saved = window.localStorage.getItem(room3DStorageKey);
    setIsRoom3D(saved === '1');
  }, [room3DStorageKey]);

  useEffect(() => {
    if (!room2DStorageKey) return;
    const saved = window.localStorage.getItem(room2DStorageKey);
    setIsRoom2D(saved === '1');
  }, [room2DStorageKey]);

  const handleRenameGroup = async () => {
    if (!activeChat) return;
    if (activeChat.chatType !== 'group') return;
    if (!user?.id || !activeChat.adminIds?.includes(user.id)) return;

    const next = window.prompt(t('chat.renamePrompt'), activeChat.name);
    if (!next) return;

    try {
      const updated = await chatService.updateChat(activeChat.id, { groupName: next });
      dispatch(updateChat(updated));
    } catch (e) {
      console.error('Failed to rename group', e);
      addLocalInfoMessage(t('chat.renameFailed'));
    }
  };

  const chatCommands = useMemo(() => {
    const exampleText = t('chat.command.exampleText');
    return [
      { id: '/w' as const, description: t('chat.command.desc.w'), example: '/w' },
      { id: '/wa' as const, description: t('chat.command.desc.wa'), example: '/wa' },
      { id: '/h' as const, description: t('chat.command.desc.h'), example: '/h' },
      { id: '/b' as const, description: t('chat.command.desc.b'), example: `/b ${exampleText}` },
      { id: '/i' as const, description: t('chat.command.desc.i'), example: `/i ${exampleText}` },
      { id: '/r' as const, description: t('chat.command.desc.r'), example: `/r ${exampleText}` },
      { id: '/p' as const, description: t('chat.command.desc.p'), example: `/p @name @name ${exampleText}` },
      { id: '/a' as const, description: t('chat.command.desc.a'), example: '/a @name' },
    ];
  }, [t]);

  const chatHelpLines = useMemo(() => [
    t('chat.command.available'),
    ...chatCommands.flatMap((c) => [
      `  ${c.example}  — ${c.description}`,
      ...(c.id === '/p' ? [`    ${t('chat.command.usage.p')}`] : []),
    ]),
    '',
    `  @name  — ${t('chat.command.usage.mention')}`,
    `  @@  — ${t('chat.command.usage.mentionAll')}`,
  ], [chatCommands, t]);


  const addLocalInfoMessage = (text: string) => {
    if (!activeChat) return;

    const infoMessage = {
      id: `local_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      chatId: activeChat.id,
      senderId: '__system__',
      senderName: '',
      senderAvatar: '',
      messageType: 'system',
      text,
      timestamp: new Date().toISOString(),
      deliveredTo: [],
      readBy: [],
      reactions: {},
      isDeleted: false,
    };

    dispatch(addMessage(infoMessage as any));
  };

  const runChatCommand = async (rawInput: string) => {
    if (!activeChat) return;

    // Find the slash-command token wherever it appears (so users can write
    // "@bob /p hug" or "/p hug @bob" or "/p @bob hug" interchangeably).
    const slashMatch = rawInput.match(/(^|\s)(\/[a-zA-Z]+)(?=\s|$)/);
    const cmd = (slashMatch ? slashMatch[2] : rawInput.split(/\s+/)[0] || '').trim() as string;

    // `rest` is everything except the command token itself, with surrounding
    // whitespace collapsed. The /p handler extracts its own @-mention from
    // this; other commands treat it as plain text.
    const rest = slashMatch
      ? `${rawInput.slice(0, slashMatch.index! + slashMatch[1].length)}${rawInput.slice(slashMatch.index! + slashMatch[1].length + slashMatch[2].length)}`
          .replace(/\s+/g, ' ')
          .trim()
      : '';

    const known = chatCommands.some((c) => c.id === cmd);
    if (!known || cmd === '/' || cmd.length === 0) {
      addLocalInfoMessage(
        [
          ...chatHelpLines,
          '',
          t('chat.command.tip'),
        ].join('\n')
      );
      return;
    }

    switch (cmd as ChatCommandId) {
      case '/h': {
        addLocalInfoMessage(
          chatHelpLines.join('\n')
        );
        return;
      }

      case '/w': {
        const names = getRealParticipants(activeChat.participants).map((p) => p.displayName);
        addLocalInfoMessage(`${t('chat.command.participants')} (${names.length}):\n  ${names.join('\n  ')}`);
        return;
      }

      case '/wa': {
        const active = getRealParticipants(activeChat.participants).filter((p) => p.isOnline);
        const names = active.map((p) => p.displayName);
        addLocalInfoMessage(
          active.length === 0
            ? t('chat.command.noActive')
            : `${t('chat.command.activeParticipants')} (${names.length}):\n  ${names.join('\n  ')}`
        );
        return;
      }

      case '/r': {
        if (!rest) {
          addLocalInfoMessage(t('chat.command.usage.r'));
          return;
        }
        const formatted = `[red]${rest}[/red]`;
        const message = await chatService.sendMessage(activeChat.id, {
          messageType: 'text',
          text: formatted,
        });
        dispatch(addMessage(message));
        return;
      }

      case '/b': {
        if (!rest) {
          addLocalInfoMessage(t('chat.command.usage.b'));
          return;
        }
        const formatted = `**${rest}**`;
        const message = await chatService.sendMessage(activeChat.id, {
          messageType: 'text',
          text: formatted,
        });
        dispatch(addMessage(message));
        return;
      }

      case '/i': {
        if (!rest) {
          addLocalInfoMessage(t('chat.command.usage.i'));
          return;
        }
        const formatted = `*${rest}*`;
        const message = await chatService.sendMessage(activeChat.id, {
          messageType: 'text',
          text: formatted,
        });
        dispatch(addMessage(message));
        return;
      }

      case '/p': {
        const realOthers = getOtherRealParticipants(activeChat, user?.id);
        const mentionResults: Array<{
          participant: typeof realOthers[number];
          start: number;
          end: number;
        }> = [];
        let scanIndex = 0;

        while (scanIndex < rest.length) {
          const mentionMatch = rest.slice(scanIndex).match(/(^|\s)@/);
          if (!mentionMatch) break;

          const mentionStart = scanIndex + mentionMatch.index! + mentionMatch[1].length;
          const afterMention = rest.slice(mentionStart + 1);
          const exactMentionMatches = realOthers
            .filter((p) => {
              const name = p.displayName.trim();
              return name.length > 0 && (afterMention === name || afterMention.startsWith(`${name} `));
            })
            .sort((a, b) => b.displayName.length - a.displayName.length);
          const typedMentionToken = afterMention.match(/^(\S+)/)?.[1] ?? '';

          const longestExactLength = exactMentionMatches[0]?.displayName.length ?? 0;
          const longestExact = exactMentionMatches.filter((p) => p.displayName.length === longestExactLength);
          let participant: typeof realOthers[number] | undefined;
          let mentionEnd = -1;

          if (longestExact.length === 1) {
            participant = longestExact[0];
            mentionEnd = mentionStart + 1 + participant.displayName.length;
          } else if (longestExact.length > 1) {
            addLocalInfoMessage(t('chat.command.photoMentionAmbiguous').replace('{name}', longestExact[0].displayName));
            return;
          } else if (typedMentionToken) {
            const prefix = realOthers.filter((p) =>
              p.displayName.toLowerCase().startsWith(typedMentionToken.toLowerCase())
            );
            if (prefix.length === 1) {
              participant = prefix[0];
              mentionEnd = mentionStart + 1 + typedMentionToken.length;
            } else if (prefix.length > 1) {
              addLocalInfoMessage(t('chat.command.photoMentionAmbiguous').replace('{name}', typedMentionToken));
              return;
            } else {
              addLocalInfoMessage(t('chat.command.photoMentionNotFound').replace('{name}', typedMentionToken));
              return;
            }
          } else {
            addLocalInfoMessage(t('chat.command.usage.p'));
            return;
          }

          mentionResults.push({ participant, start: mentionStart, end: mentionEnd });
          scanIndex = mentionEnd;
        }

        const promptBody = mentionResults.reduce<{ parts: string[]; lastIndex: number }>((acc, mention) => {
          acc.parts.push(rest.slice(acc.lastIndex, mention.start));
          acc.lastIndex = mention.end;
          return acc;
        }, { parts: [], lastIndex: 0 });
        const promptText = `${promptBody.parts.join('')}${rest.slice(promptBody.lastIndex)}`
          .replace(/\s+/g, ' ')
          .trim() || t('chat.command.defaultPhotoPrompt');

        if (mentionResults.length === 0 && isGroup) {
          addLocalInfoMessage(t('chat.command.photoMentionRequired'));
          return;
        }

        const targetParticipant = mentionResults[0]?.participant ?? realOthers[0];
        const primaryParticipant = mentionResults.length >= 2 ? mentionResults[0].participant : undefined;
        const secondaryParticipant = mentionResults.length >= 2 ? mentionResults[1].participant : targetParticipant;

        const targetChatId = activeChat.id;
        const pairChatId = isRealGroupChat(activeChat, user?.id) ? targetChatId : undefined;
        const primaryAvatar = (primaryParticipant?.avatarUrl || rightAvatar)?.trim();
        const secondaryAvatar = (secondaryParticipant?.avatarUrl || leftAvatar)?.trim();
        if (!primaryAvatar || !secondaryAvatar) {
          addLocalInfoMessage(t('chat.command.photoAvatarMissing'));
          return;
        }
        const primaryUserId = primaryParticipant?.userId || user?.id;
        const secondaryUserId = secondaryParticipant?.userId;
        if (!primaryUserId || !secondaryUserId) {
          addLocalInfoMessage(t('chat.command.photoAvatarMissing'));
          return;
        }

        addLocalInfoMessage(t('chat.command.generatingPhoto'));

        void (async () => {
          try {
            const jobResponse = await imageGenerationService.generate({
              sourceType: 'chat_image',
              generationType: 'custom',
              chatId: pairChatId,
              mediaUrl: primaryAvatar,
              secondaryMediaUrl: secondaryAvatar,
              primaryUserId,
              secondaryUserId,
              customPrompts: [promptText],
              variationCount: 1,
            });

            const job = await imageGenerationService.pollJobUntilComplete(jobResponse.jobId);
            const generatedUrl = job.results?.generatedUrls?.[0];
            if (job.status !== 'completed' || !generatedUrl) {
              throw new Error(job.errorMessage || t('chat.command.photoFailed'));
            }

            const fileName = generatedUrl.split('/').pop()?.split('?')[0] || 'photo.png';
            const message = await chatService.sendMessage(targetChatId, {
              messageType: 'image',
              mediaUrl: generatedUrl,
              thumbnailUrl: generatedUrl,
              fileName,
            });
            dispatch(addMessage(message));
          } catch (error) {
            console.error('Failed to generate pair photo:', error);
            addLocalInfoMessage(t('chat.command.photoFailed'));
          }
        })();

        return;
      }

      case '/a': {
        // Explicit replacement for the old `@mention` auto-add behavior.
        // The server applies the same lenient rules (any chat member can
        // invoke; 1-1 chats convert to groups when needed) — keeping the
        // client side trivial and deferring to one source of truth.
        if (!rest) {
          addLocalInfoMessage(t('chat.command.usage.a'));
          return;
        }

        // Accept either `/a @bob` or `/a bob`. The mention picker is
        // disabled for /a (existing-member list is the wrong set), so the
        // user types the name themselves.
        const addMention = rest.match(/(^|\s)@(\S+)/);
        const target = (addMention ? addMention[2] : rest.trim()).trim();
        if (!target) {
          addLocalInfoMessage(t('chat.command.usage.a'));
          return;
        }

        try {
          const result = await chatService.addByMention(activeChat.id, target);
          if (result.alreadyMember) {
            addLocalInfoMessage(t('chat.command.addUserAlreadyIn').replace('{name}', result.displayName || target));
            return;
          }
          if (result.chat) {
            dispatch(updateChat(result.chat));
          }
          addLocalInfoMessage(t('chat.command.addUserAdded').replace('{name}', result.displayName || target));
        } catch (error: any) {
          if (error?.response?.status === 403) {
            const reason = error?.response?.data?.reason;
            if (reason === 'not_friends') {
              const displayName = error?.response?.data?.displayName || target;
              addLocalInfoMessage(t('chat.command.addUserNotFriend').replace('{name}', displayName));
            } else {
              addLocalInfoMessage(t('chat.command.addUserForbidden'));
            }
          } else if (error?.response?.status === 404) {
            // Server now restricts /a's name resolution to the inviter's
            // friends. A 404 means "no friend matches this name" — could be
            // either a typo or a non-friend; we surface a friend-aware
            // message so users understand the constraint.
            addLocalInfoMessage(t('chat.command.addUserNoFriendMatch').replace('{name}', target));
          } else {
            console.error('Failed to add participant:', error);
            addLocalInfoMessage(t('chat.command.addUserFailed'));
          }
        }
        return;
      }
    }
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    if (isRoom3D || isRoom2D) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mergedMessages, isRoom3D, isRoom2D]);

  // When our own mood changes, broadcast mood + the resolved avatar URL via draft
  const lastBroadcastMoodRef = React.useRef<string | null>(null);

  // Join chat room when active chat changes
  useEffect(() => {
    if (activeChat) {
      signalRService.joinChat(activeChat.id);
      dispatch(fetchMessages({ chatId: activeChat.id }));
    }
    setLeftMood(null);
    setRightMood(null);
    lastBroadcastMoodRef.current = null;
    return () => {
      if (activeChat) {
        signalRService.leaveChat(activeChat.id);
      }
    };
  }, [activeChat?.id, dispatch]);

  // Mark messages as delivered/read when viewing the chat
  useEffect(() => {
    if (!activeChat || !user?.id) return;

    chatMessages.forEach((message) => {
      if (message.senderId !== user.id) {
        if (!message.deliveredTo.includes(user.id)) {
          signalRService.markMessageDelivered(activeChat.id, message.id);
        }
        if (!message.readBy.includes(user.id)) {
          signalRService.markMessageRead(activeChat.id, message.id);
        }
      }
    });
  }, [activeChat?.id, chatMessages, user?.id]);

  const sendMessage = async (raw: string): Promise<boolean> => {
    if (!activeChat || sending) return false;

    // Commands trigger when:
    //  - '/' is the first character ("/p hug @bob")
    //  - or '@name /p ...' — a leading mention followed by a slash command,
    //    so the user can write "@bob /p hug" in any natural order.
    const trimmedRaw = raw.replace(/^\s+/, '');
    const startsWithSlash = trimmedRaw.startsWith('/');
    const leadingMentionThenSlash =
      /^@\S+\s+\/[a-zA-Z]/.test(trimmedRaw);

    if (startsWithSlash || leadingMentionThenSlash) {
      setSending(true);

      try {
        await runChatCommand(trimmedRaw);
        return true;
      } catch (error: any) {
        console.error('Failed to run command:', error);
        if (error?.response?.status === 403) {
          addLocalInfoMessage(t('chat.notFriends'));
        }
        return false;
      } finally {
        setSending(false);
      }
    }

    if (!raw.trim()) return false;

    const text = raw.trim();

    // Eagerly detect mood from the message text BEFORE sending,
    // so Alice sees her own avatar change without waiting for the HTTP round-trip.
    const pendingMood = getMoodFromText(text);
    if (pendingMood) {
      const now = Date.now();
      if (rightMood === null || now - rightMoodAt >= moodCooldownMs) {
        setRightMood(pendingMood);
        setRightMoodAt(now);
      }
    }

    setSending(true);
    const clientRequestId = `client_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const optimisticMessage = {
      id: `pending_${clientRequestId}`,
      clientRequestId,
      chatId: activeChat.id,
      senderId: user?.id || '',
      senderName: user?.displayName || '',
      senderAvatar: rightAvatar || user?.avatarUrl || '',
      senderAvatarSourceId: undefined,
      senderAvatarEmotion: rightMood || undefined,
      senderGender: user?.gender || 'male',
      messageType: 'text',
      text,
      timestamp: new Date().toISOString(),
      deliveredTo: [],
      readBy: [],
      reactions: {},
      isDeleted: false,
    };

    dispatch(addMessage(optimisticMessage as any));

    try {
      const message = await chatService.sendMessage(activeChat.id, {
        clientRequestId,
        messageType: 'text',
        text,
      });
      dispatch(addMessage(message));
      return true;
    } catch (error: any) {
      dispatch(removeMessage({ chatId: activeChat.id, messageId: optimisticMessage.id }));
      console.error('Failed to send message:', error);
      if (error?.response?.status === 403) {
        addLocalInfoMessage(t('chat.notFriends'));
      }
      return false;
    } finally {
      setSending(false);
    }
  };

  const guessMessageType = (file: File): 'image' | 'video' | 'voice' | 'file' => {
    const type = file.type || '';
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('video/')) return 'video';
    if (type.startsWith('audio/')) return 'voice';
    return 'file';
  };

  const clearRecordingTimer = useCallback(() => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const releaseRecordingStream = useCallback(() => {
    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
    }
  }, []);

  const resetRecordingUi = useCallback(() => {
    clearRecordingTimer();
    setIsRecordingVoice(false);
    setRecordingSeconds(0);
  }, [clearRecordingTimer]);

  const uploadRecordedVoice = useCallback(async (blob: Blob, durationSeconds: number) => {
    if (!activeChat) return;

    const mimeType = blob.type || 'audio/webm';
    const extension = getAudioExtension(mimeType);
    const fileName = `voice_${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
    const file = new File([blob], fileName, { type: mimeType });

    try {
      setUploading(true);
      const upload = await mediaService.upload(file);

      const message = await chatService.sendMessage(activeChat.id, {
        messageType: 'voice',
        mediaUrl: upload.url,
        duration: Math.max(1, Math.min(MAX_VOICE_DURATION_SECONDS, Math.round(durationSeconds))),
        fileName: upload.fileName || file.name,
        fileSize: String(upload.size ?? file.size),
      });

      dispatch(addMessage(message));
    } catch (error: any) {
      console.error('Failed to upload/send voice message:', error);
      if (error?.response?.status === 403) {
        addLocalInfoMessage(t('chat.notFriends'));
      } else {
        addLocalInfoMessage(t('chat.voice.sendFailed'));
      }
    } finally {
      setUploading(false);
    }
  }, [activeChat, dispatch, t]);

  const stopVoiceRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      releaseRecordingStream();
      resetRecordingUi();
      return;
    }

    clearRecordingTimer();
    recorder.stop();
  }, [clearRecordingTimer, releaseRecordingStream, resetRecordingUi]);

  const cancelVoiceRecording = useCallback(() => {
    recordingCancelledRef.current = true;
    stopVoiceRecording();
  }, [stopVoiceRecording]);

  const startVoiceRecording = useCallback(async () => {
    if (!activeChat || sending || uploading || isRecordingVoice) {
      return;
    }

    if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      addLocalInfoMessage(t('chat.voice.unsupported'));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recordingCancelledRef.current = false;
      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      setRecordingSeconds(0);
      setIsRecordingVoice(true);

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const durationSeconds = Math.max(
          1,
          Math.min(MAX_VOICE_DURATION_SECONDS, Math.round((Date.now() - recordingStartedAtRef.current) / 1000))
        );
        const chunks = recordingChunksRef.current;

        mediaRecorderRef.current = null;
        recordingChunksRef.current = [];
        releaseRecordingStream();
        resetRecordingUi();

        if (recordingCancelledRef.current || chunks.length === 0) {
          recordingCancelledRef.current = false;
          return;
        }

        const recordedMimeType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: recordedMimeType });
        await uploadRecordedVoice(blob, durationSeconds);
      };

      recorder.start();

      recordingTimerRef.current = window.setInterval(() => {
        const elapsed = Math.min(
          MAX_VOICE_DURATION_SECONDS,
          Math.floor((Date.now() - recordingStartedAtRef.current) / 1000)
        );
        setRecordingSeconds(elapsed);

        if (elapsed >= MAX_VOICE_DURATION_SECONDS) {
          stopVoiceRecording();
        }
      }, 250);
    } catch (error: any) {
      console.error('Failed to start voice recording:', error);
      releaseRecordingStream();
      resetRecordingUi();

      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        addLocalInfoMessage(t('chat.voice.permissionDenied'));
      } else {
        addLocalInfoMessage(t('chat.voice.unsupported'));
      }
    }
  }, [activeChat, isRecordingVoice, releaseRecordingStream, resetRecordingUi, sending, stopVoiceRecording, t, uploadRecordedVoice, uploading]);


  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat) return;

    try {
      setUploading(true);
      const upload = await mediaService.upload(file);
      const messageType = guessMessageType(file);

      const message = await chatService.sendMessage(activeChat.id, {
        messageType,
        mediaUrl: upload.url,
        fileName: upload.fileName || file.name,
        fileSize: String(upload.size ?? file.size),
      });

      dispatch(addMessage(message));
    } catch (error: any) {
      console.error('Failed to upload/send file:', error);
      if (error?.response?.status === 403) {
        addLocalInfoMessage(t('chat.notFriends'));
      } else {
        addLocalInfoMessage(t('chat.sendFileFailed'));
      }
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    return () => {
      recordingCancelledRef.current = true;
      clearRecordingTimer();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      releaseRecordingStream();
    };
  }, [clearRecordingTimer, releaseRecordingStream]);

  useEffect(() => {
    recordingCancelledRef.current = true;
    clearRecordingTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      releaseRecordingStream();
      resetRecordingUi();
    }
  }, [activeChat?.id, clearRecordingTimer, releaseRecordingStream, resetRecordingUi]);

  const isGroup = activeChat ? isRealGroupChat(activeChat, user?.id) : false;

  const displayParticipant = activeChat
    ? getDirectDisplayParticipant(activeChat, user?.id)
    : undefined;

  const otherParticipant = activeChat
    ? getOtherRealParticipants(activeChat, user?.id)[0] || displayParticipant
    : undefined;

  // Candidates for the @-mention picker used by /p in the input panel.
  // Stable reference so React.memo on ChatInputPanel doesn't re-render on every keystroke.
  const mentionCandidates = useMemo(() => {
    if (!activeChat) return [] as Array<{ userId: string; displayName: string; avatarUrl: string }>;
    return getOtherRealParticipants(activeChat, user?.id).map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
    }));
  }, [activeChat, user?.id]);

  // Names used to highlight `@Name` in rendered message bubbles. Includes
  // self so a message from someone else mentioning the current user is also
  // styled.
  const participantNames = useMemo(() => {
    if (!activeChat) return [] as string[];
    const names = getRealParticipants(activeChat.participants).map((p) => p.displayName);
    return Array.from(new Set(names.filter(Boolean)));
  }, [activeChat]);

  useEffect(() => {
    if (!otherParticipant?.userId) {
      setOtherAvatarImageId(null);
      setOtherLiveAvatarUrl(null);
      return;
    }

    let active = true;
    contactService
      .getUser(otherParticipant.userId)
      .then((profile) => {
        if (!active) return;
        setOtherAvatarImageId(profile.avatarImageId || extractAvatarImageId(profile.avatarUrl) || null);
        setOtherLiveAvatarUrl(profile.avatarUrl || null);
      })
      .catch(() => {
        if (!active) return;
        setOtherAvatarImageId(null);
        setOtherLiveAvatarUrl(null);
      });

    return () => {
      active = false;
    };
  }, [otherParticipant?.userId]);

  const latestRawTextBySenderId = useMemo(() => {
    const map: Record<string, string> = {};
    chatMessages.forEach((msg) => {
      if (msg.messageType !== 'text' || msg.isDeleted) return;
      map[msg.senderId] = msg.text || '';
    });
    return map;
  }, [chatMessages]);

  const getLatestRawTextFor = (senderId?: string) => {
    if (!senderId) return '';
    return latestRawTextBySenderId[senderId] || '';
  };

  const latestReceivedText = useMemo(() => {
    if (!user?.id || chatMessages.length === 0) return '';
    for (let i = chatMessages.length - 1; i >= 0; i -= 1) {
      const msg = chatMessages[i];
      if (msg.messageType !== 'text' || msg.isDeleted) continue;
      if (msg.senderId === user.id) continue;
      return msg.text || '';
    }
    return '';
  }, [chatMessages, user?.id]);

  const latestReceivedAvatarUrl = useMemo(() => {
    if (!user?.id || chatMessages.length === 0) return '';
    for (let i = chatMessages.length - 1; i >= 0; i -= 1) {
      const msg = chatMessages[i];
      if (msg.isDeleted) continue;
      if (msg.senderId === user.id) continue;
      if (msg.senderAvatar) return msg.senderAvatar;
      if (msg.senderAvatarSourceId) return `/api/avatar/image/${msg.senderAvatarSourceId}`;
      return '';
    }
    return '';
  }, [chatMessages, user?.id]);


  const getLatest2DContentFor = (senderId?: string, draftText?: string): { segments: Chat2DSegment[] } => {
    const prefixLines = (value: string) =>
      value
        .split('\n')
        .map((line) => `\\> ${line}`)
        .join('\n');

    if (!senderId) {
      return {
        segments: draftText?.trim()
          ? [{ type: 'text', text: prefixLines(draftText.trim()) }]
          : [],
      };
    }

    const segments: Chat2DSegment[] = [];

    for (let i = 0; i < chatMessages.length; i += 1) {
      const msg = chatMessages[i];
      if (msg.senderId !== senderId || msg.isDeleted) continue;

      if (msg.messageType === 'text') {
        const text = (msg.text || '').trim();
        if (text) {
          segments.push({ type: 'text', text: prefixLines(text) });
        }
        continue;
      }

      if (msg.messageType === 'system') {
        continue;
      }

      const content = (msg as any).content;
      const url = (msg as any).thumbnailUrl || (msg as any).mediaUrl || content?.thumbnailUrl || content?.mediaUrl || '';
      if (!url) continue;

      if (msg.messageType !== 'image' && msg.messageType !== 'video' && msg.messageType !== 'voice' && msg.messageType !== 'file') {
        continue;
      }

      segments.push({
        type: msg.messageType,
        url,
        duration: 'duration' in msg ? msg.duration : undefined,
        fileName: 'fileName' in msg ? msg.fileName : undefined,
      });
    }

    if (draftText && draftText.trim().length > 0) {
      segments.push({ type: 'text', text: prefixLines(draftText.trim()) });
    }

    return { segments };
  };

  type MoodKey = 'neutral' | 'smile' | 'angry' | 'sad' | 'surprised' | 'thinking' | 'happy' | 'crying' | 'excited' | 'flirty' | 'solo' | 'interact';

  const [leftMoodMap, setLeftMoodMap] = useState<Partial<Record<MoodKey, string>>>({});
  const [rightMoodMap, setRightMoodMap] = useState<Partial<Record<MoodKey, string>>>({});
  const [leftMood, setLeftMood] = useState<MoodKey | null>(null);
  const [rightMood, setRightMood] = useState<MoodKey | null>(null);
  const [leftMoodAt, setLeftMoodAt] = useState(0);
  const [rightMoodAt, setRightMoodAt] = useState(0);
  const moodCooldownMs = 5000;

  const otherDraft = draftMessages.find((d) => d.senderId === otherParticipant?.userId)?.text;
  const otherDraftClean = otherDraft?.replace(/\[mood:[^\]]+\]/g, '').trim() || undefined;
  const left2D = useMemo(() => {
    if (!isRoom2D) return { segments: [] };
    return getLatest2DContentFor(otherParticipant?.userId, otherDraftClean);
  }, [isRoom2D, otherParticipant?.userId, otherDraftClean, mergedMessages, chatMessages]);

  const right2D = useMemo(() => {
    if (!isRoom2D) return { segments: [] };
    return getLatest2DContentFor(user?.id);
  }, [isRoom2D, user?.id, mergedMessages, chatMessages]);
  const leftMoodText = latestReceivedText;

  const extractAvatarImageId = (url?: string | null): string | null => {
    if (!url) return null;
    try {
      const parsed = new URL(url, window.location.origin);
      const match = parsed.pathname.match(/\/api\/avatar\/image\/([^/]+)/i);
      return match?.[1] ?? null;
    } catch {
      const match = url.match(/\/api\/avatar\/image\/([^/?#]+)/i);
      return match?.[1] ?? null;
    }
  };

  const toMoodKey = (emotion?: string | null): MoodKey | null => {
    const normalized = (emotion || '').trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === 'smile') return 'smile';
    if (normalized === 'happy') return 'happy';
    if (normalized === 'sad') return 'sad';
    if (normalized === 'crying') return 'crying';
    if (normalized === 'angry') return 'angry';
    if (normalized === 'surprised') return 'surprised';
    if (normalized === 'thinking') return 'thinking';
    if (normalized === 'neutral') return 'neutral';
    if (normalized === 'excited') return 'excited';
    if (normalized === 'flirty') return 'flirty';
    if (normalized === 'solo') return 'solo';
    if (normalized === 'interact') return 'interact';
    return null;
  };

  const buildMoodMap = (items: EmotionThumbnailResult[]): Partial<Record<MoodKey, string>> => {
    const map: Partial<Record<MoodKey, string>> = {};
    items.forEach((item) => {
      const key = toMoodKey(item.emotion);
      if (!key) return;
      if (!map[key]) {
        map[key] = item.imageUrl;
      }
    });
    return map;
  };

  const getMoodFromText = (text: string): MoodKey | null => {
    const value = text.toLowerCase();

    if (/暧昧|撩人|撩|心动|喜欢你|想你|性感|诱人|flirt|flirty|sexy|hot|attractive|turn\s?on|aroused|crush|😍|😘|😏/.test(value)) return 'flirty';
    if (/生气|气死|恼火|怒|愤怒|抓狂|angry|furious|mad|pissed|rage|🤬|😡|😤/.test(value)) return 'angry';
    if (/难过|伤心|忧伤|惆怅|sad|sorrow|upset|unhappy|😞|😔/.test(value)) return 'sad';
    if (/哭|呜呜|泪|大哭|哭泣|cry|crying|sob|😭|😢/.test(value)) return 'crying';
    if (/震惊|惊讶|哇|诶|吃惊|不敢相信|surprised|shock|omg|wow|😱|😲|😮/.test(value)) return 'surprised';
    if (/想想|思考|等等|嗯|让我想|琢磨|think|thinking|hmm|wonder|ponder|🤔/.test(value)) return 'thinking';
    if (/笑|微笑|哈哈|嘻嘻|呵呵|smile|lol|haha|hehe|grin|😂|😄|😊|😁/.test(value)) return 'smile';
    if (/开心|高兴|快乐|愉快|乐|太好了|happy|glad|joy|joyful|pleased|yay|😃|🥳/.test(value)) return 'happy';
    if (/兴奋|激动|太棒|爽|excited|awesome|thrilled|pumped|stoked|🤩|🎉/.test(value)) return 'excited';
    if (/平静|冷静|淡定|无聊|还好|一般|normal|neutral|calm|chill|meh|ok|okay|😐|😑/.test(value)) return 'neutral';

    return null;
  };

  const getAvatarForMood = (
    mood: MoodKey | null,
    moodMap: Partial<Record<MoodKey, string>>,
    fallback?: string
  ) => {
    if (!mood) return fallback || '';
    return moodMap[mood] || fallback || '';
  };

  useEffect(() => {
    const next = getMoodFromText(leftMoodText);
    if (!next) return;
    const now = Date.now();
    if (leftMood === null || now - leftMoodAt >= moodCooldownMs) {
      setLeftMood(next);
      setLeftMoodAt(now);
    }
  }, [leftMoodText, leftMood, leftMoodAt]);

  useEffect(() => {
    let active = true;
    const avatarImageId = user?.avatarImageId || extractAvatarImageId(user?.avatarUrl);
    if (!avatarImageId) {
      setRightMoodMap({});
      return () => {
        active = false;
      };
    }

    avatarService
      .getEmotionThumbnails(avatarImageId)
      .then((items) => {
        if (!active) return;
        setRightMoodMap(buildMoodMap(items));
      })
      .catch(() => {
        if (!active) return;
        setRightMoodMap({});
      });

    return () => {
      active = false;
    };
  }, [user?.avatarImageId, user?.avatarUrl]);

  useEffect(() => {
    let active = true;
    const avatarImageId = otherAvatarImageId
      || extractAvatarImageId(latestReceivedAvatarUrl || otherParticipant?.avatarUrl);
    if (!avatarImageId) {
      setLeftMoodMap({});
      return () => {
        active = false;
      };
    }

    avatarService
      .getEmotionThumbnails(avatarImageId)
      .then((items) => {
        if (!active) return;
        setLeftMoodMap(buildMoodMap(items));
      })
      .catch(() => {
        if (!active) return;
        setLeftMoodMap({});
      });

    return () => {
      active = false;
    };
  }, [otherAvatarImageId, latestReceivedAvatarUrl, otherParticipant?.avatarUrl]);

  const leftMoodRefreshAtRef = useRef(0);
  const lastLeftAvatarIdRef = useRef<string | null>(null);
  useEffect(() => {
    const avatarImageId = otherAvatarImageId
      || extractAvatarImageId(latestReceivedAvatarUrl || otherParticipant?.avatarUrl);
    if (!avatarImageId) return;

    const lastAvatarId = lastLeftAvatarIdRef.current;
    if (lastAvatarId && lastAvatarId === avatarImageId) return;

    const now = Date.now();
    if (now - leftMoodRefreshAtRef.current < 3000) return;
    leftMoodRefreshAtRef.current = now;
    lastLeftAvatarIdRef.current = avatarImageId;

    let active = true;
    avatarService
      .getEmotionThumbnails(avatarImageId)
      .then((items) => {
        if (!active) return;
        setLeftMoodMap(buildMoodMap(items));
      })
      .catch(() => {
        // Ignore refresh failures; existing mood map is still valid.
      });

    return () => {
      active = false;
    };
  }, [otherAvatarImageId, latestReceivedAvatarUrl, otherParticipant?.avatarUrl]);

  const leftAvatar = getAvatarForMood(leftMood, leftMoodMap, otherParticipant?.avatarUrl);
  const rightAvatar = getAvatarForMood(rightMood, rightMoodMap, user?.avatarUrl);

  const groupMembersCount = activeChat
    ? getRealParticipants(activeChat.participants).length
    : 0;

  const localizedDisplayParticipantName = displayParticipant?.userId === WA_USER_ID
    ? t('Wa')
    : displayParticipant?.displayName;

  const activeChatTitle = displayParticipant?.userId === WA_USER_ID
    ? t('Wa')
    : activeChat?.name;

  const leftParticipant = useMemo(() => {
    if (!otherParticipant) return null;
    return {
      displayName: otherParticipant.userId === WA_USER_ID ? t('Wa') : otherParticipant.displayName,
      avatarUrl: leftAvatar,
      gender: otherParticipant.gender,
    };
  }, [otherParticipant, leftAvatar, t]);

  const rightParticipant = useMemo(() => {
    if (!user) return null;
    return {
      displayName: user.displayName,
      avatarUrl: rightAvatar,
      gender: user.gender,
    };
  }, [user, rightAvatar]);

  useEffect(() => {
    if (!inputRootRef.current || !activeChat?.id) return;
    inputRootRef.current.render(
      <ThemeProvider theme={theme}>
        <ChatInputPanel
          activeChatId={activeChat.id}
          sending={sending}
          uploading={uploading}
          isRecordingVoice={isRecordingVoice}
          recordingSeconds={recordingSeconds}
          chatCommands={chatCommands}
          mentionCandidates={mentionCandidates}
          onSendMessage={sendMessage}
          onFileSelected={handleFileSelected}
          onStartVoiceRecording={startVoiceRecording}
          onStopVoiceRecording={stopVoiceRecording}
          onCancelVoiceRecording={cancelVoiceRecording}
          t={t}
        />
      </ThemeProvider>
    );
  }, [
    theme,
    activeChat?.id,
    sending,
    uploading,
    isRecordingVoice,
    recordingSeconds,
    chatCommands,
    mentionCandidates,
    sendMessage,
    handleFileSelected,
    startVoiceRecording,
    stopVoiceRecording,
    cancelVoiceRecording,
    t,
  ]);

  if (!activeChat) {
    return (
      <BoxAny
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'grey.50',
          ...sx,
        }}
      >
        <Typography variant="h6" color="text.secondary">
          {t('chat.selectPrompt')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t('chat.selectHint')}
        </Typography>
      </BoxAny>
    );
  }

  return (
    <BoxAny
      sx={{
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'grey.100',
        minHeight: 0,
        ...sx,
      }}
    >
      {/* Header */}
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar sx={{ minHeight: { xs: 53, sm: 61 }, py: 0.25, pl: { xs: 1, sm: 1.5 }, pr: { xs: 0.75, sm: 1.25 } }}>
          {onToggleSidebar && (
            <IconButton edge="start" onClick={onToggleSidebar} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
          )}
          {onBack && (
            <IconButton edge="start" onClick={onBack} sx={{ mr: 1 }}>
              <ArrowBackIcon />
            </IconButton>
          )}
          {isGroup ? (
            <GroupAvatar
              size={40}
              sx={{ mr: 2 }}
              members={(() => {
                const others = getOtherRealParticipants(activeChat, user?.id);
                const source = others.length > 0 ? others : getRealParticipants(activeChat.participants);
                return source.map((p) => ({
                  avatarUrl: p.avatarUrl,
                  gender: p.gender,
                  displayName: p.displayName,
                }));
              })()}
            />
          ) : (
            <UserAvatar
              src={otherLiveAvatarUrl || displayParticipant?.avatarUrl || activeChat.avatar}
              gender={displayParticipant?.gender}
              sx={{ width: 40, height: 40, mr: 2 }}
              fallbackText={localizedDisplayParticipantName || activeChatTitle || activeChat.name}
              variant="rounded"
              previewMode={isHoverCapable ? 'hover' : 'tap'}
              closePreviewOnClick
            />
          )}
          <BoxAny sx={{ flexGrow: 1, minWidth: 0, overflow: 'hidden' }}>
            <Typography variant="subtitle1" fontWeight="bold" noWrap>
              {activeChatTitle || activeChat.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {chatTypingUsers.length > 0
                ? `${chatTypingUsers.map((u) => u.userName).join(', ')} ${t('chat.typing')}`
                : displayParticipant?.isOnline && displayParticipant.userId !== WA_USER_ID
                ? t('chat.online')
                : isGroup
                ? `${groupMembersCount} ${t('chat.members')}`
                : t('chat.offline')}
            </Typography>
          </BoxAny>

          <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0, ml: 1 }}>
            {activeChat.chatType === 'group' && user?.id && activeChat.adminIds?.includes(user.id) && (
              <IconButton edge="end" onClick={handleRenameGroup} title={t('chat.renameTitle')}>
                <EditIcon />
              </IconButton>
            )}

            {!isGroup && (
              <Tooltip title={isRoom2D ? t('chat.exit2d') : t('chat.enter2d')}>
                <IconButton
                  size="small"
                  sx={{ p: 0, width: 36, height: 31 }}
                  onClick={() => {
                    if (!room2DStorageKey) return;
                    setIsRoom2D((prev) => {
                      const next = !prev;
                      window.localStorage.setItem(room2DStorageKey, next ? '1' : '0');
                      if (next) {
                        setIsRoom3D(false);
                        if (room3DStorageKey) {
                          window.localStorage.setItem(room3DStorageKey, '0');
                        }
                      }
                      return next;
                    });
                  }}
                  color={isRoom2D ? 'primary' : 'default'}
                  aria-label="toggle-2d"
                >
                  <ForumIcon />
                </IconButton>
              </Tooltip>
            )}

            <Tooltip title={isRoom3D ? t('chat.exit3d') : t('chat.enter3d')}>
              <IconButton
                size="small"
                sx={{ p: 0, width: 36, height: 31 }}
                onClick={() => {
                  if (!room3DStorageKey) return;
                  setIsRoom3D((prev) => {
                    const next = !prev;
                    window.localStorage.setItem(room3DStorageKey, next ? '1' : '0');
                    if (next) {
                      setIsRoom2D(false);
                      if (room2DStorageKey) {
                        window.localStorage.setItem(room2DStorageKey, '0');
                      }
                    }
                    return next;
                  });
                }}
                color={isRoom3D ? 'primary' : 'default'}
                aria-label={t('chat.toggle3d')}
              >
                <ViewInArIcon />
              </IconButton>
            </Tooltip>
          </BoxAny>
        </Toolbar>
      </AppBar>

      {/* Messages */}
      <ChatMessages
        activeChat={activeChat}
        user={user}
        loading={loading}
        isRoom3D={isRoom3D}
        isRoom2D={isRoom2D}
        mergedMessages={mergedMessages}
        chatTypingUsers={chatTypingUsers}
        leftParticipant={leftParticipant}
        rightParticipant={rightParticipant}
        left2D={left2D}
        right2D={right2D}
        leftAvatar={leftAvatar}
        rightAvatar={rightAvatar}
        imageGroups={imageGroups}
        imageGroupIndexByUrl={imageGroupIndexByUrl}
        imageGallery={imageGallery}
        imageGroupIndexByMessageId={imageGroupIndexByMessageId}
        participantNames={participantNames}
        messagesEndRef={messagesEndRef}
        noMessagesText={t('chat.noMessages')}
      />

      {/* Input */}
      <BoxAny
        sx={{
          pt: 2,
          pb: 2,
          pl: 0.75,
          pr: 1,
          bgcolor: 'background.paper',
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        <div ref={setInputHost} />
      </BoxAny>
    </BoxAny>
  );
};
