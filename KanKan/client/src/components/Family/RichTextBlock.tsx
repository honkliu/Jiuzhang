import React, { useEffect, useState, Component, type ErrorInfo, type ReactNode } from 'react';
import { EditorContent, EditorContext, useEditor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TextAlign } from '@tiptap/extension-text-align';
import { Highlight } from '@tiptap/extension-highlight';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { Typography } from '@tiptap/extension-typography';
import { Selection } from '@tiptap/extensions';
import { TextStyle, Color, FontSize, FontFamily } from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import ImageResize from 'tiptap-extension-resize-image';
import { Box, IconButton, Select, MenuItem, Popover } from '@mui/material';
import { Remove as MinusIcon, Add as PlusIcon, FormatColorText as FontColorIcon } from '@mui/icons-material';

// --- Tiptap UI Components ---
import { Toolbar, ToolbarGroup, ToolbarSeparator } from '@/components/tiptap-ui-primitive/toolbar';
import { HeadingDropdownMenu } from '@/components/tiptap-ui/heading-dropdown-menu';
import { ListDropdownMenu } from '@/components/tiptap-ui/list-dropdown-menu';
import { BlockquoteButton } from '@/components/tiptap-ui/blockquote-button';
import { CodeBlockButton } from '@/components/tiptap-ui/code-block-button';
import { MarkButton } from '@/components/tiptap-ui/mark-button';
import { TextAlignButton } from '@/components/tiptap-ui/text-align-button';
import { UndoRedoButton } from '@/components/tiptap-ui/undo-redo-button';
import { ColorHighlightPopover } from '@/components/tiptap-ui/color-highlight-popover';
import { LinkPopover } from '@/components/tiptap-ui/link-popover';
import { ImageUploadButton } from '@/components/tiptap-ui/image-upload-button';

// --- Tiptap Node Extensions & Styles ---
import { ImageUploadNode } from '@/components/tiptap-node/image-upload-node/image-upload-node-extension';
import { HorizontalRule } from '@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension';
import { NodeBackground } from '@/components/tiptap-extension/node-background-extension';
import '@/components/tiptap-node/list-node/list-node.scss';
import '@/components/tiptap-node/paragraph-node/paragraph-node.scss';
import '@/components/tiptap-node/blockquote-node/blockquote-node.scss';
import '@/components/tiptap-node/code-block-node/code-block-node.scss';
import '@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss';
import '@/components/tiptap-node/image-node/image-node.scss';

// --- Utils ---
import { handleImageUpload, MAX_FILE_SIZE } from '@/lib/tiptap-utils';

const BoxAny = Box as any;

// Font sizes in pt (like Word). 12pt ≈ 16px.
const FONT_SIZES_PT = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
const ptToPx = (pt: number) => Math.round(pt * 4 / 3);
const pxToPt = (px: number) => Math.round(px * 3 / 4);

const FONTS = [
  { label: '默认', value: '' },
  { label: '宋体', value: 'SimSun, serif' },
  { label: '黑体', value: 'SimHei, sans-serif' },
  { label: '楷体', value: 'KaiTi, serif' },
  { label: '仿宋', value: 'FangSong, serif' },
  { label: '微软雅黑', value: '"Microsoft YaHei", sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times', value: '"Times New Roman", serif' },
  { label: 'Courier', value: '"Courier New", monospace' },
];

const fontSelectSx = {
  fontSize: 11, height: 24, bgcolor: '#fff', borderRadius: '4px',
  '& .MuiSelect-select': { py: '2px !important', pl: '3px !important', pr: '12px !important', minHeight: '0 !important' },
  '& .MuiSelect-icon': { right: -2, fontSize: 14, top: 'calc(50% - 7px)' },
  '& .MuiInputBase-input': { padding: '2px 3px !important' },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(15,23,42,0.2)' },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(15,23,42,0.4)' },
};

const fontMenuProps = {
  PaperProps: {
    sx: {
      bgcolor: '#fff',
      backgroundImage: 'none',
      boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      border: '1px solid rgba(15,23,42,0.08)',
      maxHeight: 300,
      scrollbarWidth: 'none',
      '&::-webkit-scrollbar': { display: 'none' },
    },
  },
};

interface RichTextBlockProps {
  html: string;
  autoFocus?: boolean;
  onChange: (html: string) => void;
  onFocus: () => void;
  fontSize?: number;
}

// Global editor registry
export const editorRegistry = new Map<string, any>();

