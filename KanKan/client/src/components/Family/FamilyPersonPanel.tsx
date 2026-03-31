import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputBase,
  Link,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Check as CheckIcon,
  Close as CloseIcon,
  DeleteOutline as DeleteOutlineIcon,
} from '@mui/icons-material';
import { ImageLightbox } from '@/components/Shared/ImageLightbox';
import { mediaService } from '@/services/media.service';
import {
  familyService,
  type FamilyDate,
  type FamilyNode,
  type FamilyPhoto,
  type FamilyPersonDto,
  type FamilyRelationshipDto,
  type FamilyTreeDto,
} from '@/services/family.service';
import { Lunar, Solar } from 'lunar-typescript';

const BoxAny = Box as any;
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const editableSurfaceColor = 'rgba(8,145,178,0.08)';
const editableSurfaceBorder = 'rgba(8,145,178,0.2)';
const panelHeaderPaddingSx = { pl: 2.25, pr: 3 };
const panelSectionPaddingSx = { pl: 2.25, pr: 3 };
const roundedTextFieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '5px',
    backgroundColor: editableSurfaceColor,
    transition: 'background-color 120ms ease, box-shadow 120ms ease, border-color 120ms ease',
    '& fieldset': {
      borderColor: editableSurfaceBorder,
    },
    '&:hover fieldset': {
      borderColor: 'rgba(8,145,178,0.32)',
    },
    '&.Mui-focused fieldset': {
      borderColor: '#0891b2',
    },
  },
};
const inlineRowInputSx = {
  fontSize: 13,
  color: '#0f172a',
  px: 0.6,
  py: 0.3,
  borderRadius: '5px',
  backgroundColor: editableSurfaceColor,
  boxShadow: `inset 0 0 0 1px ${editableSurfaceBorder}`,
  transition: 'background-color 120ms ease, box-shadow 120ms ease',
  '& input, & textarea': {
    p: 0,
  },
  '&:focus-within': {
    boxShadow: 'inset 0 0 0 1px #0891b2',
    backgroundColor: 'rgba(8,145,178,0.1)',
  },
};
const linkSelectSurfaceColor = '#eef9fc';
const linkSelectSurfaceHoverColor = '#e0f4f8';
const linkSelectSurfaceBorder = '#b7dce6';
const linkSelectMenuProps = {
  PaperProps: {
    sx: {
      background: '#f8fcfd',
      backgroundImage: 'none',
      border: '1px solid #cfe3ea',
      boxShadow: '0 10px 24px rgba(15,23,42,0.12)',
      '& .MuiMenuItem-root': {
        fontSize: 13,
        color: '#0f172a',
      },
      '& .MuiMenuItem-root.Mui-selected': {
        backgroundColor: 'rgba(8,145,178,0.12)',
      },
      '& .MuiMenuItem-root.Mui-selected:hover': {
        backgroundColor: 'rgba(8,145,178,0.18)',
      },
    },
  },
} as const;
const inlineRowSelectSx = {
  width: '100%',
  borderRadius: '5px',
  backgroundColor: linkSelectSurfaceColor,
  boxShadow: `inset 0 0 0 1px ${linkSelectSurfaceBorder}`,
  transition: 'background-color 120ms ease, box-shadow 120ms ease',
  '& .MuiSelect-select': {
    px: 0.6,
    py: 0.55,
    fontSize: 13,
    color: '#0f172a',
    opacity: 1,
  },
  '& .MuiSelect-icon': {
    color: '#475569',
    opacity: 1,
  },
  '& .MuiInputBase-input': {
    color: '#0f172a',
    opacity: 1,
  },
  '&:hover': {
    backgroundColor: linkSelectSurfaceHoverColor,
  },
  '&.Mui-focused': {
    boxShadow: 'inset 0 0 0 1px #0891b2',
    backgroundColor: '#d8f0f5',
  },
};
const linkSelectInputSx = {
  ...inlineRowInputSx,
  width: '100%',
  backgroundColor: linkSelectSurfaceColor,
  boxShadow: `inset 0 0 0 1px ${linkSelectSurfaceBorder}`,
  '&:focus-within': {
    boxShadow: 'inset 0 0 0 1px #0891b2',
    backgroundColor: '#d8f0f5',
  },
};
const compactRowSx = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: 1,
  alignItems: 'center',
  px: 0,
  py: 0,
};
const compactGenderColumn = '1.35em';
const compactRankColumn = '1ch';
const compactDeleteColumn = '20px';
const compactRelationGap = 0.45;
const relationTableBackground = [
  'linear-gradient(90deg,',
  'rgba(34,197,94,0.08) 0%,',
  'rgba(34,197,94,0.08) 33.333%,',
  'rgba(15,23,42,0.06) 33.333%,',
  'rgba(15,23,42,0.06) 66.666%,',
  'rgba(34,197,94,0.08) 66.666%,',
  'rgba(34,197,94,0.08) 100%)',
].join(' ');
const relationTableSurfaceSx = {
  mb: 0.2,
  px: 0.8,
  py: 0.3,
  borderRadius: '8px',
  backgroundImage: relationTableBackground,
  boxShadow: 'inset 0 0 0 1px rgba(15,23,42,0.05)',
};

function buildRelationTableBackground(columnCount: number) {
  if (columnCount <= 1) {
    return 'rgba(34,197,94,0.08)';
  }

  const segments = Array.from({ length: columnCount }, (_, index) => {
    const start = (index * 100) / columnCount;
    const end = ((index + 1) * 100) / columnCount;
    const color = index % 2 === 0 ? 'rgba(34,197,94,0.08)' : 'rgba(15,23,42,0.06)';
    return `${color} ${start}%, ${color} ${end}%`;
  });

  return `linear-gradient(90deg, ${segments.join(', ')})`;
}

function getRelationTableSurfaceSx(columnCount: number) {
  return {
    ...relationTableSurfaceSx,
    backgroundImage: buildRelationTableBackground(columnCount),
  };
}

function getRelationGridColumns(columnCount: number) {
  return `repeat(${Math.max(columnCount, 1)}, minmax(0, 1fr))`;
}
const compactToggleButtonSx = {
  px: 0,
  py: 0,
  minHeight: '1.25rem',
  lineHeight: 1,
  borderRadius: '4px',
  border: 'none',
  backgroundColor: 'rgba(220,38,38,0.12)',
  color: '#b91c1c',
  boxShadow: 'inset 0 -1px 0 rgba(185,28,28,0.12)',
  fontWeight: 500,
  textTransform: 'none',
  cursor: 'pointer',
  transition: 'background-color 120ms ease, color 120ms ease, box-shadow 120ms ease',
  '&:hover': {
    backgroundColor: 'rgba(220,38,38,0.18)',
    color: '#991b1b',
    boxShadow: 'inset 0 -1px 0 rgba(153,27,27,0.18)',
  },
  '&:focus-visible': {
    outline: '2px solid rgba(220,38,38,0.18)',
    outlineOffset: '1px',
  },
};

type GenderValue = 'male' | 'female' | 'unknown';

interface EditableFamilyDate {
  year: string;
  month: string;
  day: string;
  calendarType: 'solar' | 'lunar';
  isLeapMonth: boolean;
}

interface EditorState {
  name: string;
  gender: GenderValue;
  linkedTreeId: string;
  linkedPersonId: string;
  briefNote: string;
  biography: string;
  isDeceased: boolean;
  birthDate: EditableFamilyDate;
  deathDate: EditableFamilyDate;
  photos: FamilyPhoto[];
}

interface AddRelativeState {
  open: boolean;
  name: string;
  gender: GenderValue;
  rank: string;
  saving: boolean;
  error: string | null;
}

interface PendingChildDraft {
  id: string;
  name: string;
  gender: GenderValue;
  rank: string;
}

interface PendingParentDraft {
  id: string;
  name: string;
  gender: GenderValue;
}

interface ParsedPendingChildDraft extends PendingChildDraft {
  trimmedName: string;
  parsedRank: number;
}

interface ParsedPendingParentDraft extends PendingParentDraft {
  trimmedName: string;
}

interface RelationLineageDraft {
  displayTag: string;
  lineageType: string;
  sourceParentId: string;
  sourceChildRank: string;
  adoptiveParentId: string;
}

interface Props {
  person: FamilyNode | null;
  tree: FamilyTreeDto | null;
  allPersons: FamilyNode[];
  onClose: () => void;
  onNavigate: (personId: string) => void;
  onOpenLinkedPerson?: (treeId: string, personId: string) => void;
  onRefresh: (preferredPersonId?: string | null) => Promise<void>;
  onEditingChange?: (editing: boolean) => void;
  canEdit?: boolean;
  fullWidth?: boolean;
}

function formatGender(gender?: string) {
  if (gender === 'female') return '女';
  if (gender === 'unknown') return '未知';
  return '男';
}

function toggleBinaryGender(gender?: string): GenderValue {
  return gender === 'female' ? 'male' : 'female';
}

function cycleRank(value?: number | string) {
  const current = typeof value === 'string' ? Number.parseInt(value, 10) : value ?? 1;
  if (Number.isNaN(current) || current < 1 || current >= 9) return '1';
  return String(current + 1);
}

function formatDisplayName(name: string) {
  const trimmed = name.trim();
  if (/^[\u4e00-\u9fff]{2}$/.test(trimmed)) {
    return `${trimmed[0]}　${trimmed[1]}`;
  }

  return trimmed;
}

