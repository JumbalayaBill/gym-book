(function (root) {
  'use strict';

  const KEY = 'gym-ordsky-v1';
  const MAX_LEN = 40;
  const EDGE_PUNCT = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

  function words(raw) {
    return String(raw == null ? '' : raw).split(/\s+/)
      .map((w) => w.replace(EDGE_PUNCT, ''))
      .filter(Boolean);
  }

  // The form shown in the cloud: lowercase words without surrounding punctuation.
  function normalizeWord(raw) {
    return words(String(raw == null ? '' : raw).toLocaleLowerCase('nb')).join(' ').slice(0, MAX_LEN).trim();
  }

  function countWords(raw) {
    return words(raw).length;
  }

  // What the visitor wrote, only with extra whitespace removed. Goes to the CSV.
  function cleanRaw(raw) {
    return String(raw == null ? '' : raw).trim().replace(/\s+/g, ' ');
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

  // Delete and merge are display rules for the clouds; answers are never changed.
  function withRules(s) {
    const r = s.rules || {};
    s.rules = {
      hidden: { 1: [].concat((r.hidden || {})[1] || []), 2: [].concat((r.hidden || {})[2] || []) },
      merges: { 1: [].concat((r.merges || {})[1] || []), 2: [].concat((r.merges || {})[2] || []) },
    };
    return s;
  }

  function createStore(storage) {
    let state = withRules({ nextN: 1, responses: [] });
    let persistent = !!storage;

    function load() {
      if (!storage) return;
      try {
        const raw = storage.getItem(KEY);
        if (raw) {
          let parsed = null;
          try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
          if (isValidState(parsed)) state = withRules(parsed);
          else storage.setItem(KEY + '-backup-' + Date.now(), raw);
        }
      } catch (e) {
        persistent = false;
      }
    }
    load();

    function save() {
      if (!storage) return;
      try {
        storage.setItem(KEY, JSON.stringify(state));
        persistent = true;
      } catch (e) {
        persistent = false;
      }
    }

    function mergeMap(q) {
      return new Map(state.rules.merges[q]);
    }

    function resolve(map, word) {
      for (let hops = 0; map.has(word) && hops < 20; hops++) word = map.get(word);
      return word;
    }

    return {
      addResponse(raw1, raw2) {
        const r = {
          n: state.nextN++,
          r1: cleanRaw(raw1), r2: cleanRaw(raw2),
          a1: normalizeWord(raw1), a2: normalizeWord(raw2),
          t: new Date().toISOString(),
        };
        state.responses.push(r);
        save();
        return r;
      },
      displayWord(q, raw) {
        return resolve(mergeMap(q), normalizeWord(raw));
      },
      counts(q) {
        const merges = mergeMap(q);
        const hidden = new Set(state.rules.hidden[q]);
        const map = new Map();
        for (const r of state.responses) {
          const w = resolve(merges, r['a' + q]);
          if (w && !hidden.has(w)) map.set(w, (map.get(w) || 0) + 1);
        }
        return [...map].map(([word, count]) => ({ word, count }))
          .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, 'nb'));
      },
      // Hide a word from the cloud (also future answers). Returns how many answers it hid.
      deleteWord(q, word) {
        const found = this.counts(q).find((c) => c.word === word);
        if (!state.rules.hidden[q].includes(word)) state.rules.hidden[q].push(word);
        save();
        return found ? found.count : 0;
      },
      mergeWords(q, list, target) {
        const to = normalizeWord(target);
        if (!to) return;
        const sources = new Set(list.map(normalizeWord));
        const map = mergeMap(q);
        map.delete(to);
        for (const [from] of [...map]) {
          if (sources.has(resolve(map, from))) map.set(from, to);
        }
        for (const w of sources) if (w && w !== to) map.set(w, to);
        state.rules.merges[q] = [...map];
        save();
      },
      unmerge(q, from) {
        state.rules.merges[q] = state.rules.merges[q].filter(([f]) => f !== from);
        save();
      },
      merges(q) {
        const map = mergeMap(q);
        return [...map.keys()].map((from) => ({ from, to: resolve(map, from) }))
          .sort((a, b) => a.from.localeCompare(b.from, 'nb'));
      },
      toCSV() {
        const lines = ['respondee_number;answer_1;answer_2'];
        for (const r of state.responses) {
          lines.push([r.n, r.r1 != null ? r.r1 : r.a1, r.r2 != null ? r.r2 : r.a2].map(csvField).join(';'));
        }
        return '\uFEFF' + lines.join('\r\n') + '\r\n';
      },
      responses() {
        return state.responses.map((r) => Object.assign({}, r));
      },
      isPersistent() {
        return persistent;
      },
      // Re-read storage, e.g. after another tab changed it (window 'storage' event).
      reload() {
        load();
      },
    };
  }

  root.GymStore = { KEY, MAX_LEN, normalizeWord, countWords, csvFilename, createStore };
})(typeof window !== 'undefined' ? window : globalThis);
