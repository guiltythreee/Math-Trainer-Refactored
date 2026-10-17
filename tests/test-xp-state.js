/* ==================================================================
   Characterisation tests for MathXP (math-xp.js)

   Tests the extracted XP / scoring / progression module:
   - Rank thresholds and progression boundaries
   - XP fade calculations per tier and rank
   - Pure XP breakdown: core, clear bonus, drill bonus, total
   - Difficulty multiplier (diffMult) effect on core XP only
   - awardXp: accumulation, rank-up detection, 1e7 cap, persistence
   - streakAlive / touchStreak: same-day, next-day, gap behaviour
   - dayKey: deterministic date formatting
   - Metadata persistence through MathStorage mock adapter
   ================================================================== */
(function () {
  'use strict';
  var X = window.MathXP;
  var E = window.MathEngine;
  var S = window.MathStorage;
  var T = window.Test;

  if (!X) {
    console.error('[test-xp-state] MathXP not found — load math-xp.js first.');
    return;
  }
  if (!E) {
    console.error('[test-xp-state] MathEngine not found — load engine.js first.');
    return;
  }
  if (!S) {
    console.error('[test-xp-state] MathStorage not found — load storage.js first.');
    return;
  }

  window.__testSuiteStarted_xpstate = true;

  // ------------------------------------------------------------------
  // 1. rankFor: rank thresholds and progression
  // ------------------------------------------------------------------
  (function () {
    T.assert(X.rankFor(0).name === 'Novice', 'rankFor: 0 XP → Novice');
    T.assert(X.rankFor(449).name === 'Novice', 'rankFor: 449 XP still Novice');
    T.assert(X.rankFor(450).name === 'Student', 'rankFor: 450 XP → Student');
    T.assert(X.rankFor(1499).name === 'Student', 'rankFor: 1499 XP still Student');
    T.assert(X.rankFor(1500).name === 'Calculator', 'rankFor: 1500 XP → Calculator');
    T.assert(X.rankFor(38000).name === 'Limitless', 'rankFor: 38000 XP → Limitless');
    T.assertEqual(X.rankFor(0).idx, 0, 'rankFor: Novice index is 0');
    T.assertEqual(X.rankFor(10000000).idx, 7, 'rankFor: 10M XP → max rank index 7');
    var r = X.rankFor(1000);
    T.assert(typeof r.progress === 'number', 'rankFor: progress is a number');
    T.assert(r.progress >= 0 && r.progress <= 1, 'rankFor: progress in [0, 1]');
  })();

  // ------------------------------------------------------------------
  // 2. fadeFor: XP rank fade
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

    // fade is always in (0, 1]
    for (var t = 0; t < 6; t++) {
      for (var rank = 0; rank <= 10; rank++) {
        var f = X.fadeFor(t, rank);
        T.assert(f > 0 && f <= 1, 'fadeFor: tier ' + t + ' rank ' + rank + ' fade in (0,1]');
      }
    }
  })();

  // ------------------------------------------------------------------
  // 3. xpBreakdown: pure XP calculation
  // ------------------------------------------------------------------
  (function () {
    var run = {
      mode: 'drill',
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
    T.assert(typeof info.diffMult === 'number', 'xpBreakdown: has diffMult');
    T.assert(info.fade <= 1 && info.fade > 0, 'xpBreakdown: fade in (0, 1]');
    T.assertEqual(info.diffMult, 1, 'xpBreakdown: diffMult echoed in result');
  })();

  // ------------------------------------------------------------------
  // 4. xpBreakdown: diffMult scales core XP only, not bonuses
  // ------------------------------------------------------------------
  (function () {
    var run = {
      mode: 'drill',
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

    var info1 = X.xpBreakdown(run, summary, X.rankFor(0).idx, 1);
    var info15 = X.xpBreakdown(run, summary, X.rankFor(0).idx, 1.5);

    // Core XP scales with diffMult
    T.assertEqual(info15.core, info1.core * 1.5, 'xpBreakdown: diffMult 1.5 scales core 1.5×');

    // clearBonus does NOT scale with diffMult (only core does)
    T.assertEqual(info15.clearBonus, info1.clearBonus, 'xpBreakdown: clearBonus unaffected by diffMult');

    // drillBonus does NOT scale with diffMult
    T.assertEqual(info15.drillBonus, info1.drillBonus, 'xpBreakdown: drillBonus unaffected by diffMult');

    // total reflects the core increase
    T.assert(info15.total > info1.total, 'xpBreakdown: total increases with diffMult');
    T.assertEqual(info15.total, Math.max(0, Math.round(info15.core + info1.clearBonus + info1.drillBonus)),
      'xpBreakdown: total = round(core + clearBonus + drillBonus)');
  })();

  // ------------------------------------------------------------------
  // 5. xpBreakdown: tier-clear bonus protection
  // ------------------------------------------------------------------
  (function () {
    var run = {
      mode: 'test80',
      tier: 'acolyte',
      penalty: 'fair',
      diff: 'normal',
      points: 500,
      topTierIndex: 0,
      attempts: []
    };

    // Cleared: qualifying + accuracy >= threshold + medianRatio <= 1
    var clearedSummary = {
      attempted: 60, accuracy: 0.97, medianRatio: 0.9, cleared: true
    };
    var infoCleared = X.xpBreakdown(run, clearedSummary, X.rankFor(0).idx, 1);
    T.assert(infoCleared.clearBonus > 0,
      'tier-clear: cleared run awards clear bonus (' + infoCleared.clearBonus + ' XP)');
    T.assert(infoCleared.firstClear === true, 'tier-clear: first clear flag set');

    // Repeat clear: tierBonus already set → reduced bonus
    var meta = X.getMeta();
    meta.tierBonus['acolyte'] = true;
    var infoRepeat = X.xpBreakdown(run, clearedSummary, X.rankFor(0).idx, 1);
    T.assert(infoRepeat.clearBonus > 0 && infoRepeat.clearBonus < infoCleared.clearBonus,
      'tier-clear: repeat clear awards reduced bonus');
    T.assert(infoRepeat.firstClear === false, 'tier-clear: repeat clear flag not set');

    // Not cleared: accuracy below threshold
    var notClearedSummary = {
      attempted: 60, accuracy: 0.90, medianRatio: 0.9, cleared: false
    };
    var infoNotCleared = X.xpBreakdown(run, notClearedSummary, X.rankFor(0).idx, 1);
    T.assert(infoNotCleared.clearBonus === 0,
      'tier-clear: uncleared run awards no clear bonus');

    // Not cleared: insufficient questions (below minSample)
    var fewSummary = {
      attempted: 10, accuracy: 0.99, medianRatio: 0.9, cleared: false
    };
    var infoFew = X.xpBreakdown(run, fewSummary, X.rankFor(0).idx, 1);
    T.assert(infoFew.clearBonus === 0,
      'tier-clear: below minSample questions awards no clear bonus');

    // Reset tierBonus for other tests
    delete meta.tierBonus['acolyte'];
  })();

  // ------------------------------------------------------------------
  // 6. awardXp: accumulation, rank-up, cap, persistence
  // ------------------------------------------------------------------
  (function () {
    var meta = X.getMeta();
    var startXp = meta.xp;

    // Normal award
    var r1 = X.awardXp(100);
    T.assertEqual(r1.gained, 100, 'awardXp: gained = 100');
    T.assertEqual(meta.xp, startXp + 100, 'awardXp: meta.xp increased by 100');
    T.assertEqual(r1.rankUp, null, 'awardXp: no rankUp for small award');

    // Rank up: add enough to reach Student (450)
    X.awardXp(450 - meta.xp);
    T.assertEqual(meta.xp, 450, 'awardXp: meta.xp at Student threshold');
    var rank = X.rankFor(meta.xp);
    T.assertEqual(rank.name, 'Student', 'awardXp: rank is Student at 450 XP');

    // Negative award clamps to 0
    var r3 = X.awardXp(-50);
    T.assertEqual(r3.gained, 0, 'awardXp: negative gained clamps to 0');
    T.assertEqual(meta.xp, 450, 'awardXp: negative award does not reduce xp');

    // 1e7 cap
    X.awardXp(1e7);
    T.assertEqual(meta.xp, 1e7, 'awardXp: meta.xp capped at 1e7');

    // Persistence: awardXp writes to storage
    var stored = S.load(S.KEYS.meta);
    T.assertEqual(stored.xp, 1e7, 'awardXp: persisted xp = 1e7');

    // Reset meta for other tests
    meta.xp = 0;
    meta.streak = { day: '', count: 0, best: 0 };
    meta.tierBonus = {};
    X.saveMeta();
  })();

  // ------------------------------------------------------------------
  // 7. streakAlive / touchStreak: same-day, next-day, gap
  // ------------------------------------------------------------------
  (function () {
    var meta = X.getMeta();
    var today = X.dayKey();                       // current date string
    var yesterday = X.dayKey(new Date(Date.now() - 86400000)); // 24h ago
    var dayBefore = X.dayKey(new Date(Date.now() - 172800000)); // 48h ago

    // Same day: streakAlive returns count, touchStreak is no-op
    meta.streak = { day: today, count: 3, best: 3 };
    T.assertEqual(X.streakAlive(), 3, 'streakAlive: same day returns count');
    X.touchStreak();
    T.assertEqual(meta.streak.count, 3, 'touchStreak: same day is no-op (count unchanged)');
    T.assertEqual(meta.streak.day, today, 'touchStreak: same day does not change day');

    // Yesterday: streakAlive returns count (yesterday counts), touchStreak increments
    meta.streak = { day: yesterday, count: 3, best: 3 };
    T.assertEqual(X.streakAlive(), 3, 'streakAlive: yesterday still counts');
    X.touchStreak();
    T.assertEqual(meta.streak.count, 4, 'touchStreak: next day increments count');
    T.assertEqual(meta.streak.day, today, 'touchStreak: day updated to today');
    T.assertEqual(meta.streak.best, 4, 'touchStreak: best updated to 4');

    // Gap of 2+ days: streak resets to 1
    meta.streak = { day: dayBefore, count: 10, best: 10 };
    T.assertEqual(X.streakAlive(), 0, 'streakAlive: gap of 2 days returns 0');
    X.touchStreak();
    T.assertEqual(meta.streak.count, 1, 'touchStreak: gap resets count to 1');
    T.assertEqual(meta.streak.best, 10, 'touchStreak: best preserved at 10');

    // First ever streak: day is empty
    meta.streak = { day: '', count: 0, best: 0 };
    T.assertEqual(X.streakAlive(), 0, 'streakAlive: empty day returns 0');
    X.touchStreak();
    T.assertEqual(meta.streak.count, 1, 'touchStreak: first touch sets count to 1');
    T.assertEqual(meta.streak.day, today, 'touchStreak: first touch sets day');

    // Reset meta
    meta.streak = { day: '', count: 0, best: 0 };
    X.saveMeta();
  })();

  // ------------------------------------------------------------------
  // 8. dayKey: deterministic date formatting (no Date mocking)
  // ------------------------------------------------------------------
  (function () {
    T.assertEqual(X.dayKey(new Date(2026, 0, 15, 12, 0, 0)), '2026-01-15', 'dayKey: pads month and day');
    T.assertEqual(X.dayKey(new Date(2026, 0, 5, 0, 0, 0)), '2026-01-05', 'dayKey: single-digit month/day padded');
    T.assertEqual(X.dayKey(new Date(2026, 11, 31, 23, 59, 59)), '2026-12-31', 'dayKey: year-end date');
  })();

  // ------------------------------------------------------------------
  // 9. Report results
  // ------------------------------------------------------------------
  console.log('[test-xp-state] ' + T.summary());
  T.results.forEach(function (res) {
    console.log('  [' + res.status + '] ' + res.message);
  });
  window.__testXpStateDone = true;
})();