function toChineseOrdinal(value: number) {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  if (value <= 0) return '';
  if (value < 10) return digits[value];
  if (value === 10) return '十';
  if (value < 20) return `十${digits[value - 10]}`;

  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${digits[tens]}十${ones === 0 ? '' : digits[ones]}`;
}

function toParentOrderLabel(position: number) {
  if (position <= 0) return '';
  if (position === 1) return '长';
  if (position === 2) return '次';
  return toChineseOrdinal(position);
}

function getGenderColor(gender?: string) {
  if (gender === 'female') {
    return { background: '#fce7f3', border: '#f472b6', text: '#ec4899' };
  }
  if (gender === 'unknown') {
    return { background: '#f1f5f9', border: '#94a3b8', text: '#475569' };
  }
  return { background: '#dbeafe', border: '#60a5fa', text: '#2563eb' };
}

function hydrateFamilyNodes(persons: FamilyPersonDto[], rels: FamilyRelationshipDto[]) {
  const map = new Map(persons.map(candidate => [
    candidate.id,
    { ...candidate, children: [], spouses: [], parentRels: [], spouseRels: [] } as FamilyNode,
  ]));

  const parentChildRels = rels
    .filter(rel => rel.type === 'parent-child')
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));

  for (const rel of parentChildRels) {
    const parent = map.get(rel.fromId);
    const child = map.get(rel.toId);
    if (!parent || !child) continue;
    parent.children.push(child);
    child.parentRels.push(rel);
  }

  for (const rel of rels.filter(candidate => candidate.type === 'spouse')) {
    const left = map.get(rel.fromId);
    const right = map.get(rel.toId);
    if (!left || !right) continue;
    left.spouses.push(right);
    right.spouses.push(left);
    left.spouseRels.push(rel);
    right.spouseRels.push(rel);
  }

  return [...map.values()];
}

function getOrderedChildren(person: FamilyNode) {
  return [...person.children].sort((left, right) => {
    const leftSortOrder = left.parentRels.find(rel => rel.type === 'parent-child' && rel.fromId === person.id)?.sortOrder ?? 0;
    const rightSortOrder = right.parentRels.find(rel => rel.type === 'parent-child' && rel.fromId === person.id)?.sortOrder ?? 0;
    return rightSortOrder - leftSortOrder;
  });
}

function shouldIncludeSpouseChildren(person: FamilyNode) {
  return person.spouses.length > 0;
}

function getDisplayChildren(person: FamilyNode) {
  const byId = new Map<string, FamilyNode>();
  const includeSpouseChildren = shouldIncludeSpouseChildren(person);

  for (const child of person.children) {
    byId.set(child.id, child);
  }

  if (includeSpouseChildren) {
    for (const spouse of person.spouses) {
      for (const child of spouse.children) {
        if (!byId.has(child.id)) {
          byId.set(child.id, child);
        }
      }
    }
  }

  return [...byId.values()].sort((left, right) => {
    const getSortOrder = (child: FamilyNode) => {
      const directSortOrder = child.parentRels.find(rel => rel.type === 'parent-child' && rel.fromId === person.id)?.sortOrder;
      if (typeof directSortOrder === 'number') {
        return directSortOrder;
      }

      for (const spouse of person.spouses) {
        const spouseSortOrder = child.parentRels.find(rel => rel.type === 'parent-child' && rel.fromId === spouse.id)?.sortOrder;
        if (typeof spouseSortOrder === 'number') {
          return spouseSortOrder;
        }
      }

      return 0;
    };

    return getSortOrder(right) - getSortOrder(left);
  });
}

function buildRelationAnnotation(rel: FamilyNode['parentRels'][number] | undefined) {
  if (!rel) return '';

  const parts: string[] = [];
  if (rel.displayTag?.trim()) {
    parts.push(rel.displayTag.trim());
  } else if (rel.lineageType === 'adoptive') {
    parts.push('继');
  }

  if (rel.notes?.trim()) {
    parts.push(rel.notes.trim());
  }

  return parts.join(' · ');
}

function toRelationLineageDraft(rel: FamilyNode['parentRels'][number]): RelationLineageDraft {
  return {
    displayTag: rel.displayTag?.trim() ?? '',
    lineageType: rel.lineageType?.trim() ?? '',
    sourceParentId: rel.sourceParentId?.trim() ?? '',
    sourceChildRank: rel.sourceChildRank ? String(rel.sourceChildRank) : '',
    adoptiveParentId: '',
  };
}

function isAdoptiveLineageRelationship(rel: FamilyNode['parentRels'][number] | undefined) {
  if (!rel) return false;
  return rel.displayTag?.trim() === '继子' || rel.lineageType?.trim() === 'adoptive';
}

function getBrotherCandidates(person: FamilyNode, allPersons: FamilyNode[]) {
  const parentIds = new Set(person.parentRels.map(rel => rel.fromId));
  if (parentIds.size === 0) return [] as FamilyNode[];

  return allPersons.filter(candidate => {
    if (candidate.id === person.id) return false;
    if (candidate.gender === 'female') return false;
    return candidate.parentRels.some(rel => parentIds.has(rel.fromId));
  });
}

function getRelationColumns(person: FamilyNode, allPersons: FamilyNode[]) {
  const resolveParents = (target: FamilyNode, predicate: (rel: FamilyNode['parentRels'][number]) => boolean) => target.parentRels
    .filter(predicate)
    .map(rel => allPersons.find(candidate => candidate.id === rel.fromId))
    .filter(Boolean) as FamilyNode[];

  const expandParents = (parentSeeds: FamilyNode[]) => {
    const byId = new Map<string, FamilyNode>();

    for (const parent of parentSeeds) {
      byId.set(parent.id, parent);
    }

    for (const parent of parentSeeds) {
      for (const spouse of parent.spouses) {
        if (spouse.id !== person.id && !byId.has(spouse.id)) {
          byId.set(spouse.id, spouse);
        }
      }
    }

    return [...byId.values()];
  };

  const biologicalParentSeeds = (() => {
    const direct = resolveParents(person, rel => !isAdoptiveLineageRelationship(rel));
    return direct.length > 0
      ? direct
      : person.spouses.flatMap(spouse => resolveParents(spouse, rel => !isAdoptiveLineageRelationship(rel)));
  })();

  const adoptiveParentSeeds = (() => {
    const direct = resolveParents(person, rel => isAdoptiveLineageRelationship(rel));
    return direct.length > 0
      ? direct
      : person.spouses.flatMap(spouse => resolveParents(spouse, rel => isAdoptiveLineageRelationship(rel)));
  })();

  const adoptiveParents = expandParents(adoptiveParentSeeds);
  const biologicalParents = expandParents(biologicalParentSeeds);
  const parents = adoptiveParents.length > 0 ? adoptiveParents : biologicalParents;

  const parentRelationById = new Map(person.parentRels.map(rel => [rel.fromId, rel]));

  return [
    {
      key: 'parents',
      title: '父母',
      items: parents.map((parent, index) => ({
        id: parent.id,
        label: formatDisplayName(parent.name),
        suffix: toParentOrderLabel(index + 1),
        annotation: buildRelationAnnotation(parentRelationById.get(parent.id)),
      })),
    },
    {
      key: 'spouses',
      title: '配偶',
      items: person.spouses.map((spouse, index) => ({
        id: spouse.id,
        label: formatDisplayName(spouse.name),
        suffix: toParentOrderLabel(index + 1),
        annotation: '',
      })),
    },
    {
      key: 'children',
      title: '子女',
      items: getDisplayChildren(person).map((child, index) => ({
        id: child.id,
        label: formatDisplayName(child.name),
        suffix: toParentOrderLabel(index + 1),
        annotation: buildRelationAnnotation(child.parentRels.find(rel => rel.type === 'parent-child' && rel.fromId === person.id)),
      })),
    },
  ] as const;
}

function getBiologicalParentItems(person: FamilyNode, allPersons: FamilyNode[]) {
  const biologicalParentSeeds = person.parentRels
    .filter(rel => !isAdoptiveLineageRelationship(rel))
    .map(rel => allPersons.find(candidate => candidate.id === rel.fromId))
    .filter(Boolean) as FamilyNode[];

  const byId = new Map<string, FamilyNode>();
  for (const parent of biologicalParentSeeds) {
    byId.set(parent.id, parent);
  }

  for (const parent of biologicalParentSeeds) {
    for (const spouse of parent.spouses) {
      if (spouse.id !== person.id && !byId.has(spouse.id)) {
        byId.set(spouse.id, spouse);
      }
    }
  }

  const parentRelationById = new Map(person.parentRels.map(rel => [rel.fromId, rel]));

  return [...byId.values()].map((parent, index) => ({
    id: parent.id,
    label: formatDisplayName(parent.name),
    suffix: toParentOrderLabel(index + 1),
    annotation: buildRelationAnnotation(parentRelationById.get(parent.id)),
  }));
}

function formatDate(date?: FamilyDate) {
  if (!date) return '';

  const solar = getSolarModelFromEditableDate({
    year: String(date.year ?? ''),
    month: date.month ? String(date.month) : '',
    day: date.day ? String(date.day) : '',
    calendarType: date.calendarType === 'lunar' ? 'lunar' : 'solar',
    isLeapMonth: Boolean(date.isLeapMonth),
  });

  if (solar) {
    const lunar = solar.getLunar();
    return `${solar.toYmd()}（${lunar.getYear()}${lunar.getYearInGanZhi()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}）`;
  }

  const prefix = date.calendarType === 'lunar' ? '农历 ' : '';
  const parts = [date.year.toString()];

  if (date.month) {
    const monthText = `${date.calendarType === 'lunar' && date.isLeapMonth ? '闰' : ''}${String(date.month).padStart(2, '0')}`;
    parts.push(monthText);
  }

  if (date.day) {
    parts.push(String(date.day).padStart(2, '0'));
  }

  return `${prefix}${parts.join('-')}`;
}

function emptyEditableDate(calendarType: 'solar' | 'lunar' = 'solar'): EditableFamilyDate {
  return { year: '', month: '', day: '', calendarType, isLeapMonth: false };
}

function toEditableDate(date?: FamilyDate): EditableFamilyDate {
  if (!date) return emptyEditableDate();

  return {
    year: String(date.year ?? ''),
    month: date.month ? String(date.month) : '',
    day: date.day ? String(date.day) : '',
    calendarType: date.calendarType === 'lunar' ? 'lunar' : 'solar',
    isLeapMonth: Boolean(date.isLeapMonth),
  };
}

function toEditorState(person: FamilyNode): EditorState {
  return {
    name: person.name,
    gender: (person.gender as GenderValue) ?? 'unknown',
    linkedTreeId: person.linkedTreeId ?? '',
    linkedPersonId: person.linkedPersonId ?? '',
    briefNote: person.briefNote ?? '',
    biography: person.biography ?? '',
    isDeceased: person.isAlive === false || Boolean(person.deathDate),
    birthDate: toEditableDate(person.birthDate),
    deathDate: toEditableDate(person.deathDate),
    photos: person.photos ? [...person.photos] : [],
  };
}

function countBriefNoteUnits(value: string) {
  const normalized = value.trim();
  if (!normalized) return 0;
  if (/\s/.test(normalized)) {
    return normalized.split(/\s+/).filter(Boolean).length;
  }
  return Array.from(normalized).length;
}

function buildStoredFamilyDate(value: EditableFamilyDate, label: string): FamilyDate | undefined {
  if (!value.year.trim()) return undefined;

  const year = Number.parseInt(value.year, 10);
  if (Number.isNaN(year)) {
    throw new Error(`${label}日期无效。`);
  }

  const monthText = value.month.trim();
  const dayText = value.day.trim();

  if (!monthText && !dayText) {
    return {
      year,
      calendarType: 'solar',
      isLeapMonth: false,
    };
  }

  if (monthText && !dayText) {
    const month = Number.parseInt(monthText, 10);
    if (Number.isNaN(month) || month < 1 || month > 12) {
      throw new Error(`${label}日期无效。`);
    }

    return {
      year,
      month,
      calendarType: 'solar',
      isLeapMonth: false,
    };
  }

  if (!monthText && dayText) {
    throw new Error(`${label}日期无效。`);
  }

  const solar = getSolarModelFromEditableDate(value);
  if (!solar) {
    throw new Error(`${label}日期无效。`);
  }

  const [, month, day] = solar.toYmd().split('-').map(part => Number.parseInt(part, 10));
  return {
    year,
    month,
    day,
    calendarType: 'solar',
    isLeapMonth: false,
  };
}

function getSolarModelFromEditableDate(value: EditableFamilyDate) {
  if (!value.year || !value.month || !value.day) return null;

  const year = Number.parseInt(value.year, 10);
  const month = Number.parseInt(value.month, 10);
  const day = Number.parseInt(value.day, 10);

  if ([year, month, day].some(part => Number.isNaN(part))) {
    return null;
  }

  try {
    if (value.calendarType === 'solar') {
      return Solar.fromYmd(year, month, day);
    }

    return Lunar.fromYmd(year, value.isLeapMonth ? -month : month, day).getSolar();
  } catch {
    return null;
  }
}

function toEditableDateFromSolarModel(solar: ReturnType<typeof Solar.fromYmd>, calendarType: EditableFamilyDate['calendarType']): EditableFamilyDate {
  if (calendarType === 'solar') {
    const [year, month, day] = solar.toYmd().split('-');
    return {
      year,
      month,
      day,
      calendarType: 'solar',
      isLeapMonth: false,
    };
  }

  const lunar = solar.getLunar();
  const lunarMonth = lunar.getMonth();
  return {
    year: String(lunar.getYear()),
    month: String(Math.abs(lunarMonth)),
    day: String(lunar.getDay()),
    calendarType: 'lunar',
    isLeapMonth: lunarMonth < 0,
  };
}

function formatEditableDateSummary(value: EditableFamilyDate) {
  const solar = getSolarModelFromEditableDate(value);
  if (!solar) return '';

  const lunar = solar.getLunar();
  return `${solar.toYmd()}（${lunar.getYear()}${lunar.getYearInGanZhi()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}）`;
}

function formatEditableDateInputValue(value: EditableFamilyDate) {
  const solar = getSolarModelFromEditableDate(value);
  if (solar) return solar.toYmd();

  const year = value.year.trim();
  const month = value.month.trim();
  const day = value.day.trim();

  if (!year) return '';
  if (!month) return year;
  if (!day) return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

function formatLunarHint(rawValue: string, value: EditableFamilyDate) {
  const trimmed = rawValue.trim();
  if (!trimmed) return '';

  const parsedSolar = parseSolarInput(trimmed);
  if (parsedSolar) {
    const previewLunar = parsedSolar.getLunar();
    return `${previewLunar.getYear()}${previewLunar.getYearInGanZhi()}年${previewLunar.getMonthInChinese()}月${previewLunar.getDayInChinese()}`;
  }

  const parts = trimmed.split(/[^\d]+/).filter(Boolean);
  if (parts.length >= 1) {
    const year = Number.parseInt(parts[0], 10);
    if (!Number.isNaN(year) && year >= 1 && year <= 9999) {
      try {
        const lunarYear = Lunar.fromYmd(year, 1, 1);
        return `${year}${lunarYear.getYearInGanZhi()}年`;
      } catch {
        return `${year}年`;
      }
    }
  }

  return formatEditableDateSummary(value) || '';
}

function parseSolarInput(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/[^\d]+/).filter(Boolean);
  if (parts.length !== 3) return null;

  const [year, month, day] = parts.map(part => Number.parseInt(part, 10));
  if ([year, month, day].some(part => Number.isNaN(part))) return null;

  try {
    return Solar.fromYmd(year, month, day);
  } catch {
    return null;
  }
}

interface MixedCalendarCell {
  key: string;
  solarYear: number;
  solarMonth: number;
  solarDay: number;
  currentMonth: boolean;
  lunarYear: number;
  lunarMonth: number;
  lunarDay: number;
  isLeapMonth: boolean;
  lunarLabel: string;
}

function buildMixedCalendarCells(cursorYear: number, cursorMonth: number): MixedCalendarCell[] {
  const firstDay = new Date(cursorYear, cursorMonth - 1, 1);
  const startOffset = firstDay.getDay();

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(cursorYear, cursorMonth - 1, index - startOffset + 1);
    const solarYear = date.getFullYear();
    const solarMonth = date.getMonth() + 1;
    const solarDay = date.getDate();
    const solar = Solar.fromYmd(solarYear, solarMonth, solarDay);
    const lunar = solar.getLunar();
    const lunarMonth = lunar.getMonth();
    const lunarDay = lunar.getDay();
    const isLeapMonth = lunarMonth < 0;

    return {
      key: `${solarYear}-${solarMonth}-${solarDay}`,
      solarYear,
      solarMonth,
      solarDay,
      currentMonth: solarMonth === cursorMonth,
      lunarYear: lunar.getYear(),
      lunarMonth: Math.abs(lunarMonth),
      lunarDay,
      isLeapMonth,
      lunarLabel: lunarDay === 1 ? `${lunar.getMonthInChinese()}月` : lunar.getDayInChinese(),
    };
  });
}

function createPhotoEntry(url: string, fileName: string): FamilyPhoto {
  const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.round(Math.random() * 100000)}`;

  return {
    id: `photo_${randomId}`,
    url,
    caption: fileName,
  };
}

function createPendingChildDraft(rank: string): PendingChildDraft {
  const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.round(Math.random() * 100000)}`;

  return {
    id: `pending_child_${randomId}`,
    name: '',
    gender: 'male',
    rank,
  };
}

function createPendingParentDraft(): PendingParentDraft {
  const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.round(Math.random() * 100000)}`;

  return {
    id: `pending_parent_${randomId}`,
    name: '',
    gender: 'male',
  };
}

function serializeEditorState(state: EditorState) {
  return JSON.stringify(state);
}

