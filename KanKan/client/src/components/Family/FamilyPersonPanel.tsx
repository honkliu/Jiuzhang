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
  type FamilyTreeDto,
} from '@/services/family.service';
import { Lunar, Solar } from 'lunar-typescript';

const BoxAny = Box as any;
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const editableSurfaceColor = 'rgba(8,145,178,0.08)';
const editableSurfaceBorder = 'rgba(8,145,178,0.2)';
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
const compactRowSx = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: 1,
  alignItems: 'center',
  px: 0,
  py: 0,
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

interface ParsedPendingChildDraft extends PendingChildDraft {
  trimmedName: string;
  parsedRank: number;
}

interface Props {
  person: FamilyNode | null;
  tree: FamilyTreeDto | null;
  allPersons: FamilyNode[];
  onClose: () => void;
  onNavigate: (personId: string) => void;
  onRefresh: (preferredPersonId?: string | null) => Promise<void>;
  canEdit?: boolean;
  fullWidth?: boolean;
}

function formatGender(gender?: string) {
  if (gender === 'female') return '女';
  if (gender === 'unknown') return '未知';
  return '男';
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
  onRefresh,
  canEdit = false,
  fullWidth = false,
}) => {
  const [editing, setEditing] = useState(false);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelInfo, setPanelInfo] = useState<string | null>(null);
  const [spouseDialog, setSpouseDialog] = useState<AddRelativeState>({
    open: false,
    name: '',
    gender: 'female',
    rank: '1',
    saving: false,
    error: null,
  });
  const [pendingChildren, setPendingChildren] = useState<PendingChildDraft[]>([]);
  const [pendingChildrenError, setPendingChildrenError] = useState<string | null>(null);
  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const editorRestoreRef = useRef<EditorState | null>(null);
  const preserveEditingAfterRefreshRef = useRef(false);
  const lastSavedEditorSnapshotRef = useRef('');

  useEffect(() => {
    if (!person) {
      setEditorState(null);
      setEditing(false);
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
    setSpouseDialog({ open: false, name: '', gender: 'female', rank: '1', saving: false, error: null });
    setPendingChildren([]);
    setPendingChildrenError(null);
    setActivePhotoIndex(null);
  }, [person]);

  const briefNoteUnits = countBriefNoteUnits(editorState?.briefNote ?? '');

  if (!person || !editorState) return null;

  const rootGen = tree?.rootGeneration ?? 1;
  const poem = tree?.zibeiPoem ?? [];
  const zibeiChar = poem[person.generation - rootGen] ?? '';
  const colorSet = getGenderColor(person.gender);
  const directParents = person.parentRels
    .map(rel => allPersons.find(candidate => candidate.id === rel.fromId))
    .filter(Boolean) as FamilyNode[];
  const parents = (() => {
    const byId = new Map<string, FamilyNode>();

    for (const parent of directParents) {
      byId.set(parent.id, parent);
    }

    for (const parent of directParents) {
      for (const spouse of parent.spouses) {
        if (spouse.id !== person.id && !byId.has(spouse.id)) {
          byId.set(spouse.id, spouse);
        }
      }
    }

    return [...byId.values()];
  })();
  const children = person.children;
  const orderedChildren = [...children].sort((left, right) => {
    const leftSortOrder = left.parentRels.find(rel => rel.type === 'parent-child' && rel.fromId === person.id)?.sortOrder ?? 0;
    const rightSortOrder = right.parentRels.find(rel => rel.type === 'parent-child' && rel.fromId === person.id)?.sortOrder ?? 0;
    return rightSortOrder - leftSortOrder;
  });
  const spouses = person.spouses;
  const relationshipEditing = Boolean(canEdit && editing);
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
    setPendingChildren([]);
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

  const savePendingChildren = async (parsedPendingChildren: ParsedPendingChildDraft[]) => {
    if (!tree || parsedPendingChildren.length === 0) return;

    type FinalChildEntry =
      | {
        kind: 'existing';
        child: FamilyNode;
        relationship: FamilyNode['parentRels'][number] | undefined;
      }
      | {
        kind: 'pending';
        draft: ParsedPendingChildDraft;
      };

    const existingEntries = orderedChildren.map(child => ({
      kind: 'existing' as const,
      child,
      relationship: child.parentRels.find(rel => rel.type === 'parent-child' && rel.fromId === person.id),
    }));
    const finalEntries: FinalChildEntry[] = [...existingEntries];

    parsedPendingChildren
      .sort((left, right) => left.parsedRank - right.parsedRank)
      .forEach(draft => {
        finalEntries.splice(draft.parsedRank - 1, 0, {
          kind: 'pending' as const,
          draft,
        });
      });

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

  const handleSave = async () => {
    if (!tree) return;

    const trimmedName = editorState.name.trim();
    if (!trimmedName) {
      setPanelError('姓名不能为空。');
      return;
    }

    if (briefNoteUnits > 10) {
      setPanelError('简注不能超过10词。');
      return;
    }

    const parsedPendingChildren = parsePendingChildren();
    if (parsedPendingChildren === null) {
      return;
    }

    setSaving(true);
    setPanelError(null);
    setPanelInfo(null);
    setPendingChildrenError(null);

    try {
      const birthDate = buildStoredFamilyDate(editorState.birthDate, '生辰');
      const deathDate = editorState.isDeceased ? buildStoredFamilyDate(editorState.deathDate, '忌日') : undefined;

      await familyService.updatePerson(tree.id, person.id, {
        name: trimmedName,
        gender: editorState.gender,
        briefNote: editorState.briefNote.trim(),
        biography: editorState.biography.trim(),
        isAlive: editorState.isDeceased ? false : true,
        birthDate,
        deathDate,
        clearBirthDate: !birthDate,
        clearDeathDate: !deathDate,
        photos: editorState.photos,
      });

      await savePendingChildren(parsedPendingChildren);

      await onRefresh(person.id);
      setEditing(false);
      setPendingChildren([]);
      setPendingChildrenError(null);
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
    setSpouseDialog({ open: false, name: '', gender: 'female', rank: '1', saving: false, error: null });
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
      const created = await familyService.addPerson(tree.id, {
        name,
        gender: spouseDialog.gender,
        generation: person.generation,
      });

      await familyService.addRelationship(tree.id, {
        type: 'spouse',
        fromId: person.id,
        toId: created.id,
        unionType: 'married',
        sortOrder: 0,
      });

      setSpouseDialog({ open: false, name: '', gender: 'female', rank: '1', saving: false, error: null });
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

  return (
    <Paper
      elevation={3}
      sx={{
        width: fullWidth ? '100%' : 320,
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarGutter: 'stable',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '5px',
        p: 0,
      }}
    >
      <BoxAny sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        pl: 2, pr: 3, py: 1.25, background: 'rgba(15,23,42,0.02)',
      }}>
        <Typography variant="subtitle2" fontWeight="bold" color="text.secondary">人物详情</Typography>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </BoxAny>
      <Divider />

      <BoxAny sx={{ pl: 2, pr: 3, py: editing ? 1.1 : 1.5 }}>
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
                  <BoxAny sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) 48px', gap: 1, alignItems: 'center', flex: 1, minWidth: 0 }}>
                    <InputBase
                      placeholder="姓名"
                      value={editorState.name}
                      onChange={event => setEditorState(current => current ? { ...current, name: event.target.value } : current)}
                      fullWidth
                      sx={{ ...inlineRowInputSx, width: '100%', fontSize: 18, fontWeight: 700 }}
                    />
                    <Select
                      variant="standard"
                      value={editorState.gender}
                      onChange={event => setEditorState(current => current ? { ...current, gender: event.target.value as GenderValue } : current)}
                      disableUnderline
                      input={<InputBase sx={{ ...inlineRowInputSx, minWidth: 0 }} />}
                      sx={{ minWidth: 0, fontSize: 13, color: '#475569' }}
                    >
                      <MenuItem value="male">男</MenuItem>
                      <MenuItem value="female">女</MenuItem>
                      <MenuItem value="unknown">未知</MenuItem>
                    </Select>
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
                  {person.name}
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
          <BoxAny sx={{ pl: 2, pr: 3, py: 1.25, display: 'grid', gap: 1.1 }}>
            {person.birthDate && (
              <BoxAny sx={{ display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr)', columnGap: 0.5, alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, lineHeight: 1.2, color: '#166534', fontWeight: 600 }}>
                  生辰
                </Typography>
                <Typography variant="body2" sx={{ minWidth: 0, fontSize: 13, color: '#475569' }}>
                  {formatDate(person.birthDate)}
                </Typography>
              </BoxAny>
            )}
            {person.deathDate && (
              <BoxAny sx={{ display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr)', columnGap: 0.5, alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, lineHeight: 1.2, color: '#166534', fontWeight: 600 }}>
                  忌日
                </Typography>
                <Typography variant="body2" sx={{ minWidth: 0, fontSize: 13, color: '#475569' }}>
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
          <BoxAny sx={{ pl: 2, pr: 3, py: 1.25, display: 'grid', gap: 1.1 }}>
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

      <Divider />
      <BoxAny sx={{ pl: 2, pr: 3, py: 1.25 }}>
        {!editing && (
          <BoxAny sx={{ mb: 0.9 }}>
            <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>父母</Typography>
            </BoxAny>
            <BoxAny sx={{ mt: 0.5, borderTop: '1px solid rgba(15,23,42,0.08)', borderBottom: '1px solid rgba(15,23,42,0.08)' }}>
              {parents.length > 0 ? parents.map((parent, index) => (
                <BoxAny
                  key={parent.id}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) 32px 24px',
                    gap: 1,
                    alignItems: 'center',
                    py: 0.75,
                    borderBottom: index === parents.length - 1 ? 'none' : '1px solid rgba(15,23,42,0.08)',
                  }}
                >
                  <Link
                    component="button"
                    variant="body2"
                    underline="hover"
                    onClick={() => onNavigate(parent.id)}
                    sx={{ justifySelf: 'start', textAlign: 'left', fontSize: 13 }}
                  >
                    {parent.name}
                  </Link>
                  <Typography variant="body2" sx={{ fontSize: 13, color: '#475569' }}>
                    {formatGender(parent.gender)}
                  </Typography>
                  <BoxAny />
                </BoxAny>
              )) : (
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, fontStyle: 'italic', py: 0.9 }}>
                  暂无记录
                </Typography>
              )}
            </BoxAny>
          </BoxAny>
        )}

        {(editing || spouses.length > 0) && (
          <BoxAny sx={{ mb: 0.9 }}>
          <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>配偶</Typography>
            {relationshipEditing && (
              <Button
                size="small"
                onClick={() => setSpouseDialog(current => current.open ? current : { ...current, open: true, error: null })}
                sx={{ ml: 'auto', flexShrink: 0, minWidth: 36, px: 1, fontSize: 20, lineHeight: 1, fontWeight: 500 }}
              >
                +
              </Button>
            )}
          </BoxAny>
          <BoxAny sx={{ mt: 0.5, borderTop: '1px solid rgba(15,23,42,0.08)', borderBottom: '1px solid rgba(15,23,42,0.08)' }}>
            {spouses.length > 0 ? spouses.map((spouse, index) => (
              <BoxAny
                key={spouse.id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: relationshipEditing ? 'minmax(0, 1fr) 32px 32px' : 'minmax(0, 1fr) 32px',
                  gap: 1,
                  alignItems: 'center',
                  py: 0.75,
                  borderBottom: index === spouses.length - 1 && !spouseDialog.open ? 'none' : '1px solid rgba(15,23,42,0.08)',
                }}
              >
                <Link
                  component="button"
                  variant="body2"
                  underline="hover"
                  onClick={() => onNavigate(spouse.id)}
                  sx={{ justifySelf: 'start', textAlign: 'left', fontSize: 13 }}
                >
                  {spouse.name}
                </Link>
                <Typography variant="body2" sx={{ fontSize: 13, color: '#475569' }}>
                  {formatGender(spouse.gender)}
                </Typography>
                {relationshipEditing && (
                  <IconButton size="small" onClick={() => handleDeleteSpouse(spouse.id)} sx={{ width: 24, height: 24, justifySelf: 'end' }}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                )}
              </BoxAny>
            )) : null}
            {relationshipEditing && spouseDialog.open && (
              <BoxAny
                sx={{
                  py: 0.75,
                  borderBottom: '1px solid rgba(15,23,42,0.08)',
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) 32px 32px',
                  gap: 1,
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
                <Select
                  variant="standard"
                  value={spouseDialog.gender}
                  onChange={event => setSpouseDialog(current => ({ ...current, gender: event.target.value as GenderValue }))}
                  disableUnderline
                  input={<InputBase sx={{ ...inlineRowInputSx, minWidth: 0 }} />}
                  sx={{ minWidth: 0, fontSize: 13, color: '#475569' }}
                >
                  <MenuItem value="male">男</MenuItem>
                  <MenuItem value="female">女</MenuItem>
                  <MenuItem value="unknown">未知</MenuItem>
                </Select>
                <IconButton size="small" onClick={closeSpouseDialog} disabled={spouseDialog.saving} sx={{ width: 24, height: 24, justifySelf: 'end' }}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </BoxAny>
            )}
          </BoxAny>
          {spouseDialog.error && <Alert severity="error" sx={{ mt: 0.75 }}>{spouseDialog.error}</Alert>}
          </BoxAny>
        )}

        {(editing || children.length > 0 || pendingChildren.length > 0) && (
          <BoxAny>
          <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
              子女（{children.length}人）
            </Typography>
            {relationshipEditing && (
              <Button size="small" onClick={() => {
                setPendingChildren(current => [...current, createPendingChildDraft(String(children.length + current.length + 1))]);
                setPendingChildrenError(null);
              }} sx={{ ml: 'auto', flexShrink: 0, minWidth: 36, px: 1, fontSize: 20, lineHeight: 1, fontWeight: 500 }}>
                +
              </Button>
            )}
          </BoxAny>
          <BoxAny sx={{ mt: 0.5, borderTop: '1px solid rgba(15,23,42,0.08)', borderBottom: '1px solid rgba(15,23,42,0.08)' }}>
            {orderedChildren.length > 0 ? orderedChildren.map((child, index) => (
              <BoxAny
                key={child.id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: relationshipEditing ? 'minmax(0, 1fr) 32px 24px 32px' : 'minmax(0, 1fr) 32px 24px',
                  gap: 1,
                  alignItems: 'center',
                  py: 0.75,
                  borderBottom: index === orderedChildren.length - 1 && pendingChildren.length === 0 ? 'none' : '1px solid rgba(15,23,42,0.08)',
                }}
              >
                <Link
                  component="button"
                  variant="body2"
                  underline="hover"
                  onClick={() => onNavigate(child.id)}
                  sx={{ justifySelf: 'start', textAlign: 'left', fontSize: 13 }}
                >
                  {child.name}
                </Link>
                <Typography variant="body2" sx={{ fontSize: 13, color: '#475569' }}>
                  {formatGender(child.gender)}
                </Typography>
                <Typography variant="body2" sx={{ fontSize: 13, color: '#475569', textAlign: 'right' }}>
                  {index + 1}
                </Typography>
                {relationshipEditing && (
                  <IconButton size="small" onClick={() => handleDeleteChild(child.id)} sx={{ width: 24, height: 24, justifySelf: 'end' }}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                )}
              </BoxAny>
            )) : pendingChildren.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, fontStyle: 'italic', py: 0.9 }}>
                暂无记录
              </Typography>
            ) : null}

            {relationshipEditing && pendingChildren.map((draft, index) => (
              <BoxAny
                key={draft.id}
                sx={{
                  py: 0.75,
                  borderBottom: index === pendingChildren.length - 1 ? 'none' : '1px solid rgba(15,23,42,0.08)',
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) 32px 24px 32px',
                  gap: 1,
                  alignItems: 'center',
                }}
              >
                <InputBase
                  placeholder="xxx"
                  value={draft.name}
                  onChange={event => {
                    setPendingChildren(current => current.map(item => item.id === draft.id ? { ...item, name: event.target.value } : item));
                    setPendingChildrenError(null);
                  }}
                  fullWidth
                  sx={inlineRowInputSx}
                />
                <Select
                  variant="standard"
                  value={draft.gender}
                  onChange={event => {
                    setPendingChildren(current => current.map(item => item.id === draft.id ? { ...item, gender: event.target.value as GenderValue } : item));
                    setPendingChildrenError(null);
                  }}
                  disableUnderline
                  input={<InputBase sx={{ ...inlineRowInputSx, minWidth: 0 }} />}
                  sx={{ fontSize: 13, color: '#475569' }}
                >
                  <MenuItem value="male">男</MenuItem>
                  <MenuItem value="female">女</MenuItem>
                </Select>
                <InputBase
                  type="text"
                  value={draft.rank}
                  onChange={event => {
                    setPendingChildren(current => current.map(item => item.id === draft.id ? { ...item, rank: event.target.value.replace(/[^\d]/g, '') } : item));
                    setPendingChildrenError(null);
                  }}
                  inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', style: { textAlign: 'right' } }}
                  sx={{ ...inlineRowInputSx, textAlign: 'right' }}
                />
                <IconButton size="small" onClick={() => setPendingChildren(current => current.filter(item => item.id !== draft.id))} sx={{ width: 24, height: 24, justifySelf: 'end' }}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </BoxAny>
            ))}
            {pendingChildrenError && <Alert severity="error" sx={{ mt: 0.75 }}>{pendingChildrenError}</Alert>}
          </BoxAny>
          </BoxAny>
        )}
      </BoxAny>

      {person.biography && !editing && (
        <>
          <Divider />
          <BoxAny sx={{ pl: 2, pr: 3, py: 1.25 }}>
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
          <BoxAny sx={{ pl: 2, pr: 3, py: 1.25 }}>
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
          <BoxAny sx={{ pl: 2, pr: 3, py: 1.25 }}>
            <BoxAny sx={{ mb: 0.9 }}>
              <BoxAny sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 0.5 }}>
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
          <BoxAny sx={{ pl: 2, pr: 3, py: 1.25 }}>
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
