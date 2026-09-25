# Gym-ordsky Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static, offline-capable kiosk web page where Forskernatt visitors answer two one-word questions about PE, shown live as two animated word clouds.

**Architecture:** Plain HTML/CSS/JS, no build step, no dependencies. `store.js` (data + CSV) and the layout half of `cloud.js` are pure and unit-tested in Node and the browser; `app.js` wires DOM, form flow and admin panel. Data lives in `localStorage`.

**Tech Stack:** Vanilla ES2020 JS, CSS transitions, locally bundled woff2 fonts (Anton, Barlow Condensed), Node 24 for running tests, Playwright MCP for browser verification.

**Spec:** `docs/superpowers/specs/2026-09-25-gym-ordsky-design.md`

## Global Constraints

- No backend, no login, no CDN at runtime; everything served from the repo root (GitHub Pages, `main` branch, root).
- Storage key: `gym-ordsky-v1`, shape `{ nextN, responses: [{ n, a1, a2, t }] }`.
- Questions/title/colours editable only in `config.js`.
- Answers: one word, trimmed, `toLocaleLowerCase('nb')`, surrounding punctuation stripped, max 30 chars.
- CSV: UTF-8 BOM, `;` separator, `\r\n` line endings, header `respondee_number;answer_1;answer_2`, filename `gym-ordsky-YYYY-MM-DD.csv`.
- Deleting a word blanks it for that question in every response; rows stay.
- Admin: `Ctrl+Shift+A`, plus fallback of typing `/admin` + Enter in the answer field (some browsers reserve `Ctrl+Shift+A`, e.g. Chrome tab search / Firefox add-ons).
- UI copy in Norwegian (bokmål).

## Review Focus

1. Same word in different case/punctuation (`GØY`, `gøy!`, ` Gøy `) must count as one word → store test in Task 1.
2. A visitor walks away after question 1; the next visitor must not start on question 2 → idle reset (60 s) in Task 3, verified in browser with a short timeout.
3. Many unique words (150) or one 30-character word must still lay out inside the cloud without overlaps, and terminate → layout tests in Task 2.
4. Double-pressing Enter on question 2 must not store two responses → `busy` guard in Task 3, browser check.
5. Words containing `;` or `"` must not break the CSV columns → store test in Task 1.

---

### Task 1: Data store + test harness

**Files:**
- Create: `store.js`, `tests/harness.js`, `tests/store.test.js`, `tests/run-node.js`, `tests/index.html`

**Interfaces:**
- Produces (global `GymStore`):
  - `normalizeWord(raw: string): string`
  - `hasWhitespace(raw: string): boolean` (inner whitespace after trim)
  - `csvFilename(date: Date): string`
  - `createStore(storage: Storage|null): Store` where Store =
    `{ addResponse(a1, a2) → {n,a1,a2,t}, counts(q: 1|2) → [{word,count}] (count desc, then word asc 'nb'), deleteWord(q, word) → number changed, toCSV() → string, responses() → array copy, isPersistent() → boolean }`
- Produces (test harness globals): `test(name, fn)`, `assert(cond, msg)`, `assertEqual(actual, expected, msg)`, `runTests(log) → {passed, failed}`

- [ ] **Step 1: Write harness, node runner, browser runner**

`tests/harness.js`:
```js
(function (root) {
  'use strict';
  const tests = [];
  root.test = (name, fn) => tests.push({ name, fn });
  root.assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };
  root.assertEqual = (actual, expected, msg) => {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) throw new Error((msg ? msg + ': ' : '') + 'expected ' + e + ' but got ' + a);
  };
  root.runTests = (log) => {
    let passed = 0, failed = 0;
    for (const t of tests) {
      try { t.fn(); passed++; log('✓ ' + t.name); }
      catch (err) { failed++; log('✗ ' + t.name + ' — ' + err.message); }
    }
    log(`${passed} passed, ${failed} failed`);
    return { passed, failed };
  };
})(typeof window !== 'undefined' ? window : globalThis);
```

