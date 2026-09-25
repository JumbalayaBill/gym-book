(function () {
  'use strict';

  const cfg = window.GYM_CONFIG;
  const { createStore, normalizeWord, hasWhitespace, csvFilename } = window.GymStore;
  const { renderCloud, measureText } = window.GymCloud;
  const WORD_FONT = "Anton, Impact, 'Arial Narrow', sans-serif";

  function safeStorage() {
    try {
      const s = window.localStorage;
      s.getItem('gym-ordsky-probe');
      return s;
    } catch (e) {
      return null;
    }
  }

  const store = createStore(safeStorage());
  const $ = (id) => document.getElementById(id);
  const form = $('answer-form');
  const input = $('answer');
  const hint = $('hint');
  const label = $('question-label');
  const stepNum = $('step-num');
  const thanks = $('thanks');
  const adminEl = $('admin');
  const counter = $('count');
  const clouds = [$('cloud-1'), $('cloud-2')];
  const panels = clouds.map((c) => c.closest('.panel'));
  const cloudsEl = document.querySelector('.clouds');
  const showToggle = $('show-toggle');
  const measure = measureText(WORD_FONT);

  let step = 0;
  let firstAnswer = '';
  let busy = false;
  let idleTimer = null;
  let revealing = false;
  let revealTimer = null;
  let revealEndsAt = 0;
  let clockFrame = null;
  const shotClock = $('shot-clock');
  const shotNum = $('shot-num');
  const shotBar = $('shot-bar');

  // ---------- Texts from config ----------
  document.title = cfg.title;
  $('title').textContent = cfg.title;
  $('subtitle').textContent = cfg.subtitle;
  document.querySelectorAll('[data-q]').forEach((el) => {
    el.textContent = cfg.questions[Number(el.dataset.q) - 1];
  });

  // ---------- Drawing ----------
  function draw(highlights) {
    highlights = highlights || [];
    [1, 2].forEach((q) => {
      const words = store.counts(q);
      renderCloud(clouds[q - 1], words, { measure, palette: cfg.palette, highlight: highlights[q - 1] });
      panels[q - 1].querySelector('.curtain-text').textContent =
        words.length ? cfg.curtainText : cfg.curtainTextEmpty;
    });
    const total = String(store.responses().length);
    if (counter.textContent !== total) {
      counter.textContent = total;
      restartAnimation(counter, 'bump');
    }
    renderAdmin();
  }

  function restartAnimation(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  // ---------- Curtain ----------
  // Clouds stay hidden so visitors aren't inspired by earlier answers.
  // They show after a submit (revealMs), while admin is open, or when staff turn them on.
  function updateCurtain() {
    const forced = showToggle.checked || !adminEl.hidden;
    cloudsEl.classList.toggle('is-revealed', revealing || forced);
    // The shot clock only makes sense when the curtain is actually going to drop.
    if (revealing && !forced) startClock();
    else stopClock();
  }

  function startClock() {
    if (!shotClock.hidden) return;
    shotClock.hidden = false;
    const tick = () => {
      const left = Math.max(0, revealEndsAt - Date.now());
      const secs = Math.ceil(left / 1000);
      if (shotNum.textContent !== String(secs)) shotNum.textContent = String(secs);
      shotClock.classList.toggle('is-final', secs <= 3);
      shotBar.style.transform = `scaleX(${left / cfg.revealMs})`;
      clockFrame = requestAnimationFrame(tick);
    };
    tick();
  }

  function stopClock() {
    cancelAnimationFrame(clockFrame);
    shotClock.hidden = true;
    shotClock.classList.remove('is-final');
  }

  function reveal() {
    revealing = true;
    revealEndsAt = Date.now() + cfg.revealMs;
    clearTimeout(revealTimer);
    stopClock(); // restart from full on a new answer
    revealTimer = setTimeout(hideClouds, cfg.revealMs);
    updateCurtain();
  }

  function hideClouds() {
    revealing = false;
    clearTimeout(revealTimer);
    updateCurtain();
  }

  // ---------- Answer flow ----------
  // After idleResetMs without activity: back to question 1 with an empty field, and
  // close admin, so the next visitor starts fresh and can't reach the admin panel.
  function armIdleTimer() {
    clearTimeout(idleTimer);
    const dirty = step === 1 || input.value !== '' || !adminEl.hidden;
    if (dirty) idleTimer = setTimeout(resetForNextVisitor, cfg.idleResetMs);
  }

  function resetForNextVisitor() {
    if (busy) return armIdleTimer();
    if (!adminEl.hidden) toggleAdmin(false);
    setStep(0);
  }

  function setStep(n, value) {
    step = n;
    stepNum.textContent = String(n + 1);
    restartAnimation(stepNum, 'flip');
    label.textContent = cfg.questions[n];
    input.value = value || '';
    hideHint();
    panels.forEach((p, i) => p.classList.toggle('is-active', i === n));
    input.focus();
    armIdleTimer();
  }

  function showHint(text) {
    hint.textContent = text;
    hint.classList.add('is-visible');
    restartAnimation(form, 'shake');
    input.focus();
  }

  function hideHint() {
    hint.classList.remove('is-visible');
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) return;
    const raw = input.value;
    if (raw.trim().toLowerCase() === '/admin') {
      input.value = '';
      toggleAdmin(true);
      return;
    }
    if (hasWhitespace(raw)) return showHint('Bare ett ord 🙂');
    const word = normalizeWord(raw);
    if (!word) return showHint('Skriv ett ord først');

    if (step === 0) {
      firstAnswer = word;
      setStep(1);
      return;
    }

    busy = true;
    clearTimeout(idleTimer);
    store.addResponse(firstAnswer, word);
    input.value = '';
    input.blur();
    thanks.textContent = cfg.thanks;
    thanks.hidden = false;
    restartAnimation(thanks, 'play');
    draw([firstAnswer, word]);
    reveal();
    setTimeout(() => {
      thanks.hidden = true;
      firstAnswer = '';
      busy = false;
      setStep(0);
    }, 1400);
  });

  input.addEventListener('input', () => {
    hideHint();
    if (revealing) hideClouds(); // next visitor started typing
    armIdleTimer();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && step === 1 && !busy) setStep(0, firstAnswer);
  });

  ['keydown', 'pointerdown'].forEach((type) => document.addEventListener(type, () => {
    if (!busy) armIdleTimer();
  }));

  // Keep the cursor in the answer field at the stand.
  document.addEventListener('click', (e) => {
    if (!busy && adminEl.hidden && !adminEl.contains(e.target)) input.focus();
  });

  // ---------- Admin ----------
  function renderAdmin() {
    if (adminEl.hidden) return;
    [1, 2].forEach((q) => {
      const items = store.counts(q).map(({ word, count }) => {
        const li = document.createElement('li');
        const w = document.createElement('span');
        w.className = 'admin-word';
        w.textContent = word;
        const c = document.createElement('span');
        c.className = 'admin-count';
        c.textContent = count;
        const del = document.createElement('button');
        del.type = 'button';
        del.textContent = 'Slett';
        del.addEventListener('click', () => {
          if (!window.confirm(`Slette «${word}» (${count} svar)?`)) return;
          store.deleteWord(q, word);
          draw();
        });
        li.append(w, c, del);
        return li;
      });
      $('admin-list-' + q).replaceChildren(...items);
    });
    $('admin-warning').hidden = store.isPersistent();
  }

  function toggleAdmin(open) {
    adminEl.hidden = !open;
    updateCurtain();
    armIdleTimer();
    if (open) renderAdmin();
    else input.focus();
  }

  function downloadCSV() {
    const blob = new Blob([store.toCSV()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = csvFilename(new Date());
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  $('admin-close').addEventListener('click', () => toggleAdmin(false));
  $('csv-btn').addEventListener('click', downloadCSV);
  showToggle.addEventListener('change', updateCurtain);
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      toggleAdmin(adminEl.hidden);
    } else if (e.key === 'Escape' && !adminEl.hidden) {
      toggleAdmin(false);
    }
  });

  // ---------- Start ----------
  // Another tab (same kiosk URL) changed the answers: take them over instead of
  // overwriting them on our next save.
  window.addEventListener('storage', (e) => {
    if (e.key !== window.GymStore.KEY) return;
    store.reload();
    draw();
  });

  // Redraw whenever a cloud changes size (window resize, answer bar height, …).
  let resizeTimer = null;
  const sizes = clouds.map(() => '');
  const resizeObserver = new ResizeObserver(() => {
    const now = clouds.map((c) => c.clientWidth + 'x' + c.clientHeight);
    if (now.join() === sizes.join()) return;
    now.forEach((v, i) => { sizes[i] = v; });
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => draw(), 150);
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  const fontReady = document.fonts && document.fonts.load
    ? document.fonts.load('40px Anton').catch(() => null)
    : Promise.resolve();
  fontReady.then(() => {
    setStep(0);
    draw();
    clouds.forEach((c) => resizeObserver.observe(c));
  });
})();
