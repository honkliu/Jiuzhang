import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Paper, useMediaQuery, useTheme } from '@mui/material';
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
import { useSettings } from '@/settings/SettingsContext';
import { VoiceMessageBubble } from '@/components/Chat/VoiceMessageBubble';

// Work around TS2590 ("union type too complex") from MUI Box typings in some TS versions.
const BoxAny = Box as any;
const chatImageCacheBust = Date.now().toString(36);

const withChatImageCacheBust = (url: string) => {
  if (!url.startsWith('/uploads/')) {
    return url;
  }

  return `${url}${url.includes('?') ? '&' : '?'}v=${chatImageCacheBust}`;
};

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
const redTagPattern = /\[red\]([\s\S]*?)\[\/red\]/gi;

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

const preserveBoundaryWhitespace = (value: string) => value.replace(/ /g, '\u00A0').replace(/\t/g, '\u00A0\u00A0\u00A0\u00A0');

const renderMarkdownFragment = (key: string, text: string, sx?: Record<string, unknown>) => {
  const leadingWhitespace = text.match(/^\s+/)?.[0] ?? '';
  const trailingWhitespace = text.match(/\s+$/)?.[0] ?? '';
  const startIndex = leadingWhitespace.length;
  const endIndex = trailingWhitespace.length > 0 ? text.length - trailingWhitespace.length : text.length;
  const coreText = text.slice(startIndex, endIndex);

  return (
    <BoxAny
      key={key}
      component="span"
      sx={{ whiteSpace: 'break-spaces', '& p': { margin: 0, display: 'inline' }, ...(sx || {}) }}
    >
      {leadingWhitespace ? preserveBoundaryWhitespace(leadingWhitespace) : null}
      {coreText ? (
        <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
          {escapePipesInMathForGfm(coreText)}
        </ReactMarkdown>
      ) : null}
      {trailingWhitespace ? preserveBoundaryWhitespace(trailingWhitespace) : null}
    </BoxAny>
  );
};

const renderMarkdownWithRedTags = (input: string) => {
  const matches = Array.from(input.matchAll(redTagPattern));
  if (matches.length === 0) {
    return (
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
        {escapePipesInMathForGfm(input)}
      </ReactMarkdown>
    );
  }

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;

  matches.forEach((match, index) => {
    const matchStart = match.index ?? 0;
    const matchEnd = matchStart + match[0].length;
    const innerText = match[1] ?? '';

    if (matchStart > lastIndex) {
      const plainText = input.slice(lastIndex, matchStart);
      if (plainText) {
        nodes.push(renderMarkdownFragment(`plain-${index}-${matchStart}`, plainText));
      }
    }

    nodes.push(renderMarkdownFragment(`red-${index}-${matchStart}`, innerText, { color: 'error.main', '& a': { color: 'inherit' } }));

    lastIndex = matchEnd;
  });

  if (lastIndex < input.length) {
    const trailingText = input.slice(lastIndex);
    if (trailingText) {
      nodes.push(renderMarkdownFragment(`plain-tail-${lastIndex}`, trailingText));
    }
  }

  return nodes;
};