`tests/run-node.js`:
```js
const fs = require('fs'), path = require('path'), vm = require('vm');
const files = ['../store.js', '../cloud.js', 'harness.js', 'store.test.js', 'cloud.test.js'];
for (const f of files) {
  const p = path.join(__dirname, f);
  if (fs.existsSync(p)) vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: f });
}
const { failed } = runTests(console.log);
process.exit(failed ? 1 : 0);
```

`tests/index.html`:
```html
<!doctype html>
<html lang="no">
<head><meta charset="utf-8"><title>Gym-ordsky – tester</title>
<style>body{font:16px/1.5 monospace;padding:2rem;background:#111;color:#eee}.f{color:#ff6b6b}.p{color:#6bff95}</style></head>
<body>
<h1>Tester</h1><pre id="out"></pre>
<script src="../store.js"></script>
<script src="../cloud.js"></script>
<script src="harness.js"></script>
<script src="store.test.js"></script>
<script src="cloud.test.js"></script>
<script>
  const out = document.getElementById('out');
  runTests((line) => {
    const s = document.createElement('span');
    s.className = line.startsWith('✗') ? 'f' : 'p';
    s.textContent = line + '\n';
    out.appendChild(s);
  });
</script>
</body>
</html>
```

- [ ] **Step 2: Write failing store tests** — `tests/store.test.js`:
```js
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
```

- [ ] **Step 3: Run to verify failure**

Run: `node tests/run-node.js`
Expected: FAIL — `GymStore is not defined`.

