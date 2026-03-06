import React from 'react';
import {
  Box, Paper, Typography, Divider, IconButton, Chip, Stack, Link,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import type { FamilyNode, FamilyTreeDto } from '@/services/family.service';

const BoxAny = Box as any;

interface Props {
  person: FamilyNode | null;
  tree: FamilyTreeDto | null;
  allPersons: FamilyNode[];
  onClose: () => void;
  onNavigate: (personId: string) => void;
  fullWidth?: boolean;
}

function formatDate(d?: { year: number; month?: number; day?: number }) {
  if (!d) return '';
  const parts = [d.year.toString()];
  if (d.month) parts.push(String(d.month).padStart(2, '0'));
  if (d.day) parts.push(String(d.day).padStart(2, '0'));
  return parts.join('-');
}

const PersonLink: React.FC<{ node: FamilyNode; onNavigate: (id: string) => void; suffix?: string }> = ({ node, onNavigate, suffix }) => (
  <Link
    component="button"
    variant="body2"
    underline="hover"
    onClick={() => onNavigate(node.id)}
    sx={{
      cursor: 'pointer',
      color: '#1e40af',
      fontWeight: 500,
      '&:hover': { color: 'rgb(42,175,71)' },
    }}
  >
    {node.name}{suffix ?? ''}
  </Link>
);

export const FamilyPersonPanel: React.FC<Props> = ({
  person, tree, allPersons, onClose, onNavigate, fullWidth = false,
}) => {
  if (!person) return null;

  const rootGen = tree?.rootGeneration ?? 1;
  const poem = tree?.zibeiPoem ?? [];
  const zibeiChar = poem[person.generation - rootGen] ?? '';

  const parents = person.parentRels
    .map(r => allPersons.find(p => p.id === r.fromId))
    .filter(Boolean) as FamilyNode[];
  const children = person.children;
  const spouses = person.spouses;

  return (
    <Paper
      elevation={3}
      sx={{
        width: fullWidth ? '100%' : 300,
        height: '100%',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: fullWidth ? 2 : 0,
        p: 0,
      }}
    >
      {/* Header */}
      <BoxAny sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        px: 2, py: 1.25, background: 'rgba(15,23,42,0.02)',
      }}>
        <Typography variant="subtitle2" fontWeight="bold" color="text.secondary">人物详情</Typography>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </BoxAny>
      <Divider />

      {/* Identity */}
      <BoxAny sx={{ px: 2, py: 1.5 }}>
        <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
          <BoxAny
            sx={{
              width: 48, height: 48, borderRadius: '50%',
              bgcolor: person.gender === 'female' ? '#fce7f3' : '#dbeafe',
              border: `2px solid ${person.gender === 'female' ? '#f472b6' : '#60a5fa'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 'bold', color: '#1e293b',
              flexShrink: 0,
            }}
          >
            {person.name.charAt(person.name.length - 1)}
          </BoxAny>
          <BoxAny sx={{ minWidth: 0 }}>
            <Typography variant="h6" lineHeight={1.2} fontWeight="bold" sx={{ fontSize: 18 }}>
              {person.name}
            </Typography>
            <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
              <Chip
                label={`第${person.generation}世`}
                size="small"
                sx={{ height: 18, fontSize: 10, bgcolor: 'rgba(42,175,71,0.1)', color: 'rgb(42,175,71)' }}
              />
              <Chip
                label={person.gender === 'female' ? '女' : '男'}
                size="small"
                sx={{
                  height: 18, fontSize: 10,
                  bgcolor: person.gender === 'female' ? 'rgba(244,114,182,0.1)' : 'rgba(96,165,250,0.1)',
                  color: person.gender === 'female' ? '#ec4899' : '#3b82f6',
                }}
              />
              {zibeiChar && (
                <Chip
                  label={`字辈：${zibeiChar}`}
                  size="small"
                  sx={{ height: 18, fontSize: 10, bgcolor: 'rgba(148,163,184,0.1)' }}
                />
              )}
              {person.isAlive === false && (
                <Chip
                  label="已故"
                  size="small"
                  sx={{ height: 18, fontSize: 10, bgcolor: 'rgba(0,0,0,0.06)', color: '#64748b' }}
                />
              )}
            </BoxAny>
          </BoxAny>
        </BoxAny>

        {(person.birthDate || person.deathDate) && (
          <Typography variant="body2" color="text.secondary" mb={0.5} sx={{ fontSize: 13 }}>
            {formatDate(person.birthDate)}{person.deathDate ? ` — ${formatDate(person.deathDate)}` : ''}
          </Typography>
        )}
        {person.birthPlace && (
          <Typography variant="body2" color="text.secondary" mb={0.5} sx={{ fontSize: 13 }}>
            出生地：{person.birthPlace}
          </Typography>
        )}
        {person.occupation && (
          <Typography variant="body2" mb={0.5} sx={{ fontSize: 13 }}>职业：{person.occupation}</Typography>
        )}
        {person.education && (
          <Typography variant="body2" mb={0.5} sx={{ fontSize: 13 }}>学历：{person.education}</Typography>
        )}
      </BoxAny>

      {/* Biography */}
      {person.biography && (
        <>
          <Divider />
          <BoxAny sx={{ px: 2, py: 1.25 }}>
            <Typography variant="caption" color="text.secondary" display="block" mb={0.5} fontWeight="bold">
              生平简介
            </Typography>
            <Typography variant="body2" sx={{ fontSize: 13, lineHeight: 1.6 }}>{person.biography}</Typography>
          </BoxAny>
        </>
      )}

      {/* Family links (clickable) */}
      <Divider />
      <BoxAny sx={{ px: 2, py: 1.25 }}>
        <Typography variant="caption" color="text.secondary" display="block" mb={0.75} fontWeight="bold">
          家庭关系
        </Typography>

        {parents.length > 0 && (
          <BoxAny sx={{ mb: 0.75 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>父母</Typography>
            <BoxAny sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.25 }}>
              {parents.map(p => (
                <PersonLink key={p.id} node={p} onNavigate={onNavigate} />
              ))}
            </BoxAny>
          </BoxAny>
        )}

        {spouses.length > 0 && (
          <BoxAny sx={{ mb: 0.75 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>配偶</Typography>
            <BoxAny sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.25 }}>
              {spouses.map(s => (
                <PersonLink key={s.id} node={s} onNavigate={onNavigate} />
              ))}
            </BoxAny>
          </BoxAny>
        )}

        {children.length > 0 && (
          <BoxAny sx={{ mb: 0.25 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
              子女（{children.length}人）
            </Typography>
            <BoxAny sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.25 }}>
              {children.map(c => (
                <PersonLink key={c.id} node={c} onNavigate={onNavigate} />
              ))}
            </BoxAny>
          </BoxAny>
        )}

        {parents.length === 0 && spouses.length === 0 && children.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, fontStyle: 'italic' }}>
            暂无关系数据
          </Typography>
        )}
      </BoxAny>

      {/* Experiences */}
      {person.experiences && person.experiences.length > 0 && (
        <>
          <Divider />
          <BoxAny sx={{ px: 2, py: 1.25 }}>
            <Typography variant="caption" color="text.secondary" display="block" mb={0.75} fontWeight="bold">
              人生经历
            </Typography>
            <Stack spacing={0.5}>
              {person.experiences.map(exp => (
                <BoxAny key={exp.id} sx={{ display: 'flex', gap: 0.75, alignItems: 'baseline' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, minWidth: 32, flexShrink: 0 }}>
                    {exp.startYear ?? '—'}
                  </Typography>
                  <BoxAny sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: '#94a3b8', mt: 0.75, flexShrink: 0 }} />
                  <Typography variant="body2" sx={{ fontSize: 13 }}>
                    {exp.title}
                    {exp.description ? <Typography component="span" variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>（{exp.description}）</Typography> : ''}
                  </Typography>
                </BoxAny>
              ))}
            </Stack>
          </BoxAny>
        </>
      )}
    </Paper>
  );
};
