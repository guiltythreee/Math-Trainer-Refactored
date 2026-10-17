/* ==================================================================
   Characterisation tests for MathGame (game.js)
   
   Only the functions exposed via window.MathGame can be tested
   directly without modifying game.js. Internal helpers (diagnose,
   kindFor, summarise, persist, median, mean) are exercised
   indirectly through analyse(), buildProfile(), xpBreakdown(), etc.
   
   These document EXISTING behaviour before refactoring.
   ================================================================== */
(function () {
  'use strict';
  var G = window.MathGame;
  var E = window.MathEngine;
  var X = window.MathXP;
  var T = window.Test;

  window.__testSuiteStarted_game = true;
  if (!G) {
    console.error('[test-game] MathGame not found — load game.js after test-dom.js.');
    return;
  }
  if (!E) {
    console.error('[test-game] MathEngine not found — load engine.js first.');
    return;
  }
  if (!X) {
    console.error('[test-game] MathXP not found — load math-xp.js first.');
    return;
  }

  // ------------------------------------------------------------------
  // MODES / DIFFS / PENALTIES / TIMERS configuration
  // ------------------------------------------------------------------
  (function () {
    // MODES
    T.assert(G.MODES.test80.name === '80 in 8', 'MODES: test80 name');
    T.assertEqual(G.MODES.test80.count, 80, 'MODES: test80 count = 80');
    T.assertEqual(G.MODES.test80.seconds, 480, 'MODES: test80 seconds = 480');

    T.assert(G.MODES.blitz.name === 'Tier Blitz', 'MODES: blitz name');
    T.assertEqual(G.MODES.blitz.seconds, 120, 'MODES: blitz seconds = 120');

    T.assert(G.MODES.limitless.name === 'Limitless', 'MODES: limitless name');
    T.assert(G.MODES.limitless.usesTier === false, 'MODES: limitless does not use tier');
    T.assertEqual(G.MODES.limitless.forcePenalty, 'sudden', 'MODES: limitless forces Sudden Death');

    T.assert(G.MODES.drill.name === 'Weak-Spot Drill', 'MODES: drill name');
    T.assertEqual(G.MODES.drill.count, 40, 'MODES: drill count = 40');

    // DIFFS
    T.assertEqual(G.DIFFS.easy.xp, 0.75, 'DIFFS: easy XP multiplier = 0.75');
    T.assertEqual(G.DIFFS.normal.xp, 1, 'DIFFS: normal XP multiplier = 1');
    T.assertEqual(G.DIFFS.hard.xp, 1.5, 'DIFFS: hard XP multiplier = 1.5');
    T.assertEqual(G.DIFFS.hard.skipCosts, true, 'DIFFS: hard skipCosts = true');
    T.assertEqual(G.DIFFS.hard.forceTimer, true, 'DIFFS: hard forceTimer = true');

    // Ranks
    T.assert(X.rankFor(0).name === 'Novice', 'rankFor: 0 XP → Novice');
    T.assert(X.rankFor(450).name === 'Student', 'rankFor: 450 XP → Student');
    T.assert(X.rankFor(1500).name === 'Calculator', 'rankFor: 1500 XP → Calculator');
    T.assert(X.rankFor(38000).name === 'Limitless', 'rankFor: 38000 XP → Limitless');
    T.assertEqual(X.rankFor(10000000).idx, X.rankFor(0).idx + 7,
      'rankFor: max rank index');
  })();

  // ------------------------------------------------------------------
  // fadeFor: XP rank fade
  // ------------------------------------------------------------------
  (function () {
    // tier index 0 (Acolyte), comfort rank 0
    T.assertEqual(X.fadeFor(0, 0), 1, 'fadeFor: tier 0 at rank 0 → 1.0 (full)');
    T.assertEqual(X.fadeFor(0, 1), 0.6, 'fadeFor: tier 0 at rank 1 → 0.6');
    T.assertEqual(X.fadeFor(0, 2), 0.35, 'fadeFor: tier 0 at rank 2 → 0.35');
    T.assertEqual(X.fadeFor(0, 4), 0.08, 'fadeFor: tier 0 at rank 4 → FADE[4] = 0.08');
    T.assertEqual(X.fadeFor(0, 5), 0.05, 'fadeFor: tier 0 at rank 5 → FADE_FLOOR = 0.05');
    T.assertEqual(X.fadeFor(0, 10), 0.05, 'fadeFor: tier 0 at rank 10 → still floor 0.05');

    // tier index 5 (Abyss), comfort rank 7
    T.assertEqual(X.fadeFor(5, 7), 1, 'fadeFor: tier 5 at rank 7 → 1.0 (full)');
    T.assertEqual(X.fadeFor(5, 8), 0.6, 'fadeFor: tier 5 at rank 8 → 0.6');
  })();

  // ------------------------------------------------------------------
  // xpBreakdown: pure XP calculation (nothing saved)
  // ------------------------------------------------------------------
  (function () {
    // Build a minimal run + summary for xpBreakdown
    var run = {
      mode: 'test80',
      tier: 'adept',
      penalty: 'fair',
      diff: 'normal',
      points: 500,
      topTierIndex: 2,
      attempts: []
    };
    var summary = {
      attempted: 40,
      accuracy: 0.9,
      cleared: true
    };

    var info = X.xpBreakdown(run, summary, X.rankFor(0).idx, 1);
    T.assert(typeof info.total === 'number', 'xpBreakdown: returns total');
    T.assert(info.total >= 0, 'xpBreakdown: total is non-negative');
    T.assert(typeof info.core === 'number', 'xpBreakdown: has core');
    T.assert(typeof info.clearBonus === 'number', 'xpBreakdown: has clearBonus');
    T.assert(typeof info.tierId === 'string', 'xpBreakdown: has tierId');
    T.assert(typeof info.tierMult === 'number', 'xpBreakdown: has tierMult');
    T.assert(typeof info.penMult === 'number', 'xpBreakdown: has penMult');
    T.assert(typeof info.fade === 'number', 'xpBreakdown: has fade');
    T.assert(info.fade <= 1 && info.fade > 0, 'xpBreakdown: fade in (0, 1]');
  })();

  // ------------------------------------------------------------------
  // analyse / prescription: coach skill diagnosis
  // ------------------------------------------------------------------
  (function () {
    // No attempts yet → empty analysis
    var rows = G.analyse();
    T.assert(Array.isArray(rows), 'analyse: returns an array');
    T.assertEqual(rows.length, 0, 'analyse: empty with no attempts');

    // prescription with no data → null
    var rx = G.prescription([]);
    T.assertEqual(rx, null, 'prescription: null with no rows');
  })();

  // ------------------------------------------------------------------
  // buildProfile: export structure
  // ------------------------------------------------------------------
  (function () {
    var profile = G.buildProfile();
    T.assertEqual(profile.app, 'limitless-math-profile', 'buildProfile: app identifier');
    T.assertEqual(profile.version, 1, 'buildProfile: version 1');
    T.assert(typeof profile.exportedAt === 'string', 'buildProfile: exportedAt is ISO string');
    T.assert(typeof profile.skills === 'object', 'buildProfile: has skills object');
    T.assert(Array.isArray(profile.weak) || profile.weak === null,
      'buildProfile: weak is array or null');
    T.assert(typeof profile.tiers === 'object', 'buildProfile: has tiers object');
    T.assert(typeof profile.meta === 'object', 'buildProfile: has meta object');
    T.assert(Array.isArray(profile.recent), 'buildProfile: has recent array');
  })();

  // ------------------------------------------------------------------
  // MathGame state / prefs
  // ------------------------------------------------------------------
  (function () {
    T.assert(typeof G.prefs === 'object', 'MathGame.prefs is an object');
    T.assert(typeof G.MODES === 'object', 'MathGame.MODES is exposed');
    T.assert(typeof G.meta === 'object', 'MathGame.meta is exposed');
    T.assert(typeof G.KEYS === 'object', 'MathGame.KEYS is exposed');
    T.assertEqual(G.KEYS.runs, 'limitless.math.v1.runs', 'KEYS: runs key');
    T.assertEqual(G.KEYS.att, 'limitless.math.v1.attempts', 'KEYS: attempts key');
    T.assertEqual(G.KEYS.meta, 'limitless.math.v1.meta', 'KEYS: meta key');
    T.assertEqual(G.KEYS.profile, 'limitless.math.v1.profile', 'KEYS: profile key');
  })();

  // ------------------------------------------------------------------
  // Report results
  // ------------------------------------------------------------------
  console.log('[test-game] ' + T.summary());
  T.results.forEach(function (res) {
    console.log('  [' + res.status + '] ' + res.message);
  });
  window.__testGameDone = true;
})();
