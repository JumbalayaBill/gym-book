(function () {
  const { normalizeWord, hasWhitespace, createStore, csvFilename, KEY } = GymStore;
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
    assertEqual(normalizeWord('a'.repeat(40)).length, 30);
  });

  test('hasWhitespace detects more than one word', () => {
    assert(hasWhitespace('to ord'));
    assert(!hasWhitespace('  ett  '));
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

  test('deleteWord blanks the answer but keeps rows and numbering', () => {
    const s = createStore(fakeStorage());
    s.addResponse('dritt', 'ball');
    s.addResponse('gøy', 'dritt');
    assertEqual(s.deleteWord(1, 'dritt'), 1);
    assertEqual(s.counts(1), [{ word: 'gøy', count: 1 }]);
    assertEqual(s.counts(2), [{ word: 'ball', count: 1 }, { word: 'dritt', count: 1 }]);
    assertEqual(s.responses().map((r) => [r.n, r.a1]), [[1, ''], [2, 'gøy']]);
  });

  test('toCSV has BOM, header, semicolons, CRLF and quoting', () => {
    const s = createStore(fakeStorage());
    s.addResponse('gøy', 'ball');
    s.addResponse('a;b', 'si"hei');
    s.deleteWord(2, 'ball');
    assertEqual(s.toCSV(),
      '﻿respondee_number;answer_1;answer_2\r\n1;gøy;\r\n2;"a;b";"si""hei"\r\n');
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

  test('csvFilename uses local date', () => {
    assertEqual(csvFilename(new Date(2026, 8, 25, 23, 30)), 'gym-ordsky-2026-09-25.csv');
  });
})();
