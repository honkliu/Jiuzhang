// Run with an existing Playwright Page against the local Vite server.
module.exports = async function verifyMusicLayout(page) {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const fields = [
    ['title', 'title', 280, '曲名'],
    ['album', 'album', 260, '专辑'],
    ['directory', 'directory', 280, '目录'],
    ['tags', null, 220, '分类'],
    ['performer', null, 180, '演奏者'],
    ['trackNumber', 'trackNumber', 72, '曲序'],
    ['format', null, 120, '格式'],
  ].map(([key, role, width, zh]) => ({
    key, role, width, labels: { zh }, type: key === 'tags' ? 'tags' : 'text',
    primary: key === 'title', searchable: true,
    filterable: ['album', 'directory', 'tags', 'performer', 'format'].includes(key),
  }));
  const records = Array.from({ length: 45 }, (_, index) => ({
    id: String(index + 1),
    data: {
      title: `Track ${String(index + 1).padStart(2, '0')} with a long full title`,
      album: 'Album',
      directory: index < 25 ? 'Directory A with a long full name' : 'Directory B',
      performer: 'Artist',
      tags: index % 2 ? ['Jazz', 'Classical', 'Live'] : [],
      trackNumber: index + 1,
    },
    playback: { relativeAudioPath: 'fixture.wav', startSeconds: 0, endSeconds: 1 },
  }));
  const routeHeader = route => route.fulfill({
    contentType: 'application/javascript', body: 'export const AppHeader = () => null;',
  });
  let fixtureRecords = records;
  const routeCatalog = route => route.fulfill({ json: { schema: { fields }, records: fixtureRecords } });
  const routePreview = route => route.fulfill({
    contentType: 'text/html',
    body: `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Music layout regression fixture</title></head>
      <body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const source = await (await fetch('/src/components/Music/MusicPage.tsx')).text();
      const languagePath = source.match(/from "([^"]*LanguageContext[^"]*)"/)[1];
      const [React, ReactDOM, music, language, skin] = await Promise.all([
        import('/node_modules/.vite/deps/react.js'),
        import('/node_modules/.vite/deps/react-dom_client.js'),
        import('/src/components/Music/MusicPage.tsx'), import(languagePath),
        import('/src/skins/SkinContext.tsx'), import('/src/index.css'),
        import('/node_modules/@fontsource/noto-sans-sc/400.css')
      ]);
      ReactDOM.default.createRoot(document.getElementById('root')).render(
        React.default.createElement(language.LanguageProvider, null,
          React.default.createElement(skin.SkinProvider, null,
            React.default.createElement(music.MusicPage))));
      </script></body></html>`,
  });
  const requests = [];
  let audioUrl = '';
  let failPlayback = false;
  const routePlayback = route => {
    requests.push(route.request().url().split('/').at(-2));
    return failPlayback
      ? route.fulfill({ status: 503, json: { message: 'Fixture playback failure' } })
      : route.fulfill({ json: { url: audioUrl, expiresAt: '2099-01-01T00:00:00Z' } });
  };
  await page.route('**/src/components/Shared/AppHeader.tsx*', routeHeader);
  await page.route('**/api/music/catalog', routeCatalog);
  await page.route('**/api/music/records/*/playback-url', routePlayback);
  await page.route('**/__music_layout_test', routePreview);
  const measure = () => page.evaluate(() => {
    const rect = element => {
      const value = element.getBoundingClientRect();
      return [value.x + window.scrollX, value.y + window.scrollY + document.body.scrollTop,
        value.width, value.height];
    };
    return {
      filters: rect(document.querySelector('[data-testid="music-filters"]')),
      table: rect(document.querySelector('[data-testid="music-table"]')),
      pagination: rect(document.querySelector('[data-testid="music-pagination"]')),
      columns: [...document.querySelectorAll('thead th')].flatMap(element => {
        const values = rect(element);
        values[0] += document.querySelector('[data-testid="music-table"]').scrollLeft;
        return values;
      }),
    };
  });
  const dataRows = page.locator('table[aria-label] tbody:not([aria-hidden="true"]) tr:not([aria-hidden="true"])');
  const verifyPreviewOrder = async (action) => {
    assert(await page.getByTestId('music-row-viewport').evaluate(viewport => {
      viewport.scrollTop = 100;
      const table = viewport.querySelector('table');
      const header = table.tHead.getBoundingClientRect();
      const firstRow = table.tBodies[0].rows[0].getBoundingClientRect();
      const preview = viewport.querySelector('[data-testid="music-next-preview"]');
      const previewRow = (preview.matches('tr') ? preview : preview.querySelector('tr')).getBoundingClientRect();
      const bounds = viewport.getBoundingClientRect();
      return table.tBodies.length === 1 && table.tBodies[0].rows.length === 21
        && viewport.scrollTop === 0 && viewport.parentElement.scrollTop === 0
        && Math.abs(firstRow.top - header.bottom) <= 1
        && Math.abs(previewRow.top - header.bottom - 20 * firstRow.height) <= 1
        && Math.abs(bounds.bottom - previewRow.top - 0.6 * previewRow.height) <= 1;
    }), `${action}: always show twenty complete rows followed by the bottom 0.6 preview, never a cropped first row`);
    assert(await page.getByTestId('music-next-preview').evaluate(element => {
      const row = element.matches('tr') ? element : element.querySelector('tr');
      const twentieth = row.previousElementSibling;
      const nineteenth = twentieth?.previousElementSibling;
      if (nineteenth?.getAttribute('data-testid') !== 'music-empty-row'
        || twentieth?.getAttribute('data-testid') !== 'music-empty-row') return true;
      return row.parentElement === nineteenth.parentElement
        && getComputedStyle(row).backgroundColor === getComputedStyle(nineteenth).backgroundColor;
    }), `${action}: a blank preview must continue alternating rows and match row nineteen, not reset after row twenty`);
  };
  const verify = async (baseline, action) => {
    await verifyPreviewOrder(action);
    const actual = await measure();
    for (const key of Object.keys(baseline)) {
      assert(actual[key].length === baseline[key].length, `${action}: ${key} structure changed`);
      actual[key].forEach((value, index) => assert(
        Math.abs(value - baseline[key][index]) <= 1,
        `${action}: ${key}[${index}] shifted from ${baseline[key][index]} to ${value}`,
      ));
    }
    assert(await page.locator('table[aria-label] tbody:not([data-testid="music-next-preview"]) tr:not([data-testid="music-next-preview"])').count() === 20,
      `${action}: short pages must be padded to twenty grid rows`);
    assert(await page.getByTestId('music-table').evaluate(element => {
      const headers = [...element.querySelectorAll('thead th')].map(cell => cell.getBoundingClientRect());
      return [...element.querySelectorAll('table[aria-label] thead tr, table[aria-label] tbody tr')]
        .filter(row => row.cells.length === headers.length)
        .every(row => [...row.cells].every((cell, index) => {
          const bounds = cell.getBoundingClientRect();
          const style = getComputedStyle(cell);
          return Math.abs(bounds.x - headers[index].x) <= 1
            && Math.abs(bounds.width - headers[index].width) <= 1
            && (index === headers.length - 1 || parseFloat(style.borderRightWidth) > 0);
        }));
    }), `${action}: headers, songs and blank rows must share aligned vertical column dividers`);
    assert(await page.getByTestId('music-empty-row').evaluateAll(rows => {
      const headers = [...document.querySelectorAll('thead th')].map(cell => cell.getBoundingClientRect());
      return rows.every(row => {
        const cells = [...row.cells];
        return row.getAttribute('aria-hidden') === 'true'
          && !row.hasAttribute('tabindex') && !row.querySelector('button, a, input')
          && cells.length === headers.length
          && cells.every((cell, index) => {
            const bounds = cell.getBoundingClientRect();
            const style = getComputedStyle(cell);
            return Math.abs(bounds.x - headers[index].x) <= 1
              && Math.abs(bounds.width - headers[index].width) <= 1
              && parseFloat(style.borderBottomWidth) > 0
              && (index === cells.length - 1 || parseFloat(style.borderRightWidth) > 0);
          });
      });
    }), `${action}: blank rows must retain column borders without becoming selectable entries`);
  };
  const verifyViewportFit = async (viewport) => {
    const layout = await page.evaluate(() => {
      const footer = document.querySelector('[data-testid="music-pagination"]').getBoundingClientRect();
      return {
        overflowing: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1
          || document.body.scrollHeight > document.body.clientHeight + 1,
        footerBottom: footer.bottom,
        availableBottom: innerHeight,
      };
    });
    assert(!layout.overflowing, `${viewport.width}x${viewport.height}: twenty rows must fit without page scrolling`);
    assert(layout.footerBottom <= layout.availableBottom,
      'The inline playback/pagination footer must remain visible');
  };
  const results = [];
  const goToPage = async (target) => {
    for (let step = 0; step < 30; step++) {
      const current = Number(await page.locator('[aria-current="true"]').textContent());
      if (current === target) return;
      await page.getByRole('button', { name: target > current ? '下一页' : '上一页', exact: true }).click();
    }
    throw new Error(`Could not navigate to page ${target}`);
  };
  try {
    await page.goto('http://localhost/__music_layout_test');
    await page.getByTestId('music-directory-toggle').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    audioUrl = await page.evaluate(() => {
      const bytes = new Uint8Array(44 + 8000 * 2 * 2);
      const view = new DataView(bytes.buffer);
      const text = (offset, value) => [...value].forEach((char, index) => {
        bytes[offset + index] = char.charCodeAt(0);
      });
      text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVEfmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, 8000, true); view.setUint32(28, 16000, true);
      view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data');
      view.setUint32(40, bytes.length - 44, true);
      return 'data:audio/wav;base64,' + btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
    });
    for (const width of [1600, 1280, 768, 430, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const search = page.getByRole('textbox', { name: '搜索曲目、专辑、演奏者或目录' });
      const playTrack = page.getByRole('button', { name: '播放单曲', exact: true });
      const selectCategory = async (name) => {
        await page.getByRole('combobox', { name: '分类', exact: true }).click();
        await page.getByRole('option', { name, exact: true }).click();
      };
      const resetFilters = async () => {
        await search.fill('');
        await selectCategory('全部');
      };
      await resetFilters();
      if (await page.getByRole('button', { name: '折叠全部目录', exact: true }).count()) {
        await page.getByRole('button', { name: '折叠全部目录', exact: true }).click();
      }
      assert(await playTrack.count() === 0, 'Directories must start collapsed');
      assert(JSON.stringify(await page.getByRole('columnheader').allTextContents())
        === JSON.stringify(['曲名', '分类', '演奏者']), 'Unexpected track columns');
      assert(await page.getByTestId('music-directory-row').count() === 2,
        'Both collapsed directories must appear on the first page');
      assert((await page.locator('table[aria-label]').getAttribute('aria-label')).includes('第 1–2 行 / 共 2 行'),
        'Collapsed pagination must count only directory rows');
      assert(await page.getByRole('heading', { name: '音乐', exact: true }).count() === 0,
        'Redundant heading is still displayed');
      const collapsedBaseline = await measure();
      const expectedRowHeight = width >= 900
        ? Math.max(32, Math.min(36, (900 - 224) / 21.6))
        : await page.getByTestId('music-table').evaluate(element => element.clientHeight / 21.6);
      assert(collapsedBaseline.table[3] >= 21.6 * expectedRowHeight - 1,
        'A short catalog must reserve the header, twenty rows and a 0.6-row preview');
      assert(await page.getByTestId('music-empty-row').count() === 18,
        'Two collapsed directories must leave eighteen empty grid rows');
      await verify(collapsedBaseline, `${width}px collapsed grid`);
      assert(collapsedBaseline.filters[3] <= (width >= 900 ? 48 : 56),
        'Search/category toolbar must retain its compact height');
      assert(await page.getByTestId('music-filters').getByRole('textbox').count() === 1
        && await page.getByTestId('music-filters').getByRole('combobox').count() === 1,
      'Toolbar must contain only search and category inputs');
      assert(await page.evaluate(() => {
        const toolbar = document.querySelector('[data-testid="music-filters"]');
        const controls = [
          toolbar.querySelector('.MuiTextField-root'),
          toolbar.querySelector('[role="combobox"]').closest('.MuiFormControl-root'),
          toolbar.querySelector('button[aria-expanded]'),
        ].map(element => element.getBoundingClientRect());
        return controls.every(rect => Math.abs(rect.y + rect.height / 2
          - controls[0].y - controls[0].height / 2) < 2)
          && controls.every(rect => rect.x >= 0 && rect.right <= innerWidth);
      }), 'Toolbar controls must remain on one line without viewport overflow');
      const directoryToggle = page.getByTestId('music-directory-toggle').first();
      await directoryToggle.click();
      await verify(collapsedBaseline, `${width}px expand directory`);
      assert(await playTrack.count() === 19, 'One heading and 19 songs must fill the first page');
      assert(await dataRows.count() === 20, 'Visible entries must be capped at 20');
      assert(await dataRows.last().evaluate(row => {
        const cell = row.querySelector('td');
        const previewCell = row.closest('table').querySelector('[data-testid="music-next-preview"] td');
        const branch = getComputedStyle(cell, '::before');
        const nextBranch = getComputedStyle(previewCell, '::before');
        return branch.bottom === '0px' && nextBranch.top === '0px' && branch.left === nextBranch.left;
      }), 'The final visible song must keep its tree connector continuous into the previewed song');
      assert(await page.locator('table[aria-label] tbody tr').evaluateAll((rows, expected) =>
        rows.every(row => Math.abs(row.getBoundingClientRect().height - expected) <= 1), expectedRowHeight),
      'Directory and song rows must share the responsive compact height');
      await directoryToggle.focus();
      await page.keyboard.press('Enter');
      await verify(collapsedBaseline, `${width}px collapse directory`);
      assert(await playTrack.count() === 0, 'Enter must toggle the directory');
      await page.keyboard.press('Space');
      await verify(collapsedBaseline, `${width}px re-expand directory`);
      assert(await playTrack.count() === 19, 'Space must toggle the directory');
      await goToPage(2);
      assert(await playTrack.count() === 6
        && await page.getByTestId('music-directory-row').count() === 2,
      'Mixed expansion must include the continuation heading, six songs and the next directory');
      await verify(collapsedBaseline, `${width}px partially filled continuation page`);
      await goToPage(1);
      await directoryToggle.click();
      const requestCount = requests.length;
      await page.getByRole('button', { name: '播放整个专辑', exact: true }).first().click();
      await page.locator('audio').waitFor({ state: 'attached' });
      await page.locator('audio').evaluate(audio => audio.pause());
      assert(requests[requestCount] === '1', 'Off-page album playback must start at the first track');
      assert(await playTrack.count() === 0, 'Album playback must not expand a collapsed directory');
      await search.fill('Track 01');
      assert(await playTrack.count() === 1, 'Search must automatically reveal matching songs');
      await verify(collapsedBaseline, `${width}px single matching song`);
      await directoryToggle.click();
      assert(await playTrack.count() === 0, 'Search results must still support manual collapse');
      await search.fill('Track 02');
      assert(await playTrack.count() === 1, 'A new search must expand its matching directory again');
      await page.getByRole('button', { name: '清除搜索', exact: true }).click();
      assert(await playTrack.count() === 0, 'Clearing search must restore the original collapsed state');
      await search.fill('   ');
      assert(await playTrack.count() === 0, 'Whitespace-only search must not expand directories');
      await search.fill('');
      await selectCategory('未分类');
      assert(await playTrack.count() === 18, 'Category selection must reveal songs when all directories were collapsed');
      await verify(collapsedBaseline, `${width}px category expands collapsed directories`);
      await selectCategory('全部');
      assert(await playTrack.count() === 0, 'Clearing category must restore the fully collapsed state');
      await directoryToggle.click();
      await search.fill('Track 26');
      assert(await playTrack.count() === 1, 'Search must expand a previously collapsed matching directory');
      assert((await page.getByTestId('music-directory-toggle').first().textContent()).includes('Directory B'),
        'Search must display the matching directory, not the previously expanded one');
      await page.getByRole('button', { name: '折叠全部目录', exact: true }).click();
      assert(await playTrack.count() === 0, 'Global collapse must work within search results');
      await page.getByRole('button', { name: '清除搜索', exact: true }).click();
      assert(await playTrack.count() === 19, 'Clearing search must restore the previously expanded directory');
      await goToPage(2);
      assert(await page.getByTestId('music-directory-toggle').nth(0).getAttribute('aria-expanded') === 'true'
        && await page.getByTestId('music-directory-toggle').nth(1).getAttribute('aria-expanded') === 'false',
      'Search toggles must not overwrite the original mixed expansion state');
      await selectCategory('未分类');
      assert(await playTrack.count() === 18, 'Uncategorized selection must expand matching songs');
      await goToPage(2);
      assert(await playTrack.count() === 5, 'Category selection must expand previously collapsed directories');
      await page.getByRole('button', { name: '折叠全部目录', exact: true }).click();
      assert(await playTrack.count() === 0, 'Filtered directories must support manual collapse');
      await selectCategory('Jazz');
      assert(await playTrack.count() === 18, 'Changing category must expand matching directories again');
      await selectCategory('全部');
      assert(await playTrack.count() === 19, 'Clearing category must restore the browse expansion state');
      await page.getByRole('button', { name: 'Jazz', exact: true }).first().click();
      assert(await playTrack.count() === 18, 'Category chips must also expand matching directories');
      await goToPage(2);
      assert(await playTrack.count() === 4, 'Category chips must reveal songs in previously collapsed directories');
      await search.fill('Track 26');
      assert(await playTrack.count() === 1, 'Search and category must combine at song level');
      await selectCategory('未分类');
      assert(await playTrack.count() === 0, 'Combined filters must exclude songs with the wrong category');
      await selectCategory('Jazz');
      assert(await playTrack.count() === 1, 'Changing category must reveal matching search results');
      await page.getByRole('button', { name: '清除搜索', exact: true }).click();
      assert(await playTrack.count() === 18, 'Clearing only search must keep category results expanded');
      await search.fill('Track 26');
      await selectCategory('全部');
      assert(await playTrack.count() === 1, 'Clearing only category must keep search results expanded');
      await page.getByRole('button', { name: '清除搜索', exact: true }).click();
      assert(await playTrack.count() === 19, 'Clearing both filters must restore the original expanded directory');
      await goToPage(2);
      assert(await page.getByTestId('music-directory-toggle').nth(1).getAttribute('aria-expanded') === 'false',
        'Category and search toggles must not overwrite the original collapsed directory');
      await page.getByRole('button', { name: '折叠全部目录', exact: true }).click();
      await page.getByRole('button', { name: '展开全部目录', exact: true }).click();
      await verify(collapsedBaseline, `${width}px expand all directories`);
      assert(await playTrack.count() === 19, 'Expanded page must reserve one row for its heading');
      const baseline = await measure();
      if (width >= 900) await verifyViewportFit({ width, height: 900 });
      assert(Math.abs(baseline.table[3] - collapsedBaseline.table[3]) <= 1,
        'Expansion must use reserved row space without moving the footer');
      await goToPage(2);
      assert(await playTrack.count() === 18 && await dataRows.count() === 20,
        'Remaining songs and the next directory must fill the same page');
      assert(await page.getByTestId('music-directory-row').count() === 2,
        'Continuation must show its own heading before the next directory');
      assert(await dataRows.first().getAttribute('data-testid') === 'music-directory-row',
        'The first visible row must identify the continued directory');
      await verify(baseline, `${width}px extra directory header`);
      await goToPage(3);
      assert(await playTrack.count() === 8 && await dataRows.count() === 9,
        'Expanded final page must contain its heading and eight remaining songs');
      assert((await page.locator('table[aria-label]').getAttribute('aria-label')).includes('第 41–49 行 / 共 49 行'),
        'Expanded row statistics must include headings but exclude unused page space');
      assert(await page.getByTestId('music-empty-row').count() === 11,
        'Nine final-page entries must leave eleven empty grid rows');
      assert(await dataRows.last().evaluate(row => {
        const cell = row.querySelector('td');
        return Math.abs(parseFloat(getComputedStyle(cell, '::before').bottom)
          - cell.getBoundingClientRect().height / 2) <= 1;
      }), 'Only the actual final matching song must end its tree connector halfway down the row');
      await verify(baseline, `${width}px partially filled last page`);
      await page.getByTestId('music-directory-toggle').first().click();
      assert(await page.getByRole('button', { name: '第 2 页', exact: true }).getAttribute('aria-current') === 'true',
        'Collapsing a continued directory must clamp to a valid page');
      await page.getByRole('button', { name: '折叠全部目录', exact: true }).click();
      assert(await playTrack.count() === 0 && await dataRows.count() === 2,
        'Collapsing from a later page must return to a valid collapsed page');
      await verify(collapsedBaseline, `${width}px collapse restores compact layout`);
      await page.getByRole('button', { name: '展开全部目录', exact: true }).click();
      await goToPage(1);
      await search.fill('Track');
      await verify(baseline, `${width}px search, same results`);
      await page.getByRole('combobox', { name: '分类', exact: true }).click();
      await page.getByRole('listbox').waitFor();
      await verify(baseline, `${width}px open filter menu`);
      await page.keyboard.press('Escape');
      await search.fill('Track 01');
      assert(await playTrack.count() === 1, 'Expected one search result');
      await verify(baseline, `${width}px one result`);
      await search.fill('missing track');
      assert(await playTrack.count() === 0, 'Expected empty results');
      await verify(baseline, `${width}px empty results`);
      await page.getByRole('button', { name: '清除搜索', exact: true }).click();
      await verify(baseline, `${width}px clear search`);
      await page.getByRole('button', { name: '未分类', exact: true }).first().click();
      await verify(baseline, `${width}px category chip`);
      await goToPage(2);
      assert(await playTrack.count() === 5 && await dataRows.count() === 6,
        'Filtered continuation must contain its heading and remaining songs');
      await verify(baseline, `${width}px short page`);
      await resetFilters();
      await verify(baseline, `${width}px clear filters`);
      await playTrack.first().click();
      await page.locator('audio').waitFor({ state: 'attached' });
      const player = page.getByTestId('music-player');
      assert(await player.evaluate((element, maxHeight) => {
        const bounds = element.getBoundingClientRect();
        return bounds.height <= maxHeight
          && bounds.left >= 0 && bounds.right <= innerWidth + 1
          && [...element.querySelectorAll('button, .MuiSlider-root')].every(control => {
            const rect = control.getBoundingClientRect();
            return rect.left >= bounds.left && rect.right <= bounds.right + 1;
          });
      }, 48), 'Inline player must remain compact without overflowing its controls');
      assert(await player.getByRole('button').count() === 3
        && await player.getByRole('slider').count() === 1,
      'Inline playback must retain transport and seeking without a volume control');
      assert(await page.getByTestId('music-time').isVisible()
        && /^\d+:\d{2} \/ \d+:\d{2}$/.test((await page.getByTestId('music-time').textContent()).trim()),
        'Elapsed and total playback time must remain visible');
      if (width >= 900) {
        assert(await player.evaluate(element => {
          const title = element.querySelector('[data-testid="music-current-title"]');
          const time = element.querySelector('[data-testid="music-time"]');
          return getComputedStyle(title).textAlign === 'right'
            && time.getBoundingClientRect().left - title.getBoundingClientRect().right <= 8;
        }), 'Track title must be right-aligned close to the time and progress controls');
      }
      assert(await page.getByTestId('music-pagination').evaluate(element => {
        const player = element.querySelector('[data-testid="music-player"]').getBoundingClientRect();
        const time = element.querySelector('[data-testid="music-time"]').getBoundingClientRect();
        const slider = element.querySelector('.MuiSlider-root').getBoundingClientRect();
        const navigation = element.querySelector('nav').getBoundingClientRect();
        const control = element.querySelector('[data-testid="music-player"] button').getBoundingClientRect();
        const pageButton = element.querySelector('nav button').getBoundingClientRect();
        const center = rect => rect.y + rect.height / 2;
        return player.right <= navigation.left + 1
          && !/第.*行/.test(element.textContent)
          && [time, slider, control, pageButton].every(rect => Math.abs(center(rect) - center(player)) <= 1);
      }), 'Footer must omit row counts and keep time, progress, playback and pages on the same line');
      await verify(baseline, `${width}px start playback`);
      await page.locator('audio').evaluate(audio => audio.pause());
      failPlayback = true;
      await playTrack.nth(1).click();
      await page.getByRole('alert').waitFor();
      await verify(baseline, `${width}px playback error`);
      await page.getByRole('alert').getByRole('button').click();
      failPlayback = false;
      await verify(baseline, `${width}px dismiss error`);
      results.push({
        viewport: width, maxAllowedShift: '1px',
        filterExpansion: 'search, category dropdown/chips, combined filters and state restoration',
      });
    }
    for (const width of [1280, 430]) {
      for (const songCount of [16, 25]) {
        fixtureRecords = Array.from({ length: 26 }, (_, group) =>
          Array.from({ length: group === 14 ? songCount : 1 }, (_, index) => ({
            id: `${group}:${index}`,
            data: {
              title: `Group ${group} song ${index + 1}`, album: 'Album',
              directory: `Directory ${group}`, performer: 'Artist', tags: [], trackNumber: index + 1,
            },
            playback: { relativeAudioPath: 'fixture.wav', startSeconds: 0, endSeconds: 1 },
          }))).flat();
        await page.setViewportSize({ width, height: 900 });
        await page.goto('http://localhost/__music_layout_test');
        await page.evaluate(() => document.fonts.ready);
        const toggle = page.getByTestId('music-directory-toggle').filter({ hasText: 'Directory 14' });
        await toggle.click();
        assert(await page.locator('[aria-current="true"]').textContent() === '1',
          'Expanding the fifteenth directory must stay on the same page');
        assert(await dataRows.count() === 20
          && await page.getByRole('button', { name: '播放单曲', exact: true }).count() === 5,
        'Fourteen collapsed headings, the expanded heading and five songs must fill page one');
        await goToPage(2);
        assert((await dataRows.first().textContent()).includes('Directory 14'),
          'Remaining songs must start with their directory heading');
        assert(await page.getByRole('button', { name: '播放单曲', exact: true }).count()
          === Math.min(songCount - 5, 19), 'Continuation must fill available song slots');
        assert(await dataRows.count() === 20, 'Subsequent folders must fill the remaining rows');
        if (songCount === 16) {
          assert(await page.getByTestId('music-directory-row').count() === 9,
            'Page two must contain the repeated heading, eleven songs and eight subsequent folders');
          await toggle.click();
          assert(await dataRows.count() === 6,
            'Collapsing from a continuation must recalculate directory-only pagination');
        } else {
          await goToPage(3);
          assert(await page.getByRole('button', { name: '播放单曲', exact: true }).count() === 1,
            'An oversized folder must continue its last song before subsequent folders');
          assert(await page.getByTestId('music-directory-row').count() === 12,
            'The last page must include all eleven subsequent folders');
        }
        results.push({ viewport: width, fifteenthDirectory: `${songCount} songs, first five stay on page one` });
      }
    }
    fixtureRecords = Array.from({ length: 45 }, (_, index) => ({
      id: `anchor-${index}`,
      data: {
        title: index === 32 ? 'huang selected song' : `Song ${index}`,
        directory: `Directory ${index}`, album: 'Album', tags: ['Jazz'],
      },
      playback: { relativeAudioPath: 'fixture.wav', startSeconds: 0, endSeconds: 1 },
    }));
    for (const width of [1280, 430]) {
      for (const selection of ['song', 'title', 'keyboard', 'album', 'directory']) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('http://localhost/__music_layout_test');
        const search = page.getByRole('textbox', { name: '搜索曲目、专辑、演奏者或目录' });
        await search.fill('huang');
        const beforeSelection = await measure();
        if (selection === 'directory') {
          await page.getByTestId('music-directory-toggle').click();
          await page.getByTestId('music-directory-toggle').click();
        } else if (selection === 'title') {
          await page.getByText('huang selected song', { exact: true }).click();
        } else if (selection === 'keyboard') {
          const songRow = page.locator('tbody tr').filter({ hasText: 'huang selected song' });
          await songRow.focus();
          await page.keyboard.press('Enter');
          await page.keyboard.press('Space');
        } else {
          await page.getByRole('button', {
            name: selection === 'song' ? '播放单曲' : '播放整个专辑', exact: true,
          }).click();
          await page.locator('audio').waitFor({ state: 'attached' });
          await page.locator('audio').evaluate(audio => audio.pause());
        }
        await search.hover();
        const selectedRow = page.locator('tbody tr[aria-selected="true"]');
        assert(await selectedRow.count() === 1, 'Exactly one clicked item must show selection');
        assert(await selectedRow.evaluate(element => {
          const cell = element.querySelector('td, th');
          const other = element.closest('table').querySelector('tbody tr[aria-selected="false"]');
          return element.classList.contains('Mui-selected')
            && getComputedStyle(cell).boxShadow !== 'none'
            && getComputedStyle(element).backgroundColor !== getComputedStyle(other).backgroundColor;
        }), 'Selection must have a persistent background and accent, not just hover feedback');
        await verify(beforeSelection, `${width}px ${selection} selection must not move the layout`);
        if (selection === 'song') {
          for (const value of ['huan', 'hua', 'hu', 'h', '']) await search.fill(value);
        }
        else await page.getByRole('button', { name: '清除搜索', exact: true }).click();
        assert(await page.getByRole('button', { name: '第 2 页', exact: true }).getAttribute('aria-current') === 'true',
          `${width}px ${selection}: clearing search must navigate to the selected directory's unfiltered page`);
        const heading = page.getByTestId('music-directory-toggle').filter({ hasText: 'Directory 32' });
        assert(await heading.getAttribute('aria-expanded') === 'true',
          'The selected directory must remain expanded after clearing search');
        assert(await selectedRow.count() === 1, 'Selection must persist after clearing search');
        assert((await selectedRow.textContent()).includes(
          selection === 'album' || selection === 'directory' ? 'Directory 32' : 'huang selected song',
        ), 'The same item must remain visibly selected');
        assert(await page.getByRole('button', { name: '播放单曲', exact: true }).count() === 1,
          'Other directories must retain their collapsed state');
        assert(await heading.evaluate(element => {
          const rect = element.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= innerHeight;
        }), 'The selected directory heading must be in view');
        await goToPage(1);
        assert(await selectedRow.count() === 0, 'Off-page selections must not highlight unrelated items');
        await goToPage(2);
        assert(await selectedRow.count() === 1, 'Selection must persist across pagination');
        if (selection === 'title') {
          await heading.click();
          assert(await selectedRow.count() === 1
            && await selectedRow.getAttribute('data-testid') === 'music-directory-row',
          'Choosing a folder must replace the song selection even when collapsing it');
        }
      }
      await page.goto('http://localhost/__music_layout_test');
      const search = page.getByRole('textbox', { name: '搜索曲目、专辑、演奏者或目录' });
      await search.fill('huang');
      await page.getByRole('button', { name: '清除搜索', exact: true }).click();
      assert(await page.locator('[aria-current="true"]').textContent() === '1',
        'Clearing search without choosing a result must retain the existing first-page behavior');
      assert(await page.getByRole('button', { name: '播放单曲', exact: true }).count() === 0,
        'An unselected search must restore the original collapsed state');
    }
    results.push({
      clearedSearchAnchor: 'song, title, keyboard, album and directory selections stay expanded on page two',
      selectionFeedback: 'persistent highlight and accent; one selected item; no layout changes',
    });
    for (const width of [1280, 430]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('http://localhost/__music_layout_test');
      await page.getByRole('combobox', { name: '分类', exact: true }).click();
      await page.getByRole('option', { name: 'Jazz', exact: true }).click();
      await goToPage(4);
      await page.getByText('huang selected song', { exact: true }).click();
      await page.getByRole('combobox', { name: '分类', exact: true }).click();
      await page.getByRole('option', { name: '全部', exact: true }).click();
      await page.getByRole('listbox').waitFor({ state: 'hidden' });
      const heading = page.getByTestId('music-directory-toggle').filter({ hasText: 'Directory 32' });
      assert(await page.locator('[aria-current="true"]').textContent() === '2',
        'Clearing category must navigate to the selected directory in the unfiltered catalog');
      assert(await heading.getAttribute('aria-expanded') === 'true',
        'Clearing category must retain the selected directory expansion');
      assert((await page.locator('tr[aria-selected="true"]').textContent()).includes('huang selected song'),
        'Clearing category must retain the selected song');
      assert(await heading.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return document.activeElement === element && bounds.top >= 0 && bounds.bottom <= innerHeight;
      }), 'Category menu must not restore focus/scroll to the toolbar after returning to the selection');
      await verifyPreviewOrder(`${width}px clearing category with a selected result`);
    }
    results.push({ clearedCategoryAnchor: 'selected song, expanded directory, page and focus retained on desktop/mobile' });
    fixtureRecords = Array.from({ length: 450 }, (_, index) => ({
      id: `directory-${index}`,
      data: { title: `Song ${index}`, directory: `Directory ${index}`, album: 'Album', tags: [] },
      playback: { relativeAudioPath: 'fixture.wav' },
    }));
    await page.goto('http://localhost/__music_layout_test');
    await page.getByTestId('music-directory-toggle').first().waitFor();
    for (const width of [1280, 430]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('http://localhost/__music_layout_test');
      await page.getByTestId('music-directory-toggle').first().waitFor();
      const baseline = await measure();
      const preview = page.getByTestId('music-next-preview');
      assert((await preview.textContent()).includes('Directory 20'),
        'Collapsed page must preview the next directory');
      assert(await preview.evaluate(element => {
        const real = element.closest('table').querySelector('[data-testid="music-directory-row"]');
        return getComputedStyle(element.matches('tr') ? element : element.querySelector('tr')).backgroundColor === getComputedStyle(real).backgroundColor
          && element.querySelectorAll('svg').length === real.querySelectorAll('svg').length
          && Boolean(element.querySelector('th[colspan]'));
      }), 'Folder preview must use the real folder band, icons and full-width heading');
      const lastHeading = page.getByTestId('music-directory-toggle').filter({ hasText: /^Directory 19$/ });
      await lastHeading.click();
      assert((await preview.textContent()).includes('Song 19'),
        'Expanding entry twenty must immediately preview its first song, not its repeated heading');
      assert(await preview.evaluate(element => {
        const row = element.matches('tr') ? element : element.querySelector('tr');
        const viewport = element.closest('[data-testid="music-row-viewport"]');
        return element.getAttribute('aria-hidden') === 'true'
          && element.hasAttribute('inert')
          && Math.abs((viewport.getBoundingClientRect().bottom - row.getBoundingClientRect().top) / 0.6
            - row.getBoundingClientRect().height) <= 1;
      }), '0.6-row preview must be clipped, display-only and hidden from assistive technology');
      const previewAppearance = await preview.evaluate(element => {
        const row = element.matches('tr') ? element : element.querySelector('tr');
        return {
          cells: [...row.cells].map(cell => ({
            padding: getComputedStyle(cell).padding,
            color: getComputedStyle(cell).color,
            text: cell.textContent,
            icons: cell.querySelectorAll('svg').length,
            chips: cell.querySelectorAll('.MuiChip-root').length,
          })),
        };
      });
      assert(await dataRows.count() === 20 && await page.getByRole('button', { name: '播放单曲', exact: true }).count() === 0,
        'Preview must not create another expandable or playable entry');
      await verify(baseline, `${width}px expanding final entry with 0.6-row preview`);
      await goToPage(2);
      assert((await dataRows.first().textContent()).includes('Directory 19'),
        'Next page must still repeat the directory heading');
      assert(await page.getByText('Song 19', { exact: true }).count() === 1,
        'The previewed song must become a real item on the next page');
      assert(await dataRows.filter({ hasText: 'Song 19' }).evaluate(row => !row.closest('[inert]')),
        'A previewed song must become interactive when it appears as a full row');
      const realAppearance = await dataRows.filter({ hasText: 'Song 19' }).evaluate(row => ({
        cells: [...row.cells].map(cell => ({
          padding: getComputedStyle(cell).padding,
          color: getComputedStyle(cell).color,
          text: cell.textContent,
          icons: cell.querySelectorAll('svg').length,
          chips: cell.querySelectorAll('.MuiChip-root').length,
        })),
      }));
      assert(JSON.stringify(previewAppearance) === JSON.stringify(realAppearance),
        'Song preview must reuse the real song styling, indentation, play icons and category chips');
      await lastHeading.click();
      await goToPage(1);
    }
    results.push({ halfRowPreview: 'entry 20 previews its first song; twenty real entries; no extra actions or footer movement' });
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(viewport);
      assert(await dataRows.count() === 20, 'Compacting must retain twenty entries per page');
      await verifyViewportFit(viewport);
      const compactBaseline = await measure();
      await page.getByRole('button', { name: '播放整个专辑', exact: true }).first().click();
      await page.locator('audio').waitFor({ state: 'attached' });
      await page.locator('audio').evaluate(audio => audio.pause());
      await verifyViewportFit(viewport);
      await verify(compactBaseline, `${viewport.width}x${viewport.height} playback must not move the list`);
    }
    results.push({ compactDesktop: '20 entries fit at 1280x900, 1440x900 and 1920x1080, including the player' });
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 390, height: 740 },
      { width: 390, height: 664 },
      { width: 430, height: 740 },
    ]) {
      await page.setViewportSize(viewport);
      await page.waitForFunction(() => {
        const container = document.querySelector('[data-testid="music-table"]');
        const viewport = document.querySelector('[data-testid="music-row-viewport"]');
        return Math.abs(container.clientHeight - viewport.getBoundingClientRect().height) <= 1;
      });
      await verifyViewportFit(viewport);
      await verifyPreviewOrder(`${viewport.width}x${viewport.height} mobile viewport resize`);
      await page.getByRole('combobox', { name: '分类', exact: true }).click();
      await page.getByRole('option', { name: '未分类', exact: true }).click();
      await page.getByRole('listbox').waitFor({ state: 'hidden' });
      await verifyViewportFit(viewport);
      await verifyPreviewOrder(`${viewport.width}x${viewport.height} expanded category songs`);
      assert(await dataRows.evaluateAll(rows => rows.every(row => {
        const bounds = row.getBoundingClientRect();
        return [...row.querySelectorAll('button, .MuiChip-root, .MuiTypography-root')].every(control => {
          const rect = control.getBoundingClientRect();
          return rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1;
        });
      })), 'Dense mobile row content must fit inside each complete row without overlapping');
      await page.getByRole('combobox', { name: '分类', exact: true }).click();
      await page.getByRole('option', { name: '全部', exact: true }).click();
      await page.getByRole('listbox').waitFor({ state: 'hidden' });
    }
    results.push({ mobileViewportFit: '20.6 rows plus toolbar and active player fit at 390x844, 390x740, 390x664 and 430x740; row content scales on resize' });
    const playerGeometryByWidth = new Map();
    for (const position of ['first', 'middle', 'last']) {
      if (position === 'middle') {
        for (let step = 0; step < 11; step++) {
          await page.getByRole('button', { name: '下一页', exact: true }).click();
        }
      } else if (position === 'last') {
        await goToPage(23);
      }
      const expectedPage = position === 'first' ? '1' : position === 'middle' ? '12' : '23';
      assert(await page.locator('[aria-current="true"]').textContent() === expectedPage,
        `Pagination navigation failed at ${position} page`);
      for (const width of [1280, 768, 430, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForFunction((maxPages) =>
          [...document.querySelectorAll('[data-testid="music-pagination"] button')]
            .filter(button => /^第 \d+ 页$/.test(button.getAttribute('aria-label') ?? '')).length <= maxPages,
        width < 600 ? 2 : 3);
        const geometry = await page.getByTestId('music-pagination').evaluate(element => {
          const bounds = element.getBoundingClientRect();
          const items = [...element.querySelectorAll('li')].map(item => item.getBoundingClientRect());
          return {
            oneRow: items.every(item => Math.abs(
              item.y + item.height / 2 - items[0].y - items[0].height / 2,
            ) <= 1),
            fits: items.every(item => item.left >= bounds.left - 1 && item.right <= bounds.right + 1),
          };
        });
        assert(geometry.oneRow, `${width}px ${position}: pagination icons must not wrap`);
        assert(geometry.fits, `${width}px ${position}: pagination must fit without horizontal overflow`);
        const playbackGeometry = await page.getByTestId('music-player').evaluate(element =>
          [element, ...element.querySelectorAll('button, .MuiSlider-root, [data-testid="music-time"]')]
            .flatMap(control => {
              const rect = control.getBoundingClientRect();
              return [rect.x, rect.width];
            }));
        if (width >= 900) {
          assert(await page.getByTestId('music-player').evaluate(element => {
            const bounds = element.getBoundingClientRect();
            const time = element.querySelector('[data-testid="music-time"]').getBoundingClientRect();
            const buttons = [...element.querySelectorAll('button')];
            const last = buttons[buttons.length - 1].getBoundingClientRect();
            return Math.abs((time.left + last.right) / 2 - (bounds.left + bounds.right) / 2) <= 2;
          }), 'Desktop time, progress and playback controls must be centered in their reserved area');
        }
        const firstGeometry = playerGeometryByWidth.get(width);
        if (firstGeometry) {
          assert(playbackGeometry.every((value, index) => Math.abs(value - firstGeometry[index]) <= 1),
            `${width}px ${position}: page numbers or row ranges must not move playback horizontally`);
        } else {
          playerGeometryByWidth.set(width, playbackGeometry);
        }
        const pageNumbers = page.getByRole('button', { name: /^第 \d+ 页$/ });
        assert(await pageNumbers.count() <= (width < 600 ? 2 : 3),
          'Show only the current page, next page on desktop, and the final page');
        assert(await page.getByRole('button', { name: '第 23 页', exact: true }).count() === 1,
          'The final page must always be visible and directly accessible');
        const current = Number(await page.locator('[aria-current="true"]').textContent());
        if (current + (width < 600 ? 0 : 1) < 22) {
          assert(await page.getByTestId('music-pagination').locator('.MuiPaginationItem-ellipsis').count() === 1,
            'A gap before the final page must show an ellipsis');
        }
      }
    }
    results.push({
      pagination: '23 pages; first, middle and last; 320–1280px; final page and gap ellipsis; at most three numbers (two on mobile)',
      inlinePlayback: 'single-line time/progress/playback/pagination; no visible row counts, volume or horizontal shifts',
    });
    return { results, playbackRequests: requests.length };
  } finally {
    await page.unroute('**/src/components/Shared/AppHeader.tsx*', routeHeader);
    await page.unroute('**/api/music/catalog', routeCatalog);
    await page.unroute('**/api/music/records/*/playback-url', routePlayback);
    await page.unroute('**/__music_layout_test', routePreview);
    await page.goto('http://localhost/music');
  }
};
