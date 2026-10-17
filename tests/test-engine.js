/* ==================================================================
   Characterisation tests for MathEngine (engine.js)
   
   These document the EXISTING behaviour before any refactoring.
   If a test fails after refactoring, that's a regression (unless the
   behaviour was a verified bug we intentionally fixed).
   ================================================================== */
(function () {
  'use strict';
  var E = window.MathEngine;
  var T = window.Test;

  window.__testSuiteStarted_engine = true;
  if (!E) {
    console.error('[test-engine] MathEngine not found — load engine.js first.');
    return;
  }

  // ------------------------------------------------------------------
  // makeRng: seeded random numbers (same seed = same sequence)
  // ------------------------------------------------------------------
  (function () {
    var a = E.makeRng(12345);
    var b = E.makeRng(12345);
    var match = true;
    for (var i = 0; i < 100; i++) {
      if (a() !== b()) { match = false; break; }
    }
    T.assert(match, 'makeRng: same seed produces identical sequence');

    var c = E.makeRng(99999);
    var diff = false;
    for (var i = 0; i < 20; i++) {
      if (a() !== c()) { diff = true; break; }
    }
    T.assert(diff, 'makeRng: different seeds produce different sequences');

    // values in [0, 1)
    var inRange = true;
    for (var i = 0; i < 1000; i++) {
      var v = a();
      if (v < 0 || v >= 1) { inRange = false; break; }
    }
    T.assert(inRange, 'makeRng: values are in [0, 1)');

    // int() within [lo, hi]
    var intOk = true;
    for (var i = 0; i < 500; i++) {
      var iv = a.int(5, 10);
      if (iv < 5 || iv > 10) { intOk = false; break; }
    }
    T.assert(intOk, 'makeRng.int: values within [lo, hi]');

    // pick() returns an element from the array
    var arr = ['a', 'b', 'c'];
    var pickOk = true;
    for (var i = 0; i < 50; i++) {
      if (arr.indexOf(a.pick(arr)) < 0) { pickOk = false; break; }
    }
    T.assert(pickOk, 'makeRng.pick: returns an element from the array');

    // chance() returns boolean
    var chanceOk = true;
    for (var i = 0; i < 50; i++) {
      var r = a.chance(0.5);
      if (r !== true && r !== false) { chanceOk = false; break; }
    }
    T.assert(chanceOk, 'makeRng.chance: returns a boolean');
  })();

  // ------------------------------------------------------------------
  // Fractions (indirectly, via parseInput / checkAnswer / ratToText /
  // ratEq — rat, rAdd, rSub are internal helpers not in the public API)
  // ------------------------------------------------------------------
  (function () {
    // checkAnswer: "6/8" parsed internally should match answer 3/4
    var q = { answer: E.parseInput('3/4'), answerText: '0.75' };
    var r1 = E.checkAnswer(q, '6/8', false);
    T.assertEqual(r1.status, 'correct', 'fraction: "6/8" equals 3/4 → correct (reduction works)');

    // parseInput decimal matches fraction answer
    var r2 = E.checkAnswer(q, '0.75', false);
    T.assertEqual(r2.status, 'correct', 'fraction: "0.75" equals 3/4 → correct');

    // ratEq: equivalent fractions are equal
    T.assert(E.ratEq(E.parseInput('1/2'), E.parseInput('2/4')),
      'ratEq: 1/2 equals 2/4');
    T.assert(!E.ratEq(E.parseInput('1/2'), E.parseInput('1/3')),
      'ratEq: 1/2 does not equal 1/3');
    T.assert(E.ratEq(E.parseInput('-1/2'), E.parseInput('-2/4')),
      'ratEq: -1/2 equals -2/4');

    // ratToText: fraction → display string
    T.assertEqual(E.ratToText(E.parseInput('1/2')), '0.5', 'ratToText: 1/2 → "0.5"');
    T.assertEqual(E.ratToText(E.parseInput('1/3')), '1/3', 'ratToText: 1/3 → "1/3" (repeating)');
    T.assertEqual(E.ratToText(E.parseInput('5')), '5', 'ratToText: 5 → "5"');
    T.assertEqual(E.ratToText(E.parseInput('-3/4')), '-0.75', 'ratToText: -3/4 → "-0.75"');
    T.assertEqual(E.ratToText(E.parseInput('0')), '0', 'ratToText: 0 → "0"');

    // parseInput reduces fractions: 6/8 should parse to same as 3/4
    var p68 = E.parseInput('6/8');
    var p34 = E.parseInput('3/4');
    T.assert(p68 && p34 && E.ratEq(p68, p34),
      'parseInput: "6/8" reduces to same fraction as "3/4"');
  })();

  // ------------------------------------------------------------------
  // parseInput: reading what the player typed
  // ------------------------------------------------------------------
  (function () {
    // decimals
    var p = E.parseInput('3.5');
    T.assert(p && E.ratEq(p, E.parseInput('7/2')), 'parseInput: "3.5" → 7/2');

    // fractions
    var p2 = E.parseInput('5/36');
    T.assert(p2 && E.ratEq(p2, E.parseInput('5/36')), 'parseInput: "5/36" → 5/36');

    // negative integer
    var p3 = E.parseInput('-4');
    T.assert(p3 && E.ratEq(p3, E.parseInput('-4')), 'parseInput: "-4" → -4/1');

    // commas stripped
    var p4 = E.parseInput('1,000');
    T.assert(p4 && E.ratEq(p4, E.parseInput('1000')), 'parseInput: "1,000" → 1000');

    // unicode minus sign (−)
    var p5 = E.parseInput('−7');
    T.assert(p5 && E.ratEq(p5, E.parseInput('-7')), 'parseInput: "−7" → -7/1');

    // empty input → incomplete
    T.assertEqual(E.parseInput(''), null, 'parseInput: "" → null');

    // invalid → null
    T.assertEqual(E.parseInput('abc'), null, 'parseInput: "abc" → null');
    T.assertEqual(E.parseInput('1.2.3'), null, 'parseInput: "1.2.3" → null');
    T.assertEqual(E.parseInput('/'), null, 'parseInput: "/" → null');
  })();

  // ------------------------------------------------------------------
  // checkAnswer: validating the player's answer
  // ------------------------------------------------------------------
  (function () {
    var q = { answer: E.parseInput('3/2'), answerText: '1.5' };

    // exact decimal match, submit=false (auto-advance) → correct
    var r1 = E.checkAnswer(q, '1.5', false);
    T.assertEqual(r1.status, 'correct', 'checkAnswer: exact decimal match submit=false → correct');

    // exact fraction match
    var r2 = E.checkAnswer(q, '3/2', false);
    T.assertEqual(r2.status, 'correct', 'checkAnswer: "3/2" matches 3/2 → correct');

    // wrong answer, submit=false → pending (waits for more typing)
    var r3 = E.checkAnswer(q, '2', false);
    T.assertEqual(r3.status, 'pending', 'checkAnswer: wrong submit=false → pending');

    // wrong answer, submit=true (Enter) → wrong
    var r4 = E.checkAnswer(q, '2', true);
    T.assertEqual(r4.status, 'wrong', 'checkAnswer: wrong submit=true → wrong');

    // empty → incomplete
    var r5 = E.checkAnswer(q, '', false);
    T.assertEqual(r5.status, 'incomplete', 'checkAnswer: empty → incomplete');

    // tolerance question: within 1% → correct but not exact
    var qtol = { answer: E.parseInput('1/1'), tol: { rel: 0.01, center: 1 }, answerText: '1' };
    var r6 = E.checkAnswer(qtol, '1.005', true);
    T.assertEqual(r6.status, 'correct', 'checkAnswer: within 1% tolerance → correct');
    T.assertEqual(r6.exact, false, 'checkAnswer: tolerance match is not exact');

    // tolerance question: outside 1% → wrong
    var r7 = E.checkAnswer(qtol, '2', true);
    T.assertEqual(r7.status, 'wrong', 'checkAnswer: outside tolerance → wrong');
  })();

  // ------------------------------------------------------------------
  // ratToText: fraction → display string
  // ------------------------------------------------------------------
  (function () {
    T.assertEqual(E.ratToText(E.parseInput('1/2')), '0.5', 'ratToText: 1/2 → "0.5"');
    T.assertEqual(E.ratToText(E.parseInput('1/3')), '1/3', 'ratToText: 1/3 → "1/3" (repeating)');
    T.assertEqual(E.ratToText(E.parseInput('5')), '5', 'ratToText: 5 → "5"');
    T.assertEqual(E.ratToText(E.parseInput('-3/4')), '-0.75', 'ratToText: -3/4 → "-0.75"');
    T.assertEqual(E.ratToText(E.parseInput('0')), '0', 'ratToText: 0 → "0"');
  })();

  // ------------------------------------------------------------------
  // targetFor: converts difficulty score to time target (seconds)
  // ------------------------------------------------------------------
  (function () {
    // targetFor: round1(clamp(1.3 + 0.75 * diff, 1.5, 30))
    // diff=1 → 1.3 + 0.75 = 2.05 → 2.1 (floor of 1.5 only applies when diff < 0.27)
    T.assertEqual(E.targetFor(1), 2.1, 'targetFor: diff=1 → 2.1');
    // diff=30 → 1.3 + 22.5 = 23.8 → 23.8 (cap of 30 only applies when diff > 38.3)
    T.assertEqual(E.targetFor(30), 23.8, 'targetFor: diff=30 → 23.8');
    var mid = E.targetFor(10);
    T.assert(mid >= 1.5 && mid <= 30, 'targetFor: diff=10 within [1.5, 30]');
    // diff=0 → 1.3 + 0 = 1.3 → clamped to 1.5
    T.assertEqual(E.targetFor(0), 1.5, 'targetFor: diff=0 → 1.5 (floor applies)');
    // very high diff hits the cap
    T.assertEqual(E.targetFor(100), 30, 'targetFor: diff=100 → 30 (cap applies)');
  })();

  // ------------------------------------------------------------------
  // Tier data integrity
  // ------------------------------------------------------------------
  (function () {
    T.assertEqual(E.TIERS.length, 6, 'TIERS: exactly 6 tiers');
    E.TIERS.forEach(function (t, i) {
      T.assertEqual(t.index, i, 'TIERS[' + i + ']: index matches position');
      T.assert(Array.isArray(t.recipes) && t.recipes.length > 0,
        'TIERS[' + i + ']: has recipes array');
      T.assert(typeof t.accuracy === 'number',
        'TIERS[' + i + ']: has accuracy threshold');
      T.assert(typeof t.name === 'string', 'TIERS[' + i + ']: has name');
      T.assert(typeof t.label === 'string', 'TIERS[' + i + ']: has label');
      T.assert(typeof t.blurb === 'string', 'TIERS[' + i + ']: has blurb');
      T.assert(typeof t.emblem === 'string', 'TIERS[' + i + ']: has emblem');

      t.recipes.forEach(function (rec, ri) {
        T.assert(Array.isArray(rec) && rec.length === 3,
          'TIERS[' + i + '].recipes[' + ri + ']: is [name, weight, settings]');
        T.assert(typeof rec[0] === 'string',
          'TIERS[' + i + '].recipes[' + ri + ']: recipe name is string');
        T.assert(typeof rec[1] === 'number',
          'TIERS[' + i + '].recipes[' + ri + ']: weight is number');
        T.assert(typeof rec[2] === 'object',
          'TIERS[' + i + '].recipes[' + ri + ']: settings is object');
      });
    });
  })();

  // ------------------------------------------------------------------
  // SKILLS / RECIPE_SKILL consistency
  // ------------------------------------------------------------------
  (function () {
    E.SKILLS.forEach(function (skill) {
      var found = false;
      Object.keys(E.RECIPE_SKILL).forEach(function (recipe) {
        if (E.RECIPE_SKILL[recipe] === skill) found = true;
      });
      T.assert(found, 'SKILLS: "' + skill + '" is mapped in RECIPE_SKILL');
    });
  })();

  // ------------------------------------------------------------------
  // TRICKS / TRICK_BY_ID consistency
  // ------------------------------------------------------------------
  (function () {
    T.assert(Array.isArray(E.TRICKS) && E.TRICKS.length > 0,
      'TRICKS: non-empty array');
    E.TRICKS.forEach(function (tr) {
      T.assert(E.TRICK_BY_ID[tr.id] === tr,
        'TRICK_BY_ID: "' + tr.id + '" maps to the trick object');
      T.assert(typeof tr.name === 'string', 'TRICKS: "' + tr.id + '" has name');
      T.assert(typeof tr.short === 'string', 'TRICKS: "' + tr.id + '" has short method');
      T.assert(typeof tr.blurb === 'string', 'TRICKS: "' + tr.id + '" has blurb');
      T.assert(typeof tr.when === 'string', 'TRICKS: "' + tr.id + '" has when');
      T.assert(Array.isArray(tr.steps), 'TRICKS: "' + tr.id + '" has steps array');
      T.assert(typeof tr.example === 'string', 'TRICKS: "' + tr.id + '" has example');
    });
  })();

  // ------------------------------------------------------------------
  // nextQuestion: produces valid questions from a tier
  // ------------------------------------------------------------------
  (function () {
    var r = E.makeRng(42);
    var q = E.nextQuestion('adept', r, {});
    T.assert(typeof q.text === 'string' && q.text.length > 0,
      'nextQuestion: produces non-empty text');
    T.assert(typeof q.answer === 'object' && typeof q.answer.n === 'number' &&
      typeof q.answer.d === 'number',
      'nextQuestion: answer is a fraction {n, d}');
    T.assert(typeof q.target === 'number' && q.target > 0,
      'nextQuestion: target is positive number');
    T.assert(typeof q.skill === 'string', 'nextQuestion: has skill');
    T.assertEqual(q.tier, 'adept', 'nextQuestion: tier is set');
    T.assert(typeof q.diff === 'number' && q.diff >= 1,
      'nextQuestion: diff is >= 1');
    T.assert(typeof q.id === 'string', 'nextQuestion: has recipe id');
  })();

  // ------------------------------------------------------------------
  // nextQuestion: seeded reproducibility
  // ------------------------------------------------------------------
  (function () {
    var r1 = E.makeRng(777);
    var r2 = E.makeRng(777);
    var q1 = E.nextQuestion('adept', r1, {});
    var q2 = E.nextQuestion('adept', r2, {});
    T.assertEqual(q1.text, q2.text, 'nextQuestion: same seed → same question text');
    T.assertEqual(q1.answer.n, q2.answer.n,
      'nextQuestion: same seed → same answer numerator');
    T.assertEqual(q1.answer.d, q2.answer.d,
      'nextQuestion: same seed → same answer denominator');
  })();

  // ------------------------------------------------------------------
  // buildDeck: 80-in-8 deck construction
  // ------------------------------------------------------------------
  (function () {
    var r = E.makeRng(5);
    var deck = E.buildDeck('adept', 80, r);
    T.assertEqual(deck.length, 80, 'buildDeck: 80 questions for 80-in-8');
    deck.forEach(function (slot, i) {
      T.assert(typeof slot.rec === 'object',
        'buildDeck: slot[' + i + '] has rec');
      T.assert(typeof slot.tier === 'string',
        'buildDeck: slot[' + i + '] has tier');
    });

    // ~80% current tier, ~20% tier below
    var belowCount = deck.filter(function (s) { return s.tier !== 'adept'; }).length;
    T.assert(belowCount >= 10 && belowCount <= 22,
      'buildDeck: ~20% from tier below (' + belowCount + ' of 80)');

    // No immediate back-to-back duplicates of the same recipe (the
    // de-duplication pass should have broken most runs)
    var adjacentDupes = 0;
    for (var i = 1; i < deck.length; i++) {
      if (deck[i].rec[0] === deck[i - 1].rec[0]) adjacentDupes++;
    }
    T.assert(adjacentDupes === 0,
      'buildDeck: no adjacent duplicate recipes (' + adjacentDupes + ' found)');
  })();

  // ------------------------------------------------------------------
  // strictLimit: per-question hard time limit
  // ------------------------------------------------------------------
  (function () {
    T.assertEqual(E.strictLimit({ target: 2 }, 1.6), 3.2,
      'strictLimit: target 2 × factor 1.6 = 3.2');
    // floor at 3 seconds
    T.assertEqual(E.strictLimit({ target: 1 }, 1.6), 3,
      'strictLimit: floor at 3 seconds');
    // cap at 45 seconds
    T.assertEqual(E.strictLimit({ target: 40 }, 1.6), 45,
      'strictLimit: cap at 45 seconds');
    // default factor 1.6
    T.assertEqual(E.strictLimit({ target: 5 }, undefined), 8,
      'strictLimit: default factor 1.6 → 5 × 1.6 = 8');
  })();

  // ------------------------------------------------------------------
  // drillQuestion: weak-spot drill question selection
  // ------------------------------------------------------------------
  (function () {
    var r = E.makeRng(9);
    var q = E.drillQuestion(['Addition'], {}, 'adept', r, {});
    T.assert(typeof q.text === 'string' && q.text.length > 0,
      'drillQuestion: produces a question');
    T.assert(typeof q.answer === 'object',
      'drillQuestion: answer is a fraction');
    T.assert(typeof q.target === 'number' && q.target > 0,
      'drillQuestion: target is set');
  })();

  // ------------------------------------------------------------------
  // retryQuestion: re-issue a missed question from the same recipe
  // ------------------------------------------------------------------
  (function () {
    var r = E.makeRng(3);
    var q = E.nextQuestion('acolyte', r, {});
    var retry = E.retryQuestion(q, r, {});
    T.assert(retry !== null, 'retryQuestion: produces a question');
    T.assertEqual(retry.id, q.id, 'retryQuestion: same recipe id');
    T.assertEqual(retry.tier, q.tier, 'retryQuestion: same tier');
  })();

  // ------------------------------------------------------------------
  // trickQuestion: trick chamber question generation
  // ------------------------------------------------------------------
  (function () {
    var r = E.makeRng(1);
    var q = E.trickQuestion('eleven', r, {});
    T.assert(typeof q.text === 'string' && q.text.length > 0,
      'trickQuestion: produces a question');
    T.assertEqual(q.tag, 'Rune of Eleven', 'trickQuestion: "eleven" has correct tag');
    T.assert(typeof q.hint === 'string', 'trickQuestion: includes a hint');
    T.assert(typeof q.target === 'number' && q.target > 0,
      'trickQuestion: target is set');
  })();

  // ------------------------------------------------------------------
  // deckQuestion: draw from a deck slot
  // ------------------------------------------------------------------
  (function () {
    var r = E.makeRng(4);
    var deck = E.buildDeck('scribe', 20, r);
    var slot = deck[0];
    var q = E.deckQuestion(slot, r, {});
    T.assert(typeof q.text === 'string', 'deckQuestion: produces a question');
    T.assertEqual(q.tier, slot.tier, 'deckQuestion: tier matches slot tier');
  })();

  // ------------------------------------------------------------------
  // Report results
  // ------------------------------------------------------------------
  console.log('[test-engine] ' + T.summary());
  T.results.forEach(function (res) {
    console.log('  [' + res.status + '] ' + res.message);
  });
  window.__testEngineDone = true;
})();
