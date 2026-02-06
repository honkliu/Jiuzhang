import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { useLanguage } from '@/i18n/LanguageContext';
import { FiberManualRecord as FiberManualRecordIcon } from '@mui/icons-material';
import { Message } from '@/services/chat.service';
import { UserAvatar } from '@/components/Shared/UserAvatar';
import { format } from 'date-fns';

// Work around TS2590 (“union type too complex”) from MUI Box typings in some TS versions.
const BoxAny = Box as any;

const renderBoldItalic = (text: string, keyPrefix: string): React.ReactNode[] => {
  const parts: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;

    if (start > lastIndex) {
      parts.push(text.slice(lastIndex, start));
    }

    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={`${keyPrefix}-b-${start}-${end}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(<em key={`${keyPrefix}-i-${start}-${end}`}>{token.slice(1, -1)}</em>);
    } else {
      parts.push(token);
    }

    lastIndex = end;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
};

const renderInlineFormat = (text: string): React.ReactNode => {
  // Very small, safe formatter:
  // - [red]...[/red]
  // - **bold**
  // - *italic*
  // Everything else is rendered as plain text.
  const nodes: React.ReactNode[] = [];
  const redPattern = /\[red\]([\s\S]*?)\[\/red\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = redPattern.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;

    if (start > lastIndex) {
      nodes.push(...renderBoldItalic(text.slice(lastIndex, start), `t-${lastIndex}-${start}`));
    }

    const inner = match[1] ?? '';
    nodes.push(
      <span key={`red-${start}-${end}`} style={{ color: '#d32f2f', fontWeight: 600 }}>
        {renderBoldItalic(inner, `red-${start}-${end}`)}
      </span>
    );

    lastIndex = end;
  }

  if (lastIndex < text.length) {
    nodes.push(...renderBoldItalic(text.slice(lastIndex), `tail-${lastIndex}`));
  }

  return nodes;
};

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  showAvatar,
}) => {
  const { language, t } = useLanguage();
  const isAgent = message.senderId === 'user_ai_wa';
  const isDraft = message.id.startsWith('draft_');
  const [displayText, setDisplayText] = useState(message.text || '');
  const animRef = useRef<number | null>(null);
  const lastTextRef = useRef(message.text || '');

  useEffect(() => {
    const fullText = message.text || '';

    if (isOwn || isAgent || isDraft || message.messageType !== 'text') {
      setDisplayText(fullText);
      lastTextRef.current = fullText;
      if (animRef.current) {
        window.clearInterval(animRef.current);
        animRef.current = null;
      }
      return;
    }

    if (fullText === lastTextRef.current) {
      return;
    }

    lastTextRef.current = fullText;
    let index = 0;
    setDisplayText('');

    if (animRef.current) {
      window.clearInterval(animRef.current);
    }

    animRef.current = window.setInterval(() => {
      index = Math.min(fullText.length, index + 2);
      setDisplayText(fullText.slice(0, index));
      if (index >= fullText.length && animRef.current) {
        window.clearInterval(animRef.current);
        animRef.current = null;
      }
    }, 15);

    return () => {
      if (animRef.current) {
        window.clearInterval(animRef.current);
        animRef.current = null;
      }
    };
  }, [isOwn, isAgent, message.id, message.messageType, message.text]);
  const formatTime = (timestamp: string) => {
    try {
      return format(new Date(timestamp), 'HH:mm');
    } catch {
      return '';
    }
  };

  return (
    <BoxAny
      sx={{
        display: 'flex',
        flexDirection: isOwn ? 'row-reverse' : 'row',
        justifyContent: isOwn ? 'flex-end' : 'flex-start',
        alignItems: 'flex-start', // Adjusted alignment to top-align the avatar
        gap: 1,
        mb: 0.5,
        width: '100%',
      }}
    >
      {/* Avatar */}
      <BoxAny sx={{ width: 56, flexShrink: 0, textAlign: 'center' }}>
        {showAvatar && (
          <UserAvatar
            src={message.senderAvatar}
            gender={message.senderGender}
            fallbackText={message.senderName}
            variant="rounded"
            sx={{ width: 40, height: 40, mx: 'auto' }}
          />
        )}
        {showAvatar && (
          <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
            {language === 'zh' && message.senderName === 'Wa' ? t('Wa') : message.senderName}
          </Typography>
        )}
      </BoxAny>

      {/* Message Bubble */}
      <Paper
        elevation={0}
        sx={{
          maxWidth: '70%',
          px: 2,
          py: 1,
          bgcolor: isOwn ? 'rgba(7, 193, 96, 0.9)' : 'rgba(255, 255, 255, 0.6)',
          color: isOwn ? 'primary.contrastText' : 'text.primary',
          borderTopLeftRadius: !isOwn && !showAvatar ? 4 : undefined,
          borderTopRightRadius: isOwn && !showAvatar ? 4 : undefined,
          ml: isOwn ? 'auto' : 0,
          border: '1px solid rgba(255,255,255,0.5)',
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.12)',
          backdropFilter: 'blur(12px) saturate(160%)',
          WebkitBackdropFilter: 'blur(12px) saturate(160%)',
        }}
      >
        {/* Message content */}
        {message.isDeleted ? (
          <Typography
            variant="body2"
            sx={{ fontStyle: 'italic', opacity: 0.7 }}
          >
            This message was deleted
          </Typography>
        ) : message.messageType === 'text' ? (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {renderInlineFormat(isOwn || isAgent || isDraft ? message.text || '' : displayText)}
          </Typography>
        ) : message.messageType === 'image' ? (
          <BoxAny
            component="img"
            src={message.mediaUrl}
            alt="Image"
            sx={{
              maxWidth: '100%',
              maxHeight: 300,
              borderRadius: 1,
            }}
          />
        ) : message.messageType === 'video' ? (
          <BoxAny
            component="video"
            src={message.mediaUrl}
            controls
            sx={{ maxWidth: '100%', maxHeight: 300, borderRadius: 1 }}
          />
        ) : message.messageType === 'voice' ? (
          <BoxAny component="audio" src={message.mediaUrl} controls />
        ) : message.messageType === 'file' ? (
          <Typography variant="body2">
            <a href={message.mediaUrl} target="_blank" rel="noreferrer">
              {message.fileName || 'Download file'}
            </a>
          </Typography>
        ) : (
          <Typography variant="body2">[{message.messageType}]</Typography>
        )}

        {/* Time and status */}
        <BoxAny
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 0.5,
            mt: 0.5,
          }}
        >
          <Typography variant="caption" sx={{ opacity: 0.7, fontSize: '0.7rem' }}>
            {formatTime(message.timestamp)}
          </Typography>
          {isOwn && !isAgent && !isDraft && message.readBy.length === 0 && (
            <FiberManualRecordIcon
              sx={{ fontSize: 10, color: 'error.main' }}
              titleAccess="Unread"
            />
          )}
        </BoxAny>
      </Paper>
    </BoxAny>
  );
};
