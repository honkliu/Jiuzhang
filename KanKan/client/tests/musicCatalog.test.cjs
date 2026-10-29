const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'components', 'Music', 'musicCatalog.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const catalog = {};
vm.runInThisContext(`(function(exports) { ${compiled.outputText}\n})`)(catalog);

const fields = [
  { key: 'title', role: 'title', primary: true, searchable: true },
  { key: 'trackNumber', role: 'trackNumber' },
  { key: 'album', role: 'album', searchable: true, filterable: true },
  { key: 'performer', searchable: true, filterable: true },
  { key: 'tags', type: 'tags', searchable: true, filterable: true },
  { key: 'format', filterable: true },
  { key: 'directory', searchable: true, filterable: true },
  { key: 'source', visible: false },
];
const tagsField = fields.find((field) => field.key === 'tags');
const makeRecord = (id, directory, album, trackNumber, tags = []) => ({
  id,
  data: { title: `Track ${id}`, directory, album, trackNumber, tags },
  playback: { relativeAudioPath: `${directory}/${id}.flac` },
});

test('display-only preview skips continuation headings without changing page entries or counts', () => {
  const records = Array.from({ length: 22 }, (_, index) =>
    makeRecord(String(index), `Directory ${index}`, 'Album', 1));
  const groups = catalog.groupMusicRecords(records, fields);
  const collapsed = catalog.paginateMusicGroups(groups, records, 1, new Set());
  assert.equal(collapsed.preview.kind, 'directory');
  assert.equal(collapsed.preview.group.id, groups[20].id);
  assert.equal(collapsed.lastRow, 20);
  assert.equal(collapsed.totalRows, 22);
  const expanded = catalog.paginateMusicGroups(groups, records, 1, new Set([groups[19].id]));
  assert.equal(expanded.rows.length, 20);
  assert.equal(expanded.rows[19].tracks.length, 0);
  assert.equal(expanded.preview.kind, 'track');
  assert.equal(expanded.preview.record.id, '19');
  const next = catalog.paginateMusicGroups(groups, records, 2, new Set([groups[19].id]));
  assert.equal(next.rows[0].group.id, groups[19].id);
  assert.equal(next.rows[0].tracks[0].id, expanded.preview.record.id);
  assert.equal(next.preview, null);
});

test('album groups show one directory per album and keep numeric playback order', () => {
  const records = [
    makeRecord('ten', 'Collection A', 'Album', '10'),
    makeRecord('two', 'Collection A', 'Album', '2'),
    makeRecord('one', 'Collection A', 'Album', 1),
    makeRecord('other-directory', 'Collection B', 'Album', '1'),
    makeRecord('other-album', 'Collection A', 'Second album', '1'),
  ];
  const groups = catalog.groupMusicRecords(records, fields);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].directory, 'Collection A');
  assert.deepEqual(groups[0].records.map((record) => record.id), ['one', 'two', 'ten']);
  assert.equal(new Set(groups.map((group) => group.id)).size, 3);
  assert.equal(records[0].id, 'ten', 'group sorting must not mutate the catalog');
});

test('missing album or directory metadata uses audio directories without merging folders', () => {
  const records = [
    { id: 'a', data: {}, playback: { relativeAudioPath: 'Folder A\\a.flac' } },
    { id: 'b', data: {}, playback: { relativeAudioPath: 'Folder B/b.flac' } },
    { id: 'c', data: {}, playback: { relativeAudioPath: 'c.flac' } },
  ];
  assert.deepEqual(
    catalog.groupMusicRecords(records, []).map((group) => group.directory),
    ['Folder A', 'Folder B', '.'],
  );
});

test('track columns omit album, directory, format, track number and hidden fields', () => {
  assert.deepEqual(catalog.trackFields(fields).map((field) => field.key), [
    'title', 'tags', 'performer',
  ]);
  assert.deepEqual(catalog.trackFields([
    { key: 'custom-order', role: 'trackNumber' },
    { key: 'custom-album', role: 'album' },
    { key: 'custom-path', role: 'directory' },
  ]), []);
});

