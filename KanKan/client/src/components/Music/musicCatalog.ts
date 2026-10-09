import type { MusicCatalogField, MusicCatalogRecord } from '@/services/music.service';

export function scalarText(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(scalarText).filter(Boolean).join(' · ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function fieldValues(record: MusicCatalogRecord, field: MusicCatalogField): string[] {
  const value = record.data[field.key];
  const values = (Array.isArray(value) ? value : [value]).map(scalarText).filter(Boolean);
  return values.length === 0 && field.type === 'tags' ? [''] : values;
}

export function trackFields(fields: MusicCatalogField[]): MusicCatalogField[] {
  return fields.filter((field) =>
    field.visible !== false
    && !['album', 'directory', 'format', 'trackNumber'].includes(field.role ?? '')
    && !['album', 'directory', 'format', 'trackNumber'].includes(field.key))
    .sort((a, b) => {
      const order = (field: MusicCatalogField) => {
        if (field.primary || field.role === 'title' || field.key === 'title') return 0;
        if (field.type === 'tags' || field.key === 'tags') return 1;
        return 2;
      };
      return order(a) - order(b);
    });
}

export function filterMusicRecords(
  records: MusicCatalogRecord[],
  searchableFields: MusicCatalogField[],
  filterableFields: MusicCatalogField[],
  search: string,
  filters: Record<string, string>,
): MusicCatalogRecord[] {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  return records.filter((record) =>
    (!normalizedSearch || searchableFields.some((field) =>
      scalarText(record.data[field.key]).toLocaleLowerCase().includes(normalizedSearch)))
    && filterableFields.every((field) => !filters[field.key]
      || fieldValues(record, field).some((value) =>
        JSON.stringify(value) === filters[field.key])));
}

export interface MusicAlbumGroup {
  id: string;
  directory: string;
  records: MusicCatalogRecord[];
}

export const MUSIC_PAGE_SIZE = 20;

export function paginateMusicGroups(
  groups: MusicAlbumGroup[],
  filteredRecords: MusicCatalogRecord[],
  page: number,
  expandedGroups: ReadonlySet<string>,
) {
  const matches = new Set(filteredRecords.map((record) => record.id));
  type DirectoryRows = {
    group: MusicAlbumGroup; showDirectory: boolean; tracks: MusicCatalogRecord[];
  };
  const pages: { rows: DirectoryRows[]; rowCount: number }[] = [{ rows: [], rowCount: 0 }];
  const groupPages = new Map<string, number>();
  for (const group of groups) {
    const matchesInGroup = group.records.filter((record) => matches.has(record.id));
    if (matchesInGroup.length === 0) continue;
    const tracks = expandedGroups.has(group.id) ? matchesInGroup : [];
    let offset = 0;
    do {
      let target = pages[pages.length - 1];
      if (target.rowCount === MUSIC_PAGE_SIZE) {
        target = { rows: [], rowCount: 0 };
        pages.push(target);
      }
      if (!groupPages.has(group.id)) groupPages.set(group.id, pages.length);
      const chunk = tracks.slice(offset, offset + MUSIC_PAGE_SIZE - target.rowCount - 1);
      target.rows.push({ group, showDirectory: true, tracks: chunk });
      target.rowCount += 1 + chunk.length;
      offset += chunk.length;
    } while (offset < tracks.length);
  }
  const totalRows = pages.reduce((count, item) => count + item.rowCount, 0);
  const pageCount = pages.length;
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const precedingRows = pages.slice(0, currentPage - 1).reduce((count, item) => count + item.rowCount, 0);
  const selected = pages[currentPage - 1];
  return {
    rows: selected.rows, totalRows, pageCount, currentPage, groupPages,
    firstRow: totalRows === 0 ? 0 : precedingRows + 1,
    lastRow: precedingRows + selected.rowCount,
  };
}

export function groupMusicRecords(
  records: MusicCatalogRecord[],
  fields: MusicCatalogField[],
): MusicAlbumGroup[] {
  const albumField = fields.find((field) => field.role === 'album' || field.key === 'album');
  const directoryField = fields.find((field) => field.role === 'directory' || field.key === 'directory');
  const numberField = fields.find((field) => field.role === 'trackNumber' || field.key === 'trackNumber');
  const groups = new Map<string, MusicAlbumGroup>();
  for (const record of records) {
    const directory = (directoryField && scalarText(record.data[directoryField.key]))
      || record.playback.relativeAudioPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
      || '.';
    const album = albumField ? scalarText(record.data[albumField.key]) : '';
    const id = JSON.stringify([directory, album]);
    let group = groups.get(id);
    if (!group) {
      group = { id, directory, records: [] };
      groups.set(id, group);
    }
    group.records.push(record);
  }
  for (const group of groups.values()) {
    if (numberField) {
      group.records.sort((a, b) =>
        scalarText(a.data[numberField.key]).localeCompare(
          scalarText(b.data[numberField.key]), undefined, { numeric: true }));
    }
  }
  return [...groups.values()];
}