export const RichTextBlockWithRegistry: React.FC<RichTextBlockProps & { blockId: string }> = ({ blockId, html, autoFocus, onChange, onFocus }) => {
  const baseFontSize = 16;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        horizontalRule: false,
        link: { openOnClick: false, enableClickSelection: true },
        bulletList: { keepMarks: true, keepAttributes: true },
        orderedList: { keepMarks: true, keepAttributes: true },
        dropcursor: { color: '#FF0000', width: 4 },
      }),
      HorizontalRule,
      ImageResize.configure({ inline: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      NodeBackground,
      TextStyle.extend({ inclusive: true }),
      Color,
      FontSize,
      FontFamily,
      Underline.extend({ inclusive: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      Typography,
      Subscript,
      Superscript,
      Selection,
      ImageUploadNode.configure({
        type: 'imageResize',
        accept: 'image/*',
        maxSize: MAX_FILE_SIZE,
        limit: 3,
        upload: handleImageUpload,
        onError: (error: Error) => console.error('Upload failed:', error),
      }),
    ],
    enableContentCheck: false,
    content: html || '',
    editable: true,
    autofocus: autoFocus ? 'end' : false,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    onFocus: () => onFocus(),
    editorProps: {
      attributes: {
        style: `font-size: ${baseFontSize}px; line-height: 1.5; padding: 2px 4px; outline: none; min-height: 24px;`,
      },
    },
  });

  useEffect(() => {
    if (editor) {
      editorRegistry.set(blockId, editor);
      return () => { editorRegistry.delete(blockId); };
    }
  }, [editor, blockId]);

  useEffect(() => {
    if (editor && !editor.isFocused) {
      const currentHtml = editor.getHTML();
      if (currentHtml !== html) {
        editor.commands.setContent(html || '');
      }
    }
  }, [html, editor]);

  if (!editor) return null;

  return (
    <BoxAny sx={{
      flex: '1 1 auto', width: '100%', height: '100%',
      fontSize: `${baseFontSize}px`,
      '& .tiptap': { height: '100%', outline: 'none', cursor: 'text' },
      '& .tiptap p': { margin: 0 },
      '& .tiptap ul, & .tiptap ol': { margin: '0 !important', paddingLeft: '1.6em' },
      '& .tiptap li': { margin: 0, '& > p': { margin: '0 !important', lineHeight: '1.5 !important' } },
      '& .tiptap li::marker': { fontSize: 'inherit' },
      '& .tiptap blockquote': { margin: '0.25em 0', paddingLeft: '1em', borderLeft: '3px solid #d1d5db' },
      '& .tiptap pre': { margin: '0.25em 0', padding: '0.5em', background: '#f1f5f9', borderRadius: '4px', fontSize: '0.9em' },
      '& .tiptap hr': { margin: '0.5em 0', border: 'none', borderTop: '1px solid #e2e8f0' },
      '& .tiptap img': { maxWidth: '100%', height: 'auto' },
    }}>
      <EditorContent editor={editor} style={{ height: '100%' }} />
    </BoxAny>
  );
};

// ── Font color popover with 8 preset colors ────────────────────────────────

const FontColorPopover: React.FC<{ currentColor: string; colors: string[]; onSelect: (c: string) => void }> = ({ currentColor, colors, onSelect }) => {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  return (
    <>
      <IconButton size="small" onClick={e => { e.stopPropagation(); setAnchorEl(e.currentTarget); }}
        sx={{ width: 24, height: 24, p: 0.25, position: 'relative' }}>
        <FontColorIcon sx={{ fontSize: 16 }} />
        <BoxAny sx={{ position: 'absolute', bottom: 1, left: 4, right: 4, height: 3, borderRadius: 1, bgcolor: currentColor }} />
      </IconButton>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { p: 1, borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' } } }}
      >
        <BoxAny sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.5 }}>
          {colors.map(c => (
            <BoxAny key={c} onClick={() => { onSelect(c); setAnchorEl(null); }}
              sx={{
                width: 24, height: 24, borderRadius: '4px', cursor: 'pointer',
                bgcolor: c, border: c === currentColor ? '2px solid #2563eb' : '1px solid rgba(0,0,0,0.15)',
                '&:hover': { transform: 'scale(1.15)' }, transition: 'transform 0.1s',
              }}
            />
          ))}
        </BoxAny>
      </Popover>
    </>
  );
};

// ── Shared toolbar using Tiptap UI components ─────────────────────────────