/** Detect if text contains markdown formatting */
const hasMarkdownSyntax = (text: string): boolean =>
  /^#{1,6}\s/m.test(text) ||          // headings
  /^[-*+]\s/m.test(text) ||            // unordered list
  /^\d+\.\s/m.test(text) ||            // ordered list
  /^```/m.test(text) ||                // code block
  /\*\*.+\*\*/m.test(text) ||          // bold
  /^>/m.test(text) ||                  // blockquote
  /\|.+\|.+\|/m.test(text);           // table

const plainTextSx = {
  whiteSpace: 'pre-wrap' as const,
  '& .katex-display': { margin: '0.5em 0', overflowX: 'auto', overflowY: 'hidden' },
  '& .katex': { fontSize: '1.1em' },
  '& table': { width: '100%', borderCollapse: 'collapse', margin: '8px 0' },
  '& th, & td': { border: '1px solid rgba(0,0,0,0.1)', padding: '4px 8px', textAlign: 'left' },
  '& th': { backgroundColor: 'rgba(0,0,0,0.03)', fontWeight: 600 },
  '& code': { backgroundColor: 'rgba(0,0,0,0.05)', padding: '2px 4px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.9em' },
  '& pre': { backgroundColor: 'rgba(0,0,0,0.05)', padding: '8px 12px', borderRadius: '4px', overflowX: 'auto', margin: '8px 0' },
  '& pre code': { padding: 0, backgroundColor: 'transparent' },
};

const markdownSx = {
  whiteSpace: 'normal' as const,
  lineHeight: 1.6,
  '& .katex-display': { margin: '0.5em 0', overflowX: 'auto', overflowY: 'hidden' },
  '& .katex': { fontSize: '1.1em' },
  '& p': { margin: '0.4em 0' },
  '& p:first-of-type': { marginTop: 0 },
  '& p:last-of-type': { marginBottom: 0 },
  '& h1, & h2, & h3, & h4, & h5, & h6': { margin: '0.6em 0 0.3em' },
  '& h1': { fontSize: '1.3em' },
  '& h2': { fontSize: '1.15em' },
  '& h3': { fontSize: '1.05em' },
  '& ul, & ol': { paddingLeft: '1.5em', margin: '0.3em 0' },
  '& li': { margin: '0.15em 0' },
  '& li > p': { margin: 0, display: 'inline' },
  '& blockquote': { margin: '0.4em 0', paddingLeft: '0.75em', borderLeft: '3px solid rgba(0,0,0,0.15)', color: 'inherit' },
  '& table': { width: '100%', borderCollapse: 'collapse', margin: '0.5em 0' },
  '& th, & td': { border: '1px solid rgba(0,0,0,0.1)', padding: '4px 8px', textAlign: 'left' },
  '& th': { backgroundColor: 'rgba(0,0,0,0.03)', fontWeight: 600 },
  '& code': { backgroundColor: 'rgba(0,0,0,0.05)', padding: '2px 4px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.9em' },
  '& pre': { backgroundColor: 'rgba(0,0,0,0.05)', padding: '8px 12px', borderRadius: '4px', overflowX: 'auto', margin: '0.5em 0' },
  '& pre code': { padding: 0, backgroundColor: 'transparent' },
  '& hr': { border: 'none', borderTop: '1px solid rgba(0,0,0,0.1)', margin: '0.5em 0' },
};

/**
 * Match `@Name` against the list of chat participants. Names can contain
 * spaces, so we sort longer names first to prefer the longest match — this
 * keeps `@Bob` from eating part of `@Bob Smith`. Mentions must be preceded
 * by start-of-string or whitespace to avoid matching inside emails.
 */
const findMentionAt = (text: string, startIdx: number, names: string[]): { name: string; end: number } | null => {
  if (text[startIdx] !== '@') return null;
  if (startIdx > 0) {
    const prev = text[startIdx - 1];
    if (prev !== ' ' && prev !== '\n' && prev !== '\t') return null;
  }
  const after = text.slice(startIdx + 1);
  const sorted = [...names].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    if (after.startsWith(name)) {
      const charAfter = after[name.length];
      // Mention must end at a non-name character to avoid matching prefixes
      // (e.g. don't let "Bob" match inside "Bobby").
      if (
        charAfter === undefined
        || charAfter === ' '
        || charAfter === '\n'
        || charAfter === '\t'
        || /[.,!?;:'"，。！？；：]/.test(charAfter)
      ) {
        return { name, end: startIdx + 1 + name.length };
      }
    }
  }
  return null;
};

const mentionStyleSx = {
  // Red text + underline, no extra weight. Red has enough contrast against
  // both the green own-bubble and the white incoming-bubble to stay legible.
  color: 'error.main',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
  '& a': { color: 'inherit' },
};

/**
 * Split text into [plain, mention, plain, mention, ...] segments. Plain
 * segments still go through markdown + redTag rendering; mention segments
 * are rendered with the mention style and bypass markdown (the `@` would
 * otherwise be misread).
 *
 * Each plain segment's wrapper forces its inner `<p>` from ReactMarkdown to
 * `display: inline` — otherwise splitting a single line into multiple
 * fragments produces visible line breaks where the mention sits.
 */
const inlinePSx = { '& p': { margin: 0, display: 'inline' } };

const renderTextWithMentions = (text: string, names: string[] | undefined): React.ReactNode => {
  if (!names || names.length === 0) {
    return renderMarkdownWithRedTags(text);
  }

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] === '@') {
      const hit = findMentionAt(text, i, names);
      if (hit) {
        if (i > cursor) {
          const before = text.slice(cursor, i);
          nodes.push(
            <BoxAny key={`pre-${cursor}`} component="span" sx={inlinePSx}>
              {renderMarkdownWithRedTags(before)}
            </BoxAny>
          );
        }
        nodes.push(
          <BoxAny key={`men-${i}`} component="span" sx={mentionStyleSx}>
            @{hit.name}
          </BoxAny>
        );
        cursor = hit.end;
        i = hit.end;
        continue;
      }
    }
    i += 1;
  }
  if (cursor < text.length) {
    const tail = text.slice(cursor);
    nodes.push(
      <BoxAny key={`tail-${cursor}`} component="span" sx={inlinePSx}>
        {renderMarkdownWithRedTags(tail)}
      </BoxAny>
    );
  }
  return nodes;
};

const MarkdownOrPlainText: React.FC<{ text: string; mentionableNames?: string[] }> = ({ text, mentionableNames }) => {
  const isMd = hasMarkdownSyntax(text);
  const hasMention = mentionableNames && mentionableNames.length > 0 && text.includes('@');
  return (
    <BoxAny sx={isMd ? markdownSx : plainTextSx}>
      {hasMention
        ? renderTextWithMentions(text, mentionableNames)
        : renderMarkdownWithRedTags(text)}
    </BoxAny>
  );
};

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  timeSeparator?: string | null;
  imageGallery?: string[];
  imageIndex?: number;
  imageGroups?: Array<{ sourceUrl: string; messageId: string; canEdit: boolean }>;
  imageGroupIndex?: number;
  /** Display names of chat participants — used to highlight `@Name` mentions in text. */
  mentionableNames?: string[];
}

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({
  message,
  isOwn,
  showAvatar,
  timeSeparator,
  imageGallery,
  imageIndex,
  imageGroups,
  imageGroupIndex,
  mentionableNames,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isHoverCapable = useMediaQuery('(hover: hover) and (pointer: fine)');
  const { t } = useLanguage();
  const { formatTime: formatTimeWithZone } = useSettings();
  const isAgent = message.senderId === 'user_ai_wa';
  const isDraft = message.id.startsWith('draft_');
  const [displayText, setDisplayText] = useState(message.text || '');
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const animRef = useRef<number | null>(null);
  const lastTextRef = useRef(message.text || '');

  const rawText = isOwn || isAgent || isDraft ? message.text || '' : displayText;
  const renderText = rawText;

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
  const formatTime = (timestamp: string) => formatTimeWithZone(timestamp, {
    hour: '2-digit',
    minute: '2-digit',
  });

  const imageUrl =
    message.mediaUrl ||
    message.thumbnailUrl ||
    (message as any)?.content?.mediaUrl ||
    (message as any)?.content?.thumbnailUrl ||
    '';
  const displayedImageUrl = withChatImageCacheBust(imageUrl);

  if (message.messageType === 'system' || message.senderId === '__system__') {
    const isMultiline = (message.text || '').includes('\n');

    return (
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          textAlign: isMultiline ? 'left' : 'center',
          color: 'text.secondary',
          fontSize: '0.72rem',
          py: 1,
          mx: 'auto',
          maxWidth: isMultiline ? '76%' : '100%',
          opacity: 0.7,
          whiteSpace: 'pre-line',
        }}
      >
        {message.text}
      </Typography>
    );
  }

  return (
    <>
      {timeSeparator && (
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            textAlign: 'center',
            color: 'text.secondary',
            fontSize: '0.72rem',
            py: 1,
            opacity: 0.7,
          }}
        >
          {timeSeparator}
        </Typography>
      )}
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
            src={message.senderAvatar || (message.senderAvatarSourceId ? `/api/avatar/image/${message.senderAvatarSourceId}` : '')}
            gender={message.senderGender}
            fallbackText={message.senderName}
            variant="rounded"
            previewMode={isHoverCapable ? 'hover' : 'tap'}
            closePreviewOnClick
            sx={{ width: 40, height: 40, mx: 'auto' }}
          />
        )}
        {showAvatar && (
          <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
            {isAgent ? t('Wa') : message.senderName}
          </Typography>
        )}
      </BoxAny>

      {/* Message Bubble */}
      <Paper
        elevation={0}
        sx={{
          maxWidth: '76%',
          px: message.messageType === 'image' ? 0 : 1.5,
          py: message.messageType === 'image' ? 0 : 0.75,
          position: 'relative',
            overflow: message.messageType === 'image' ? 'hidden' : 'visible',
          bgcolor: message.messageType === 'image'
            ? 'transparent'
            : (isOwn ? '#07c160' : '#ffffff'),
          color: 'text.primary',
            borderRadius: '4px',
          ml: isOwn ? 'auto' : 0,
          border: message.messageType === 'image'
            ? 'none'
            : (isOwn ? 'none' : '1px solid #d9d9d9'),
          boxShadow: message.messageType === 'image'
            ? 'none'
            : '0 1px 2px rgba(0,0,0,0.10)',
          ...(message.messageType !== 'image' ? {
            '&::before': {
              content: '""',
              position: 'absolute',
              top: '12px',
              width: 0,
              height: 0,
              ...(isOwn ? {
                right: '-5px',
                borderWidth: '5px 0 5px 5px',
                borderStyle: 'solid',
                borderColor: 'transparent transparent transparent #07c160',
              } : {
                left: '-6px',
                borderWidth: '5px 6px 5px 0',
                borderStyle: 'solid',
                borderColor: 'transparent #d9d9d9 transparent transparent',
              }),
            },
            ...(!isOwn ? {
              '&::after': {
                content: '""',
                position: 'absolute',
                top: '12px',
                left: '-4px',
                width: 0,
                height: 0,
                borderWidth: '5px 5px 5px 0',
                borderStyle: 'solid',
                borderColor: 'transparent #ffffff transparent transparent',
              },
            } : {}),
          } : {}),
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
          <MarkdownOrPlainText text={renderText} mentionableNames={mentionableNames} />
        ) : message.messageType === 'image' ? (
          <ImageHoverPreview
            src={displayedImageUrl}
            alt={t('chat.message.image')}
            openOnHover={isHoverCapable}
            openOnLongPress={!isHoverCapable}
            openOnTap={false}
          >
            {(previewProps) => (
              <BoxAny
                {...previewProps}
                component="img"
                src={displayedImageUrl}
                alt={t('chat.message.image')}
                tabIndex={0}
                onContextMenu={(event: React.MouseEvent<HTMLElement>) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  setIsLightboxOpen(true);
                }}
                sx={{
                  maxWidth: '100%',
                  maxHeight: 300,
                  borderRadius: '4px',
                  WebkitTouchCallout: 'none',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                }}
              />
            )}
          </ImageHoverPreview>
        ) : message.messageType === 'video' ? (
          <BoxAny
            component="video"
            src={message.mediaUrl}
            controls
            sx={{ maxWidth: '100%', maxHeight: 300, borderRadius: 0 }}
          />
        ) : message.messageType === 'voice' ? (
          <VoiceMessageBubble
            url={message.mediaUrl || ''}
            duration={message.duration}
            align={isOwn ? 'right' : 'left'}
            isMobile={isMobile}
          />
        ) : message.messageType === 'file' ? (
          <Typography variant="body2">
            <a href={message.mediaUrl} target="_blank" rel="noreferrer">
              {message.fileName || t('chat.message.download')}
            </a>
          </Typography>
        ) : (
          <Typography variant="body2">[{message.messageType}]</Typography>
        )}

        {/* Read status */}
        {isOwn && !isAgent && !isDraft && message.readBy.length === 0 && (
          <BoxAny
            sx={{
              display: 'flex',
              justifyContent: 'flex-end',
              mt: 0.25,
            }}
          >
            <FiberManualRecordIcon
              sx={{ fontSize: 10, color: 'error.main' }}
              titleAccess={t('chat.message.unread')}
            />
          </BoxAny>
        )}
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