- [ ] **Step 4: Implement `store.js`**
```js
(function (root) {
  'use strict';

  const KEY = 'gym-ordsky-v1';
  const MAX_LEN = 30;

  function normalizeWord(raw) {
    return String(raw == null ? '' : raw)
      .trim()
      .toLocaleLowerCase('nb')
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
      .slice(0, MAX_LEN);
  }

  function hasWhitespace(raw) {
    return /\s/.test(String(raw).trim());
  }

  function csvFilename(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `gym-ordsky-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.csv`;
  }

  function csvField(value) {
    const s = String(value == null ? '' : value);
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function isValidState(s) {
    return s && Number.isInteger(s.nextN) && Array.isArray(s.responses);
  }

  function createStore(storage) {
    let state = { nextN: 1, responses: [] };
    let persistent = !!storage;

    if (storage) {
      try {
        const raw = storage.getItem(KEY);
        if (raw) {
          let parsed = null;
          try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
          if (isValidState(parsed)) state = parsed;
          else storage.setItem(KEY + '-backup-' + Date.now(), raw);
        }
      } catch (e) {
        persistent = false;
      }
    }

    function save() {
      if (!storage) return;
      try {
        storage.setItem(KEY, JSON.stringify(state));
        persistent = true;
      } catch (e) {
        persistent = false;
      }
    }

    return {
      addResponse(a1, a2) {
        const r = { n: state.nextN++, a1, a2, t: new Date().toISOString() };
        state.responses.push(r);
        save();
        return r;
      },
      counts(q) {
        const key = 'a' + q;
        const map = new Map();
        for (const r of state.responses) {
          const w = r[key];
          if (w) map.set(w, (map.get(w) || 0) + 1);
        }
        return [...map].map(([word, count]) => ({ word, count }))
          .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, 'nb'));
      },
      deleteWord(q, word) {
        const key = 'a' + q;
        let changed = 0;
        for (const r of state.responses) {
          if (r[key] === word) { r[key] = ''; changed++; }
        }
        if (changed) save();
        return changed;
      },
      toCSV() {
        const lines = ['respondee_number;answer_1;answer_2'];
        for (const r of state.responses) lines.push([r.n, r.a1, r.a2].map(csvField).join(';'));
        return '﻿' + lines.join('\r\n') + '\r\n';
      },
      responses() {
        return state.responses.map((r) => Object.assign({}, r));
      },
      isPersistent() {
        return persistent;
      },
    };
  }

  root.GymStore = { KEY, normalizeWord, hasWhitespace, csvFilename, createStore };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 5: Run tests** — `node tests/run-node.js` → all store tests pass.

- [ ] **Step 6: Commit** — `git add store.js tests && git commit -m "feat: data store with CSV export and tests"`

---

### Task 2: Word-cloud layout + renderer

**Files:**
- Create: `cloud.js`, `tests/cloud.test.js`

**Interfaces:**
- Produces (global `GymCloud`):
  - `layoutCloud(words: [{word,count}], width, height, measure: (word, size) → {w,h}, opts?: {minSize, maxSize, padding}) → [{word, count, size, x, y, w, h}]` — `x,y` are box centres relative to container centre; unpadded `w,h`; boxes inside `±width/2, ±height/2`; no two boxes overlap.
  - `measureText(fontFamily: string) → measure` (canvas-based, browser only)
  - `renderCloud(container: HTMLElement, words, opts: {measure, palette: string[], highlight?: string}) → layout` — reuses one `<span class="cloud-word">` per word; animates via CSS transitions.

- [ ] **Step 1: Write failing layout tests** — `tests/cloud.test.js`:
```js
(function () {
  const { layoutCloud } = GymCloud;
  const measure = (word, size) => ({ w: word.length * size * 0.55, h: size });

  const inBounds = (b, W, H) =>
    Math.abs(b.x) * 2 + b.w <= W + 0.01 && Math.abs(b.y) * 2 + b.h <= H + 0.01;
  const overlap = (a, b) =>
    Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
  function checkValid(layout, W, H) {
    layout.forEach((b) => assert(inBounds(b, W, H), `"${b.word}" out of bounds`));
    for (let i = 0; i < layout.length; i++)
      for (let j = i + 1; j < layout.length; j++)
        assert(!overlap(layout[i], layout[j]), `"${layout[i].word}" overlaps "${layout[j].word}"`);
  }
  const makeWords = (n) =>
    Array.from({ length: n }, (_, i) => ({ word: 'ord' + i + 'x'.repeat(i % 7), count: 1 + ((i * 37) % 11) }));

  test('empty input or zero size gives empty layout', () => {
    assertEqual(layoutCloud([], 800, 500, measure), []);
    assertEqual(layoutCloud([{ word: 'a', count: 1 }], 0, 500, measure), []);
  });

  test('single word is centred', () => {
    const [b] = layoutCloud([{ word: 'gøy', count: 1 }], 800, 500, measure);
    assertEqual([Math.round(b.x), Math.round(b.y)], [0, 0]);
  });

  test('40 words: all placed, in bounds, no overlaps', () => {
    const layout = layoutCloud(makeWords(40), 800, 500, measure);
    assertEqual(layout.length, 40);
    checkValid(layout, 800, 500);
  });

  test('highest count gets the largest size; equal counts equal size', () => {
    const layout = layoutCloud(
      [{ word: 'ball', count: 2 }, { word: 'gøy', count: 9 }, { word: 'dans', count: 2 }], 800, 500, measure);
    const size = (w) => layout.find((b) => b.word === w).size;
    assert(size('gøy') > size('ball'));
    assertEqual(size('ball'), size('dans'));
  });

  test('150 unique words still fit, terminate and do not overlap', () => {
    const words = Array.from({ length: 150 }, (_, i) => ({ word: 'w' + i, count: 1 }));
    const layout = layoutCloud(words, 600, 400, measure);
    assertEqual(layout.length, 150);
    checkValid(layout, 600, 400);
  });

  test('a 30-character word fits a narrow cloud', () => {
    const layout = layoutCloud([{ word: 'x'.repeat(30), count: 5 }, { word: 'kort', count: 1 }], 300, 300, measure);
    assertEqual(layout.length, 2);
    checkValid(layout, 300, 300);
  });

  test('layout is deterministic', () => {
    const words = makeWords(25);
    assertEqual(layoutCloud(words, 700, 450, measure), layoutCloud(words, 700, 450, measure));
  });
})();
```

- [ ] **Step 2: Run** — `node tests/run-node.js` → FAIL `GymCloud is not defined`.

- [ ] **Step 3: Implement `cloud.js`**
```js
(function (root) {
  'use strict';

  const SPIRAL_SPACING = 8; // px between spiral turns
  const ARC_STEP = 4;       // px along the spiral between candidate positions

  function sortWords(words) {
    return words.slice().sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, 'nb'));
  }

  function overlaps(a, b) {
    return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
  }

  // Place words largest-first along an elliptical Archimedean spiral.
  // Returns null if a word does not fit (unless allowDrop, then it is skipped).
  function tryLayout(sorted, width, height, measure, minSize, maxSize, pad, allowDrop) {
    const maxCount = sorted[0].count;
    const aspect = width / height;
    const maxR = height / Math.SQRT2 + 1;
    const placed = [];
    const result = [];

    for (const item of sorted) {
      const size = Math.max(minSize, maxSize * Math.sqrt(item.count / maxCount));
      const m = measure(item.word, size);
      const box = { x: 0, y: 0, w: m.w + pad, h: m.h + pad };
      let found = false;

      if (box.w <= width && box.h <= height) {
        let lastHit = null;
        let theta = 0;
        let r = 0;
        while (r <= maxR) {
          box.x = aspect * r * Math.cos(theta);
          box.y = r * Math.sin(theta);
          if (Math.abs(box.x) * 2 + box.w <= width && Math.abs(box.y) * 2 + box.h <= height &&
              !(lastHit && overlaps(box, lastHit))) {
            lastHit = placed.find((p) => overlaps(box, p)) || null;
            if (!lastHit) { found = true; break; }
          }
          theta += ARC_STEP / (Math.max(r, 8) * Math.max(aspect, 1));
          r = (SPIRAL_SPACING * theta) / (2 * Math.PI);
        }
      }

      if (!found) {
        if (allowDrop) continue;
        return null;
      }
      placed.push({ x: box.x, y: box.y, w: box.w, h: box.h });
      result.push({ word: item.word, count: item.count, size, x: box.x, y: box.y, w: m.w, h: m.h });
    }
    return result;
  }

  function layoutCloud(words, width, height, measure, opts) {
    opts = opts || {};
    if (!words.length || width <= 0 || height <= 0) return [];
    const sorted = sortWords(words);
    const minSize = opts.minSize != null ? opts.minSize : 16;
    const maxSize = opts.maxSize != null ? opts.maxSize : Math.min(height / 3.5, width / 5);
    const pad = opts.padding != null ? opts.padding : 6;
    let scale = 1;
    for (let i = 0; i < 14; i++) {
      const res = tryLayout(sorted, width, height, measure, minSize * scale, maxSize * scale, pad, false);
      if (res) return res;
      scale *= 0.85;
    }
    return tryLayout(sorted, width, height, measure, minSize * scale, maxSize * scale, pad, true);
  }

  let measureCtx = null;
  function measureText(fontFamily) {
    return function (word, size) {
      measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
      measureCtx.font = `${size}px ${fontFamily}`;
      return { w: Math.ceil(measureCtx.measureText(word).width), h: Math.ceil(size) };
    };
  }

  function hashWord(word) {
    let h = 0;
    for (const ch of word) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return h;
  }

  function renderCloud(container, words, opts) {
    const layout = layoutCloud(words, container.clientWidth, container.clientHeight, opts.measure, opts);
    const els = container._cloudEls || (container._cloudEls = new Map());
    const palette = opts.palette || ['#ffffff'];
    const keep = new Set();

    for (const item of layout) {
      keep.add(item.word);
      let el = els.get(item.word);
      const transform = `translate(-50%, -50%) translate(${item.x.toFixed(1)}px, ${item.y.toFixed(1)}px)`;
      if (!el) {
        el = document.createElement('span');
        el.className = 'cloud-word is-hidden';
        el.textContent = item.word;
        el.style.color = palette[hashWord(item.word) % palette.length];
        el.style.fontSize = item.size.toFixed(1) + 'px';
        el.style.transform = transform;
        container.appendChild(el);
        els.set(item.word, el);
        void el.offsetWidth; // commit start state so the entry animates
      }
      el.classList.remove('is-hidden');
      el.style.fontSize = item.size.toFixed(1) + 'px';
      el.style.transform = transform;
      el.title = `${item.word} (${item.count})`;
      if (opts.highlight === item.word) {
        el.classList.remove('pulse');
        void el.offsetWidth;
        el.classList.add('pulse');
      }
    }

    for (const [word, el] of els) {
      if (keep.has(word)) continue;
      els.delete(word);
      el.classList.add('is-hidden');
      setTimeout(() => el.remove(), 700);
    }
    return layout;
  }

  root.GymCloud = { layoutCloud, measureText, renderCloud };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run** — `node tests/run-node.js` → all store + cloud tests pass (run time < 5 s).