const FamilyDateEditor: React.FC<{
  label: string;
  value: EditableFamilyDate;
  onChange: (nextValue: EditableFamilyDate) => void;
  compact?: boolean;
}> = ({ label, value, onChange, compact = false }) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedSolar = useMemo(() => getSolarModelFromEditableDate(value), [value]);
  const selectedSolarYmd = selectedSolar?.toYmd() ?? '';
  const [pickerDateInput, setPickerDateInput] = useState(() => formatEditableDateInputValue(value));
  const [pickerCursor, setPickerCursor] = useState(() => {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  });
  const [pickerYearInput, setPickerYearInput] = useState(() => String(new Date().getFullYear()));
  const cells = useMemo(() => buildMixedCalendarCells(pickerCursor.year, pickerCursor.month), [pickerCursor.month, pickerCursor.year]);

  useEffect(() => {
    setPickerDateInput(formatEditableDateInputValue(value));
  }, [selectedSolar, selectedSolarYmd, value]);

  useEffect(() => {
    if (!pickerOpen) return;

    const baseDate = selectedSolar
      ? new Date(selectedSolar.toYmd())
      : new Date();

    setPickerCursor({
      year: baseDate.getFullYear(),
      month: baseDate.getMonth() + 1,
    });
  }, [pickerOpen, selectedSolar, selectedSolarYmd]);

  useEffect(() => {
    setPickerYearInput(String(pickerCursor.year));
  }, [pickerCursor.year]);

  const handlePickDate = (cell: MixedCalendarCell) => {
    const solar = Solar.fromYmd(cell.solarYear, cell.solarMonth, cell.solarDay);
    onChange(toEditableDateFromSolarModel(solar, 'solar'));
    setPickerDateInput(solar.toYmd());
    setPickerOpen(false);
  };

  const moveMonth = (delta: number) => {
    const nextDate = new Date(pickerCursor.year, pickerCursor.month - 1 + delta, 1);
    setPickerCursor({ year: nextDate.getFullYear(), month: nextDate.getMonth() + 1 });
  };

  const applyPickerYearInput = () => {
    const nextYear = Number.parseInt(pickerYearInput, 10);
    if (Number.isNaN(nextYear) || nextYear < 1 || nextYear > 9999) {
      setPickerYearInput(String(pickerCursor.year));
      return;
    }

    setPickerCursor(current => ({ ...current, year: nextYear }));
  };

  const parsedInputSolar = useMemo(() => parseSolarInput(pickerDateInput), [pickerDateInput]);

  const commitDateInput = () => {
    if (!pickerDateInput.trim()) {
      onChange(emptyEditableDate('solar'));
      return;
    }

    if (!parsedInputSolar) {
      setPickerDateInput(formatEditableDateInputValue(value));
      return;
    }

    onChange(toEditableDateFromSolarModel(parsedInputSolar, 'solar'));
    setPickerDateInput(parsedInputSolar.toYmd());
  };

  const openCalendarAtInputDate = () => {
    const targetSolar = parsedInputSolar ?? selectedSolar;
    if (targetSolar) {
      const targetDate = new Date(targetSolar.toYmd());
      setPickerCursor({ year: targetDate.getFullYear(), month: targetDate.getMonth() + 1 });
      onChange(toEditableDateFromSolarModel(targetSolar, 'solar'));
      setPickerDateInput(targetSolar.toYmd());
    }
    setPickerOpen(true);
  };

  const lunarHint = formatLunarHint(pickerDateInput, value);

  const inputNode = (
    <>
      <BoxAny sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 1, alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="xxxx-xx-xx"
          value={pickerDateInput}
          onChange={event => setPickerDateInput(event.target.value)}
          onBlur={commitDateInput}
          onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitDateInput();
            }
          }}
          fullWidth
          sx={roundedTextFieldSx}
        />
        <Button size="small" variant="outlined" onClick={openCalendarAtInputDate} sx={{ minWidth: 56, height: 28, px: 1, fontSize: 11 }}>
          {label}
        </Button>
      </BoxAny>
      <Typography variant="caption" color="text.secondary">
        {lunarHint}
      </Typography>
    </>
  );

  return (
    <BoxAny sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0.75 }}>
      {compact ? (
        <BoxAny sx={{ display: 'grid', gridTemplateColumns: '32px 9.5ch minmax(0, 1fr)', columnGap: 0.5, alignItems: 'center' }}>
          <BoxAny
            component="button"
            type="button"
            onClick={openCalendarAtInputDate}
            sx={{
              p: 0,
              border: 'none',
              background: 'transparent',
              justifySelf: 'start',
              textAlign: 'left',
              fontSize: 12,
              lineHeight: 1.2,
              color: '#166534',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'color 120ms ease, transform 120ms ease',
              '&:hover': {
                color: '#15803d',
                transform: 'translateY(-1px)',
              },
              '&:focus-visible': {
                outline: 'none',
                color: '#15803d',
                textDecoration: 'underline',
              },
            }}
          >
            {label}
          </BoxAny>
          <InputBase
            placeholder="xxxx-xx-xx"
            value={pickerDateInput}
            onChange={event => setPickerDateInput(event.target.value)}
            onBlur={commitDateInput}
            onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitDateInput();
              }
            }}
            fullWidth
            sx={{ ...inlineRowInputSx, width: '10.5ch', maxWidth: '10.5ch' }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 0, fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {lunarHint}
          </Typography>
        </BoxAny>
      ) : (
        <BoxAny sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0.75 }}>
          {inputNode}
        </BoxAny>
      )}
      <Dialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: {
            background: '#fff',
            backgroundImage: 'none',
            border: '1px solid rgba(15,23,42,0.08)',
            boxShadow: '0 18px 48px rgba(15,23,42,0.18)',
          },
        }}
        BackdropProps={{
          sx: {
            backdropFilter: 'none',
            backgroundColor: 'rgba(15,23,42,0.38)',
          },
        }}
      >
        <DialogTitle>{label}</DialogTitle>
        <DialogContent dividers>
          <BoxAny sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
            <Button size="small" onClick={() => moveMonth(-1)}>上月</Button>
            <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TextField
                size="small"
                label="年份"
                value={pickerYearInput}
                onChange={event => setPickerYearInput(event.target.value.replace(/[^\d]/g, ''))}
                onBlur={applyPickerYearInput}
                onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    applyPickerYearInput();
                  }
                }}
                sx={{ ...roundedTextFieldSx, width: 108 }}
              />
              <Typography variant="subtitle2" fontWeight="bold">
                {pickerCursor.month}月
              </Typography>
            </BoxAny>
            <Button size="small" onClick={() => moveMonth(1)}>下月</Button>
          </BoxAny>

          <BoxAny sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.75 }}>
            {WEEKDAY_LABELS.map(weekday => (
              <Typography key={weekday} variant="caption" color="text.secondary" sx={{ textAlign: 'center', py: 0.5, fontWeight: 700 }}>
                {weekday}
              </Typography>
            ))}

            {cells.map(cell => {
              const isSelected = value.calendarType === 'solar'
                ? selectedSolarYmd === `${String(cell.solarYear).padStart(4, '0')}-${String(cell.solarMonth).padStart(2, '0')}-${String(cell.solarDay).padStart(2, '0')}`
                : (value.year === String(cell.lunarYear)
                  && value.month === String(cell.lunarMonth)
                  && value.day === String(cell.lunarDay)
                  && value.isLeapMonth === cell.isLeapMonth);

              return (
                <BoxAny
                  key={cell.key}
                  component="button"
                  type="button"
                  onClick={() => handlePickDate(cell)}
                  sx={{
                    minHeight: 56,
                    px: 0.75,
                    py: 0.75,
                    borderRadius: '5px',
                    border: isSelected ? '1px solid rgb(42,175,71)' : '1px solid rgba(15,23,42,0.08)',
                    background: isSelected
                      ? 'rgba(42,175,71,0.12)'
                      : cell.currentMonth
                        ? '#fff'
                        : 'rgba(148,163,184,0.08)',
                    color: cell.currentMonth ? '#0f172a' : '#94a3b8',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'border-color 120ms ease, transform 120ms ease, background 120ms ease',
                    '&:hover': {
                      borderColor: 'rgb(42,175,71)',
                      transform: 'translateY(-1px)',
                    },
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                    {cell.solarDay}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.35, fontSize: 10.5, color: cell.currentMonth ? '#64748b' : '#94a3b8' }}>
                    {cell.lunarLabel}
                  </Typography>
                </BoxAny>
              );
            })}
          </BoxAny>

        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPickerOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </BoxAny>
  );
};

