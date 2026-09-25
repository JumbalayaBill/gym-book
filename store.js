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

    function load() {
      if (!storage) return;
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
      // Re-read storage, e.g. after another tab changed it (window 'storage' event).
      reload() {
        load();
      },
    };
  }

  root.GymStore = { KEY, normalizeWord, hasWhitespace, csvFilename, createStore };
})(typeof window !== 'undefined' ? window : globalThis);
