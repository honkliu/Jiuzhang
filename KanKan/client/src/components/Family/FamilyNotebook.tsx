import React, { useEffect, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { familyService } from '@/services/family.service';
import { notebookService } from '@/services/notebook.service';
import { Notebook } from '@/components/Notebook/Notebook';

const BoxAny = Box as any;

interface FamilyNotebookProps {
  treeId: string;
}

export const FamilyNotebook: React.FC<FamilyNotebookProps> = ({ treeId }) => {
  const [notebookId, setNotebookId] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    familyService.getTreeNotebook(treeId).then(async result => {
      if (cancelled) return;

      let nbId = result.notebookId;

      // No notebook yet — try to create
      if (!nbId) {
        try {
          const created = await familyService.getOrCreateTreeNotebook(treeId);
          nbId = created.notebookId;
        } catch {
          // POST failed (viewer without edit rights) — show empty state
          if (!cancelled) { setNotebookId(null); setCanEdit(false); setLoading(false); }
          return;
        }
      }

      // Fetch notebook to get canEdit from server
      try {
        const nb = await notebookService.get(nbId);
        if (!cancelled) { setNotebookId(nb.id); setCanEdit(nb.canEdit); setLoading(false); }
      } catch {
        // Can view tree but not notebook? Show read-only
        if (!cancelled) { setNotebookId(nbId); setCanEdit(false); setLoading(false); }
      }
    }).catch(err => {
      if (cancelled) return;
      setError(err?.message || '无法加载谱志');
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [treeId]);

  if (loading) {
    return (
      <BoxAny sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={28} />
      </BoxAny>
    );
  }

  if (error) {
    return (
      <BoxAny sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="error">{error}</Typography>
      </BoxAny>
    );
  }

  if (!notebookId) {
    return (
      <BoxAny sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="text.secondary">该家谱暂无谱志</Typography>
      </BoxAny>
    );
  }

  return <Notebook notebookId={notebookId} canEdit={canEdit} />;
};