test('missing, null, empty-array and empty-string categories are all uncategorized', () => {
  for (const value of [undefined, null, [], '', ['']]) {
    const record = makeRecord('empty', 'Folder', 'Album', 1, value);
    record.data.tags = value;
    assert.deepEqual(catalog.fieldValues(record, tagsField), ['']);
    assert.deepEqual(
      catalog.filterMusicRecords([record], fields, [tagsField], '', { tags: JSON.stringify('') }),
      [record],
    );
  }
});

test('category filters distinguish uncategorized from real tags, including localized labels', () => {
  const records = [
    makeRecord('empty', 'Folder', 'Album', 1),
    makeRecord('jazz', 'Folder', 'Album', 2, ['Jazz', 'Live']),
    makeRecord('label', 'Folder', 'Album', 3, ['Uncategorized']),
    makeRecord('chinese', 'Folder', 'Album', 4, ['未分类']),
  ];
  for (const [value, expected] of [
    ['', ['empty']], ['Jazz', ['jazz']], ['Live', ['jazz']],
    ['Uncategorized', ['label']], ['未分类', ['chinese']],
  ]) {
    const filtered = catalog.filterMusicRecords(
      records, fields, [tagsField], '', { tags: JSON.stringify(value) });
    assert.deepEqual(filtered.map((record) => record.id), expected);
  }
  assert.equal(catalog.filterMusicRecords(records, fields, [tagsField], '', {}).length, 4);
});

test('search and category filters combine without narrowing the full album playback queue', () => {
  const records = [
    makeRecord('a', 'Folder', 'Album', 1, ['Jazz']),
    makeRecord('b', 'Folder', 'Album', 2),
    makeRecord('c', 'Folder', 'Album', 3),
  ];
  const filtered = catalog.filterMusicRecords(
    records, fields, [tagsField], 'TRACK B', { tags: JSON.stringify('') });
  assert.deepEqual(filtered.map((record) => record.id), ['b']);
  assert.deepEqual(catalog.groupMusicRecords(records, fields)[0].records, records);
});

test('expanded pagination counts both directory headings and tracks as visible rows', () => {
  const records = Array.from({ length: 45 }, (_, index) =>
    makeRecord(String(index), index < 25 ? 'Folder A' : 'Folder B', 'Album', index + 1));
  const groups = catalog.groupMusicRecords(records, fields);
  const expanded = new Set(groups.map((group) => group.id));
  const pages = [1, 2, 3].map((page) => catalog.paginateMusicGroups(groups, records, page, expanded));
  assert.equal(catalog.MUSIC_PAGE_SIZE, 20);
  assert.deepEqual(pages.map(({ rows }) =>
    rows.reduce((count, row) => count + Number(row.showDirectory) + row.tracks.length, 0)), [20, 20, 9]);
  assert.deepEqual(pages[1].rows.map((row) => [row.group.directory, row.showDirectory, row.tracks.length]), [
    ['Folder A', true, 6], ['Folder B', true, 12],
  ]);
  assert.equal(pages[1].rows[0].group.records.length, 25, 'album playback must retain off-page tracks');
  assert.equal(pages[0].totalRows, 49);
  assert.deepEqual(pages.map(({ firstRow, lastRow }) => [firstRow, lastRow]),
    [[1, 20], [21, 40], [41, 49]]);
  assert.equal(pages[0].groupPages.get(groups[1].id), 2);
  assert(pages.every(({ rows }) => rows[0].showDirectory));
  assert.deepEqual(
    pages.flatMap(({ rows }) => rows.flatMap((row) => row.tracks.map((record) => record.id))),
    records.map((record) => record.id),
  );
});

test('pagination operates on filtered songs without empty groups or skipped matches', () => {
  const records = Array.from({ length: 42 }, (_, index) =>
    makeRecord(String(index), 'Folder', 'Album', index + 1, index % 2 ? ['Jazz'] : []));
  const groups = catalog.groupMusicRecords(records, fields);
  const filtered = catalog.filterMusicRecords(
    records, fields, [tagsField], '', { tags: JSON.stringify('') });
  const expanded = new Set(groups.map((group) => group.id));
  const firstPage = catalog.paginateMusicGroups(groups, filtered, 1, expanded);
  const lastPage = catalog.paginateMusicGroups(groups, filtered, 2, expanded);
  assert.equal(firstPage.rows[0].tracks.length, 19);
  assert.deepEqual(lastPage.rows[0].tracks.map((record) => record.id), ['38', '40']);
  assert.equal(lastPage.rows[0].showDirectory, true);
  assert.equal(lastPage.rows[0].group.records.length, 42);
  assert.deepEqual(catalog.paginateMusicGroups(groups, [], 1, expanded), {
    rows: [], preview: null, totalRows: 0, pageCount: 1, currentPage: 1,
    groupPages: new Map(), firstRow: 0, lastRow: 0,
  });
});

