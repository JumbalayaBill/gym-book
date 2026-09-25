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