- [ ] **Step 5: Commit** — `git add cloud.js tests/cloud.test.js && git commit -m "feat: animated word-cloud layout and renderer"`

---

### Task 3: Page, styling, fonts and answer flow

**Files:**
- Create: `index.html`, `config.js`, `style.css`, `app.js`, `fonts/*.woff2`

**Interfaces:**
- Consumes: `GymStore.*` (Task 1), `GymCloud.renderCloud`, `GymCloud.measureText` (Task 2)
- Produces: global `GYM_CONFIG = { subtitle, title, questions: [string, string], palette: string[], thanks: string, idleResetMs: number }`; DOM ids `cloud-1`, `cloud-2`, `answer-form`, `answer`, `admin` used by Task 4.

- [ ] **Step 1: Download fonts** (Latin subset covers æ/ø/å)
```bash
mkdir -p fonts
curl -sfL -o fonts/anton-400.woff2 https://cdn.jsdelivr.net/npm/@fontsource/anton/files/anton-latin-400-normal.woff2
curl -sfL -o fonts/barlow-condensed-500.woff2 https://cdn.jsdelivr.net/npm/@fontsource/barlow-condensed/files/barlow-condensed-latin-500-normal.woff2
curl -sfL -o fonts/barlow-condensed-700.woff2 https://cdn.jsdelivr.net/npm/@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2
```
Both fonts are SIL OFL; add `fonts/LICENSE.txt` noting that.