test('collapsed pagination fills pages with directory rows instead of counting hidden songs', () => {
  const records = Array.from({ length: 45 }, (_, index) =>
    makeRecord(String(index), `Folder ${index}`, 'Album', 1));
  const groups = catalog.groupMusicRecords(records, fields);
  const pages = [1, 2, 3].map((page) =>
    catalog.paginateMusicGroups(groups, records, page, new Set()));
  assert.deepEqual(pages.map((page) => page.rows.length), [20, 20, 5]);
  assert(pages.every((page) => page.totalRows === 45 && page.pageCount === 3
    && page.rows.every((row) => row.showDirectory && row.tracks.length === 0)));
});

test('mixed expansion counts only visible tracks and clamps stale pages after collapse', () => {
  const records = Array.from({ length: 45 }, (_, index) =>
    makeRecord(String(index), index < 25 ? 'Folder A' : 'Folder B', 'Album', index + 1));
  const groups = catalog.groupMusicRecords(records, fields);
  const mixed = catalog.paginateMusicGroups(groups, records, 2, new Set([groups[0].id]));
  assert.equal(mixed.totalRows, 28);
  assert.equal(mixed.rows[0].tracks.length, 6);
  assert.equal(mixed.rows[1].tracks.length, 0);
  const collapsed = catalog.paginateMusicGroups(groups, records, 3, new Set());
  assert.equal(collapsed.currentPage, 1);
  assert.equal(collapsed.pageCount, 1);
  assert.equal(collapsed.totalRows, 2);
  assert.equal(collapsed.rows.length, 2);
});

test('continuation headings use a row on every page without duplicating or skipping songs', () => {
  for (const count of [1, 19, 20, 38, 39, 57, 58, 100]) {
    const records = Array.from({ length: count }, (_, index) =>
      makeRecord(String(index), 'Folder', 'Album', index + 1));
    const groups = catalog.groupMusicRecords(records, fields);
    const expanded = new Set([groups[0].id]);
    const first = catalog.paginateMusicGroups(groups, records, 1, expanded);
    const expectedPages = Math.ceil(count / 19);
    assert.equal(first.pageCount, expectedPages);
    assert.equal(first.totalRows, count + expectedPages);
    const seen = [];
    for (let page = 1; page <= first.pageCount; page++) {
      const { rows } = catalog.paginateMusicGroups(groups, records, page, expanded);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].showDirectory, true);
      assert(rows[0].tracks.length > 0 && rows[0].tracks.length <= 19);
      seen.push(...rows[0].tracks.map((record) => record.id));
    }
    assert.deepEqual(seen, records.map((record) => record.id));
  }
});

test('expanding the fifteenth directory fills five song slots then continues before other directories', () => {
  for (const count of [6, 12, 16, 19, 20, 39]) {
    const records = [
      ...Array.from({ length: 14 }, (_, index) => makeRecord(`a${index}`, `A${index}`, 'Album', 1)),
      ...Array.from({ length: count }, (_, index) => makeRecord(`b${index}`, 'B', 'Album', index)),
      ...Array.from({ length: 12 }, (_, index) => makeRecord(`c${index}`, `C${index}`, 'Album', 1)),
    ];
    const groups = catalog.groupMusicRecords(records, fields);
    const collapsed = catalog.paginateMusicGroups(groups, records, 1, new Set());
    assert.equal(collapsed.rows[14].group.id, groups[14].id);
    assert.equal(collapsed.lastRow, 20);
    const expanded = new Set([groups[14].id]);
    const first = catalog.paginateMusicGroups(groups, records, 1, expanded);
    assert.equal(first.rows.length, 15);
    assert.equal(first.rows[14].tracks.length, 5);
    assert.equal(first.lastRow, 20);
    assert.equal(first.groupPages.get(groups[14].id), 1);
    const target = catalog.paginateMusicGroups(groups, records, 2, expanded);
    assert.equal(target.rows[0].group.id, groups[14].id);
    assert.equal(target.rows[0].tracks.length, Math.min(count - 5, 19));
    assert.equal(target.firstRow, 21);
    if (count - 5 < 19) {
      assert.equal(target.rows.length - 1, Math.min(19 - (count - 5), 12));
    }
  }
});

