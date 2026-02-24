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
  SxProps,
  Theme,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Send as SendIcon,
  EmojiEmotions as EmojiIcon,
  Menu as MenuIcon,
  AttachFile as AttachFileIcon,
  Edit as EditIcon,
  ViewInAr as ViewInArIcon,
  Forum as ForumIcon,
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import { fetchMessages, addMessage, updateChat } from '@/store/chatSlice';
import { MessageBubble } from './MessageBubble';
import { signalRService } from '@/services/signalr.service';
import { chatService, type Message } from '@/services/chat.service';
import { mediaService } from '@/services/media.service';
import { avatarService, type EmotionThumbnailResult } from '@/services/avatar.service';
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

export const ChatWindow: React.FC<ChatWindowProps> = ({ onBack, onToggleSidebar, sx }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { activeChat, messages, typingUsers, loading, drafts } = useSelector(
    (state: RootState) => state.chat
  );
  const { user } = useSelector((state: RootState) => state.auth);
  const { t } = useLanguage();
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isRoom3D, setIsRoom3D] = useState(false);
  const [isRoom2D, setIsRoom2D] = useState(false);
  const [commandSelectedIndex, setCommandSelectedIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftDebounceRef = useRef<number | null>(null);
  const lastDraftRef = useRef<string>('');

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
      alert(t('chat.renameFailed'));
    }
  };

  type ChatCommandId = '/w' | '/wa' | '/h' | '/b' | '/i' | '/r';
  const exampleText = t('chat.command.exampleText');
  const CHAT_COMMANDS: Array<{ id: ChatCommandId; description: string; example: string }> = [
    { id: '/w', description: t('chat.command.desc.w'), example: '/w' },
    { id: '/wa', description: t('chat.command.desc.wa'), example: '/wa' },
    { id: '/h', description: t('chat.command.desc.h'), example: '/h' },
    { id: '/b', description: t('chat.command.desc.b'), example: `/b ${exampleText}` },
    { id: '/i', description: t('chat.command.desc.i'), example: `/i ${exampleText}` },
    { id: '/r', description: t('chat.command.desc.r'), example: `/r ${exampleText}` },
  ];

  const isCommandMode = messageText.startsWith('/');
  const commandToken = (() => {
    if (!isCommandMode) return null;
    const firstSpace = messageText.indexOf(' ');
    return (firstSpace === -1 ? messageText : messageText.slice(0, firstSpace)).trim();
  })();

  const commandSuggestions = (() => {
    if (!isCommandMode) return [];
    const prefix = commandToken ?? '/';
    return CHAT_COMMANDS.filter((c) => c.id.startsWith(prefix as string));
  })();

  useEffect(() => {
    setCommandSelectedIndex(0);
  }, [commandToken]);

  useEffect(() => {
    return () => {
      if (draftDebounceRef.current) {
        window.clearTimeout(draftDebounceRef.current);
        draftDebounceRef.current = null;
      }
    };
  }, []);

  const addLocalInfoMessage = (text: string) => {
    if (!activeChat) return;

    const infoMessage = {
      id: `local_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      chatId: activeChat.id,
      senderId: WA_USER_ID,
      senderName: 'Wa',
      senderAvatar: '',
      messageType: 'text',
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

    const firstSpace = rawInput.indexOf(' ');
    const cmd = (firstSpace === -1 ? rawInput : rawInput.slice(0, firstSpace)).trim() as string;
    const rest = (firstSpace === -1 ? '' : rawInput.slice(firstSpace + 1)).trim();

    const known = CHAT_COMMANDS.some((c) => c.id === cmd);
    if (!known || cmd === '/' || cmd.length === 0) {
      addLocalInfoMessage(
        [
          t('chat.command.available'),
          ...CHAT_COMMANDS.map((c) => `  ${c.example}  — ${c.description}`),
          '',
          t('chat.command.tip'),
        ].join('\n')
      );
      return;
    }

    switch (cmd as ChatCommandId) {
      case '/h':
        addLocalInfoMessage(
          [t('chat.command.available'), ...CHAT_COMMANDS.map((c) => `  ${c.example}  — ${c.description}`)].join('\n')
        );
        return;

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
    setLeftBroadcastAvatar('');
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

  const handleSendMessage = async () => {
    if (!activeChat || sending) return;

    // Commands only trigger when '/' is the first character.
    // Leading whitespace like "  /w" is NOT a command.
    const raw = messageText;
    if (raw.startsWith('/')) {
      setMessageText('');
      setSending(true);

      try {
        await runChatCommand(raw);
      } catch (error) {
        console.error('Failed to run command:', error);
        setMessageText(raw);
        signalRService.sendDraftChanged(activeChat.id, raw);
      } finally {
        setSending(false);
        inputRef.current?.focus();
      }

      return;
    }

    if (!raw.trim()) return;

    const text = raw.trim();

    // Eagerly detect mood from the message text BEFORE clearing the input,
    // so Alice sees her own avatar change without waiting for the HTTP round-trip.
    const pendingMood = getMoodFromText(text);
    if (pendingMood) {
      const now = Date.now();
      if (rightMood === null || now - rightMoodAt >= moodCooldownMs) {
        setRightMood(pendingMood);
        setRightMoodAt(now);
      }
    }

    setMessageText('');
    setSending(true);

    try {
      const message = await chatService.sendMessage(activeChat.id, {
        messageType: 'text',
        text,
      });
      dispatch(addMessage(message));
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessageText(text); // Restore message on error
      signalRService.sendDraftChanged(activeChat.id, text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const guessMessageType = (file: File): 'image' | 'video' | 'voice' | 'file' => {
    const type = file.type || '';
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('video/')) return 'video';
    if (type.startsWith('audio/')) return 'voice';
    return 'file';
  };

  const handlePickFile = useCallback(() => {
    if (uploading || sending) return;
    fileInputRef.current?.click();
  }, [uploading, sending]);

  const scheduleDraftSend = useCallback(
    (chatId: string, text: string) => {
      if (draftDebounceRef.current) {
        window.clearTimeout(draftDebounceRef.current);
      }

      draftDebounceRef.current = window.setTimeout(() => {
        if (lastDraftRef.current === text) return;
        lastDraftRef.current = text;
        signalRService.sendDraftChanged(chatId, text);
      }, 200);
    },
    []
  );

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
    } catch (error) {
      console.error('Failed to upload/send file:', error);
      alert(t('chat.sendFileFailed'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
      setMessageText(`${next.id} `);
    }
  };

  const isGroup = activeChat ? isRealGroupChat(activeChat, user?.id) : false;

  const displayParticipant = activeChat
    ? getDirectDisplayParticipant(activeChat, user?.id)
    : undefined;

  const otherParticipant = activeChat
    ? getOtherRealParticipants(activeChat, user?.id)[0] || displayParticipant
    : undefined;

  const buildRollingTextFor = (senderId?: string, draftText?: string) => {
    if (!senderId) return '';
    const prefixLines = (value: string) =>
      value
        .split('\n')
        .map((line) => `\\> ${line}`)
        .join('\n');

    const parts = chatMessages
      .filter((msg) => msg.senderId === senderId && msg.messageType === 'text' && !msg.isDeleted)
      .map((msg) => prefixLines(msg.text || ''))
      .filter((text) => text.length > 0);

    if (draftText && draftText.trim().length > 0) {
      parts.push(prefixLines(draftText));
    }

    return parts.join('\n');
  };

  const getLatestRawTextFor = (senderId?: string) => {
    if (!senderId) return '';
    for (let i = chatMessages.length - 1; i >= 0; i -= 1) {
      const msg = chatMessages[i];
      if (msg.senderId !== senderId) continue;
      if (msg.messageType !== 'text' || msg.isDeleted) continue;
      return msg.text || '';
    }
    return '';
  };

  const getLatest2DContentFor = (senderId?: string, draftText?: string): { text: string; mediaUrls: string[] } => {
    if (!senderId) return { text: draftText || '', mediaUrls: [] };

    const text = buildRollingTextFor(senderId, draftText);

    // Collect all media URLs in chronological order (oldest first)
    const mediaUrls: string[] = [];
    for (let i = 0; i < mergedMessages.length; i += 1) {
      const msg = mergedMessages[i];
      if (msg.senderId !== senderId) continue;
      if (msg.isDeleted) continue;
      const content = (msg as any).content;
      const url = (msg as any).thumbnailUrl || (msg as any).mediaUrl || content?.thumbnailUrl || content?.mediaUrl || '';
      if (url) mediaUrls.push(url);
    }

    return { text, mediaUrls };
  };

  type MoodKey = 'neutral' | 'smile' | 'angry' | 'sad' | 'surprised' | 'thinking' | 'happy' | 'crying' | 'excited';

  const [leftMoodMap, setLeftMoodMap] = useState<Partial<Record<MoodKey, string>>>({});
  const [rightMoodMap, setRightMoodMap] = useState<Partial<Record<MoodKey, string>>>({});
  const [leftMood, setLeftMood] = useState<MoodKey | null>(null);
  const [rightMood, setRightMood] = useState<MoodKey | null>(null);
  const [leftMoodAt, setLeftMoodAt] = useState(0);
  const [rightMoodAt, setRightMoodAt] = useState(0);
  const [leftBroadcastAvatar, setLeftBroadcastAvatar] = useState<string>('');
  const moodCooldownMs = 5000;

  const otherDraft = draftMessages.find((d) => d.senderId === otherParticipant?.userId)?.text;
  const otherDraftClean = otherDraft?.replace(/\[mood:[^\]]+\]/g, '').trim() || undefined;
  const left2D = getLatest2DContentFor(otherParticipant?.userId, otherDraftClean);
  const right2D = getLatest2DContentFor(user?.id);
  const leftMoodText = otherDraft || getLatestRawTextFor(otherParticipant?.userId);
  const rightMoodText = messageText.trim().length > 0 ? messageText : getLatestRawTextFor(user?.id);

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
    // Tag format: [mood:smile:https://...avatarUrl...]
    const moodTagMatch = leftMoodText?.match(/\[mood:([^:\]]+):([^\]]*)\]/);
    const next = moodTagMatch ? toMoodKey(moodTagMatch[1]) : getMoodFromText(leftMoodText);
    if (!next) return;
    const now = Date.now();
    if (leftMood === null || now - leftMoodAt >= moodCooldownMs) {
      setLeftMood(next);
      setLeftMoodAt(now);
      if (moodTagMatch?.[2]) setLeftBroadcastAvatar(moodTagMatch[2]);
    }
  }, [leftMoodText, leftMood, leftMoodAt]);

  useEffect(() => {
    const next = getMoodFromText(rightMoodText);
    if (!next) return;
    const now = Date.now();
    if (rightMood === null || now - rightMoodAt >= moodCooldownMs) {
      setRightMood(next);
      setRightMoodAt(now);
    }
  }, [rightMoodText, rightMood, rightMoodAt]);

  // When our own mood changes, broadcast mood + the resolved avatar URL via draft
  useEffect(() => {
    if (!activeChat || !rightMood) return;
    if (lastBroadcastMoodRef.current === rightMood) return;
    lastBroadcastMoodRef.current = rightMood;
    const avatarUrl = rightMoodMap[rightMood] || '';
    const tag = `[mood:${rightMood}:${avatarUrl}]`;
    signalRService.sendDraftChanged(activeChat.id, tag);
  }, [rightMood, rightMoodMap, activeChat]);

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
    const avatarImageId = extractAvatarImageId(otherParticipant?.avatarUrl);
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
  }, [otherParticipant?.avatarUrl]);

  const leftAvatar = leftBroadcastAvatar || getAvatarForMood(leftMood, leftMoodMap, otherParticipant?.avatarUrl);
  const rightAvatar = getAvatarForMood(rightMood, rightMoodMap, user?.avatarUrl);

  const groupMembersCount = activeChat
    ? getRealParticipants(activeChat.participants).length
    : 0;

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
        ...sx,
      }}
    >
      {/* Header */}
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
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
              src={displayParticipant?.avatarUrl || activeChat.avatar}
              gender={displayParticipant?.gender}
              sx={{ width: 40, height: 40, mr: 2 }}
              fallbackText={displayParticipant?.displayName || activeChat.name}
              variant="rounded"
            />
          )}
          <BoxAny sx={{ flexGrow: 1, minWidth: 0, overflow: 'hidden' }}>
            <Typography variant="subtitle1" fontWeight="bold" noWrap>
              {activeChat.name}
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

          {activeChat.chatType === 'group' && user?.id && activeChat.adminIds?.includes(user.id) && (
            <IconButton edge="end" onClick={handleRenameGroup} title={t('chat.renameTitle')}>
              <EditIcon />
            </IconButton>
          )}

          {!isGroup && (
            <Tooltip title={isRoom2D ? t('chat.exit2d') : t('chat.enter2d')}>
              <span>
                <IconButton
                  edge="end"
                  size="small"
                  sx={{ p: 0.5 }}
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
              </span>
            </Tooltip>
          )}

          <Tooltip title={isRoom3D ? t('chat.exit3d') : t('chat.enter3d')}>
            <span>
              <IconButton
                edge="end"
                size="small"
                sx={{ p: 0.5 }}
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
            </span>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {/* Messages */}
      {isRoom3D ? (
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
      ) : isRoom2D ? (
        <ChatRoom2D
          leftParticipant={otherParticipant ? {
            displayName: otherParticipant.displayName,
            avatarUrl: leftAvatar,
            gender: otherParticipant.gender,
          } : null}
          rightParticipant={user ? {
            displayName: user.displayName,
            avatarUrl: rightAvatar,
            gender: user.gender,
          } : null}
          leftText={left2D.text}
          rightText={right2D.text}
          leftMediaUrls={left2D.mediaUrls}
          rightMediaUrls={right2D.mediaUrls}
          imageGroups={imageGroups}
          imageGroupIndexByUrl={imageGroupIndexByUrl}
        />
      ) : (
        <BoxAny
          sx={{
            flexGrow: 1,
            overflow: 'auto',
            px: '1px',
            py: 1.5,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          {loading && mergedMessages.length === 0 ? (
            <BoxAny sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <CircularProgress />
            </BoxAny>
          ) : mergedMessages.length === 0 ? (
            <BoxAny sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Typography color="text.secondary">{t('chat.noMessages')}</Typography>
            </BoxAny>
          ) : (
            mergedMessages.map((message, index) => {
              const prevMessage = index > 0 ? mergedMessages[index - 1] : null;
              const showAvatar = !prevMessage || prevMessage.senderId !== message.senderId;

              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isOwn={message.senderId === user?.id}
                  showAvatar={showAvatar}
                  imageGallery={imageGallery.urls}
                  imageIndex={imageGallery.indexById[message.id]}
                  imageGroups={imageGroups}
                  imageGroupIndex={imageGroupIndexByMessageId[message.id]}
                />
              );
            })
          )}
          <div ref={messagesEndRef} />
        </BoxAny>
      )}

      {/* Input */}
      <BoxAny
        sx={{
          p: 2,
          bgcolor: 'background.paper',
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleFileSelected}
        />
        <BoxAny sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
          <IconButton size="small" disabled>
            <EmojiIcon />
          </IconButton>
          <IconButton
            size="small"
            onClick={handlePickFile}
            disabled={uploading || sending}
            title={t('chat.attach')}
            aria-label={t('chat.attach')}
          >
            {uploading ? <CircularProgress size={18} /> : <AttachFileIcon />}
          </IconButton>
          <TextField
            inputRef={inputRef}
            fullWidth
            multiline
            maxRows={4}
            placeholder={t('chat.typeMessage')}
            value={messageText}
            onChange={(e) => {
              const nextValue = e.target.value;
              setMessageText(nextValue);
              if (activeChat) {
                scheduleDraftSend(activeChat.id, nextValue);
              }
            }}
            onKeyPress={handleKeyPress}
            onKeyDown={handleKeyDown}
            size="small"
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 3,
                bgcolor: 'grey.100',
              },
            }}
          />
          <Popper
            open={isCommandMode && commandSuggestions.length > 0}
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
                    onClick={() => setMessageText(`${c.id} `)}
                    sx={{ fontFamily: 'monospace' }}
                  />
                ))}
              </Stack>
            </Paper>
          </Popper>
          <IconButton
            color="primary"
            onClick={handleSendMessage}
            disabled={!messageText.trim() || sending || uploading}
          >
            <SendIcon />
          </IconButton>
        </BoxAny>
      </BoxAny>
    </BoxAny>
  );
};
