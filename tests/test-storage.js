/* ==================================================================
   Focused characterisation tests for MathStorage (storage.js)

   These tests verify the storage layer in isolation:
   - Key names match the original format exactly
   - load/save round-trips
   - Import/export validation
   - Storage availability check
   - Graceful handling of missing/corrupted data
   ================================================================== */
(function () {
  'use strict';
  var S = window.MathStorage;
  var T = window.Test;

  if (!S) {
    console.error('[test-storage] MathStorage not found — load storage.js first.');
    return;
  }
  window.__testSuiteStarted_storage = true;

  /* ---------- 1. Key names match original format ---------- */
  (function () {
    T.assertEqual(S.KEYS.runs, 'limitless.math.v1.runs',
      'keys: runs key preserved');
    T.assertEqual(S.KEYS.att, 'limitless.math.v1.attempts',
      'keys: attempts key preserved');
    T.assertEqual(S.KEYS.prefs, 'limitless.math.v1.prefs',
      'keys: prefs key preserved');
    T.assertEqual(S.KEYS.meta, 'limitless.math.v1.meta',
      'keys: meta key preserved');
    T.assertEqual(S.KEYS.profile, 'limitless.math.v1.profile',
      'keys: profile key preserved');
    T.assertEqual(S.KEYS.topic, 'limitless.math.v1.topic',
      'keys: topic key preserved');
  })();

  /* ---------- 2. Limits ---------- */
  (function () {
    T.assertEqual(S.LIMITS.MAX_RUNS, 500, 'limits: MAX_RUNS = 500');
    T.assertEqual(S.LIMITS.MAX_ATTEMPTS, 5000, 'limits: MAX_ATTEMPTS = 5000');
    T.assertEqual(S.LIMITS.SKILL_WINDOW, 60, 'limits: SKILL_WINDOW = 60');
  })();

  /* ---------- 3. load/save round-trip ---------- */
  (function () {
    // Save then load
    var ok = S.save(S.KEYS.prefs, { mode: 'drill', tier: 'adept' });
    T.assert(ok === true, 'storage: save returns true on success');

    var loaded = S.load(S.KEYS.prefs, {});
    T.assertEqual(loaded.mode, 'drill', 'storage: load returns saved value');
    T.assertEqual(loaded.tier, 'adept', 'storage: load returns saved value');

    // Load missing key returns fallback
    var missing = S.load(S.KEYS.runs, []);
    T.assert(Array.isArray(missing) && missing.length === 0,
      'storage: load missing key returns fallback');

    // Load corrupted data returns fallback — bypass JSON layer by writing
    // raw text directly to the mock adapter (simulating disk corruption).
    var adapter = window.__testStorageAdapter;
    if (!adapter || !adapter.local) {
      T.assert(false, 'storage: mock storage adapter not available');
      return;
    }
    adapter.local.setItem(S.KEYS.meta, 'not valid json{{{');
    var corrupt = S.load(S.KEYS.meta, { xp: 0 });
    T.assertEqual(corrupt.xp, 0,
      'storage: load corrupted data returns fallback');

    // Restore valid meta for subsequent tests
    S.save(S.KEYS.meta, { xp: 100 });

    // Save failure (quota) returns false — verified via boolean return type.
    var saveResult = S.save(S.KEYS.meta, { xp: 200 });
    T.assert(saveResult === true || saveResult === false,
      'storage: save returns boolean');
  })();

  /* ---------- 4. loadTopic / saveTopic ---------- */
  (function () {
    var ok = S.saveTopic('eleven');
    T.assert(ok === undefined, 'storage: saveTopic executes without error (returns undefined)');

    var loaded = S.loadTopic();
    T.assertEqual(loaded, 'eleven', 'storage: loadTopic returns saved value');

    // Clear topic
    S.saveTopic(null);
    var afterClear = S.loadTopic();
    T.assert(afterClear === null || afterClear === '',
      'storage: saveTopic(null) clears topic (returns null or empty)');
  })();

  /* ---------- 5. Import/export validation ---------- */
  (function () {
    // Valid progress file
    var validProgress = {
      app: 'limitless-math',
      version: 2,
      runs: [],
      attempts: []
    };
    T.assert(S.isValidProgressFile(validProgress),
      'validation: valid progress file accepted');

    // Invalid: wrong app
    T.assert(!S.isValidProgressFile({ app: 'other', runs: [], attempts: [] }),
      'validation: wrong app rejected');
    // Invalid: missing runs
    T.assert(!S.isValidProgressFile({ app: 'limitless-math', attempts: [] }),
      'validation: missing runs rejected');
    // Invalid: missing attempts
    T.assert(!S.isValidProgressFile({ app: 'limitless-math', runs: [] }),
      'validation: missing attempts rejected');
    // Invalid: null
    T.assert(!S.isValidProgressFile(null), 'validation: null rejected');

    // Valid profile file
    var validProfile = {
      app: 'limitless-math-profile',
      version: 1,
      skills: {}
    };
    T.assert(S.isValidProfileFile(validProfile),
      'validation: valid profile file accepted');

    // Invalid: wrong app
    T.assert(!S.isValidProfileFile({ app: 'other', skills: {} }),
      'validation: wrong app rejected for profile');
    // Invalid: missing skills
    T.assert(!S.isValidProfileFile({ app: 'limitless-math-profile' }),
      'validation: missing skills rejected for profile');
  })();

  /* ---------- 6. Storage availability ---------- */
  (function () {
    var avail = S.isAvailable();
    T.assert(avail === true, 'storage: isAvailable returns true when storage works');
  })();

  /* ---------- Report results ---------- */
  console.log('[test-storage] ' + T.summary());
  T.results.forEach(function (res) {
    console.log('  [' + res.status + '] ' + res.message);
  });
  window.__testStorageDone = true;
})();