test('directories stay on the same page when all matching songs fit, including an exact fit', () => {
  const records = [
    ...Array.from({ length: 13 }, (_, index) => makeRecord(`a${index}`, 'A', 'Album', index)),
    ...Array.from({ length: 12 }, (_, index) => makeRecord(`b${index}`, 'B', 'Album', index)),
  ];
  const groups = catalog.groupMusicRecords(records, fields);
  const expanded = new Set(groups.map(group => group.id));
  for (const count of [1, 4, 5]) {
    const filtered = [...groups[0].records, ...groups[1].records.slice(0, count)];
    const result = catalog.paginateMusicGroups(groups, filtered, 1, expanded);
    assert.equal(result.pageCount, 1);
    assert.equal(result.groupPages.get(groups[1].id), 1);
    assert.equal(result.rows[1].tracks.length, count);
    assert.equal(result.totalRows, 15 + count);
    assert.equal(result.rows[1].group.records.length, 12, 'Keep the full album playback queue');
  }
});

test('a heading in the final page slot keeps its starting page and continues all songs next page', () => {
  const records = [
    ...Array.from({ length: 19 }, (_, index) => makeRecord(`a${index}`, `A${index}`, 'Album', 1)),
    ...Array.from({ length: 21 }, (_, index) => makeRecord(`b${index}`, 'B', 'Album', index)),
    makeRecord('c', 'C', 'Album', 1),
  ];
  const groups = catalog.groupMusicRecords(records, fields);
  const expanded = new Set([groups[19].id]);
  const first = catalog.paginateMusicGroups(groups, records, 1, expanded);
  assert.equal(first.rows[19].tracks.length, 0);
  assert.equal(first.groupPages.get(groups[19].id), 1);
  const second = catalog.paginateMusicGroups(groups, records, 2, expanded);
  assert.equal(second.rows[0].tracks.length, 19);
  const third = catalog.paginateMusicGroups(groups, records, 3, expanded);
  assert.equal(third.rows[0].tracks.length, 2);
  assert.equal(third.rows[1].group.directory, 'C');
  assert.deepEqual(
    [first, second, third].flatMap(({ rows }) => rows.flatMap(row => row.tracks.map(record => record.id))),
    groups[19].records.map(record => record.id),
  );
});

test('visible-row packing fills every non-final page and keeps every song in order', () => {
  const records = [13, 12, 19, 1, 20, 5, 39, 18].flatMap((count, group) =>
    Array.from({ length: count }, (_, index) =>
      makeRecord(`${group}:${index}`, `Folder ${group}`, 'Album', index)));
  const groups = catalog.groupMusicRecords(records, fields);
  const expanded = new Set(groups.map(group => group.id));
  const first = catalog.paginateMusicGroups(groups, records, 1, expanded);
  const seen = [];
  let total = 0;
  for (let page = 1; page <= first.pageCount; page++) {
    const result = catalog.paginateMusicGroups(groups, records, page, expanded);
    const count = result.rows.reduce((sum, row) => sum + 1 + row.tracks.length, 0);
    assert(count > 0 && count <= 20);
    if (page < first.pageCount) assert.equal(count, 20);
    assert.equal(result.firstRow, total + 1);
    total += count;
    assert.equal(result.lastRow, total);
    for (const row of result.rows) {
      assert(row.showDirectory);
      seen.push(...row.tracks.map(record => record.id));
    }
  }
  assert.equal(total, first.totalRows);
  assert.deepEqual(seen, records.map(record => record.id));
});
