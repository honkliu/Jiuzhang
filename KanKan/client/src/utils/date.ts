const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_PREFIX_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/;

export const parseDateInput = (value?: string): Date | null => {
  if (!value) return null;

  const trimmed = value.trim();
  const dateOnlyMatch = trimmed.match(DATE_ONLY_PATTERN) || trimmed.match(ISO_DATE_PREFIX_PATTERN);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatDateZhCN = (value?: string): string => {
  const parsed = parseDateInput(value);
  return parsed ? parsed.toLocaleDateString('zh-CN') : '';
};
