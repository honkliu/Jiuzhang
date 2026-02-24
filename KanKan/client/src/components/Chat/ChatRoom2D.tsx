import React, { useRef, useState } from 'react';
import { Box, Paper, useMediaQuery, useTheme } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { UserAvatar } from '@/components/Shared/UserAvatar';
import { ImageLightbox } from '@/components/Shared/ImageLightbox';
import { ImageHoverPreview } from '@/components/Shared/ImageHoverPreview';

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

interface ParticipantInfo {
  displayName?: string;
  avatarUrl?: string;
  gender?: string;
}

interface ChatRoom2DProps {
  leftParticipant: ParticipantInfo | null;
  rightParticipant: ParticipantInfo | null;
  leftText?: string;
  rightText?: string;
  leftMediaUrls?: string[];
  rightMediaUrls?: string[];
  imageGroups?: Array<{ sourceUrl: string; messageId: string; canEdit: boolean }>;
  imageGroupIndexByUrl?: Record<string, number>;
}

export const ChatRoom2D: React.FC<ChatRoom2DProps> = ({
  leftParticipant,
  rightParticipant,
  leftText,
  rightText,
  leftMediaUrls,
  rightMediaUrls,
  imageGroups,
  imageGroupIndexByUrl,
}) => {
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number; groupIndex?: number } | null>(null);
  const imageClickTimerRef = useRef<number | null>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Preserve current proportions across screen sizes
  // Desktop: bubble 504×315, avatar 282×282, image strip 60px
  // Mobile: stack vertically with more breathing room
  const bubbleW = isMobile ? '92vw' : 520;
  const bubbleH = isMobile ? '44vw' : 320;  // ratio ~2.1:1
  const avatarSize = isMobile ? '36vw' : 220;
  const imgStripW = isMobile ? 56 : 110;

  const textStyle = {
    whiteSpace: 'pre-wrap',
    lineHeight: 1.6,
    fontSize: isMobile ? '0.9rem' : '1rem',
    fontFamily: "'STKaiti', 'KaiTi', 'STSong', 'SimSun', 'Noto Serif SC', serif",
  };

  const renderBubble = (text?: string, mediaUrls?: string[], align: 'left' | 'right' = 'left') => {
    const hasMedia = mediaUrls && mediaUrls.length > 0;
    if (!text && !hasMedia) return null;
    return (
      <Paper
        elevation={0}
        sx={{
          width: bubbleW,
          height: bubbleH,
          pl: isMobile ? 1.5 : 2.5,
          pr: isMobile ? 2 : 3.5,
          py: isMobile ? 1 : 1.5,
          bgcolor: align === 'right' ? 'rgba(23, 76, 70, 0.95)' : 'rgba(251, 243, 227, 0.96)',
          color: align === 'right' ? 'rgba(240, 250, 248, 0.95)' : 'rgba(50, 36, 24, 0.95)',
          border: '1px solid rgba(116, 84, 50, 0.6)',
          boxShadow: '0 18px 40px rgba(46, 30, 16, 0.3)',
          borderRadius: 2,
          alignSelf: align === 'right' ? 'flex-end' : 'flex-start',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'flex-end',
          backgroundImage:
            align === 'right'
              ? 'linear-gradient(180deg, rgba(15, 62, 57, 0.6), rgba(23, 76, 70, 0.95))'
              : 'linear-gradient(180deg, rgba(255, 250, 240, 0.9), rgba(238, 220, 188, 0.95))',
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: 8,
            border: '1px solid rgba(152, 112, 68, 0.35)',
            borderRadius: 1.5,
            pointerEvents: 'none',
          },
          '&::before': {
            content: '""',
            position: 'absolute',
            bottom: 12,
            width: 14,
            height: 14,
            transform: 'rotate(45deg)',
            backgroundColor: align === 'right' ? 'rgba(28, 92, 84, 0.9)' : 'rgba(248, 241, 226, 0.92)',
            borderLeft: align === 'right' ? 'none' : '1px solid rgba(120, 94, 62, 0.5)',
            borderBottom: align === 'right' ? 'none' : '1px solid rgba(120, 94, 62, 0.5)',
            borderRight: align === 'right' ? '1px solid rgba(120, 94, 62, 0.5)' : 'none',
            borderTop: align === 'right' ? '1px solid rgba(120, 94, 62, 0.5)' : 'none',
            right: align === 'right' ? 18 : 'auto',
            left: align === 'left' ? 18 : 'auto',
          },
        }}
      >
        {/* Text area — fills remaining width */}
        {text && (
          <BoxAny
            sx={{
              position: 'relative',
              zIndex: 1,
              flex: 1,
              overflow: 'hidden',
              ...textStyle,
              '& p': { margin: 0 },
              '& blockquote': {
                margin: 0,
                paddingLeft: '0.75em',
                borderLeft: '2px solid rgba(116, 84, 50, 0.45)',
                color: 'inherit',
              },
              '& .katex-display': {
                margin: '0.5em 0',
                overflowX: 'auto',
                overflowY: 'hidden',
              },
              '& .katex': { fontSize: '1.05em' },
              '& table': { width: '100%', borderCollapse: 'collapse', margin: '8px 0' },
              '& th, & td': { border: '1px solid rgba(0,0,0,0.12)', padding: '4px 8px', textAlign: 'left' },
              '& th': { backgroundColor: 'rgba(0,0,0,0.03)', fontWeight: 600 },
              '& code': { backgroundColor: 'rgba(0,0,0,0.06)', padding: '2px 4px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.9em' },
              '& pre': { backgroundColor: 'rgba(0,0,0,0.06)', padding: '8px 12px', borderRadius: '4px', overflowX: 'auto', margin: '8px 0' },
              '& pre code': { padding: 0, backgroundColor: 'transparent' },
            }}
          >
            <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
              {escapePipesInMathForGfm(text)}
            </ReactMarkdown>
          </BoxAny>
        )}

        {/* Image strip — 60px wide, newest at bottom, older images scroll off top */}
        {hasMedia && (
          <BoxAny
            sx={{
              position: 'relative',
              zIndex: 1,
              width: imgStripW,
              flexShrink: 0,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              overflow: 'hidden',
              gap: 0.5,
              pl: text ? 0.5 : 0,
              pr: 0.5,
            }}
          >
            {mediaUrls.map((url, i) => (
              <ImageHoverPreview
                key={i}
                src={url}
                alt="Chat media"
                openOnHover={false}
                openOnLongPress={false}
                openOnDoubleClick
                closeOnTriggerClickWhenOpen
              >
                {(previewProps) => (
                  <BoxAny
                    {...previewProps}
                    component="img"
                    src={url}
                    alt="Chat media"
                    onClick={(event: React.MouseEvent<HTMLElement>) => {
                      previewProps.onClick?.(event);
                      if (event.defaultPrevented) return;
                      if (imageClickTimerRef.current) {
                        window.clearTimeout(imageClickTimerRef.current);
                      }
                      imageClickTimerRef.current = window.setTimeout(() => {
                        setLightbox({
                          images: mediaUrls,
                          index: i,
                          groupIndex: imageGroupIndexByUrl?.[url],
                        });
                        imageClickTimerRef.current = null;
                      }, 220);
                    }}
                    onDoubleClick={(event: React.MouseEvent<HTMLElement>) => {
                      if (imageClickTimerRef.current) {
                        window.clearTimeout(imageClickTimerRef.current);
                        imageClickTimerRef.current = null;
                      }
                      previewProps.onDoubleClick?.(event);
                    }}
                    sx={{
                      width: '100%',
                      flexShrink: 0,
                      aspectRatio: 'auto',
                      objectFit: 'cover',
                      borderRadius: 1,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                      cursor: 'pointer',
                      transition: 'opacity 0.15s',
                      '&:hover': { opacity: 0.85 },
                    }}
                  />
                )}
              </ImageHoverPreview>
            ))}
          </BoxAny>
        )}
      </Paper>
    );
  };

  return (
    <>
      <BoxAny
        sx={{
          flexGrow: 1,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'center' : 'stretch',
          justifyContent: isMobile ? 'space-between' : 'space-between',
          px: isMobile ? 1.25 : 3.5,
          py: isMobile ? 1.75 : 3.25,
          background:
            'linear-gradient(180deg, rgba(236, 219, 191, 0.98) 0%, rgba(205, 173, 133, 0.98) 60%, rgba(178, 142, 102, 0.98) 100%)',
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.22), transparent 52%), radial-gradient(circle at 80% 30%, rgba(255,255,255,0.16), transparent 55%), radial-gradient(circle at 50% 80%, rgba(0,0,0,0.25), transparent 45%), repeating-linear-gradient(45deg, rgba(120, 90, 55, 0.08) 0px, rgba(120, 90, 55, 0.08) 3px, rgba(255,255,255,0.04) 3px, rgba(255,255,255,0.04) 6px)',
            pointerEvents: 'none',
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: 14,
            border: '1px solid rgba(105, 78, 46, 0.45)',
            borderRadius: 3,
            pointerEvents: 'none',
          },
        }}
      >
        <BoxAny
          sx={{
            width: isMobile ? '100%' : '48%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: isMobile ? 'center' : 'flex-start',
            justifyContent: 'flex-end',
            gap: isMobile ? 0.75 : 1.5,
            position: 'relative',
            zIndex: 1,
            pb: isMobile ? 0.5 : 2.5,
          }}
        >
          <UserAvatar
            src={leftParticipant?.avatarUrl || ''}
            gender={leftParticipant?.gender}
            fallbackText={leftParticipant?.displayName}
            variant="rounded"
            previewMode="doubleClick"
            closePreviewOnClick
            sx={{
              width: avatarSize,
              height: avatarSize,
              border: 'none',
              bgcolor: 'transparent',
              boxShadow: '0 18px 36px rgba(28, 18, 8, 0.35)',
            }}
          />
          {renderBubble(leftText, leftMediaUrls, 'left')}
        </BoxAny>

        <BoxAny
          sx={{
            width: isMobile ? '100%' : '48%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: isMobile ? 'center' : 'flex-end',
            justifyContent: 'flex-end',
            gap: isMobile ? 0.75 : 1.5,
            position: 'relative',
            zIndex: 1,
            pb: isMobile ? 0.5 : 2.5,
          }}
        >
          {renderBubble(rightText, rightMediaUrls, 'right')}
          <UserAvatar
            src={rightParticipant?.avatarUrl || ''}
            gender={rightParticipant?.gender}
            fallbackText={rightParticipant?.displayName}
            variant="rounded"
            previewMode="doubleClick"
            closePreviewOnClick
            sx={{
              width: avatarSize,
              height: avatarSize,
              border: 'none',
              bgcolor: 'transparent',
              boxShadow: '0 18px 36px rgba(16, 45, 40, 0.35)',
            }}
          />
        </BoxAny>
      </BoxAny>

      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          groups={imageGroups}
          initialGroupIndex={lightbox.groupIndex}
          open
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  );
};
