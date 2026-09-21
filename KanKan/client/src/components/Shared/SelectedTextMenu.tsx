import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  IconButton,
  Popover,
  Portal,
  Stack,
  TextField,
  useMediaQuery,
} from '@mui/material';
import { AutoAwesome as MagicIcon } from '@mui/icons-material';
import { useLanguage } from '@/i18n/LanguageContext';
import {
  generationActionButtonSx,
  promptEditorSurfaceSx,
  promptEditorTextFieldSx,
} from './promptEditorStyles';

const BoxAny = Box as any;

interface SelectionDetails {
  text: string;
  mouseX: number;
  mouseY: number;
}

interface SelectedTextMenuProps {
  children: React.ReactNode;
  onGenerate: (selectedText: string) => Promise<void>;
  disabled?: boolean;
}

function readSelection(container: HTMLElement | null): SelectionDetails | null {
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() ?? '';
  if (!container || !selection || selection.isCollapsed || !selectedText || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const commonAncestor = range.commonAncestorContainer;
  const selectedNode = commonAncestor.nodeType === Node.ELEMENT_NODE
    ? commonAncestor as Element
    : commonAncestor.parentElement;
  if (!selectedNode || !container.contains(selectedNode)) {
    return null;
  }

  const rects = range.getClientRects();
  const rect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return null;
  }

  return {
    text: selectedText,
    mouseX: Math.min(window.innerWidth - 48, Math.max(8, rect.right - 40)),
    mouseY: Math.min(window.innerHeight - 48, rect.bottom + 8),
  };
}

export const SelectedTextMenu: React.FC<SelectedTextMenuProps> = ({
  children,
  onGenerate,
  disabled = false,
}) => {
  const { t } = useLanguage();
  const isTouchDevice = useMediaQuery('(hover: none) and (pointer: coarse)');
  const containerRef = useRef<HTMLElement | null>(null);
  const selectionTimerRef = useRef<number | null>(null);
  const [menu, setMenu] = useState<SelectionDetails | null>(null);
  const [mobileAction, setMobileAction] = useState<SelectionDetails | null>(null);

  useEffect(() => {
    return () => {
      if (selectionTimerRef.current !== null) {
        window.clearTimeout(selectionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!mobileAction) return;

    const handleSelectionChange = () => {
      window.requestAnimationFrame(() => {
        if (!readSelection(containerRef.current)) {
          setMobileAction(null);
        }
      });
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [mobileAction]);

  const handleContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    if (disabled) return;

    const selected = readSelection(event.currentTarget);
    if (!selected) return;

    event.preventDefault();
    event.stopPropagation();
    setMenu({
      ...selected,
      mouseX: event.clientX + 2,
      mouseY: event.clientY - 6,
    });
  };

  const handleTouchEnd = () => {
    if (disabled || !isTouchDevice) return;

    if (selectionTimerRef.current !== null) {
      window.clearTimeout(selectionTimerRef.current);
    }
    selectionTimerRef.current = window.setTimeout(() => {
      selectionTimerRef.current = null;
      setMobileAction(readSelection(containerRef.current));
    }, 250);
  };

  const openMobilePrompt = () => {
    if (!mobileAction) return;
    setMenu(mobileAction);
    setMobileAction(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleCopy = async () => {
    if (!menu) return;
    await navigator.clipboard.writeText(menu.text.trim());
    setMenu(null);
  };

  const handleGenerate = async () => {
    if (!menu) return;
    const selectedText = menu.text.trim();
    if (!selectedText) return;

    setMenu(null);
    try {
      await onGenerate(selectedText);
    } catch (error) {
      console.error('Failed to generate image from selected text:', error);
    }
  };

  const promptEditor = (
    <Stack spacing={1} sx={{ width: { xs: '100%', sm: 360 }, p: 1 }}>
      <TextField
        autoFocus
        size="small"
        multiline
        minRows={3}
        maxRows={6}
        fullWidth
        label={t('selection.prompt')}
        value={menu?.text ?? ''}
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
          disabled={!menu?.text.trim()}
          sx={{ height: 32 }}
        >
          {t('selection.copy')}
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={() => void handleGenerate()}
          disabled={!menu?.text.trim()}
          startIcon={<MagicIcon />}
          sx={generationActionButtonSx}
        >
          {t('selection.generateImage')}
        </Button>
      </Stack>
    </Stack>
  );

  return (
    <>
      <BoxAny
        ref={containerRef}
        component="span"
        sx={{ display: 'contents' }}
        onContextMenu={handleContextMenu}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </BoxAny>
      {mobileAction && (
        <Portal>
          <IconButton
            color="primary"
            aria-label={t('selection.generateImage')}
            onPointerDown={(event) => event.preventDefault()}
            onClick={openMobilePrompt}
            sx={{
              position: 'fixed',
              left: mobileAction.mouseX,
              top: mobileAction.mouseY,
              width: 40,
              height: 40,
              zIndex: (theme) => theme.zIndex.modal + 1,
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'divider',
              boxShadow: 4,
              '&:hover': { bgcolor: 'background.paper' },
            }}
          >
            <MagicIcon />
          </IconButton>
        </Portal>
      )}
      {isTouchDevice ? (
        <Dialog
          open={Boolean(menu)}
          onClose={() => setMenu(null)}
          disableScrollLock
          fullWidth
          maxWidth="sm"
          PaperProps={{
            sx: {
              ...promptEditorSurfaceSx,
              position: 'fixed',
              bottom: 0,
              m: 0,
              width: '100%',
              maxWidth: '100%',
              borderRadius: '16px 16px 0 0',
            },
          }}
        >
          {promptEditor}
        </Dialog>
      ) : (
        <Popover
          open={Boolean(menu)}
          onClose={() => setMenu(null)}
          disableScrollLock
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
          {promptEditor}
        </Popover>
      )}
    </>
  );
};
