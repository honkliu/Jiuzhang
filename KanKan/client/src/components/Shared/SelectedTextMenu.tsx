import React, { useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Popover,
  Stack,
  TextField,
} from '@mui/material';
import { AutoAwesome as MagicIcon } from '@mui/icons-material';
import { useLanguage } from '@/i18n/LanguageContext';
import {
  generationActionButtonSx,
  promptEditorSurfaceSx,
  promptEditorTextFieldSx,
} from './promptEditorStyles';

const BoxAny = Box as any;

interface SelectedTextMenuProps {
  children: React.ReactNode;
  onGenerate: (selectedText: string) => Promise<void>;
  disabled?: boolean;
}

export const SelectedTextMenu: React.FC<SelectedTextMenuProps> = ({
  children,
  onGenerate,
  disabled = false,
}) => {
  const { t } = useLanguage();
  const [menu, setMenu] = useState<{ mouseX: number; mouseY: number; text: string } | null>(null);
  const [generating, setGenerating] = useState(false);

  const handleContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    if (disabled || generating) return;

    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() ?? '';
    if (!selection || selection.isCollapsed || !selectedText) return;

    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const commonAncestor = range?.commonAncestorContainer;
    const selectedNode = commonAncestor?.nodeType === Node.ELEMENT_NODE
      ? commonAncestor as Element
      : commonAncestor?.parentElement;
    if (!selectedNode || !event.currentTarget.contains(selectedNode)) return;

    event.preventDefault();
    event.stopPropagation();
    setMenu({ mouseX: event.clientX + 2, mouseY: event.clientY - 6, text: selectedText });
  };

  const handleCopy = async () => {
    if (!menu) return;
    await navigator.clipboard.writeText(menu.text.trim());
    setMenu(null);
  };

  const handleGenerate = async () => {
    if (!menu || generating) return;
    const selectedText = menu.text.trim();
    if (!selectedText) return;

    setGenerating(true);
    setMenu(null);
    try {
      await onGenerate(selectedText);
    } catch (error) {
      console.error('Failed to generate image from selected text:', error);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <BoxAny component="span" sx={{ display: 'contents' }} onContextMenu={handleContextMenu}>
        {children}
      </BoxAny>
      <Popover
        open={Boolean(menu)}
        onClose={() => {
          if (!generating) setMenu(null);
        }}
        anchorReference="anchorPosition"
        anchorPosition={menu ? { top: menu.mouseY, left: menu.mouseX } : undefined}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{
          sx: {
            ...promptEditorSurfaceSx,
            borderRadius: '8px',
          },
        }}
      >
        <Stack spacing={1} sx={{ width: { xs: 280, sm: 360 }, p: 1 }}>
          <TextField
            autoFocus
            size="small"
            multiline
            minRows={3}
            maxRows={6}
            fullWidth
            label={t('selection.prompt')}
            value={menu?.text ?? ''}
            disabled={generating}
            onChange={(event) => {
              const text = event.target.value;
              setMenu((current) => current ? { ...current, text } : current);
            }}
            sx={promptEditorTextFieldSx}
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button
              size="small"
              variant="outlined"
              onClick={() => void handleCopy()}
              disabled={generating || !menu?.text.trim()}
              sx={{ height: 32 }}
            >
              {t('selection.copy')}
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => void handleGenerate()}
              disabled={generating || !menu?.text.trim()}
              startIcon={generating
                ? <CircularProgress size={16} color="inherit" />
                : <MagicIcon />}
              sx={generationActionButtonSx}
            >
              {t('selection.generateImage')}
            </Button>
          </Stack>
        </Stack>
      </Popover>
    </>
  );
};