- [ ] **Step 2: `config.js`**
```js
// Rediger denne fila for å endre tekstene på siden.
window.GYM_CONFIG = {
  subtitle: 'Forskernatt · NTNU',
  title: 'Hva er gym for deg?',
  questions: [
    'Beskriv "gym" med ett ord.',
    'Nevn én ting du savner i gym.',
  ],
  thanks: 'Takk!',
  // Farger på ordene (linjefargene i en gymsal)
  palette: ['#ffd23f', '#ff5a5f', '#4da3ff', '#f4f1ea', '#3ddc84', '#ff9f43'],
  // Går tilbake til spørsmål 1 hvis ingen skriver på spørsmål 2 på så lenge (ms)
  idleResetMs: 60000,
};
```

- [ ] **Step 3: `index.html`** — header (subtitle, title, response counter), faint court-line SVG background, two `.panel` sections each with `.q-title[data-q]`, `.cloud#cloud-N` and `.empty` "Bli den første!", the answer form (`.step` badge "1/2", `label#question-label`, `input#answer maxlength=30 autocomplete=off spellcheck=false`, Enter button, `#hint`), `#thanks` overlay, and the `aside#admin` panel (markup in Task 4 but include the empty `<aside id="admin" hidden>` shell now). Scripts: `config.js`, `store.js`, `cloud.js`, `app.js` with `defer`.

- [ ] **Step 4: `style.css`** — "gymsal" theme: dark sports-floor background (`#0e2f33` → `#12393e` radial), court lines at ~7 % white, Anton for words/title/numbers, Barlow Condensed for UI text, yellow active-panel border, cream answer bar with huge Anton input, `.cloud-word` absolutely positioned at 50 %/50 % with `line-height:1; white-space:nowrap` and transitions on `transform`, `font-size` (0.8 s ease-out-back-ish), `opacity`, `scale`; `.is-hidden {opacity:0; scale:.2}`; `.pulse` keyframes on `scale` + glowing `text-shadow`; `.shake` on the form; `#thanks` pop animation; `prefers-reduced-motion` disables transitions; below 800 px width, panels stack.

