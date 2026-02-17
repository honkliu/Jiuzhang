import React from 'react';
import { Box, Paper } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { UserAvatar } from '@/components/Shared/UserAvatar';

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
}

export const ChatRoom2D: React.FC<ChatRoom2DProps> = ({
  leftParticipant,
  rightParticipant,
  leftText,
  rightText,
}) => {
  const textStyle = {
    whiteSpace: 'pre-wrap',
    lineHeight: 1.6,
    fontSize: '0.95rem',
    fontFamily: "'STKaiti', 'KaiTi', 'STSong', 'SimSun', 'Noto Serif SC', serif",
  };

  const renderBubble = (text?: string, align: 'left' | 'right' = 'left') => {
    if (!text) return null;
    return (
      <Paper
        elevation={0}
        sx={{
          width: 504,
          height: 315,
          px: 2.5,
          py: 1.5,
          bgcolor: align === 'right' ? 'rgba(23, 76, 70, 0.95)' : 'rgba(251, 243, 227, 0.96)',
          color: align === 'right' ? 'rgba(240, 250, 248, 0.95)' : 'rgba(50, 36, 24, 0.95)',
          border: '1px solid rgba(116, 84, 50, 0.6)',
          boxShadow: '0 18px 40px rgba(46, 30, 16, 0.3)',
          borderRadius: 2,
          alignSelf: align === 'right' ? 'flex-end' : 'flex-start',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
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
        <BoxAny
          sx={{
            position: 'relative',
            zIndex: 1,
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
            '& .katex': {
              fontSize: '1.05em',
            },
            '& table': {
              width: '100%',
              borderCollapse: 'collapse',
              margin: '8px 0',
            },
            '& th, & td': {
              border: '1px solid rgba(0,0,0,0.12)',
              padding: '4px 8px',
              textAlign: 'left',
            },
            '& th': {
              backgroundColor: 'rgba(0,0,0,0.03)',
              fontWeight: 600,
            },
            '& code': {
              backgroundColor: 'rgba(0, 0, 0, 0.06)',
              padding: '2px 4px',
              borderRadius: '3px',
              fontFamily: 'monospace',
              fontSize: '0.9em',
            },
            '& pre': {
              backgroundColor: 'rgba(0, 0, 0, 0.06)',
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
          <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
            {escapePipesInMathForGfm(text)}
          </ReactMarkdown>
        </BoxAny>
      </Paper>
    );
  };

  return (
    <BoxAny
      sx={{
        flexGrow: 1,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        px: 3,
        py: 3,
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
          width: '46%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          gap: 1.5,
          position: 'relative',
          zIndex: 1,
          pb: 2.5,
        }}
      >
        <UserAvatar
          src={leftParticipant?.avatarUrl || ''}
          gender={leftParticipant?.gender}
          fallbackText={leftParticipant?.displayName}
          variant="rounded"
          sx={{
            width: 282,
            height: 282,
            border: 'none',
            bgcolor: 'transparent',
            boxShadow: '0 18px 36px rgba(28, 18, 8, 0.35)',
          }}
        />
        {renderBubble(leftText, 'left')}
      </BoxAny>

      <BoxAny
        sx={{
          width: '46%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          justifyContent: 'flex-end',
          gap: 1.5,
          position: 'relative',
          zIndex: 1,
          pb: 2.5,
        }}
      >
        {renderBubble(rightText, 'right')}
        <UserAvatar
          src={rightParticipant?.avatarUrl || ''}
          gender={rightParticipant?.gender}
          fallbackText={rightParticipant?.displayName}
          variant="rounded"
          sx={{
            width: 282,
            height: 282,
            border: 'none',
            bgcolor: 'transparent',
            boxShadow: '0 18px 36px rgba(16, 45, 40, 0.35)',
          }}
        />
      </BoxAny>
    </BoxAny>
  );
};
