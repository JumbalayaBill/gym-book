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

  test('the most answered word clearly dominates (double count ≥ 1.6× size)', () => {
    const layout = layoutCloud([{ word: 'gøy', count: 6 }, { word: 'lek', count: 3 }], 1000, 700, measure);
    const size = (w) => layout.find((b) => b.word === w).size;
    assert(size('gøy') / size('lek') >= 1.6, 'ratio was ' + (size('gøy') / size('lek')).toFixed(2));
  });

  test('150 unique words still fit, terminate and do not overlap', () => {
    const words = Array.from({ length: 150 }, (_, i) => ({ word: 'w' + i, count: 1 }));
    const layout = layoutCloud(words, 600, 400, measure);
    assertEqual(layout.length, 150);
    checkValid(layout, 600, 400);
  });

  test('long tail keeps a readable minimum size and always shows the highlighted word', () => {
    // Realistic end-of-evening Q2: a few popular words and a long tail of singles.
    const words = Array.from({ length: 300 }, (_, i) => ({
      word: 'ord' + String(i).padStart(3, '0'),
      count: i < 5 ? 20 - i * 3 : i < 40 ? 2 : 1,
    }));
    words.push({ word: 'ørsmå', count: 1 }); // sorts last alphabetically
    const layout = layoutCloud(words, 560, 380, measure, { highlight: ['ørsmå'] });
    checkValid(layout, 560, 380);
    const minSize = Math.min(...layout.map((b) => b.size));
    assert(minSize >= 16, 'min size was ' + minSize.toFixed(1));
    assert(layout.some((b) => b.word === 'ørsmå'), 'highlighted word missing');
    for (let i = 0; i < 5; i++) assert(layout.some((b) => b.word === words[i].word), 'popular word missing');
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
