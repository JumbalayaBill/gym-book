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
