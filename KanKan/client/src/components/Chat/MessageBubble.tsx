import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Paper } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useLanguage } from '@/i18n/LanguageContext';
import { FiberManualRecord as FiberManualRecordIcon } from '@mui/icons-material';
import { Message } from '@/services/chat.service';
import { UserAvatar } from '@/components/Shared/UserAvatar';
import { ImageHoverPreview } from '@/components/Shared/ImageHoverPreview';
import { ImageLightbox } from '@/components/Shared/ImageLightbox';
import { format } from 'date-fns';

// Work around TS2590 ("union type too complex") from MUI Box typings in some TS versions.
const BoxAny = Box as any;

const restorePipesInMath = () => {
  return (tree: any) => {
    const walk = (node: any) => {
      if (!node) return;
      if (node.type === 'inlineMath' || node.type === 'math') {
        if (typeof node.value === 'string') {
          node.value = node.value.replace(/\\\|/g, '|');
        }
      }
      if (Array.isArray(node.children)) {
        node.children.forEach(walk);
      }
    };

    walk(tree);
  };
};

const remarkPlugins = [remarkMath, remarkGfm, restorePipesInMath];
const rehypePlugins = [rehypeKatex];

const escapePipesInMathForGfm = (input: string): string => {
  let out = '';
  let i = 0;
  let inMath = false;
  let mathDelim: '$' | '$$' = '$';

  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];

    if (!inMath) {
      if (ch === '\\' && next === '$') {
        out += input.slice(i, i + 2);
        i += 2;
        continue;
      }

      if (ch === '$') {
        if (next === '$') {
          inMath = true;
          mathDelim = '$$';
          out += '$$';
          i += 2;
          continue;
        }

        inMath = true;
        mathDelim = '$';
        out += '$';
        i += 1;
        continue;
      }

      out += ch;
      i += 1;
      continue;
    }

    if (ch === '\\' && next === '$') {
      out += input.slice(i, i + 2);
      i += 2;
      continue;
    }

    if (mathDelim === '$$' && ch === '$' && next === '$') {
      inMath = false;
      out += '$$';
      i += 2;
      continue;
    }

    if (mathDelim === '$' && ch === '$') {
      inMath = false;
      out += '$';
      i += 1;
      continue;
    }

    if (ch === '|') {
      // Escape pipes inside math so GFM tables keep their column structure.
      out += '\\|';
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
};

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  imageGallery?: string[];
  imageIndex?: number;
  imageGroups?: Array<{ sourceUrl: string; messageId: string; canEdit: boolean }>;
  imageGroupIndex?: number;
}

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({
  message,
  isOwn,
  showAvatar,
  imageGallery,
  imageIndex,
  imageGroups,
  imageGroupIndex,
}) => {
  const { language, t } = useLanguage();
  const isAgent = message.senderId === 'user_ai_wa';
  const isDraft = message.id.startsWith('draft_');
  const [displayText, setDisplayText] = useState(message.text || '');
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const animRef = useRef<number | null>(null);
  const lastTextRef = useRef(message.text || '');

  const rawText = isOwn || isAgent || isDraft ? message.text || '' : displayText;
  const renderText = escapePipesInMathForGfm(rawText);

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

  const imageUrl =
    message.mediaUrl ||
    message.thumbnailUrl ||
    (message as any)?.content?.mediaUrl ||
    (message as any)?.content?.thumbnailUrl ||
    '';

  return (
    <>
      <BoxAny
        sx={{
          display: 'flex',
          flexDirection: isOwn ? 'row-reverse' : 'row',
          justifyContent: isOwn ? 'flex-end' : 'flex-start',
          alignItems: 'flex-start', // Adjusted alignment to top-align the avatar
          gap: 0.5,
          mb: 0.5,
          width: '100%',
          mx: -0.5,
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
          maxWidth: '76%',
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
            {t('chat.message.deleted')}
          </Typography>
        ) : message.messageType === 'text' ? (
          <BoxAny
            sx={{
              whiteSpace: 'pre-wrap',
              '& .katex-display': {
                margin: '0.5em 0',
                overflowX: 'auto',
                overflowY: 'hidden',
              },
              '& .katex': {
                fontSize: '1.1em',
              },
              '& table': {
                width: '100%',
                borderCollapse: 'collapse',
                margin: '8px 0',
              },
              '& th, & td': {
                border: '1px solid rgba(0,0,0,0.1)',
                padding: '4px 8px',
                textAlign: 'left',
              },
              '& th': {
                backgroundColor: 'rgba(0,0,0,0.03)',
                fontWeight: 600,
              },
              '& code': {
                backgroundColor: 'rgba(0, 0, 0, 0.05)',
                padding: '2px 4px',
                borderRadius: '3px',
                fontFamily: 'monospace',
                fontSize: '0.9em',
              },
              '& pre': {
                backgroundColor: 'rgba(0, 0, 0, 0.05)',
                padding: '8px 12px',
                borderRadius: '4px',
                overflowX: 'auto',
                margin: '8px 0',
              },
              '& pre code': {
                padding: 0,
                backgroundColor: 'transparent',
              },
            }}
          >
            <ReactMarkdown
              remarkPlugins={remarkPlugins}
              rehypePlugins={rehypePlugins}
            >
              {renderText}
            </ReactMarkdown>
          </BoxAny>
        ) : message.messageType === 'image' ? (
          <ImageHoverPreview
            src={imageUrl}
            alt={t('chat.message.image')}
            onPreviewClick={() => setIsLightboxOpen(true)}
          >
            {(previewProps) => (
              <BoxAny
                {...previewProps}
                component="img"
                src={imageUrl}
                alt={t('chat.message.image')}
                tabIndex={0}
                onClick={(event: React.MouseEvent<HTMLElement>) => {
                  previewProps.onClick?.(event);
                  setIsLightboxOpen(true);
                }}
                sx={{
                  maxWidth: '100%',
                  maxHeight: 300,
                  borderRadius: 1,
                }}
              />
            )}
          </ImageHoverPreview>
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
              {message.fileName || t('chat.message.download')}
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
              titleAccess={t('chat.message.unread')}
            />
          )}
        </BoxAny>
      </Paper>
    </BoxAny>
        {message.messageType === 'image' && imageUrl ? (
          <ImageLightbox
            images={imageGallery && imageGallery.length > 0 ? imageGallery : [imageUrl]}
            initialIndex={
              imageGallery && imageGallery.length > 0 && typeof imageIndex === 'number'
                ? Math.min(Math.max(imageIndex, 0), imageGallery.length - 1)
                : 0
            }
            groups={imageGroups}
            initialGroupIndex={typeof imageGroupIndex === 'number' ? imageGroupIndex : undefined}
            open={isLightboxOpen}
            onClose={() => setIsLightboxOpen(false)}
          />
        ) : null}
    </>
  );
});