export const FamilyPersonPanel: React.FC<Props> = ({
  person,
  tree,
  allPersons,
  onClose,
  onNavigate,
  onOpenLinkedPerson,
  onRefresh,
  onEditingChange,
  canEdit = false,
  fullWidth = false,
}) => {
  const [editing, setEditing] = useState(false);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [availableTrees, setAvailableTrees] = useState<FamilyTreeDto[]>([]);
  const [availableTreesLoaded, setAvailableTreesLoaded] = useState(false);
  const [linkablePersons, setLinkablePersons] = useState<FamilyPersonDto[]>([]);
  const [loadingLinkablePersons, setLoadingLinkablePersons] = useState(false);
  const [linkedTreeSelectorError, setLinkedTreeSelectorError] = useState<string | null>(null);
  const [linkedViewLoading, setLinkedViewLoading] = useState(false);
  const [linkedViewError, setLinkedViewError] = useState<string | null>(null);
  const [linkedViewState, setLinkedViewState] = useState<{ tree: FamilyTreeDto; person: FamilyNode; persons: FamilyNode[] } | null>(null);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelInfo, setPanelInfo] = useState<string | null>(null);
  const [spouseDialog, setSpouseDialog] = useState<AddRelativeState>({
    open: false,
    name: '',
    gender: 'male',
    rank: '1',
    saving: false,
    error: null,
  });
  const [pendingParents, setPendingParents] = useState<PendingParentDraft[]>([]);
  const [pendingChildren, setPendingChildren] = useState<PendingChildDraft[]>([]);
  const [relationLineageDrafts, setRelationLineageDrafts] = useState<Record<string, RelationLineageDraft>>({});
  const [relationGenderOverrides, setRelationGenderOverrides] = useState<Record<string, GenderValue>>({});
  const [childRankOverrides, setChildRankOverrides] = useState<Record<string, string>>({});
  const [pendingParentsError, setPendingParentsError] = useState<string | null>(null);
  const [pendingChildrenError, setPendingChildrenError] = useState<string | null>(null);
  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const editorRestoreRef = useRef<EditorState | null>(null);
  const preserveEditingAfterRefreshRef = useRef(false);
  const lastSavedEditorSnapshotRef = useRef('');

  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);

  useEffect(() => {
    if (!person) {
      setEditorState(null);
      setEditing(false);
      setLinkablePersons([]);
      setLinkedTreeSelectorError(null);
      setLinkedViewError(null);
      setLinkedViewState(null);
      return;
    }

    if (preserveEditingAfterRefreshRef.current && editorRestoreRef.current) {
      setEditorState(editorRestoreRef.current);
      lastSavedEditorSnapshotRef.current = serializeEditorState(editorRestoreRef.current);
      setEditing(true);
      preserveEditingAfterRefreshRef.current = false;
      editorRestoreRef.current = null;
    } else {
      const nextEditorState = toEditorState(person);
      setEditorState(nextEditorState);
      lastSavedEditorSnapshotRef.current = serializeEditorState(nextEditorState);
      setEditing(false);
    }
    setPanelError(null);
    setPanelInfo(null);
    setSpouseDialog({ open: false, name: '', gender: 'male', rank: '1', saving: false, error: null });
    setPendingParents([]);
    setPendingChildren([]);
    setRelationLineageDrafts({});
    setRelationGenderOverrides({});
    setChildRankOverrides({});
    setPendingParentsError(null);
    setPendingChildrenError(null);
    setActivePhotoIndex(null);
  }, [person]);

  useEffect(() => {
    if (availableTreesLoaded || (!editing && !person?.linkedTreeId)) return;

    let cancelled = false;
    void familyService.listTrees()
      .then(trees => {
        if (cancelled) return;
        setAvailableTrees(trees);
        setAvailableTreesLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLinkedTreeSelectorError('加载谱系列表失败。');
      });

    return () => {
      cancelled = true;
    };
  }, [availableTreesLoaded, editing, person?.linkedTreeId]);

  useEffect(() => {
    if (!editing || !editorState?.linkedTreeId) {
      setLinkablePersons([]);
      setLoadingLinkablePersons(false);
      return;
    }

    let cancelled = false;
    setLoadingLinkablePersons(true);
    setLinkedTreeSelectorError(null);

    void familyService.getTree(editorState.linkedTreeId)
      .then(response => {
        if (cancelled) return;
        setLinkablePersons(response.persons);

        const currentLinkedPersonId = editorState.linkedPersonId;
        if (currentLinkedPersonId && response.persons.some(candidate => candidate.id === currentLinkedPersonId)) {
          return;
        }

        const currentName = editorState.name.trim();
        if (!currentName) {
          return;
        }

        const sameNameCandidate = response.persons.find(candidate => candidate.name.trim() === currentName);
        if (!sameNameCandidate) {
          return;
        }

        setEditorState(current => current && current.linkedTreeId === response.tree.id
          ? { ...current, linkedPersonId: sameNameCandidate.id }
          : current);
      })
      .catch(() => {
        if (cancelled) return;
        setLinkablePersons([]);
        setLinkedTreeSelectorError('加载关联人物失败。');
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingLinkablePersons(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [editing, editorState?.linkedPersonId, editorState?.linkedTreeId, editorState?.name]);

  useEffect(() => {
    if (!person?.linkedTreeId || !person.linkedPersonId) {
      setLinkedViewState(null);
      setLinkedViewError(null);
      setLinkedViewLoading(false);
      return;
    }

    let cancelled = false;
    setLinkedViewLoading(true);
    setLinkedViewError(null);

    void familyService.getTree(person.linkedTreeId)
      .then(response => {
        if (cancelled) return;
        const linkedNodes = hydrateFamilyNodes(response.persons, response.relationships);
        const linkedPerson = linkedNodes.find(candidate => candidate.id === person.linkedPersonId);
        if (!linkedPerson) {
          setLinkedViewState(null);
          setLinkedViewError('已关联的人物在目标谱系中不存在。');
          return;
        }
        setLinkedViewState({ tree: response.tree, person: linkedPerson, persons: linkedNodes });
      })
      .catch(() => {
        if (cancelled) return;
        setLinkedViewState(null);
        setLinkedViewError('加载关联谱系失败。');
      })
      .finally(() => {
        if (!cancelled) {
          setLinkedViewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [person?.linkedPersonId, person?.linkedTreeId]);

  const briefNoteUnits = countBriefNoteUnits(editorState?.briefNote ?? '');

  if (!person || !editorState) return null;

  const rootGen = tree?.rootGeneration ?? 1;
  const poem = tree?.zibeiPoem ?? [];
  const zibeiChar = poem[person.generation - rootGen] ?? '';
  const colorSet = getGenderColor(person.gender);
  const directParents = person.parentRels
    .map(rel => allPersons.find(candidate => candidate.id === rel.fromId))
    .filter(Boolean) as FamilyNode[];
  const children = person.children;
  const orderedChildren = getOrderedChildren(person);
  const spouses = person.spouses;
  const getRelationGender = (node: FamilyNode): GenderValue => relationGenderOverrides[node.id] ?? (node.gender === 'female' ? 'female' : 'male');
  const getChildRank = (child: FamilyNode, fallbackIndex: number) => childRankOverrides[child.id] ?? String(fallbackIndex + 1);
  const relationColumns = getRelationColumns(person, allPersons);
  const biologicalParentItems = getBiologicalParentItems(person, allPersons);
  const hasAdoptiveParentRelations = person.parentRels.some(rel => isAdoptiveLineageRelationship(rel));
  const relationRowCount = relationColumns.reduce((maxCount, column) => Math.max(maxCount, column.items.length), 0);
  const linkedRelationColumns = linkedViewState ? getRelationColumns(linkedViewState.person, linkedViewState.persons) : [];
  const linkedBiologicalParentItems = linkedViewState ? getBiologicalParentItems(linkedViewState.person, linkedViewState.persons) : [];
  const linkedHasAdoptiveParentRelations = linkedViewState ? linkedViewState.person.parentRels.some(rel => isAdoptiveLineageRelationship(rel)) : false;
  const linkedRelationRowCount = linkedRelationColumns.reduce((maxCount, column) => Math.max(maxCount, column.items.length), 0);
  const relationGridColumns = getRelationGridColumns(relationColumns.length);
  const linkedRelationGridColumns = getRelationGridColumns(linkedRelationColumns.length);
  const availableLinkedTrees = availableTrees.filter(candidate => candidate.id !== tree?.id);
  const relationshipEditing = Boolean(canEdit && editing);
  const editableParentRelationshipsRaw = directParents
    .map(parent => ({
      relationship: person.parentRels.find(rel => rel.type === 'parent-child' && rel.fromId === parent.id),
      counterpart: parent,
      kind: 'parent' as const,
    }))
    .filter((entry): entry is { relationship: FamilyNode['parentRels'][number]; counterpart: FamilyNode; kind: 'parent' } => Boolean(entry.relationship) && !isAdoptiveLineageRelationship(entry.relationship));
  const editableParentRelationships = (() => {
    if (editableParentRelationshipsRaw.length <= 1) return editableParentRelationshipsRaw;
    const fatherSideEntries = editableParentRelationshipsRaw.filter(entry => entry.counterpart.gender !== 'female');
    if (fatherSideEntries.length > 0) {
      return [fatherSideEntries[0]];
    }
    return [editableParentRelationshipsRaw[0]];
  })();
  const editableLineageRelationships = editableParentRelationships;
  const getLineageParticipants = (entry: typeof editableLineageRelationships[number]) => {
    const biologicalParent = entry.counterpart;
    const childNode = person;
    return { biologicalParent, childNode };
  };
  const getPairedAdoptiveRelation = (entry: typeof editableLineageRelationships[number]) => {
    const { biologicalParent, childNode } = getLineageParticipants(entry);
    return childNode.parentRels.find(rel => rel.id !== entry.relationship.id
      && rel.type === 'parent-child'
      && rel.fromId !== biologicalParent.id
      && (isAdoptiveLineageRelationship(rel) || rel.sourceParentId === biologicalParent.id));
  };
  const getOriginalRelationLineageDraft = (entry: typeof editableLineageRelationships[number]) => {
    const original = toRelationLineageDraft(entry.relationship);
    const pairedAdoptiveRelation = getPairedAdoptiveRelation(entry);
    return {
      ...original,
      adoptiveParentId: pairedAdoptiveRelation?.fromId ?? '',
    };
  };
  const getRelationLineageDraft = (entry: typeof editableLineageRelationships[number]) => ({
    ...getOriginalRelationLineageDraft(entry),
    ...(relationLineageDrafts[entry.relationship.id] ?? {}),
  });
  const getAdoptiveBrotherOptions = (entry: typeof editableLineageRelationships[number]) => {
    const { biologicalParent } = getLineageParticipants(entry);
    const options = getBrotherCandidates(biologicalParent, allPersons);
    const selectedTargetId = (relationLineageDrafts[entry.relationship.id]?.adoptiveParentId ?? getPairedAdoptiveRelation(entry)?.fromId ?? '').trim();
    if (selectedTargetId && !options.some(candidate => candidate.id === selectedTargetId)) {
      const selectedTarget = allPersons.find(candidate => candidate.id === selectedTargetId);
      if (selectedTarget) {
        return [...options, selectedTarget];
      }
    }
    return options;
  };
  const parentRowCount = directParents.length + pendingParents.length;
  const spouseDraftVisible = relationshipEditing && spouseDialog.open;
  const spouseRowCount = spouses.length + (spouseDraftVisible ? 1 : 0);
  const childRowCount = orderedChildren.length + pendingChildren.length;
  const editableRelationRowCount = Math.max(parentRowCount, spouseRowCount, childRowCount, 1);
  const coverImage = editorState.photos[0]?.url || person.avatarUrl;
  const photoUrls = (person.photos ?? []).map(photo => photo.url);
  const photoGroups = (person.photos ?? []).map(photo => ({
    sourceUrl: photo.url,
    messageId: `family:${tree?.id ?? 'unknown-tree'}:${person.id}:${photo.id}`,
    canEdit,
  }));
  const photoStack = (person.photos ?? []).slice(0, 3).reverse();

  const beginEditing = () => {
    if (!canEdit || editing) return;
    setEditing(true);
    setPanelError(null);
    setPanelInfo(null);
  };

  const resetEditor = () => {
    setEditorState(toEditorState(person));
    setEditing(false);
    setPanelError(null);
    setPanelInfo(null);
    setSpouseDialog({ open: false, name: '', gender: 'male', rank: '1', saving: false, error: null });
    setPendingParents([]);
    setPendingChildren([]);
    setRelationLineageDrafts({});
    setRelationGenderOverrides({});
    setChildRankOverrides({});
    setPendingParentsError(null);
    setPendingChildrenError(null);
  };

  const openPhotoPicker = () => {
    photoInputRef.current?.click();
  };

  const parsePendingChildren = (): ParsedPendingChildDraft[] | null => {
    const totalChildrenAfterSave = children.length + pendingChildren.length;
    const parsedPendingChildren = pendingChildren.map(draft => ({
      ...draft,
      trimmedName: draft.name.trim(),
      parsedRank: Number.parseInt(draft.rank, 10),
    }));

    if (parsedPendingChildren.some(draft => !draft.trimmedName)) {
      setPendingChildrenError('请输入子女姓名。');
      return null;
    }

    if (parsedPendingChildren.some(draft => Number.isNaN(draft.parsedRank) || draft.parsedRank < 1 || draft.parsedRank > totalChildrenAfterSave)) {
      setPendingChildrenError(`排行必须在 1 到 ${totalChildrenAfterSave} 之间。`);
      return null;
    }

    const uniqueRanks = new Set(parsedPendingChildren.map(draft => draft.parsedRank));
    if (uniqueRanks.size !== parsedPendingChildren.length) {
      setPendingChildrenError('新增子女的排行不能重复。');
      return null;
    }

    return parsedPendingChildren;
  };

  const parsePendingParents = (): ParsedPendingParentDraft[] | null => {
    const parsedPendingParents = pendingParents.map(draft => ({
      ...draft,
      trimmedName: draft.name.trim(),
    }));

    if (parsedPendingParents.some(draft => !draft.trimmedName)) {
      setPendingParentsError('请输入父母姓名。');
      return null;
    }

    return parsedPendingParents;
  };

  const validateChildRankOverrides = () => {
    if (Object.keys(childRankOverrides).length === 0) return true;

    const totalChildrenAfterSave = children.length + pendingChildren.length;
    const parsedRanks = orderedChildren.map((child, index) => Number.parseInt(getChildRank(child, index), 10));

    if (parsedRanks.some(rank => Number.isNaN(rank) || rank < 1 || rank > totalChildrenAfterSave)) {
      setPendingChildrenError(`排行必须在 1 到 ${totalChildrenAfterSave} 之间。`);
      return false;
    }

    const uniqueRanks = new Set(parsedRanks);
    if (uniqueRanks.size !== parsedRanks.length) {
      setPendingChildrenError('现有子女的排行不能重复。');
      return false;
    }

    return true;
  };

  const savePendingChildren = async (parsedPendingChildren: ParsedPendingChildDraft[]) => {
    if (!tree) return;

    type FinalChildEntry =
      | {
        kind: 'existing';
        child: FamilyNode;
        relationship: FamilyNode['parentRels'][number] | undefined;
        parsedRank: number;
      }
      | {
        kind: 'pending';
        draft: ParsedPendingChildDraft;
      };

    const existingEntries = orderedChildren.map(child => ({
      kind: 'existing' as const,
      child,
      relationship: child.parentRels.find(rel => rel.type === 'parent-child' && rel.fromId === person.id),
      parsedRank: Number.parseInt(childRankOverrides[child.id] ?? String((child.parentRels.find(rel => rel.type === 'parent-child' && rel.fromId === person.id)?.sortOrder ?? 0) + 1), 10),
    }));
    const finalEntries: FinalChildEntry[] = [];

    const totalChildrenAfterSave = existingEntries.length + parsedPendingChildren.length;
    const existingParsedRanks = existingEntries.map(entry => entry.parsedRank);
    if (existingParsedRanks.some(rank => Number.isNaN(rank) || rank < 1 || rank > totalChildrenAfterSave)) {
      throw new Error(`排行必须在 1 到 ${totalChildrenAfterSave} 之间。`);
    }
    const combinedRanks = [...existingParsedRanks, ...parsedPendingChildren.map(entry => entry.parsedRank)];
    if (new Set(combinedRanks).size !== combinedRanks.length) {
      throw new Error('子女排行不能重复。');
    }

    [...existingEntries, ...parsedPendingChildren.map(draft => ({ kind: 'pending' as const, draft }))]
      .sort((left, right) => {
        const leftRank = left.kind === 'existing' ? left.parsedRank : left.draft.parsedRank;
        const rightRank = right.kind === 'existing' ? right.parsedRank : right.draft.parsedRank;
        return leftRank - rightRank;
      })
      .forEach(entry => finalEntries.push(entry));

    const finalCount = finalEntries.length;

    for (let index = 0; index < finalEntries.length; index += 1) {
      const entry = finalEntries[index];
      const nextSortOrder = finalCount - 1 - index;

      if (entry.kind === 'existing') {
        if (entry.relationship && entry.relationship.sortOrder !== nextSortOrder) {
          await familyService.updateRelationship(tree.id, entry.relationship.id, { sortOrder: nextSortOrder });
        }
        continue;
      }

      const created = await familyService.addPerson(tree.id, {
        name: entry.draft.trimmedName,
        gender: entry.draft.gender,
        generation: person.generation + 1,
      });

      await familyService.addRelationship(tree.id, {
        type: 'parent-child',
        fromId: person.id,
        toId: created.id,
        parentRole: person.gender === 'female' ? 'mother' : person.gender === 'male' ? 'father' : undefined,
        childStatus: 'biological',
        sortOrder: nextSortOrder,
      });
    }
  };

  const ensureSpouseRelationship = async (leftId: string, rightId: string) => {
    if (!tree || leftId === rightId) return;

    const hasExistingRelationship = allPersons.some(candidate => candidate.id === leftId && candidate.spouseRels.some(rel =>
      rel.type === 'spouse'
      && ((rel.fromId === leftId && rel.toId === rightId) || (rel.fromId === rightId && rel.toId === leftId))
    ));

    if (hasExistingRelationship) {
      return;
    }

    await familyService.addRelationship(tree.id, {
      type: 'spouse',
      fromId: leftId,
      toId: rightId,
      unionType: 'married',
      sortOrder: 0,
    });
  };

  const savePendingParents = async (parsedPendingParents: ParsedPendingParentDraft[]) => {
    if (!tree || parsedPendingParents.length === 0) return;

    const parentIds = [...directParents.map(parent => parent.id)];

    for (const entry of parsedPendingParents) {
      const created = await familyService.addPerson(tree.id, {
        name: entry.trimmedName,
        gender: entry.gender,
        generation: person.generation - 1,
      });

      await familyService.addRelationship(tree.id, {
        type: 'parent-child',
        fromId: created.id,
        toId: person.id,
        parentRole: entry.gender === 'female' ? 'mother' : entry.gender === 'male' ? 'father' : undefined,
        childStatus: 'biological',
        sortOrder: 0,
      });

      if (parentIds.length === 1) {
        await ensureSpouseRelationship(parentIds[0], created.id);
      }

      parentIds.push(created.id);
    }
  };

  const saveRelationLineageDrafts = async () => {
    if (!tree || editableLineageRelationships.length === 0) return;

    for (const entry of editableLineageRelationships) {
      const original = getOriginalRelationLineageDraft(entry);
      const draft = getRelationLineageDraft(entry);
      const displayTag = draft.displayTag.trim();
      const lineageType = displayTag === '出继' ? 'biological' : '';
      const adoptiveParentId = displayTag === '出继' ? draft.adoptiveParentId.trim() : '';
      const { biologicalParent, childNode } = getLineageParticipants(entry);
      const brotherOptions = getAdoptiveBrotherOptions(entry);
      const pairedAdoptiveRelation = getPairedAdoptiveRelation(entry);
      const hasChanged = displayTag !== original.displayTag
        || lineageType !== original.lineageType
        || adoptiveParentId !== original.adoptiveParentId;

      if (displayTag === '出继') {
        if (!adoptiveParentId) {
          throw new Error(`请为${childNode.name}选择承继伯叔。`);
        }
        if (!brotherOptions.some(candidate => candidate.id === adoptiveParentId)) {
          throw new Error(`承继人必须是${biologicalParent.name}的兄弟。`);
        }
      }

      if (!hasChanged && !(displayTag === '出继' && pairedAdoptiveRelation && pairedAdoptiveRelation.fromId !== adoptiveParentId)) {
        continue;
      }

      await familyService.updateRelationship(tree.id, entry.relationship.id, {
        displayTag,
        lineageType,
        sourceParentId: '',
        sourceChildRank: 0,
      });

      if (displayTag === '出继') {
        const biologicalRank = (() => {
          const orderedSiblings = getOrderedChildren(biologicalParent);
          const rankIndex = orderedSiblings.findIndex(candidate => candidate.id === childNode.id);
          return rankIndex >= 0 ? rankIndex + 1 : 0;
        })();
        const selectedAdoptiveParent = allPersons.find(candidate => candidate.id === adoptiveParentId);

        if (pairedAdoptiveRelation && pairedAdoptiveRelation.fromId !== adoptiveParentId) {
          await familyService.deleteRelationship(tree.id, pairedAdoptiveRelation.id);
        }

        if (pairedAdoptiveRelation && pairedAdoptiveRelation.fromId === adoptiveParentId) {
          await familyService.updateRelationship(tree.id, pairedAdoptiveRelation.id, {
            displayTag: '继子',
            lineageType: 'adoptive',
            sourceParentId: biologicalParent.id,
            sourceChildRank: biologicalRank,
          });
        } else {
          await familyService.addRelationship(tree.id, {
            type: 'parent-child',
            fromId: adoptiveParentId,
            toId: childNode.id,
            parentRole: selectedAdoptiveParent?.gender === 'female' ? 'mother' : selectedAdoptiveParent?.gender === 'male' ? 'father' : undefined,
            childStatus: 'adoptive',
            lineageType: 'adoptive',
            displayTag: '继子',
            sourceParentId: biologicalParent.id,
            sourceChildRank: biologicalRank,
            sortOrder: entry.relationship.sortOrder,
          });
        }
      } else if (pairedAdoptiveRelation) {
        await familyService.deleteRelationship(tree.id, pairedAdoptiveRelation.id);
      }
    }
  };

  const handleSave = async () => {
    if (!tree) return;

    const trimmedName = editorState.name.trim();
    const pendingSpouseName = spouseDialog.open ? spouseDialog.name.trim() : '';
    const linkedTreeId = editorState.linkedTreeId.trim();
    const linkedPersonId = editorState.linkedPersonId.trim();
    if (!trimmedName) {
      setPanelError('姓名不能为空。');
      return;
    }

    if ((linkedTreeId && !linkedPersonId) || (!linkedTreeId && linkedPersonId)) {
      setPanelError('请选择完整的关联谱系人物。');
      return;
    }

    if (briefNoteUnits > 10) {
      setPanelError('简注不能超过10词。');
      return;
    }

    const parsedPendingParents = parsePendingParents();
    if (parsedPendingParents === null) {
      return;
    }

    const parsedPendingChildren = parsePendingChildren();
    if (parsedPendingChildren === null) {
      return;
    }
    if (!validateChildRankOverrides()) {
      return;
    }

    setSaving(true);
    setPanelError(null);
    setPanelInfo(null);
    setPendingParentsError(null);
    setPendingChildrenError(null);
    if (spouseDialog.open) {
      setSpouseDialog(current => ({ ...current, error: null }));
    }

    try {
      const birthDate = buildStoredFamilyDate(editorState.birthDate, '生辰');
      const deathDate = editorState.isDeceased ? buildStoredFamilyDate(editorState.deathDate, '忌日') : undefined;

      await familyService.updatePerson(tree.id, person.id, {
        name: trimmedName,
        gender: editorState.gender,
        linkedTreeId: linkedTreeId || undefined,
        linkedPersonId: linkedPersonId || undefined,
        clearLinkedPerson: !linkedTreeId && !linkedPersonId && Boolean(person.linkedTreeId || person.linkedPersonId),
        briefNote: editorState.briefNote.trim(),
        biography: editorState.biography.trim(),
        isAlive: editorState.isDeceased ? false : true,
        birthDate,
        deathDate,
        clearBirthDate: !birthDate,
        clearDeathDate: !deathDate,
        photos: editorState.photos,
      });

      const relationGenderUpdates = [...directParents, ...spouses, ...orderedChildren]
        .filter(node => relationGenderOverrides[node.id] && relationGenderOverrides[node.id] !== node.gender)
        .map(node => familyService.updatePerson(tree.id, node.id, { gender: relationGenderOverrides[node.id] }));

      if (relationGenderUpdates.length > 0) {
        await Promise.all(relationGenderUpdates);
      }

      await saveRelationLineageDrafts();
      await savePendingParents(parsedPendingParents);
      await savePendingChildren(parsedPendingChildren);
      if (pendingSpouseName) {
        await createSpouseRelationship(pendingSpouseName, spouseDialog.gender);
      }

      await onRefresh(person.id);
      setEditing(false);
      setPendingParents([]);
      setPendingChildren([]);
      setRelationLineageDrafts({});
      setRelationGenderOverrides({});
      setChildRankOverrides({});
      setPendingParentsError(null);
      setPendingChildrenError(null);
      if (pendingSpouseName) {
        setSpouseDialog({ open: false, name: '', gender: 'male', rank: '1', saving: false, error: null });
      }
      setPanelInfo('人物信息已更新。');
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : '保存人物信息失败。');
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setUploadingPhotos(true);
    setPanelError(null);
    setPanelInfo(null);

    try {
      const uploads = await Promise.all(files.map(file => mediaService.upload(file)));
      setEditorState(current => current ? {
        ...current,
        photos: [
          ...current.photos,
          ...uploads.map(upload => createPhotoEntry(upload.url, upload.fileName)),
        ],
      } : current);
      setPanelInfo('照片已上传，保存后生效。');
    } catch {
      setPanelError('上传照片失败。');
    } finally {
      setUploadingPhotos(false);
      event.target.value = '';
    }
  };

  const handleRemovePhoto = (photoId: string) => {
    setEditorState(current => current ? {
      ...current,
      photos: current.photos.filter(photo => photo.id !== photoId),
    } : current);
  };

  const closeSpouseDialog = () => {
    if (spouseDialog.saving) return;
    setSpouseDialog({ open: false, name: '', gender: 'male', rank: '1', saving: false, error: null });
  };

  const createSpouseRelationship = async (name: string, gender: GenderValue) => {
    if (!tree) return;

    const created = await familyService.addPerson(tree.id, {
      name,
      gender,
      generation: person.generation,
    });

    await familyService.addRelationship(tree.id, {
      type: 'spouse',
      fromId: person.id,
      toId: created.id,
      unionType: 'married',
      sortOrder: 0,
    });
  };

  const handleAddSpouse = async () => {
    if (!tree) return;

    const name = spouseDialog.name.trim();
    if (!name) {
      setSpouseDialog(current => ({ ...current, error: '请输入配偶姓名。' }));
      return;
    }

    setSpouseDialog(current => ({ ...current, saving: true, error: null }));
    setPanelError(null);

    try {
      await createSpouseRelationship(name, spouseDialog.gender);

      setSpouseDialog({ open: false, name: '', gender: 'male', rank: '1', saving: false, error: null });
      await onRefresh(person.id);
      setPanelInfo('已添加配偶。');
    } catch {
      setSpouseDialog(current => ({ ...current, saving: false, error: '添加配偶失败。' }));
      return;
    }

  };
  const handleDeleteSpouse = async (spouseId: string) => {
    if (!tree) return;

    const relationship = person.spouseRels.find(rel =>
      rel.type === 'spouse'
      && ((rel.fromId === person.id && rel.toId === spouseId) || (rel.fromId === spouseId && rel.toId === person.id))
    );

    if (!relationship) {
      setPanelError('未找到配偶关系，无法删除。');
      return;
    }

    setPanelError(null);
    setPanelInfo(null);

    try {
      await familyService.deleteRelationship(tree.id, relationship.id);
      await onRefresh(person.id);
      setPanelInfo('已删除配偶关系。');
    } catch {
      setPanelError('删除配偶失败。');
    }
  };

  const handleDeleteChild = async (childId: string) => {
    if (!tree) return;

    setPanelError(null);
    setPanelInfo(null);

    try {
      await familyService.deletePerson(tree.id, childId);
      await onRefresh(person.id);
      setPanelInfo('已删除子女。');
    } catch {
      setPanelError('删除子女失败。');
    }
  };

  const handleDeleteParent = async (parentId: string) => {
    if (!tree) return;

    const relationship = person.parentRels.find(rel => rel.type === 'parent-child' && rel.fromId === parentId);

    if (!relationship) {
      setPanelError('未找到父母关系，无法删除。');
      return;
    }

    setPanelError(null);
    setPanelInfo(null);

    try {
      await familyService.deleteRelationship(tree.id, relationship.id);
      await onRefresh(person.id);
      setPanelInfo('已删除父母关系。');
    } catch {
      setPanelError('删除父母失败。');
    }
  };

  return (
    <Paper
      elevation={3}
      sx={{
        width: fullWidth ? '100%' : 404,
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        '&::-webkit-scrollbar': {
          display: 'none',
        },
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '8px',
        p: 0,
      }}
    >
      <BoxAny sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        ...panelHeaderPaddingSx, py: 1.25, background: 'rgba(15,23,42,0.02)',
      }}>
        <Typography variant="subtitle2" fontWeight="bold" color="text.secondary">人物详情</Typography>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </BoxAny>
      <Divider />

      <BoxAny sx={{ ...panelSectionPaddingSx, py: editing ? 1.1 : 1.5 }}>
        {panelError && <Alert severity="error" sx={{ mb: 1.25 }}>{panelError}</Alert>}
        {panelInfo && <Alert severity="success" sx={{ mb: 1.25 }}>{panelInfo}</Alert>}

        <BoxAny sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: editing ? 0.45 : 1.25 }}>
          <BoxAny
            role={canEdit && !editing ? 'button' : undefined}
            tabIndex={canEdit && !editing ? 0 : undefined}
            onClick={beginEditing}
            onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
              if ((event.key === 'Enter' || event.key === ' ') && canEdit && !editing) {
                event.preventDefault();
                beginEditing();
              }
            }}
            sx={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              bgcolor: colorSet.background,
              border: `2px solid ${colorSet.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              fontWeight: 'bold',
              color: '#1e293b',
              flexShrink: 0,
              overflow: 'hidden',
              cursor: canEdit && !editing ? 'pointer' : 'default',
              transition: 'transform 120ms ease, box-shadow 120ms ease',
              '&:hover': canEdit && !editing ? { transform: 'translateY(-1px)', boxShadow: '0 8px 20px rgba(15,23,42,0.14)' } : undefined,
              '&:focus-visible': canEdit && !editing ? { outline: 'none', boxShadow: '0 0 0 3px rgba(59,130,246,0.35)' } : undefined,
            }}
          >
            {coverImage ? (
              <BoxAny component="img" src={coverImage} alt={person.name} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              person.name.charAt(person.name.length - 1)
            )}
          </BoxAny>
          <BoxAny sx={{ minWidth: 0, flex: 1 }}>
            {editing ? (
              <BoxAny sx={{ display: 'grid', gap: 0.55 }}>
                <BoxAny sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <BoxAny sx={{ display: 'grid', gridTemplateColumns: `minmax(0, 1.5fr) ${compactGenderColumn}`, gap: 1, alignItems: 'center', flex: 1, minWidth: 0 }}>
                    <InputBase
                      placeholder="姓名"
                      value={editorState.name}
                      onChange={event => setEditorState(current => current ? { ...current, name: event.target.value } : current)}
                      fullWidth
                      sx={{ ...inlineRowInputSx, width: '100%', fontSize: 18, fontWeight: 700 }}
                    />
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => setEditorState(current => current ? { ...current, gender: toggleBinaryGender(current.gender) } : current)}
                      sx={{ ...compactToggleButtonSx, minWidth: compactGenderColumn, width: compactGenderColumn, fontSize: 13, justifySelf: 'center' }}
                    >
                      {formatGender(editorState.gender)}
                    </Button>
                  </BoxAny>
                </BoxAny>
                <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                  <Chip
                    label={`第${person.generation}世`}
                    size="small"
                    sx={{ height: 18, fontSize: 10, bgcolor: 'rgba(42,175,71,0.1)', color: 'rgb(42,175,71)' }}
                  />
                  {zibeiChar && (
                    <Chip
                      label={`字辈：${zibeiChar}`}
                      size="small"
                      sx={{ height: 18, fontSize: 10, bgcolor: 'rgba(148,163,184,0.1)' }}
                    />
                  )}
                  {editorState.isDeceased && (
                    <Chip
                      label="已故"
                      size="small"
                      sx={{ height: 18, fontSize: 10, bgcolor: 'rgba(0,0,0,0.06)', color: '#64748b' }}
                    />
                  )}
                </BoxAny>
                <InputBase
                  placeholder="简介"
                  value={editorState.briefNote}
                  onChange={event => setEditorState(current => current ? { ...current, briefNote: event.target.value } : current)}
                  fullWidth
                  multiline
                  maxRows={2}
                  sx={{ ...inlineRowInputSx, width: '100%' }}
                />
                <Stack direction="row" spacing={0.5} justifyContent="flex-end" sx={{ pt: 0 }}>
                  <Button onClick={resetEditor} disabled={saving} size="small" sx={{ minWidth: 44, px: 0.75, fontSize: 12, lineHeight: 1.1 }}>
                    取消
                  </Button>
                  <Button variant="contained" size="small" onClick={handleSave} disabled={saving || uploadingPhotos} sx={{ minWidth: 48, px: 0.9, fontSize: 12, lineHeight: 1.1, boxShadow: 'none' }}>
                    保存
                  </Button>
                </Stack>
              </BoxAny>
            ) : (
              <>
                <Typography
                  variant="h6"
                  lineHeight={1.2}
                  fontWeight="bold"
                  sx={{
                    fontSize: 18,
                    display: 'inline-block',
                    maxWidth: '100%',
                    borderRadius: '5px',
                    wordBreak: 'break-word',
                  }}
                >
                  {formatDisplayName(person.name)}
                </Typography>
                <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
                  <Chip
                    label={`第${person.generation}世`}
                    size="small"
                    sx={{ height: 18, fontSize: 10, bgcolor: 'rgba(42,175,71,0.1)', color: 'rgb(42,175,71)' }}
                  />
                  <Chip
                    label={formatGender(person.gender)}
                    size="small"
                    sx={{ height: 18, fontSize: 10, bgcolor: colorSet.background, color: colorSet.text }}
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
                {person.briefNote && (
                  <Typography variant="body2" sx={{ mt: 0.75, fontSize: 12.5, color: '#475569' }}>
                    {person.briefNote}
                  </Typography>
                )}
              </>
            )}
          </BoxAny>
        </BoxAny>

      </BoxAny>

      {!editing && (person.birthDate || person.deathDate) && (
        <>
          <Divider />
          <BoxAny sx={{ ...panelSectionPaddingSx, py: 1.25, display: 'grid', gap: 1.1 }}>
            {person.birthDate && (
              <BoxAny sx={{ display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr)', columnGap: 0.5, alignItems: 'baseline' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, lineHeight: 1.35, color: '#166534', fontWeight: 600 }}>
                  生辰
                </Typography>
                <Typography variant="body2" sx={{ minWidth: 0, fontSize: 13, color: '#475569', lineHeight: 1.35 }}>
                  {formatDate(person.birthDate)}
                </Typography>
              </BoxAny>
            )}
            {person.deathDate && (
              <BoxAny sx={{ display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr)', columnGap: 0.5, alignItems: 'baseline' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, lineHeight: 1.35, color: '#166534', fontWeight: 600 }}>
                  忌日
                </Typography>
                <Typography variant="body2" sx={{ minWidth: 0, fontSize: 13, color: '#475569', lineHeight: 1.35 }}>
                  {formatDate(person.deathDate)}
                </Typography>
              </BoxAny>
            )}
          </BoxAny>
        </>
      )}

      {editing && (
        <>
          <Divider />
          <BoxAny sx={{ ...panelSectionPaddingSx, py: 1.25, display: 'grid', gap: 1.1 }}>
            <BoxAny sx={{ display: 'grid', gap: 1.1 }}>
              <FamilyDateEditor
                label="生辰"
                value={editorState.birthDate}
                onChange={nextValue => setEditorState(current => current ? { ...current, birthDate: nextValue } : current)}
                compact
              />

              {editorState.isDeceased && (
                <FamilyDateEditor
                  label="忌日"
                  value={editorState.deathDate}
                  onChange={nextValue => setEditorState(current => current ? { ...current, deathDate: nextValue } : current)}
                  compact
                />
              )}

              <BoxAny sx={{ ...compactRowSx, px: 0, py: 0 }}>
                <Button
                  size="small"
                  variant={editorState.isDeceased ? 'contained' : 'outlined'}
                  onClick={() => setEditorState(current => current ? { ...current, isDeceased: !current.isDeceased, deathDate: !current.isDeceased ? current.deathDate : emptyEditableDate(current.deathDate.calendarType) } : current)}
                  sx={{ ml: 'auto', minWidth: 44, px: 0.9, lineHeight: 1.1 }}
                >
                  已故
                </Button>
              </BoxAny>
            </BoxAny>
          </BoxAny>
        </>
      )}

      {editing && (
        <>
          <Divider />
          <BoxAny sx={{ ...panelSectionPaddingSx, py: 1.25, display: 'grid', gap: 0.9 }}>
            <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                关联谱系
              </Typography>
              {(editorState.linkedTreeId || editorState.linkedPersonId) && (
                <Button
                  size="small"
                  onClick={() => setEditorState(current => current ? { ...current, linkedTreeId: '', linkedPersonId: '' } : current)}
                  sx={{ ml: 'auto', minWidth: 44, px: 0.75, fontSize: 12, lineHeight: 1.1 }}
                >
                  清除
                </Button>
              )}
            </BoxAny>
            <Select
              value={editorState.linkedTreeId}
              onChange={event => setEditorState(current => current ? { ...current, linkedTreeId: event.target.value, linkedPersonId: '' } : current)}
              displayEmpty
              MenuProps={linkSelectMenuProps}
              renderValue={selected => {
                if (!selected) return '选择家谱';
                return availableLinkedTrees.find(candidate => candidate.id === selected)?.name ?? '选择家谱';
              }}
              input={<InputBase sx={linkSelectInputSx} />}
              size="small"
              sx={inlineRowSelectSx}
            >
              {availableLinkedTrees.map(candidate => (
                <MenuItem key={candidate.id} value={candidate.id}>{candidate.name}</MenuItem>
              ))}
            </Select>
            {editorState.linkedTreeId && (
              <Select
                value={editorState.linkedPersonId}
                onChange={event => setEditorState(current => current ? { ...current, linkedPersonId: event.target.value } : current)}
                displayEmpty
                disabled={loadingLinkablePersons}
                MenuProps={linkSelectMenuProps}
                renderValue={selected => {
                  if (!selected) return '选择人物';
                  return linkablePersons.find(candidate => candidate.id === selected)?.name ?? '选择人物';
                }}
                input={<InputBase sx={linkSelectInputSx} />}
                size="small"
                sx={inlineRowSelectSx}
              >
                <MenuItem value="">选择人物</MenuItem>
                {linkablePersons.map(candidate => (
                  <MenuItem key={candidate.id} value={candidate.id}>{candidate.name}</MenuItem>
                ))}
              </Select>
            )}
            {linkedTreeSelectorError && <Alert severity="error">{linkedTreeSelectorError}</Alert>}
          </BoxAny>
        </>
      )}

      <Divider />
      <BoxAny sx={{ ...panelSectionPaddingSx, pt: 1.25, pb: 0.4 }}>
        {!editing && (
          <>
          <BoxAny sx={getRelationTableSurfaceSx(relationColumns.length)}>
            <BoxAny
              sx={{
                mt: 0,
              }}
            >
              <BoxAny
                sx={{
                  display: 'grid',
                  gridTemplateColumns: relationGridColumns,
                  columnGap: 1.1,
                  py: 0.75,
                  borderBottom: relationRowCount > 0 ? '1px solid rgba(15,23,42,0.08)' : 'none',
                }}
              >
                {relationColumns.map(column => (
                  <Typography key={column.key} variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                    {column.title}
                  </Typography>
                ))}
              </BoxAny>

              {relationRowCount > 0 ? Array.from({ length: relationRowCount }, (_, rowIndex) => (
                <BoxAny
                  key={`relation-row-${rowIndex}`}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: relationGridColumns,
                    columnGap: 1.1,
                    py: 0.75,
                    borderBottom: rowIndex === relationRowCount - 1 ? 'none' : '1px solid rgba(15,23,42,0.08)',
                  }}
                >
                  {relationColumns.map(column => {
                    const value = column.items[rowIndex];
                    return value ? (
                      <BoxAny key={`${column.key}-${rowIndex}`} sx={{ minWidth: 0 }}>
                        <BoxAny sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, flexWrap: 'wrap', minWidth: 0 }}>
                          <Link
                            component="button"
                            variant="body2"
                            underline="hover"
                            onClick={() => onNavigate(value.id)}
                            sx={{ justifySelf: 'start', textAlign: 'left', fontSize: 13, minWidth: 0, wordBreak: 'break-word' }}
                          >
                            {value.label}
                            {value.suffix ? (
                              <BoxAny component="span" sx={{ fontSize: 11, color: '#94a3b8', ml: 0.5 }}>
                                {value.suffix}
                              </BoxAny>
                            ) : null}
                          </Link>
                          {value.annotation ? (
                            <Typography component="span" variant="caption" color="text.secondary" sx={{ fontSize: 10.5, lineHeight: 1.25 }}>
                              {value.annotation}
                            </Typography>
                          ) : null}
                        </BoxAny>
                      </BoxAny>
                    ) : (
                      <BoxAny key={`${column.key}-${rowIndex}`} />
                    );
                  })}
                </BoxAny>
              )) : (
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, fontStyle: 'italic', py: 0.9 }}>
                  暂无记录
                </Typography>
              )}
            </BoxAny>
          </BoxAny>

          {hasAdoptiveParentRelations && biologicalParentItems.length > 0 && (
            <BoxAny sx={{ mt: 0.9, px: 0.8, py: 0.75, borderRadius: '8px', backgroundColor: 'rgba(15,23,42,0.03)', boxShadow: 'inset 0 0 0 1px rgba(15,23,42,0.05)' }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 11, mb: 0.55 }}>
                生父母
              </Typography>
              <BoxAny sx={{ display: 'grid', gap: 0.55 }}>
                {biologicalParentItems.map(item => (
                  <BoxAny key={`biological-parent-${item.id}`} sx={{ minWidth: 0 }}>
                    <BoxAny sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, flexWrap: 'wrap', minWidth: 0 }}>
                      <Link
                        component="button"
                        variant="body2"
                        underline="hover"
                        onClick={() => onNavigate(item.id)}
                        sx={{ justifySelf: 'start', textAlign: 'left', fontSize: 13, minWidth: 0, wordBreak: 'break-word' }}
                      >
                        {item.label}
                        {item.suffix ? (
                          <BoxAny component="span" sx={{ fontSize: 11, color: '#94a3b8', ml: 0.5 }}>
                            {item.suffix}
                          </BoxAny>
                        ) : null}
                      </Link>
                      {item.annotation ? (
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ fontSize: 10.5, lineHeight: 1.25 }}>
                          {item.annotation}
                        </Typography>
                      ) : null}
                    </BoxAny>
                  </BoxAny>
                ))}
              </BoxAny>
            </BoxAny>
          )}
          </>
        )}

        {editing && (
          <BoxAny sx={relationTableSurfaceSx}>
            <BoxAny
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                columnGap: 1.1,
                py: 0.75,
                borderBottom: editableRelationRowCount > 0 ? '1px solid rgba(15,23,42,0.08)' : 'none',
              }}
            >
              <BoxAny sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                  父母
                </Typography>
                {relationshipEditing && (
                  <Button
                    size="small"
                    onClick={() => {
                      setPendingParents(current => [...current, createPendingParentDraft()]);
                      setPendingParentsError(null);
                    }}
                    sx={{ ml: 'auto', flexShrink: 0, minWidth: 30, px: 0.5, fontSize: 18, lineHeight: 1, fontWeight: 500 }}
                  >
                    +
                  </Button>
                )}
              </BoxAny>

              <BoxAny sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                  配偶
                </Typography>
                {relationshipEditing && (
                  <Button
                    size="small"
                    onClick={() => setSpouseDialog(current => current.open ? current : { ...current, open: true, error: null, gender: 'male' })}
                    sx={{ ml: 'auto', flexShrink: 0, minWidth: 30, px: 0.5, fontSize: 18, lineHeight: 1, fontWeight: 500 }}
                  >
                    +
                  </Button>
                )}
              </BoxAny>

              <BoxAny sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                  子女
                </Typography>
                {relationshipEditing && (
                  <Button
                    size="small"
                    onClick={() => {
                      setPendingChildren(current => [...current, createPendingChildDraft(String(children.length + current.length + 1))]);
                      setPendingChildrenError(null);
                    }}
                    sx={{ ml: 'auto', flexShrink: 0, minWidth: 30, px: 0.5, fontSize: 18, lineHeight: 1, fontWeight: 500 }}
                  >
                    +
                  </Button>
                )}
              </BoxAny>
            </BoxAny>

            {Array.from({ length: editableRelationRowCount }, (_, rowIndex) => {
              const spouse = rowIndex < spouses.length ? spouses[rowIndex] : null;
              const isSpouseDraftRow = spouseDraftVisible && rowIndex === spouses.length;
              const parent = rowIndex < directParents.length ? directParents[rowIndex] : null;
              const parentDraftIndex = rowIndex - directParents.length;
              const parentDraft = parentDraftIndex >= 0 ? pendingParents[parentDraftIndex] ?? null : null;
              const child = rowIndex < orderedChildren.length ? orderedChildren[rowIndex] : null;
              const childDraftIndex = rowIndex - orderedChildren.length;
              const childDraft = childDraftIndex >= 0 ? pendingChildren[childDraftIndex] ?? null : null;

              return (
                <BoxAny
                  key={`editable-relation-row-${rowIndex}`}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    columnGap: 1.1,
                    py: 0.75,
                    alignItems: 'start',
                    borderBottom: rowIndex === editableRelationRowCount - 1 ? 'none' : '1px solid rgba(15,23,42,0.08)',
                  }}
                >
                  <BoxAny sx={{ minWidth: 0 }}>
                    {parent ? (
                      <BoxAny
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: relationshipEditing
                            ? `minmax(0, 1fr) ${compactGenderColumn} ${compactDeleteColumn}`
                            : `minmax(0, 1fr) ${compactGenderColumn}`,
                          gap: compactRelationGap,
                          alignItems: 'center',
                        }}
                      >
                        <Link
                          component="button"
                          variant="body2"
                          underline="hover"
                          onClick={() => onNavigate(parent.id)}
                          sx={{ justifySelf: 'start', textAlign: 'left', fontSize: 13, minWidth: 0, wordBreak: 'break-word' }}
                        >
                          {formatDisplayName(parent.name)}
                        </Link>
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => setRelationGenderOverrides(current => ({ ...current, [parent.id]: toggleBinaryGender(getRelationGender(parent)) }))}
                          sx={{ ...compactToggleButtonSx, minWidth: compactGenderColumn, width: compactGenderColumn, fontSize: 13, justifySelf: 'center' }}
                        >
                          {formatGender(getRelationGender(parent))}
                        </Button>
                        {relationshipEditing ? (
                          <IconButton size="small" onClick={() => handleDeleteParent(parent.id)} sx={{ width: 24, height: 24, justifySelf: 'end' }}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        ) : null}
                      </BoxAny>
                    ) : parentDraft ? (
                      <BoxAny
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: `minmax(0, 1fr) ${compactGenderColumn} ${compactDeleteColumn}`,
                          gap: compactRelationGap,
                          alignItems: 'center',
                        }}
                      >
                        <InputBase
                          placeholder="xxx"
                          value={parentDraft.name}
                          onChange={event => {
                            setPendingParents(current => current.map(item => item.id === parentDraft.id ? { ...item, name: event.target.value } : item));
                            setPendingParentsError(null);
                          }}
                          fullWidth
                          sx={inlineRowInputSx}
                        />
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => {
                            setPendingParents(current => current.map(item => item.id === parentDraft.id ? { ...item, gender: toggleBinaryGender(item.gender) } : item));
                            setPendingParentsError(null);
                          }}
                          sx={{ ...compactToggleButtonSx, minWidth: compactGenderColumn, width: compactGenderColumn, fontSize: 13, justifySelf: 'center' }}
                        >
                          {formatGender(parentDraft.gender)}
                        </Button>
                        <IconButton size="small" onClick={() => setPendingParents(current => current.filter(item => item.id !== parentDraft.id))} sx={{ width: 24, height: 24, justifySelf: 'end' }}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </BoxAny>
                    ) : parentRowCount === 0 && rowIndex === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, fontStyle: 'italic' }}>
                        暂无记录
                      </Typography>
                    ) : null}
                  </BoxAny>

                  <BoxAny sx={{ minWidth: 0 }}>
                    {spouse ? (
                      <BoxAny
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: relationshipEditing
                            ? `minmax(0, 1fr) ${compactGenderColumn} ${compactDeleteColumn}`
                            : `minmax(0, 1fr) ${compactGenderColumn}`,
                          gap: compactRelationGap,
                          alignItems: 'center',
                        }}
                      >
                        <Link
                          component="button"
                          variant="body2"
                          underline="hover"
                          onClick={() => onNavigate(spouse.id)}
                          sx={{ justifySelf: 'start', textAlign: 'left', fontSize: 13, minWidth: 0, wordBreak: 'break-word' }}
                        >
                          {formatDisplayName(spouse.name)}
                        </Link>
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => setRelationGenderOverrides(current => ({ ...current, [spouse.id]: toggleBinaryGender(getRelationGender(spouse)) }))}
                          sx={{ ...compactToggleButtonSx, minWidth: compactGenderColumn, width: compactGenderColumn, fontSize: 13, justifySelf: 'center' }}
                        >
                          {formatGender(getRelationGender(spouse))}
                        </Button>
                        {relationshipEditing ? (
                          <IconButton size="small" onClick={() => handleDeleteSpouse(spouse.id)} sx={{ width: 24, height: 24, justifySelf: 'end' }}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        ) : null}
                      </BoxAny>
                    ) : isSpouseDraftRow ? (
                      <BoxAny
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: `minmax(0, 1fr) ${compactGenderColumn} ${compactDeleteColumn}`,
                          gap: compactRelationGap,
                          alignItems: 'center',
                        }}
                      >
                        <InputBase
                          placeholder="xxx"
                          value={spouseDialog.name}
                          onChange={event => setSpouseDialog(current => ({ ...current, name: event.target.value }))}
                          onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              void handleAddSpouse();
                            }
                          }}
                          fullWidth
                          sx={{ ...inlineRowInputSx, width: '100%' }}
                        />
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => setSpouseDialog(current => ({ ...current, gender: toggleBinaryGender(current.gender) }))}
                          sx={{ ...compactToggleButtonSx, minWidth: compactGenderColumn, width: compactGenderColumn, fontSize: 13, justifySelf: 'center' }}
                        >
                          {formatGender(spouseDialog.gender)}
                        </Button>
                        <IconButton size="small" onClick={closeSpouseDialog} disabled={spouseDialog.saving} sx={{ width: 24, height: 24, justifySelf: 'end' }}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </BoxAny>
                    ) : spouseRowCount === 0 && rowIndex === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, fontStyle: 'italic' }}>
                        暂无记录
                      </Typography>
                    ) : null}
                  </BoxAny>

                  <BoxAny sx={{ minWidth: 0 }}>
                    {child ? (
                      <BoxAny
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: relationshipEditing
                            ? `minmax(0, 1fr) ${compactGenderColumn} ${compactRankColumn} ${compactDeleteColumn}`
                            : `minmax(0, 1fr) ${compactGenderColumn} ${compactRankColumn}`,
                          gap: compactRelationGap,
                          alignItems: 'center',
                        }}
                      >
                        <Link
                          component="button"
                          variant="body2"
                          underline="hover"
                          onClick={() => onNavigate(child.id)}
                          sx={{ justifySelf: 'start', textAlign: 'left', fontSize: 13, minWidth: 0, wordBreak: 'break-word' }}
                        >
                          {formatDisplayName(child.name)}
                        </Link>
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => setRelationGenderOverrides(current => ({ ...current, [child.id]: toggleBinaryGender(getRelationGender(child)) }))}
                          sx={{ ...compactToggleButtonSx, minWidth: compactGenderColumn, width: compactGenderColumn, fontSize: 13, justifySelf: 'center' }}
                        >
                          {formatGender(getRelationGender(child))}
                        </Button>
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => setChildRankOverrides(current => ({ ...current, [child.id]: cycleRank(getChildRank(child, rowIndex)) }))}
                          sx={{ ...compactToggleButtonSx, minWidth: compactRankColumn, width: compactRankColumn, fontSize: 13, textAlign: 'right', justifySelf: 'end', fontVariantNumeric: 'tabular-nums' }}
                        >
                          {getChildRank(child, rowIndex)}
                        </Button>
                        {relationshipEditing ? (
                          <IconButton size="small" onClick={() => handleDeleteChild(child.id)} sx={{ width: 24, height: 24, justifySelf: 'end' }}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        ) : null}
                      </BoxAny>
                    ) : childDraft ? (
                      <BoxAny
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: `minmax(0, 1fr) ${compactGenderColumn} ${compactRankColumn} ${compactDeleteColumn}`,
                          gap: compactRelationGap,
                          alignItems: 'center',
                        }}
                      >
                        <InputBase
                          placeholder="xxx"
                          value={childDraft.name}
                          onChange={event => {
                            setPendingChildren(current => current.map(item => item.id === childDraft.id ? { ...item, name: event.target.value } : item));
                            setPendingChildrenError(null);
                          }}
                          fullWidth
                          sx={inlineRowInputSx}
                        />
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => {
                            setPendingChildren(current => current.map(item => item.id === childDraft.id ? { ...item, gender: toggleBinaryGender(item.gender) } : item));
                            setPendingChildrenError(null);
                          }}
                          sx={{ ...compactToggleButtonSx, minWidth: compactGenderColumn, width: compactGenderColumn, fontSize: 13, justifySelf: 'center' }}
                        >
                          {formatGender(childDraft.gender)}
                        </Button>
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => {
                            setPendingChildren(current => current.map(item => item.id === childDraft.id ? { ...item, rank: cycleRank(item.rank) } : item));
                            setPendingChildrenError(null);
                          }}
                          sx={{ ...compactToggleButtonSx, minWidth: compactRankColumn, width: compactRankColumn, fontSize: 13, textAlign: 'right', justifySelf: 'end', fontVariantNumeric: 'tabular-nums' }}
                        >
                          {childDraft.rank}
                        </Button>
                        <IconButton size="small" onClick={() => setPendingChildren(current => current.filter(item => item.id !== childDraft.id))} sx={{ width: 24, height: 24, justifySelf: 'end' }}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </BoxAny>
                    ) : childRowCount === 0 && rowIndex === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, fontStyle: 'italic' }}>
                        暂无记录
                      </Typography>
                    ) : null}
                  </BoxAny>
                </BoxAny>
              );
            })}

            {pendingParentsError && <Alert severity="error" sx={{ mt: 0.75 }}>{pendingParentsError}</Alert>}
            {spouseDialog.error && <Alert severity="error" sx={{ mt: 0.75 }}>{spouseDialog.error}</Alert>}
            {pendingChildrenError && <Alert severity="error" sx={{ mt: 0.75 }}>{pendingChildrenError}</Alert>}

            {editableLineageRelationships.length > 0 && (
              <BoxAny sx={{ mt: 0.85, pt: 0.85, borderTop: '1px solid rgba(15,23,42,0.08)', display: 'grid', gap: 0.75 }}>
                {editableLineageRelationships.map(entry => {
                  const draft = getRelationLineageDraft(entry);
                  const adoptiveBrotherOptions = getAdoptiveBrotherOptions(entry);
                  const showAdoptiveTarget = draft.displayTag === '出继';

                  return (
                    <BoxAny
                      key={entry.relationship.id}
                      sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 0.45, alignItems: 'center' }}
                    >
                      <BoxAny
                        component="label"
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.4,
                          minWidth: 48,
                          justifySelf: 'start',
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        <BoxAny
                          component="input"
                          type="checkbox"
                          checked={showAdoptiveTarget}
                          onChange={() => setRelationLineageDrafts(current => ({
                            ...current,
                            [entry.relationship.id]: {
                              ...draft,
                              displayTag: showAdoptiveTarget ? '' : '出继',
                              lineageType: showAdoptiveTarget ? '' : 'biological',
                              sourceParentId: '',
                              sourceChildRank: '',
                              adoptiveParentId: showAdoptiveTarget ? '' : draft.adoptiveParentId,
                            },
                          }))}
                          sx={{ display: 'none' }}
                        />
                        <BoxAny
                          component="span"
                          sx={{
                            width: 14,
                            height: 14,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '3px',
                            boxShadow: `inset 0 0 0 1px ${showAdoptiveTarget ? 'rgba(185,28,28,0.38)' : 'rgba(71,85,105,0.28)'}`,
                            backgroundColor: showAdoptiveTarget ? 'rgba(220,38,38,0.14)' : 'rgba(255,255,255,0.72)',
                            color: '#b91c1c',
                          }}
                        >
                          {showAdoptiveTarget ? <CheckIcon sx={{ fontSize: 12 }} /> : null}
                        </BoxAny>
                        <Typography component="span" sx={{ fontSize: 12, color: showAdoptiveTarget ? '#b91c1c' : '#475569', lineHeight: 1 }}>
                          出继
                        </Typography>
                      </BoxAny>

                      {showAdoptiveTarget ? (
                        <Select
                          value={draft.adoptiveParentId}
                          onChange={event => setRelationLineageDrafts(current => ({
                            ...current,
                            [entry.relationship.id]: {
                              ...draft,
                              adoptiveParentId: event.target.value,
                            },
                          }))}
                          displayEmpty
                          disabled={adoptiveBrotherOptions.length === 0}
                          MenuProps={linkSelectMenuProps}
                          renderValue={selected => {
                            if (!selected) return adoptiveBrotherOptions.length === 0 ? '无可选承继伯叔' : '';
                            return allPersons.find(candidate => candidate.id === selected)?.name ?? '';
                          }}
                          input={<InputBase sx={linkSelectInputSx} />}
                          size="small"
                          sx={{
                            ...inlineRowSelectSx,
                            minWidth: 0,
                            '& .MuiSelect-select': {
                              ...inlineRowSelectSx['& .MuiSelect-select'],
                              py: 0.2,
                              minHeight: '1.25rem',
                            },
                          }}
                        >
                          {adoptiveBrotherOptions.length === 0 ? (
                            <MenuItem value="">无可选承继伯叔</MenuItem>
                          ) : null}
                          {adoptiveBrotherOptions.map(candidate => (
                            <MenuItem key={candidate.id} value={candidate.id}>{candidate.name}</MenuItem>
                          ))}
                        </Select>
                      ) : (
                        <BoxAny />
                      )}
                    </BoxAny>
                  );
                })}
              </BoxAny>
            )}
          </BoxAny>
        )}
      </BoxAny>

      {!editing && (linkedViewLoading || linkedViewError || linkedViewState) && (
        <>
          <Divider />
          <BoxAny sx={{ ...panelSectionPaddingSx, py: 1.25, display: 'grid', gap: 0.9 }}>
            {linkedViewLoading && (
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
                正在加载关联谱系…
              </Typography>
            )}
            {linkedViewError && <Alert severity="error">{linkedViewError}</Alert>}
            {linkedViewState && (
              <BoxAny
                sx={{
                  display: 'grid',
                  gap: 0.95,
                  p: 1.1,
                  borderRadius: '8px',
                  border: '1px solid rgba(15,23,42,0.08)',
                  background: 'linear-gradient(180deg, rgba(248,250,252,0.98) 0%, rgba(241,245,249,0.9) 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.75)',
                }}
              >
                <BoxAny sx={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr)', columnGap: 0.75, alignItems: 'start' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>
                    另谱
                  </Typography>
                  <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 0.6, flexWrap: 'wrap', minWidth: 0 }}>
                    <Link
                      component="button"
                      variant="body2"
                      underline="hover"
                      onClick={() => onOpenLinkedPerson?.(linkedViewState.tree.id, linkedViewState.person.id)}
                      sx={{ justifySelf: 'start', textAlign: 'left', fontSize: 13, minWidth: 0, wordBreak: 'break-word', color: 'rgb(42,175,71)' }}
                    >
                      {linkedViewState.person.name}
                    </Link>
                    <Typography
                      component={onOpenLinkedPerson ? 'button' : 'span'}
                      onClick={onOpenLinkedPerson
                        ? () => onOpenLinkedPerson(linkedViewState.tree.id, linkedViewState.person.id)
                        : undefined}
                      sx={{
                        px: 0.85,
                        py: 0.35,
                        border: 'none',
                        borderRadius: 0,
                        backgroundColor: '#d9eef2',
                        boxShadow: '0 4px 10px rgba(15,23,42,0.10)',
                        fontSize: 12.5,
                        lineHeight: 1.2,
                        fontWeight: 600,
                        color: '#0f766e',
                        cursor: onOpenLinkedPerson ? 'pointer' : 'default',
                        transition: 'background-color 120ms ease, color 120ms ease, box-shadow 120ms ease, transform 120ms ease',
                        '&:hover': onOpenLinkedPerson ? { backgroundColor: '#c9e5ea', color: '#115e59', boxShadow: '0 6px 14px rgba(15,23,42,0.14)', transform: 'translateY(-1px)' } : undefined,
                      }}
                    >
                      {linkedViewState.tree.name}
                    </Typography>
                  </BoxAny>
                </BoxAny>

                {linkedViewState.person.briefNote && (
                  <BoxAny sx={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr)', columnGap: 0.75, alignItems: 'start' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>
                      简注
                    </Typography>
                    <Typography variant="body2" sx={{ fontSize: 12.5, color: '#475569', lineHeight: 1.45 }}>
                      {linkedViewState.person.briefNote}
                    </Typography>
                  </BoxAny>
                )}

                <BoxAny sx={{ borderTop: '1px solid rgba(15,23,42,0.08)', pt: 0.9 }}>
                  <BoxAny sx={getRelationTableSurfaceSx(linkedRelationColumns.length)}>
                  <BoxAny
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: linkedRelationGridColumns,
                      columnGap: 1.1,
                      py: 0.75,
                      borderBottom: linkedRelationRowCount > 0 ? '1px solid rgba(15,23,42,0.08)' : 'none',
                    }}
                  >
                    {linkedRelationColumns.map(column => (
                      <Typography key={column.key} variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                        {column.title}
                      </Typography>
                    ))}
                  </BoxAny>

                  {linkedRelationRowCount > 0 ? Array.from({ length: linkedRelationRowCount }, (_, rowIndex) => (
                    <BoxAny
                      key={`linked-relation-row-${rowIndex}`}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: linkedRelationGridColumns,
                        columnGap: 1.1,
                        py: 0.75,
                        borderBottom: rowIndex === linkedRelationRowCount - 1 ? 'none' : '1px solid rgba(15,23,42,0.08)',
                      }}
                    >
                      {linkedRelationColumns.map(column => {
                        const value = column.items[rowIndex];
                        return value ? (
                          <BoxAny key={`${column.key}-${rowIndex}`} sx={{ minWidth: 0 }}>
                            <BoxAny sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, flexWrap: 'wrap', minWidth: 0 }}>
                              <Link
                                component="button"
                                variant="body2"
                                underline="hover"
                                onClick={() => onOpenLinkedPerson?.(linkedViewState.tree.id, value.id)}
                                sx={{ justifySelf: 'start', textAlign: 'left', fontSize: 13, minWidth: 0, wordBreak: 'break-word', color: 'rgb(42,175,71)' }}
                              >
                                {value.label}
                                {value.suffix ? (
                                  <BoxAny component="span" sx={{ fontSize: 11, color: '#94a3b8', ml: 0.5 }}>
                                    {value.suffix}
                                  </BoxAny>
                                ) : null}
                              </Link>
                              {value.annotation ? (
                                <Typography component="span" variant="caption" color="text.secondary" sx={{ fontSize: 10.5, lineHeight: 1.25 }}>
                                  {value.annotation}
                                </Typography>
                              ) : null}
                            </BoxAny>
                          </BoxAny>
                        ) : (
                          <BoxAny key={`${column.key}-${rowIndex}`} />
                        );
                      })}
                    </BoxAny>
                  )) : (
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, fontStyle: 'italic', py: 0.9 }}>
                      暂无记录
                    </Typography>
                  )}
                  {linkedHasAdoptiveParentRelations && linkedBiologicalParentItems.length > 0 && (
                    <BoxAny sx={{ mt: 0.9, px: 0.8, py: 0.75, borderRadius: '8px', backgroundColor: 'rgba(15,23,42,0.03)', boxShadow: 'inset 0 0 0 1px rgba(15,23,42,0.05)' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 11, mb: 0.55 }}>
                        生父母
                      </Typography>
                      <BoxAny sx={{ display: 'grid', gap: 0.55 }}>
                        {linkedBiologicalParentItems.map(item => (
                          <BoxAny key={`linked-biological-parent-${item.id}`} sx={{ minWidth: 0 }}>
                            <BoxAny sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, flexWrap: 'wrap', minWidth: 0 }}>
                              <Link
                                component="button"
                                variant="body2"
                                underline="hover"
                                onClick={() => onOpenLinkedPerson?.(linkedViewState.tree.id, item.id)}
                                sx={{ justifySelf: 'start', textAlign: 'left', fontSize: 13, minWidth: 0, wordBreak: 'break-word', color: 'rgb(42,175,71)' }}
                              >
                                {item.label}
                                {item.suffix ? (
                                  <BoxAny component="span" sx={{ fontSize: 11, color: '#94a3b8', ml: 0.5 }}>
                                    {item.suffix}
                                  </BoxAny>
                                ) : null}
                              </Link>
                              {item.annotation ? (
                                <Typography component="span" variant="caption" color="text.secondary" sx={{ fontSize: 10.5, lineHeight: 1.25 }}>
                                  {item.annotation}
                                </Typography>
                              ) : null}
                            </BoxAny>
                          </BoxAny>
                        ))}
                      </BoxAny>
                    </BoxAny>
                  )}
                  </BoxAny>
                </BoxAny>
              </BoxAny>
            )}
          </BoxAny>
        </>
      )}

      {person.biography && !editing && (
        <>
          <Divider />
          <BoxAny sx={{ ...panelSectionPaddingSx, pt: 0.6, pb: 1.25 }}>
            <Typography variant="caption" color="text.secondary" display="block" mb={0.5} sx={{ fontSize: 11 }}>
              生平
            </Typography>
            <Typography variant="body2" sx={{ fontSize: 13, lineHeight: 1.6 }}>{person.biography}</Typography>
          </BoxAny>
        </>
      )}

      {editing && (
        <>
          <Divider />
          <BoxAny sx={{ ...panelSectionPaddingSx, py: 1.25 }}>
            <BoxAny sx={{ display: 'grid', gap: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                生平
              </Typography>
              <InputBase
                placeholder="生平"
                value={editorState.biography}
                onChange={event => setEditorState(current => current ? { ...current, biography: event.target.value } : current)}
                fullWidth
                multiline
                minRows={4}
                maxRows={12}
                sx={{
                  ...inlineRowInputSx,
                  width: '100%',
                  alignItems: 'flex-start',
                  py: 0.75,
                  lineHeight: 1.6,
                  '& .MuiInputBase-inputMultiline': {
                    overflowY: 'auto',
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                  },
                  '& .MuiInputBase-inputMultiline::-webkit-scrollbar': {
                    display: 'none',
                  },
                }}
              />
            </BoxAny>
          </BoxAny>
        </>
      )}

      {editing && (
        <>
          <Divider />
          <BoxAny sx={{ ...panelSectionPaddingSx, py: 1.25 }}>
            <BoxAny sx={{ mb: 0.9 }}>
              <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1.25 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                  照片
                </Typography>
                <Button
                  size="small"
                  onClick={openPhotoPicker}
                  disabled={uploadingPhotos}
                  sx={{ ml: 'auto', flexShrink: 0, minWidth: 36, px: 1, fontSize: 20, lineHeight: 1, fontWeight: 500 }}
                >
                  {uploadingPhotos ? <CircularProgress size={18} /> : '+'}
                </Button>
              </BoxAny>
              <input ref={photoInputRef} type="file" accept="image/*" multiple hidden onChange={handlePhotoUpload} />

              <BoxAny sx={{ mt: 0.5, borderTop: '1px solid rgba(15,23,42,0.08)', borderBottom: '1px solid rgba(15,23,42,0.08)' }}>
                {editorState.photos.length > 0 && (
                  <BoxAny sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 1, py: 0.75 }}>
                    {editorState.photos.map(photo => (
                      <BoxAny key={photo.id} sx={{ position: 'relative', borderRadius: '5px', overflow: 'hidden', border: '1px solid rgba(15,23,42,0.08)' }}>
                        <BoxAny component="img" src={photo.url} alt={photo.caption ?? person.name} sx={{ width: '100%', height: 88, objectFit: 'cover', display: 'block' }} />
                        <IconButton
                          size="small"
                          onClick={() => handleRemovePhoto(photo.id)}
                          sx={{ position: 'absolute', right: 4, top: 4, bgcolor: 'rgba(255,255,255,0.9)' }}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </BoxAny>
                    ))}
                  </BoxAny>
                )}
              </BoxAny>
            </BoxAny>
          </BoxAny>
        </>
      )}

      {(person.photos?.length ?? 0) > 0 && !editing && (
        <>
          <Divider />
          <BoxAny sx={{ ...panelSectionPaddingSx, py: 1.25 }}>
            <Typography variant="caption" color="text.secondary" display="block" mb={0.75} fontWeight="bold">
              照片
            </Typography>
            <BoxAny
              role="button"
              tabIndex={0}
              onClick={() => setActivePhotoIndex(0)}
              onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setActivePhotoIndex(0);
                }
              }}
              sx={{
                position: 'relative',
                width: 152,
                height: 124,
                cursor: 'pointer',
                outline: 'none',
                '&:focus-visible': {
                  borderRadius: '5px',
                  boxShadow: '0 0 0 3px rgba(59,130,246,0.35)',
                },
              }}
            >
              {photoStack.map((photo, index) => {
                const layer = photoStack.length - 1 - index;
                return (
                  <BoxAny
                    key={photo.id}
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: '5px',
                      overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,0.72)',
                      boxShadow: layer === 0
                        ? '0 16px 36px rgba(15,23,42,0.24)'
                        : '0 10px 24px rgba(15,23,42,0.14)',
                      transform: `translate(${layer * 12}px, ${layer * 7}px) rotate(${layer * 3.5}deg)`,
                      zIndex: index + 1,
                      bgcolor: '#e2e8f0',
                    }}
                  >
                    <BoxAny component="img" src={photo.url} alt={photo.caption ?? person.name} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </BoxAny>
                );
              })}
              <BoxAny
                sx={{
                  position: 'absolute',
                  right: -6,
                  bottom: -10,
                  px: 1,
                  py: 0.5,
                  borderRadius: 999,
                  bgcolor: 'rgba(15,23,42,0.82)',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.2,
                  zIndex: 6,
                  boxShadow: '0 10px 24px rgba(15,23,42,0.22)',
                }}
              >
                共 {person.photos?.length ?? 0} 张
              </BoxAny>
            </BoxAny>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, fontSize: 12 }}>
              点击照片可打开照片浏览/编辑。
            </Typography>
            <ImageLightbox
              images={photoUrls}
              initialIndex={activePhotoIndex ?? 0}
              open={activePhotoIndex !== null}
              onClose={() => setActivePhotoIndex(null)}
              groups={photoGroups}
              initialGroupIndex={activePhotoIndex ?? 0}
            />
          </BoxAny>
        </>
      )}

      {person.experiences && person.experiences.length > 0 && !editing && (
        <>
          <Divider />
          <BoxAny sx={{ pl: 2, pr: 3, py: 1.25 }}>
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
