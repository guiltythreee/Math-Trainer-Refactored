/* ==================================================================
   Characterisation tests for MathCoach (math-coach.js)

   Tests the extracted skill analysis and coaching module:
   - diagnose(): skill classification rules
   - kindFor(): diagnosis-to-drill-kind mapping
   - localSkillStats(): attempt aggregation from storage
   - skillStats(): local + uploaded blending
   - analyse(): full pipeline with weakness ranking
   - prescription(): weak-skill filtering and drill kind selection
   - snapshotBefore(): pre-drill skill snapshot
   - buildDrillCfg(): drill configuration (auto and manual focus)
   ================================================================== */
(function () {
  'use strict';
  var C = window.MathCoach;
  var S = window.MathStorage;
  var T = window.Test;

  if (!C) {
    console.error('[test-math-coach] MathCoach not found — load math-coach.js first.');
    return;
  }
  if (!S) {
    console.error('[test-math-coach] MathStorage not found — load storage.js first.');
    return;
  }

  window.__testSuiteStarted_coachstate = true;

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  function resetStorage() {
    S.save(S.KEYS.att, []);
    S.save(S.KEYS.profile, null);
  }

  // ------------------------------------------------------------------
  // 1. diagnose: skill classification
  // ------------------------------------------------------------------
  (function () {
    T.assertEqual(C.diagnose(0.9, 0.5, 2).text, 'Too few to judge', 'diagnose: n < 3 → Too few to judge');
    T.assertEqual(C.diagnose(0.9, 0.5, 2).cls, '', 'diagnose: n < 3 → empty cls');
    T.assertEqual(C.diagnose(0.98, 0.8, 10).text, 'Strong', 'diagnose: 98% acc, 0.8x ratio → Strong');
    T.assertEqual(C.diagnose(0.98, 1.0, 10).text, 'Strong', 'diagnose: 98% acc, 1.0x ratio → Strong');
    T.assertEqual(C.diagnose(0.96, 1.2, 10).text, 'Accurate but slow', 'diagnose: 96% acc, 1.2x ratio → Accurate but slow');
    T.assertEqual(C.diagnose(0.7, 0.5, 10).text, 'Needs practice', 'diagnose: 70% acc → Needs practice');
    T.assertEqual(C.diagnose(0.9, 1.0, 10).text, 'Fast but sloppy', 'diagnose: 90% acc, 1.0x ratio → Fast but sloppy');
    T.assertEqual(C.diagnose(0.88, 1.2, 10).text, 'Developing', 'diagnose: 88% acc, 1.2x ratio → Developing');
  })();

  // ------------------------------------------------------------------
  // 2. kindFor: diagnosis-to-drill-kind mapping
  // ------------------------------------------------------------------
  (function () {
    T.assertEqual(C.kindFor('Accurate but slow'), 'speed', 'kindFor: Accurate but slow → speed');
    T.assertEqual(C.kindFor('Fast but sloppy'), 'accuracy', 'kindFor: Fast but sloppy → accuracy');
    T.assertEqual(C.kindFor('Needs practice'), 'accuracy', 'kindFor: Needs practice → accuracy');
    T.assertEqual(C.kindFor('Strong'), 'standard', 'kindFor: Strong → standard');
    T.assertEqual(C.kindFor('Too few to judge'), 'standard', 'kindFor: Too few to judge → standard');
    T.assertEqual(C.kindFor('Developing'), 'standard', 'kindFor: Developing → standard');
  })();

  // ------------------------------------------------------------------
  // 3. localSkillStats: attempt aggregation from storage
  // ------------------------------------------------------------------
  (function () {
    resetStorage();
    S.save(S.KEYS.att, [
      { s: 'Addition', r: 'correct', time: 1.0, target: 2.0 },
      { s: 'Addition', r: 'correct', time: 1.5, target: 2.0 },
      { s: 'Addition', r: 'wrong', time: 5.0, target: 2.0 },
      { s: 'Subtraction', r: 'skip', time: 0, target: 0 },
      { s: 'Subtraction', r: 'correct', time: 2.0, target: 1.0 },
      { s: 'Multiplication', r: 'correct', time: 3.0, target: 4.0 },
      { s: 'Division', r: 'wrong', time: 1.0, target: 0 }   // target 0 → filtered out
    ]);

    var stats = C.localSkillStats();
    T.assertEqual(Object.keys(stats).length, 3, 'localSkillStats: 3 skills (skip and target=0 filtered)');
    T.assertEqual(stats.Addition.n, 3, 'localSkillStats: Addition n=3');
    T.assertEqual(stats.Addition.acc, 2 / 3, 'localSkillStats: Addition acc=2/3');
    T.assertEqual(stats.Subtraction.n, 1, 'localSkillStats: Subtraction n=1');
    T.assertEqual(stats.Multiplication.n, 1, 'localSkillStats: Multiplication n=1');
    T.assert(!stats.Division, 'localSkillStats: Division excluded (target=0)');
  })();

  // ------------------------------------------------------------------
  // 4. localSkillStats: skill window limit
  // ------------------------------------------------------------------
  (function () {
    resetStorage();
    var manyAttempts = [];
    for (var i = 0; i < 100; i++) {
      manyAttempts.push({ s: 'Addition', r: i % 2 === 0 ? 'correct' : 'wrong', time: 1.0, target: 2.0 });
    }
    S.save(S.KEYS.att, manyAttempts);
    var stats = C.localSkillStats();
    T.assertEqual(stats.Addition.n, 60, 'localSkillStats: skill window = 60 (most recent)');
  })();

  // ------------------------------------------------------------------
  // 5. skillStats: local only
  // ------------------------------------------------------------------
  (function () {
    resetStorage();
    S.save(S.KEYS.att, [
      { s: 'Addition', r: 'correct', time: 1.0, target: 2.0 },
      { s: 'Addition', r: 'correct', time: 1.0, target: 2.0 }
    ]);
    S.save(S.KEYS.profile, null);

    var stats = C.skillStats();
    T.assertEqual(stats.Addition.n, 2, 'skillStats: local n=2');
    T.assertEqual(stats.Addition.src, 'local', 'skillStats: local src=local');
    T.assertEqual(stats.Addition.acc, 1.0, 'skillStats: local acc=1.0');
  })();

  // ------------------------------------------------------------------
  // 6. skillStats: uploaded only
  // ------------------------------------------------------------------
  (function () {
    resetStorage();
    S.save(S.KEYS.att, []);
    S.save(S.KEYS.profile, { skills: { Subtraction: { n: 5, acc: 0.8, ratio: 0.9, medianTime: 2.0 } } });

    var stats = C.skillStats();
    T.assertEqual(stats.Subtraction.n, 5, 'skillStats: uploaded n=5');
    T.assertEqual(stats.Subtraction.src, 'uploaded', 'skillStats: uploaded src=uploaded');
    T.assertEqual(stats.Subtraction.acc, 0.8, 'skillStats: uploaded acc=0.8');
  })();

  // ------------------------------------------------------------------
  // 7. skillStats: mixed (local + uploaded)
  // ------------------------------------------------------------------
  (function () {
    resetStorage();
    S.save(S.KEYS.att, [
      { s: 'Addition', r: 'correct', time: 1.0, target: 2.0 },
      { s: 'Addition', r: 'wrong', time: 3.0, target: 2.0 }
    ]);
    S.save(S.KEYS.profile, { skills: { Addition: { n: 10, acc: 0.9, ratio: 1.0, medianTime: 1.5 } } });

    var stats = C.skillStats();
    T.assertEqual(stats.Addition.src, 'mixed', 'skillStats: mixed src=mixed');
    T.assertEqual(stats.Addition.n, 9, 'skillStats: mixed n=9 (2 local + 0.7*10=7 rounded)');
    T.assertEqual(Math.round(stats.Addition.acc * 1000) / 1000, 0.811, 'skillStats: mixed acc weighted ≈ 0.811');
  })();

  // ------------------------------------------------------------------
  // 8. analyse: full pipeline
  // ------------------------------------------------------------------
  (function () {
    resetStorage();
    S.save(S.KEYS.att, [
      { s: 'Addition', r: 'correct', time: 1.0, target: 2.0 },
      { s: 'Addition', r: 'correct', time: 1.0, target: 2.0 },
      { s: 'Subtraction', r: 'wrong', time: 5.0, target: 2.0 },
      { s: 'Subtraction', r: 'wrong', time: 5.0, target: 2.0 },
      { s: 'Multiplication', r: 'correct', time: 1.0, target: 2.0 },
      { s: 'Multiplication', r: 'correct', time: 1.0, target: 2.0 },
      { s: 'Division', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Division', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Division', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Division', r: 'wrong', time: 10.0, target: 2.0 }
    ]);
    S.save(S.KEYS.profile, null);

    var rows = C.analyse();
    T.assertEqual(rows.length, 4, 'analyse: 4 skill rows');
    T.assertEqual(rows[0].skill, 'Division', 'analyse: Division first (highest weakness)');
    T.assertEqual(rows[0].diag.text, 'Needs practice', 'analyse: Division → Needs practice');
    T.assertEqual(rows[0].kind, 'accuracy', 'analyse: Division → accuracy drill');
    T.assert(rows[0].weakness > rows[1].weakness, 'analyse: rows sorted by weakness descending');
  })();

  // ------------------------------------------------------------------
  // 9. prescription: weak-skill filtering
  // ------------------------------------------------------------------
  (function () {
    resetStorage();
    S.save(S.KEYS.att, [
      { s: 'Addition', r: 'correct', time: 1.0, target: 2.0 },
      { s: 'Addition', r: 'correct', time: 1.0, target: 2.0 },
      { s: 'Addition', r: 'correct', time: 1.0, target: 2.0 },
      { s: 'Addition', r: 'correct', time: 1.0, target: 2.0 },
      { s: 'Addition', r: 'correct', time: 1.0, target: 2.0 },
      { s: 'Subtraction', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Subtraction', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Subtraction', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Subtraction', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Subtraction', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Multiplication', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Multiplication', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Multiplication', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Multiplication', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Multiplication', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Division', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Division', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Division', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Division', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Division', r: 'wrong', time: 10.0, target: 2.0 }
    ]);
    S.save(S.KEYS.profile, null);

    var rows = C.analyse();
    var rx = C.prescription(rows);
    T.assert(rx !== null, 'prescription: returns object when weak skills exist');
    T.assertEqual(rx.skills.length, 3, 'prescription: max 3 skills');
    T.assertEqual(rx.skills[0], 'Division', 'prescription: Division first (most weak)');
    T.assertEqual(rx.kind, 'accuracy', 'prescription: accuracy kind');
    T.assert(rx.weights[rx.skills[0]] >= 0.5, 'prescription: weight >= 0.5');
  })();

  // ------------------------------------------------------------------
  // 10. prescription: null when no weak skills
  // ------------------------------------------------------------------
  (function () {
    resetStorage();
    S.save(S.KEYS.att, [
      { s: 'Addition', r: 'correct', time: 1.0, target: 2.0 },
      { s: 'Addition', r: 'correct', time: 1.0, target: 2.0 },
      { s: 'Addition', r: 'correct', time: 1.0, target: 2.0 },
      { s: 'Addition', r: 'correct', time: 1.0, target: 2.0 },
      { s: 'Addition', r: 'correct', time: 1.0, target: 2.0 }
    ]);
    S.save(S.KEYS.profile, null);

    var rows = C.analyse();
    var rx = C.prescription(rows);
    T.assert(rx === null, 'prescription: null when all skills strong');
  })();

  // ------------------------------------------------------------------
  // 11. snapshotBefore: pre-drill snapshot
  // ------------------------------------------------------------------
  (function () {
    resetStorage();
    S.save(S.KEYS.att, [
      { s: 'Addition', r: 'correct', time: 1.0, target: 2.0 },
      { s: 'Addition', r: 'wrong', time: 3.0, target: 2.0 },
      { s: 'Subtraction', r: 'correct', time: 2.0, target: 1.0 }
    ]);
    S.save(S.KEYS.profile, null);

    var snap = C.snapshotBefore(['Addition', 'Subtraction']);
    T.assertEqual(snap.Addition.n, 2, 'snapshotBefore: Addition n=2');
    T.assertEqual(snap.Addition.acc, 0.5, 'snapshotBefore: Addition acc=0.5');
    T.assertEqual(snap.Subtraction.n, 1, 'snapshotBefore: Subtraction n=1');
    T.assertEqual(snap.Subtraction.acc, 1.0, 'snapshotBefore: Subtraction acc=1.0');
    T.assert(!snap.Multiplication, 'snapshotBefore: Multiplication not in snapshot (not requested)');
  })();

  // ------------------------------------------------------------------
  // 12. buildDrillCfg: auto mode
  // ------------------------------------------------------------------
  (function () {
    resetStorage();
    S.save(S.KEYS.att, [
      { s: 'Addition', r: 'correct', time: 1.0, target: 2.0 },
      { s: 'Addition', r: 'correct', time: 1.0, target: 2.0 },
      { s: 'Addition', r: 'correct', time: 1.0, target: 2.0 },
      { s: 'Addition', r: 'correct', time: 1.0, target: 2.0 },
      { s: 'Addition', r: 'correct', time: 1.0, target: 2.0 },
      { s: 'Subtraction', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Subtraction', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Subtraction', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Subtraction', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Subtraction', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Multiplication', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Multiplication', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Multiplication', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Multiplication', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Multiplication', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Division', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Division', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Division', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Division', r: 'wrong', time: 10.0, target: 2.0 },
      { s: 'Division', r: 'wrong', time: 10.0, target: 2.0 }
    ]);
    S.save(S.KEYS.profile, null);

    var cfg = C.buildDrillCfg(true, 'auto', ['Addition', 'Subtraction', 'Multiplication', 'Division'], {
      speed: { name: 'Speed drill' },
      accuracy: { name: 'Accuracy drill' },
      standard: { name: 'Mixed drill' }
    });
    T.assertEqual(cfg.kind, 'accuracy', 'buildDrillCfg: auto → accuracy kind');
    T.assertEqual(cfg.before.Division.n, 5, 'buildDrillCfg: Division snapshot n=5');
    T.assertEqual(cfg.before.Division.acc, 0.0, 'buildDrillCfg: Division snapshot acc=0');
    T.assert(cfg.skills.length >= 1, 'buildDrillCfg: auto returns skills');
  })();

  // ------------------------------------------------------------------
  // 13. buildDrillCfg: manual focus
  // ------------------------------------------------------------------
  (function () {
    resetStorage();
    S.save(S.KEYS.att, [
      { s: 'Addition', r: 'correct', time: 1.0, target: 2.0 },
      { s: 'Subtraction', r: 'wrong', time: 10.0, target: 2.0 }
    ]);
    S.save(S.KEYS.profile, null);

    var cfg = C.buildDrillCfg(false, 'Subtraction', ['Addition', 'Subtraction', 'Multiplication', 'Division'], {
      speed: { name: 'Speed drill' },
      accuracy: { name: 'Accuracy drill' },
      standard: { name: 'Mixed drill' }
    });
    T.assertEqual(cfg.skills[0], 'Subtraction', 'buildDrillCfg: manual focus → Subtraction');
    T.assertEqual(cfg.skills.length, 1, 'buildDrillCfg: manual focus → single skill');
  })();

  // ------------------------------------------------------------------
  // 14. Report results
  // ------------------------------------------------------------------
  console.log('[test-math-coach] ' + T.summary());
  T.results.forEach(function (res) {
    console.log('  [' + res.status + '] ' + res.message);
  });
  window.__testCoachStateDone = true;
})();
