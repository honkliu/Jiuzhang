import React, { useEffect, useRef, useState } from 'react';
import { Box, Paper, useMediaQuery, useTheme } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { UserAvatar } from '@/components/Shared/UserAvatar';
import { ImageLightbox } from '@/components/Shared/ImageLightbox';
import { ImageHoverPreview } from '@/components/Shared/ImageHoverPreview';
import { VoiceMessageBubble } from '@/components/Chat/VoiceMessageBubble';

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

interface Chat2DSegment {
  type: 'text' | 'image' | 'video' | 'voice' | 'file';
  text?: string;
  url?: string;
  duration?: number;
  fileName?: string;
}

interface ChatRoom2DProps {
  leftParticipant: ParticipantInfo | null;
  rightParticipant: ParticipantInfo | null;
  leftSegments?: Chat2DSegment[];
  rightSegments?: Chat2DSegment[];
  imageGroups?: Array<{ sourceUrl: string; messageId: string; canEdit: boolean }>;
  imageGroupIndexByUrl?: Record<string, number>;
}

export const ChatRoom2D: React.FC<ChatRoom2DProps> = ({
  leftParticipant,
  rightParticipant,
  leftSegments,
  rightSegments,
  imageGroups,
  imageGroupIndexByUrl,
}) => {
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number; groupIndex?: number } | null>(null);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const leftScrollRef = useRef<HTMLDivElement | null>(null);
  const rightScrollRef = useRef<HTMLDivElement | null>(null);
  const [layoutWidth, setLayoutWidth] = useState<number>(0);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isHoverCapable = useMediaQuery('(hover: hover) and (pointer: fine)');

  useEffect(() => {
    if (!layoutRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setLayoutWidth(entry.contentRect.width);
    });
    observer.observe(layoutRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (leftScrollRef.current) {
      leftScrollRef.current.scrollTop = leftScrollRef.current.scrollHeight;
    }
  }, [leftSegments]);

  useEffect(() => {
    if (rightScrollRef.current) {
      rightScrollRef.current.scrollTop = rightScrollRef.current.scrollHeight;
    }
  }, [rightSegments]);

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const baseWidth = layoutWidth || window.innerWidth;
  const columnWidth = baseWidth / 2;

  // Keep bubble sizes consistent until narrow; cap at <= 2/3 view width.
  const bubbleTargetPx = Math.min(baseWidth * 0.66, 520);
  const bubbleW = `${bubbleTargetPx}px`;
  const bubbleH = 'calc(100% - 10px)';
  const avatarSizePx = (isMobile
    ? clamp(baseWidth * 0.2, 96, 150)
    : clamp(baseWidth * 0.14, 110, 220)) * 1.3;
  const avatarSize = `${avatarSizePx}px`;
  const imgStripW = isMobile ? 56 : 110;
  const maxSafeOverlapPx = Math.max(0, columnWidth - avatarSizePx - 16);
  const overlapOffsetPx = Math.min(Math.max(0, bubbleTargetPx - columnWidth), maxSafeOverlapPx, 140);
  const overlapOffset = `${overlapOffsetPx}px`;

  const textStyle = {
    whiteSpace: 'pre-wrap',
    lineHeight: 1.45,
    fontSize: isMobile ? '0.9rem' : '1rem',
    fontFamily: "'STKaiti', 'KaiTi', 'STSong', 'SimSun', 'Noto Serif SC', serif",
  };

  const renderBubble = (
    segments?: Chat2DSegment[],
    align: 'left' | 'right' = 'left',
    extraSx?: Record<string, any>
  ) => {
    const orderedSegments = segments || [];
    const hasSegments = orderedSegments.length > 0;
    if (!hasSegments) return null;

    const orderedImages = orderedSegments.filter((segment) => segment.type === 'image').map((segment) => segment.url || '');

    return (
      <Paper
        elevation={0}
        sx={{
          width: bubbleW,
          maxWidth: overlapOffsetPx > 0 ? `calc(100% + ${overlapOffset})` : '100%',
          height: bubbleH,
          minHeight: 0,
          pl: isMobile ? 1.5 : 2.5,
          pr: isMobile ? 2 : 3.5,
          py: isMobile ? 1 : 1.5,
          bgcolor: align === 'right' ? 'rgba(23, 76, 70, 0.95)' : 'rgba(251, 243, 227, 0.96)',
          color: align === 'right' ? 'rgba(240, 250, 248, 0.95)' : 'rgba(50, 36, 24, 0.95)',
          border: '1px solid rgba(116, 84, 50, 0.6)',
          boxShadow: '0 18px 40px rgba(46, 30, 16, 0.3)',
          borderRadius: '12px',
          alignSelf: 'auto',
          position: 'relative',
          overflowX: 'visible',
          overflowY: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          alignItems: 'stretch',
          backgroundImage:
            align === 'right'
              ? 'linear-gradient(180deg, rgba(15, 62, 57, 0.6), rgba(23, 76, 70, 0.95))'
              : 'linear-gradient(180deg, rgba(255, 250, 240, 0.9), rgba(238, 220, 188, 0.95))',
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: 8,
            border: '1px solid rgba(152, 112, 68, 0.35)',
            borderRadius: '8px',
            pointerEvents: 'none',
          },
          ...extraSx,
        }}
      >
        <BoxAny
          ref={align === 'left' ? leftScrollRef : rightScrollRef}
          sx={{
            position: 'relative',
            zIndex: 1,
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            boxSizing: 'border-box',
            overflowX: 'hidden',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            '&::-webkit-scrollbar': {
              display: 'none',
            },
          }}
        >
          <BoxAny
            sx={{
              minHeight: '100%',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              justifyContent: 'flex-end',
              gap: 0.55,
              pb: isMobile ? 1 : 1.25,
            }}
          >
          {orderedSegments.map((segment, index) => {
            if (segment.type === 'text') {
              return (
                <BoxAny
                  key={`text-${index}`}
                  sx={{
                    minWidth: 0,
                    flexShrink: 0,
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
                    {escapePipesInMathForGfm(segment.text || '')}
                  </ReactMarkdown>
                </BoxAny>
              );
            }

            if (segment.type === 'image' && segment.url) {
              const imageIndex = orderedImages.findIndex((url) => url === segment.url);

              return (
                <ImageHoverPreview
                  key={`${segment.type}-${segment.url}-${index}`}
                  src={segment.url}
                  alt="Chat media"
                  openOnHover={isHoverCapable}
                  openOnLongPress={!isHoverCapable}
                  openOnTap={false}
                >
                  {(previewProps) => (
                    <BoxAny
                      {...previewProps}
                      component="img"
                      src={segment.url}
                      alt="Chat media"
                      onContextMenu={(event: React.MouseEvent<HTMLElement>) => {
                        event.preventDefault();
                      }}
                      onClick={() => {
                        setLightbox({
                          images: orderedImages,
                          index: imageIndex >= 0 ? imageIndex : 0,
                          groupIndex: imageGroupIndexByUrl?.[segment.url || ''],
                        });
                      }}
                      sx={{
                        width: imgStripW,
                        height: 'auto',
                        maxHeight: isMobile ? 88 : 140,
                        flexShrink: 0,
                        alignSelf: 'flex-end',
                        display: 'block',
                        objectFit: 'contain',
                        objectPosition: 'top center',
                        borderRadius: 1,
                        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                        cursor: 'pointer',
                        transition: 'opacity 0.15s',
                        '&:hover': { opacity: 0.85 },
                        WebkitTouchCallout: 'none',
                        WebkitUserSelect: 'none',
                        userSelect: 'none',
                      }}
                    />
                  )}
                </ImageHoverPreview>
              );
            }

            if (segment.type === 'voice' && segment.url) {
              return (
                <BoxAny
                  key={`${segment.type}-${segment.url}-${index}`}
                  sx={{
                    alignSelf: 'flex-end',
                    flexShrink: 0,
                    display: 'inline-flex',
                    bgcolor: align === 'right' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                    borderRadius: '4px',
                    px: 1,
                    py: 0.5,
                  }}
                >
                  <VoiceMessageBubble
                    url={segment.url}
                    duration={segment.duration}
                    align={align}
                    isMobile={isMobile}
                  />
                </BoxAny>
              );
            }

            if (segment.type === 'video' && segment.url) {
              return (
                <BoxAny
                  key={`${segment.type}-${segment.url}-${index}`}
                  component="video"
                  src={segment.url}
                  controls
                  sx={{ width: '100%', maxHeight: 180, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.18)', alignSelf: 'flex-end', flexShrink: 0 }}
                />
              );
            }

            if (segment.url) {
              return (
                <BoxAny
                  key={`${segment.type}-${segment.url}-${index}`}
                  component="a"
                  href={segment.url}
                  target="_blank"
                  rel="noreferrer"
                  sx={{
                    color: 'inherit',
                    textDecoration: 'underline',
                    fontSize: '0.9rem',
                    wordBreak: 'break-all',
                    alignSelf: 'flex-end',
                    flexShrink: 0,
                  }}
                >
                  {segment.fileName || 'Download file'}
                </BoxAny>
              );
            }

            return null;
          })}
          </BoxAny>
        </BoxAny>
      </Paper>
    );
  };

  return (
    <>
      <BoxAny
        ref={layoutRef}
        sx={{
          flexGrow: 1,
          minHeight: 0,
          position: 'relative',
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr 1fr',
          alignItems: 'stretch',
          justifyContent: 'space-between',
          columnGap: isMobile ? 0 : 3.5,
          rowGap: 0,
          px: isMobile ? 1.25 : 3.5,
          pt: 0,
          pb: 0,
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
            borderRadius: 0,
            pointerEvents: 'none',
          },
        }}
      >
        {/* A (top-left avatar) */}
        <BoxAny
          sx={{
            gridColumn: 1,
            gridRow: 1,
            display: 'flex',
            minHeight: 0,
            alignItems: 'flex-end',
            justifyContent: 'flex-start',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <UserAvatar
            src={leftParticipant?.avatarUrl || ''}
            gender={leftParticipant?.gender}
            fallbackText={leftParticipant?.displayName}
            variant="rounded"
            previewMode={isHoverCapable ? 'hover' : 'tap'}
            closePreviewOnClick
            sx={{
              width: avatarSize,
              height: avatarSize,
              border: 'none',
              bgcolor: 'transparent',
              boxShadow: '0 18px 36px rgba(28, 18, 8, 0.35)',
            }}
          />
        </BoxAny>

        {/* BM (top-right bubble) */}
        <BoxAny
          sx={{
            gridColumn: 2,
            gridRow: 1,
            display: 'flex',
            minHeight: 0,
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
            position: 'relative',
            zIndex: 2,
          }}
        >
          {renderBubble(rightSegments, 'right', {
            ml: overlapOffsetPx > 0 ? `calc(-1 * ${overlapOffset})` : 0,
          })}
        </BoxAny>

        {/* AM (bottom-left bubble) */}
        <BoxAny
          sx={{
            gridColumn: 1,
            gridRow: 2,
            display: 'flex',
            minHeight: 0,
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            position: 'relative',
            zIndex: 2,
          }}
        >
          {renderBubble(leftSegments, 'left', {
            mr: overlapOffsetPx > 0 ? `calc(-1 * ${overlapOffset})` : 0,
          })}
        </BoxAny>

        {/* B (bottom-right avatar) */}
        <BoxAny
          sx={{
            gridColumn: 2,
            gridRow: 2,
            display: 'flex',
            minHeight: 0,
            alignItems: 'flex-start',
            justifyContent: 'flex-end',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <UserAvatar
            src={rightParticipant?.avatarUrl || ''}
            gender={rightParticipant?.gender}
            fallbackText={rightParticipant?.displayName}
            variant="rounded"
            previewMode={isHoverCapable ? 'hover' : 'tap'}
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

        {/* Two horizontal coil springs — cubic Bezier with horizontal tangents at every rail touch
            so front/back arcs connect with G1 continuity (smooth, like a cosine wave helix) */}
        {(['left', 'right'] as const).map((side) => {
          const count = 10;
          const springW = avatarSizePx * 0.90;  // spans 5%–95% of avatar
          const loopW = springW / count;
          const ry = isMobile ? 4 : 5;
          const sw = 2;
          const pad = avatarSizePx * 0.05;  // 5% offset from avatar edge
          const svgW = springW + pad * 2;
          const svgH = ry * 2 + 10;
          const cy = svgH / 2;
          const topY = cy - ry;
          const botY = cy + ry;
          const gridPx = isMobile ? 10 : 28;
          const dx = 0.5 * loopW;  // horizontal half-step

          // top touch-points 1,2,3…   bot touch-points A,B,C… (staggered by dx)
          const topXs = Array.from({ length: count }, (_, i) => pad + i * loopW);
          const botXs = Array.from({ length: count }, (_, i) => pad + (i + 0.5) * loopW);

          const bend = loopW * 0.28; // horizontal control-point offset → horizontal tangents at rails
          const ins = ry * 0.10;

          // Cubic Bezier with horizontal tangents at both endpoints → G1 at every touch point
          // Front: 1→A (top-left to bottom-right, bowing right-of-chord)
          const fC = (tx: number, bx: number) =>
            `M ${tx} ${topY} C ${tx + bend} ${topY} ${bx - bend} ${botY} ${bx} ${botY}`;
          // Back: A→2 (bottom-left to top-right, same horizontal tangent at A and 2)
          const bC = (bx: number, tx2: number) =>
            `M ${bx} ${botY} C ${bx + bend} ${botY} ${tx2 - bend} ${topY} ${tx2} ${topY}`;
          // Highlight: same front arc, inset slightly
          const fHiC = (tx: number, bx: number) =>
            `M ${tx} ${topY + ins} C ${tx + bend} ${topY + ins} ${bx - bend} ${botY - ins} ${bx} ${botY - ins}`;

          return (
            <BoxAny
              key={side}
              sx={{
                position: 'absolute',
                ...(side === 'left' ? { left: gridPx } : { right: gridPx }),
                top: '50%',
                transform: side === 'left' ? 'translateY(-50%)' : 'translateY(-50%) scaleX(-1)',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            >
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                width={svgW}
                height={svgH}
                style={{ display: 'block', overflow: 'visible' }}
              >
                {/* ── PASS 0: back arcs — 30% opacity solid ── */}
                {Array.from({ length: count - 1 }, (_, i) => (
                  <path key={`b-${i}`} d={bC(botXs[i], topXs[i + 1])}
                    fill="none" stroke="rgba(160,160,160,0.30)" strokeWidth={2} strokeLinecap="round" />
                ))}

                {/* ── PASS 2: front arcs — bright gold ── */}
                {topXs.map((tx, i) => (
                  <path key={`f-${i}`} d={fC(tx, botXs[i])}
                    fill="none" stroke="rgba(222,158,24,1.0)" strokeWidth={sw} strokeLinecap="round" />
                ))}
                {/* ── PASS 3: specular highlight ── */}
                {topXs.map((tx, i) => (
                  <path key={`fhi-${i}`} d={fHiC(tx, botXs[i])}
                    fill="none" stroke="rgba(255,242,155,0.72)" strokeWidth={sw * 0.28} strokeLinecap="round" />
                ))}


              </svg>
            </BoxAny>
          );
        })}
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
