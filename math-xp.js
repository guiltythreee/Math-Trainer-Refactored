/* ==================================================================
   Math Trainer — XP / scoring / progression  (Phase 4c)

   Owns the progression meta record and pure XP/score calculations.
   Everything here is deterministic and has no DOM dependency.

   Responsibilities:
     • loadMeta()   — build the meta record from stored data
     • getMeta()    — return the current meta object (shared reference)
     • saveMeta()   — persist meta to storage
     • rankFor(xp)  — compute rank from XP
     • streakAlive()— current streak count
     • touchStreak()— advance streak by one day
     • awardXp(n)   — add XP, detect rank-up, persist
     • fadeFor(tierIdx, rankIdx) — XP fade multiplier
     • xpBreakdown(r, s, rankIdx, diffMult) — pure XP calculation
   game.js owns: mergeMeta(), persist(), renderProfile(), buildProfile(),
   trick records, and all DOM rendering.
   ================================================================== */
(function (root, E, S) {
  'use strict';

  var KEY_META = S.KEYS.meta;

  // ---------- helpers ----------
  function num(v, lo, hi, dflt) { v = +v; return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt; }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  // ---------- constants ----------
  var RANKS = [
    [0, 'Novice'], [450, 'Student'], [1500, 'Calculator'], [3500, 'Savant'],
    [7500, 'Sage'], [14000, 'Oracle'], [24000, 'Archmage'], [38000, 'Limitless']
  ];
  var TIER_XP = [1.0, 1.25, 1.6, 2.1, 2.8, 3.8];          /* acolyte … abyss */
  var TIER_COMFORT = [0, 1, 2, 3, 5, 7];                   /* rank index where each tier stops paying full XP */
  var FADE = [1, 0.6, 0.35, 0.18, 0.08];                   /* 0, 1, 2, 3, 4 ranks above comfort */
  var FADE_FLOOR = 0.05;                                   /* 5 ranks or more above: a trickle, never zero */
  var PENALTY_XP = { practice: 0.5, fair: 1, strict: 1.25, escalating: 1.25, sudden: 1.5 };
  var FIRST_CLEAR_XP = [60, 90, 140, 220, 350, 550];       /* one-time bonus the first time you clear each tier */
  var REPEAT_CLEAR_SHARE = 0.15;                           /* later clears pay this share of that, times FADE */

  // ---------- meta state ----------
  // Loaded once at module time from storage; shared mutable reference.
  // game.js reads/writes meta.xp, meta.streak, meta.tricks, meta.tierClears,
  // meta.tierBonus through this same reference.
  var meta = (function () {
    var m = S.load(KEY_META, {}) || {};
    return {
      xp: num(m.xp, 0, 1e7, 0),
      streak: { day: (m.streak && typeof m.streak.day === 'string') ? m.streak.day : '', count: num(m.streak && m.streak.count, 0, 100000, 0), best: num(m.streak && m.streak.best, 0, 100000, 0) },
      tricks: (m.tricks && typeof m.tricks === 'object') ? m.tricks : {},
      tierClears: (m.tierClears && typeof m.tierClears === 'object') ? m.tierClears : {},
      tierBonus: (m.tierBonus && typeof m.tierBonus === 'object') ? m.tierBonus : {}
    };
  })();

  function saveMeta() { S.save(KEY_META, meta); }

  // ---------- XP / progression ----------
  function rankFor(xp) {
    var i = 0;
    while (i + 1 < RANKS.length && xp >= RANKS[i + 1][0]) i++;
    var floor = RANKS[i][0], next = RANKS[i + 1] ? RANKS[i + 1][0] : null;
    return { idx: i, name: RANKS[i][1], floor: floor, next: next, nextName: RANKS[i + 1] ? RANKS[i + 1][1] : null,
      progress: next ? (xp - floor) / (next - floor) : 1 };
  }
  function streakAlive() {
    var s = meta.streak, y = new Date();
    y.setDate(y.getDate() - 1);
    return (s.day === dayKey() || s.day === dayKey(y)) ? s.count : 0;
  }
  function touchStreak() {
    var s = meta.streak, today = dayKey();
    if (s.day === today) return;
    var y = new Date(); y.setDate(y.getDate() - 1);
    s.count = (s.day === dayKey(y)) ? s.count + 1 : 1;
    s.day = today;
    s.best = Math.max(s.best || 0, s.count);
  }
  function awardXp(n) {
    n = Math.max(0, Math.round(n));
    var before = rankFor(meta.xp).idx;
    meta.xp = Math.min(1e7, meta.xp + n);
    var after = rankFor(meta.xp);
    saveMeta();
    return { gained: n, rankUp: after.idx > before ? after.name : null };
  }
  function fadeFor(tierIdx, rankIdx) {
    var gap = Math.max(0, rankIdx - TIER_COMFORT[tierIdx]);
    return gap < FADE.length ? FADE[gap] : FADE_FLOOR;
  }
  /* pure: works out the XP for a finished run and shows every step (nothing is saved here)
     diffMult is required (no default) so every caller makes the difficulty multiplier explicit. */
  function xpBreakdown(r, s, rankIdx, diffMult) {
    var tierIdx = r.tier ? E.TIER_BY_ID[r.tier].index : r.topTierIndex;
    var tierId = E.TIERS[tierIdx].id;
    var base = Math.max(0, r.points) / 10;
    var tierMult = TIER_XP[tierIdx], penMult = PENALTY_XP[r.penalty] || 1, fade = fadeFor(tierIdx, rankIdx);
    var core = base * tierMult * penMult * diffMult * fade;
    var clearBonus = 0, firstClear = false;
    if (s.cleared) {
      if (!meta.tierBonus[tierId]) { clearBonus = FIRST_CLEAR_XP[tierIdx]; firstClear = true; }
      else clearBonus = FIRST_CLEAR_XP[tierIdx] * REPEAT_CLEAR_SHARE * fade;
    }
    var drillBonus = (r.mode === 'drill' && s.attempted >= 10) ? 10 * fade : 0;
    return { tierIdx: tierIdx, tierId: tierId, base: base, tierMult: tierMult, penMult: penMult, diffMult: diffMult, fade: fade,
      core: core, clearBonus: clearBonus, firstClear: firstClear, drillBonus: drillBonus,
      total: Math.max(0, Math.round(core + clearBonus + drillBonus)) };
  }

  root.MathXP = {
    getMeta: function () { return meta; },
    saveMeta: saveMeta,
    rankFor: rankFor,
    streakAlive: streakAlive,
    touchStreak: touchStreak,
    awardXp: awardXp,
    fadeFor: fadeFor,
    xpBreakdown: xpBreakdown,
    dayKey: dayKey
  };
})(typeof window !== 'undefined' ? window : globalThis, window.MathEngine, window.MathStorage);
