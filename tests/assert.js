// Simple assertion library for browser-based characterisation tests.
// No dependencies — runs in any modern browser.
var Test = (function () {
  'use strict';
  var passed = 0;
  var failed = 0;
  var results = [];

  function assert(condition, message) {
    if (condition) {
      passed++;
      results.push({ status: 'PASS', message: message });
    } else {
      failed++;
      results.push({ status: 'FAIL', message: message });
    }
  }

  function assertEqual(actual, expected, message) {
    var ok = actual === expected;
    if (!ok && typeof actual === 'number' && typeof expected === 'number') {
      ok = Math.abs(actual - expected) < 1e-9;
    }
    if (!ok && Array.isArray(actual) && Array.isArray(expected)) {
      ok = actual.length === expected.length &&
        actual.every(function (v, i) { return v === expected[i]; });
    }
    if (!ok && typeof actual === 'object' && typeof expected === 'object' &&
        actual !== null && expected !== null) {
      ok = JSON.stringify(actual) === JSON.stringify(expected);
    }
    assert(ok, message + ' (expected: ' + JSON.stringify(expected) +
      ', actual: ' + JSON.stringify(actual) + ')');
  }

  function assertThrows(fn, message) {
    try {
      fn();
      assert(false, message + ' (no error thrown)');
    } catch (e) {
      assert(true, message);
    }
  }

  return {
    assert: assert,
    assertEqual: assertEqual,
    assertThrows: assertThrows,
    passed: function () { return passed; },
    failed: function () { return failed; },
    results: results,
    total: function () { return passed + failed; },
    summary: function () {
      return 'Tests: ' + passed + ' passed, ' + failed + ' failed out of ' +
        (passed + failed);
    }
  };
})();

// Node.js / CommonJS export (harmless in a browser <script> tag)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Test: Test };
}