- [ ] **Step 5: `app.js`** — form flow:
  - Safe `localStorage` access (`try` → `null`), `createStore`.
  - Apply `GYM_CONFIG` texts to title, subtitle, `[data-q]`, label.
  - `setStep(n, value)`: updates badge/label/active panel, focuses input, starts idle timer on step 1 (reset on `input` events).
  - Submit: ignore while `busy`; `/admin` opens admin; whitespace → hint «Bare ett ord 🙂» + shake; empty after normalise → «Skriv ett ord først»; step 1 stores `firstAnswer`; step 2 → `addResponse`, `busy = true`, `draw([a1, a2])`, show thanks 1.4 s, then `setStep(0)`.
  - Escape on step 2 → `setStep(0, firstAnswer)`.
  - Click anywhere outside admin refocuses the input.
  - `draw(highlights)`: `renderCloud` for both clouds with `measureText(WORD_FONT)`, toggles `.is-empty`, updates counter, calls `renderAdmin()` (stub until Task 4).
  - Wait for `document.fonts.load('40px Anton')` (catch errors) before first draw; debounce resize (150 ms) → `draw()`.

- [ ] **Step 6: Verify in the browser** — `python3 -m http.server 8765` in background; open `http://localhost:8765/` with Playwright at 1920×1080:
  - Submit `GØY` → `ball`; then `gøy!` → `ball`; check clouds show `gøy` and `ball` larger than a third word; screenshot.
  - Type `to ord` → hint shown, step unchanged.
  - Double-press Enter quickly on step 2 → `responses().length` increments by exactly 1 (check via `localStorage`).
  - Set `GYM_CONFIG.idleResetMs = 500` via evaluate, answer Q1, wait 1 s → back at 1/2.
  - Reload → clouds restored.
  - Open `tests/index.html` → all green.

- [ ] **Step 7: Commit** — `git add index.html config.js style.css app.js fonts && git commit -m "feat: kiosk page with answer flow and gymsal styling"`

---

### Task 4: Admin panel + CSV download

**Files:**
- Modify: `index.html` (admin markup), `app.js` (admin logic), `style.css` (admin styles)

**Interfaces:**
- Consumes: `store.counts`, `store.deleteWord`, `store.toCSV`, `store.isPersistent`, `GymStore.csvFilename`, `draw()` from Task 3.

- [ ] **Step 1: Markup** — `aside#admin` with heading "Admin", close button, `#admin-warning` («Obs: svarene lagres ikke i nettleseren …», hidden by default), "Last ned CSV" button `#csv-btn`, two lists `#admin-list-1`, `#admin-list-2` headed by the questions, and a hint line "Åpne/lukk: Ctrl+Shift+A eller skriv /admin".

- [ ] **Step 2: Logic in `app.js`**
  - `toggleAdmin(open)`; `Ctrl+Shift+A` (`e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a'`, `preventDefault`) toggles; Escape closes when open.
  - `renderAdmin()` (no-op when hidden): per question, `<li>` with word, count and a "Slett" button; click → `confirm('Slette «word» (count svar)?')` → `store.deleteWord(q, word)` → `draw()`. Toggle `#admin-warning` by `!store.isPersistent()`.
  - CSV: `new Blob([store.toCSV()], {type: 'text/csv;charset=utf-8'})`, temporary `<a download=csvFilename(new Date())>`, click, revoke URL.

- [ ] **Step 3: Verify in browser** — open admin via `/admin` and via Ctrl+Shift+A; delete a word (accept dialog) → it animates out of the cloud and the list; click CSV → downloaded file starts with BOM + header, deleted cell empty; screenshot.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: admin panel with word deletion and CSV export"`

---

### Task 5: README + final verification

**Files:**
- Create: `README.md`, `.nojekyll`

- [ ] **Step 1: README** (Norwegian): what it is; change questions in `config.js`; run locally (`python3 -m http.server`, open `localhost:8000`); tests (`node tests/run-node.js` or open `tests/index.html`); publish on GitHub Pages (create repo, push, Settings → Pages → Deploy from branch → `main` / root); at the stand: use the same browser (not private/incognito), full screen F11, admin via Ctrl+Shift+A or `/admin`, **download the CSV before closing**; answers live only in that browser.

- [ ] **Step 2: Final run** — `node tests/run-node.js` all pass; full browser flow once more; final screenshot.

- [ ] **Step 3: Commit** — `git add README.md .nojekyll && git commit -m "docs: README with usage and GitHub Pages publishing"`