export const SharedRichTextToolbar: React.FC<{ activeBlockId?: string | null }> = ({ activeBlockId }) => {
  const editor = activeBlockId ? editorRegistry.get(activeBlockId) : null;
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const handler = () => forceUpdate(n => n + 1);
    editor.on('selectionUpdate', handler);
    editor.on('transaction', handler);
    return () => {
      editor.off('selectionUpdate', handler);
      editor.off('transaction', handler);
    };
  }, [editor]);

  if (!editor) return null;

  const headingSizePt: Record<number, number> = { 1: 24, 2: 18, 3: 15 };
  const headingLevel = editor.isActive('heading') ? (editor.getAttributes('heading').level as number) : 0;
  const textStyleFontSize = editor.getAttributes('textStyle').fontSize;
  const currentPt = headingLevel
    ? (headingSizePt[headingLevel] ?? 12)
    : textStyleFontSize ? pxToPt(parseInt(textStyleFontSize)) : 12;
  const currentFontFamily = editor.getAttributes('textStyle').fontFamily || '';

  const stepFontSize = (dir: 1 | -1) => {
    const idx = FONT_SIZES_PT.findIndex((s: number) => dir === 1 ? s > currentPt : s >= currentPt);
    const targetPt = dir === 1
      ? (idx >= 0 ? FONT_SIZES_PT[idx] : FONT_SIZES_PT[FONT_SIZES_PT.length - 1])
      : (idx > 0 ? FONT_SIZES_PT[idx - 1] : FONT_SIZES_PT[0]);
    editor.chain().focus().setFontSize(`${ptToPx(targetPt)}px`).run();
  };

  return (
    <EditorContext.Provider value={{ editor }}>
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 0.25, flexWrap: 'nowrap',
        /* 1. Make all tiptap dropdown/popover buttons non-transparent */
        '& button, & [role="button"]': { minWidth: 0 },
        /* 2. Compact all toolbar buttons */
        '& .tiptap-button': { padding: '2px 4px !important', minWidth: '24px !important' },
      }}>
      <Toolbar style={{ border: 'none', background: 'transparent', padding: 0, minHeight: 0, boxShadow: 'none', gap: 2, flexWrap: 'nowrap', alignItems: 'center' }}>
        <ToolbarGroup>
          <UndoRedoButton action="undo" />
          <UndoRedoButton action="redo" />
        </ToolbarGroup>

        <ToolbarSeparator />

        <ToolbarGroup>
          <MarkButton type="bold" />
          <MarkButton type="italic" />
          <MarkButton type="underline" />
        </ToolbarGroup>

        <ToolbarSeparator />

        {/* Font color */}
        {(() => {
          const currentColor = editor.getAttributes('textStyle').color || '#000000';
          const colors = ['#000000', '#FF0000', '#0000FF', '#008000', '#FF8C00', '#800080', '#964B00', '#808080'];
          return <FontColorPopover currentColor={currentColor} colors={colors} onSelect={c => editor.chain().focus().setColor(c).run()} />;
        })()}
        <ColorHighlightPopover />
        <LinkPopover />

        <ToolbarSeparator />

        <IconButton size="small" onClick={() => stepFontSize(-1)} sx={{ width: 20, height: 20, p: 0 }}>
          <MinusIcon sx={{ fontSize: 12 }} />
        </IconButton>
        <Select size="small" value={FONT_SIZES_PT.includes(currentPt) ? currentPt : ''}
          displayEmpty
          renderValue={() => `${currentPt}`}
          onChange={e => { e.stopPropagation(); editor.chain().focus().setFontSize(`${ptToPx(Number(e.target.value))}px`).run(); }}
          onClick={e => e.stopPropagation()}
          sx={{ ...fontSelectSx, minWidth: 36 }}
          MenuProps={fontMenuProps}>
          {FONT_SIZES_PT.map(s => <MenuItem key={s} value={s} sx={{ fontSize: 11 }}>{s}</MenuItem>)}
        </Select>
        <IconButton size="small" onClick={() => stepFontSize(1)} sx={{ width: 20, height: 20, p: 0 }}>
          <PlusIcon sx={{ fontSize: 12 }} />
        </IconButton>

        <ToolbarSeparator />

        <ToolbarGroup>
          <ImageUploadButton text="" />
        </ToolbarGroup>

        <ToolbarSeparator />

        <ToolbarGroup>
          <TextAlignButton align="left" />
          <TextAlignButton align="center" />
          <TextAlignButton align="right" />
        </ToolbarGroup>

        <ToolbarSeparator />

        <Select size="small" value={currentFontFamily}
          onChange={e => { e.stopPropagation(); const v = e.target.value as string; v ? editor.chain().focus().setFontFamily(v).run() : editor.chain().focus().unsetFontFamily().run(); }}
          onClick={e => e.stopPropagation()} displayEmpty
          renderValue={v => FONTS.find(f => f.value === v)?.label || '字体'}
          sx={{ ...fontSelectSx, minWidth: 48 }}
          MenuProps={fontMenuProps}>
          {FONTS.map(f => <MenuItem key={f.value} value={f.value} sx={{ fontSize: 11, fontFamily: f.value || 'inherit' }}>{f.label}</MenuItem>)}
        </Select>

        <ToolbarSeparator />

        <ToolbarGroup>
          <HeadingDropdownMenu modal={false} levels={[1, 2, 3]} />
          <ListDropdownMenu modal={false} types={['bulletList', 'orderedList']} />
          <BlockquoteButton />
          <CodeBlockButton />
        </ToolbarGroup>
      </Toolbar>
      </Box>
    </EditorContext.Provider>
  );
};

// Backward compat
export const RichTextToolbar = SharedRichTextToolbar;
