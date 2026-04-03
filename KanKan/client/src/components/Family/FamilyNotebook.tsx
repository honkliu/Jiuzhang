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
      if (result.notebookId) {
        // Notebook exists — fetch it to get canEdit from server
        try {
          const notebooks = await notebookService.list();
          const nb = notebooks.find(n => n.id === result.notebookId);
          if (!cancelled) {
            setNotebookId(result.notebookId);
            setCanEdit(nb?.canEdit ?? false);
            setLoading(false);
          }
        } catch {
          if (!cancelled) {
            setNotebookId(result.notebookId);
            setCanEdit(false);
            setLoading(false);
          }
        }
        return;
      }
      // No notebook yet — try to create
      try {
        const created = await familyService.getOrCreateTreeNotebook(treeId);
        if (!cancelled) { setNotebookId(created.notebookId); setCanEdit(true); setLoading(false); }
      } catch {
        if (!cancelled) { setNotebookId(null); setLoading(false); }
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
