(function () {
  const { normalizeWord, countWords, createStore, csvFilename, KEY } = GymStore;
  const fakeStorage = (initial) => {
    const data = Object.assign({}, initial);
    return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
  };

  test('normalizeWord lowercases, trims and strips surrounding punctuation', () => {
    assertEqual(normalizeWord('  GØY! '), 'gøy');
    assertEqual(normalizeWord('«Svette»'), 'svette');
    assertEqual(normalizeWord('Ære...'), 'ære');
    assertEqual(normalizeWord('kan-ikke'), 'kan-ikke');
    assertEqual(normalizeWord('!!!'), '');
    assertEqual(normalizeWord('a'.repeat(50)).length, 40);
  });

  test('normalizeWord handles two-word answers', () => {
    assertEqual(normalizeWord('  Savner   VARIASJON! '), 'savner variasjon');
    assertEqual(normalizeWord('mer, dans'), 'mer dans');
    assertEqual(normalizeWord('ikke gøy'), 'ikke gøy');
  });

  test('countWords counts words, ignoring extra spaces and loose punctuation', () => {
    assertEqual(countWords('  ett  '), 1);
    assertEqual(countWords('to  ord'), 2);
    assertEqual(countWords('hele tre ord'), 3);
    assertEqual(countWords('gøy !'), 1);
    assertEqual(countWords('   '), 0);
  });

  test('counts merge case and punctuation variants', () => {
    const s = createStore(fakeStorage());
    s.addResponse(normalizeWord('GØY'), 'ball');
    s.addResponse(normalizeWord('gøy!'), 'ball');
    s.addResponse(normalizeWord(' Gøy '), 'dans');
    s.addResponse('svett', 'dans');
    assertEqual(s.counts(1), [{ word: 'gøy', count: 3 }, { word: 'svett', count: 1 }]);
    assertEqual(s.counts(2), [{ word: 'ball', count: 2 }, { word: 'dans', count: 2 }]);
  });

  test('responses are numbered incrementally and persisted', () => {
    const storage = fakeStorage();
    const s = createStore(storage);
    assertEqual(s.addResponse('a', 'b').n, 1);
    assertEqual(s.addResponse('c', 'd').n, 2);
    const s2 = createStore(storage);
    assertEqual(s2.responses().map((r) => r.n), [1, 2]);
    assertEqual(s2.addResponse('e', 'f').n, 3);
    assert(s2.isPersistent());
  });

  test('deleteWord hides a word from that cloud only and never touches the raw answers', () => {
    const s = createStore(fakeStorage());
    s.addResponse('Dritt', 'ball');
    s.addResponse('gøy', 'dritt');
    assertEqual(s.deleteWord(1, 'dritt'), 1);
    assertEqual(s.counts(1), [{ word: 'gøy', count: 1 }]);
    assertEqual(s.counts(2), [{ word: 'ball', count: 1 }, { word: 'dritt', count: 1 }]);
    s.addResponse('DRITT!', 'x');
    assertEqual(s.counts(1), [{ word: 'gøy', count: 1 }], 'later answers stay hidden');
    assert(s.toCSV().includes('1;Dritt;ball'), 'raw answer kept in CSV');
  });

  test('raw answers are stored as written, cloud uses the normalised form', () => {
    const s = createStore(fakeStorage());
    s.addResponse('  Savner   Variasjon ', 'Mer dans!');
    assertEqual(s.counts(1), [{ word: 'savner variasjon', count: 1 }]);
    assertEqual(s.toCSV(), '\uFEFFrespondee_number;answer_1;answer_2\r\n1;Savner Variasjon;Mer dans!\r\n');
  });

  test('mergeWords combines variants into one word and applies to later answers', () => {
    const s = createStore(fakeStorage());
    s.addResponse('x', 'savner variasjon');
    s.addResponse('x', 'mangler variasjon');
    s.addResponse('x', 'variasjon');
    s.addResponse('x', 'dans');
    s.mergeWords(2, ['savner variasjon', 'mangler variasjon', 'variasjon'], 'Variasjon');
    assertEqual(s.counts(2), [{ word: 'variasjon', count: 3 }, { word: 'dans', count: 1 }]);
    s.addResponse('x', 'Savner variasjon');
    assertEqual(s.counts(2)[0], { word: 'variasjon', count: 4 });
    assertEqual(s.counts(1), [{ word: 'x', count: 5 }], 'other question untouched');
    assertEqual(s.displayWord(2, 'mangler variasjon!'), 'variasjon');
    assert(s.toCSV().includes('1;x;savner variasjon'), 'raw answer kept in CSV');
  });

  test('merging into a new name and merging a merged word again both resolve', () => {
    const s = createStore(fakeStorage());
    s.addResponse('a1', 'mer ballspill');
    s.addResponse('a2', 'fotball');
    s.addResponse('a3', 'lagidrett');
    s.mergeWords(2, ['mer ballspill', 'fotball'], 'ballspill');
    s.mergeWords(2, ['ballspill', 'lagidrett'], 'lagidrett');
    assertEqual(s.counts(2), [{ word: 'lagidrett', count: 3 }]);
    assertEqual(s.merges(2), [
      { from: 'ballspill', to: 'lagidrett' },
      { from: 'fotball', to: 'lagidrett' },
      { from: 'mer ballspill', to: 'lagidrett' },
    ]);
  });

  test('unmerge restores a variant, and rules survive a reload', () => {
    const storage = fakeStorage();
    const s = createStore(storage);
    s.addResponse('x', 'savner variasjon');
    s.addResponse('x', 'variasjon');
    s.addResponse('dritt', 'y');
    s.mergeWords(2, ['savner variasjon', 'variasjon'], 'variasjon');
    s.deleteWord(1, 'dritt');
    const s2 = createStore(storage);
    assertEqual(s2.counts(2), [{ word: 'variasjon', count: 2 }, { word: 'y', count: 1 }]);
    assertEqual(s2.counts(1), [{ word: 'x', count: 2 }]);
    s2.unmerge(2, 'savner variasjon');
    assertEqual(s2.counts(2), [
      { word: 'savner variasjon', count: 1 }, { word: 'variasjon', count: 1 }, { word: 'y', count: 1 },
    ]);
  });

  test('data saved before two-word support still loads and exports', () => {
    const old = { nextN: 3, responses: [{ n: 1, a1: 'gøy', a2: 'dans', t: '' }, { n: 2, a1: '', a2: 'ski', t: '' }] };
    const s = createStore(fakeStorage({ [KEY]: JSON.stringify(old) }));
    assertEqual(s.counts(1), [{ word: 'gøy', count: 1 }]);
    assertEqual(s.toCSV(), '\uFEFFrespondee_number;answer_1;answer_2\r\n1;gøy;dans\r\n2;;ski\r\n');
    assertEqual(s.addResponse('a', 'b').n, 3);
  });

  test('toCSV has BOM, header, semicolons, CRLF and quoting', () => {
    const s = createStore(fakeStorage());
    s.addResponse('gøy', 'ball');
    s.addResponse('a;b', 'si"hei');
    assertEqual(s.toCSV(),
      '\uFEFFrespondee_number;answer_1;answer_2\r\n1;gøy;ball\r\n2;"a;b";"si""hei"\r\n');
  });

  test('corrupt storage starts empty and keeps a backup', () => {
    const storage = fakeStorage({ [KEY]: '{not json' });
    const s = createStore(storage);
    assertEqual(s.responses(), []);
    assert(Object.keys(storage.data).some((k) => k.startsWith(KEY + '-backup-')), 'backup key');
  });

  test('null storage works in memory and reports non-persistent', () => {
    const s = createStore(null);
    s.addResponse('a', 'b');
    assertEqual(s.counts(1), [{ word: 'a', count: 1 }]);
    assert(!s.isPersistent());
  });

  test('failing setItem marks store non-persistent', () => {
    const storage = fakeStorage();
    storage.setItem = () => { throw new Error('QuotaExceeded'); };
    const s = createStore(storage);
    s.addResponse('a', 'b');
    assert(!s.isPersistent());
  });

  test('reload picks up changes written by another tab', () => {
    const storage = fakeStorage();
    const tabA = createStore(storage);
    const tabB = createStore(storage);
    tabA.addResponse('gøy', 'dans');
    tabB.reload();
    tabB.addResponse('lek', 'ski');
    tabA.reload();
    assertEqual(tabA.responses().map((r) => [r.n, r.a1]), [[1, 'gøy'], [2, 'lek']]);
  });

  test('clearAll empties answers, CSV and rules, restarts numbering, and persists', () => {
    const storage = fakeStorage();
    const s = createStore(storage);
    s.addResponse('test', 'savner variasjon');
    s.addResponse('dritt', 'variasjon');
    s.mergeWords(2, ['savner variasjon', 'variasjon'], 'variasjon');
    s.deleteWord(1, 'dritt');
    s.clearAll();
    assertEqual(s.responses(), []);
    assertEqual(s.counts(1), []);
    assertEqual(s.merges(2), []);
    assertEqual(s.toCSV(), '\uFEFFrespondee_number;answer_1;answer_2\r\n');
    assertEqual(s.addResponse('dritt', 'savner variasjon').n, 1);
    assertEqual(s.counts(1), [{ word: 'dritt', count: 1 }], 'old delete rules are gone');
    assertEqual(s.counts(2), [{ word: 'savner variasjon', count: 1 }], 'old merges are gone');
    const reloaded = createStore(storage);
    assertEqual(reloaded.responses().map((r) => r.n), [1]);
  });

  test('csvFilename accepts a suffix for the backup file', () => {
    assertEqual(csvFilename(new Date(2026, 8, 25), 'før-sletting'), 'gym-ordsky-2026-09-25-før-sletting.csv');
  });

  test('csvFilename uses local date', () => {
    assertEqual(csvFilename(new Date(2026, 8, 25, 23, 30)), 'gym-ordsky-2026-09-25.csv');
  });
})();
