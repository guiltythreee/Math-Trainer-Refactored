/* ==================================================================
   Math Trainer — Skill analysis and coaching  (Phase 4e)

   Extracts the coach / weak-spot analysis logic from game.js:
   skill statistics, diagnosis, prescription, drill configuration,
   and before-snapshots.  Pure calculation functions have no DOM or
   game-state dependency; functions that read stored data use the
   MathStorage adapter; functions that need game configuration receive
   it as explicit parameters.
   ================================================================== */
(function (root, E, S, U) {
  'use strict';

  var KEY_ATT = S.KEYS.att;
  var KEY_PROFILE = S.KEYS.profile;
  var SKILL_WINDOW = S.LIMITS.SKILL_WINDOW;

  /* ---------- pure diagnosis ---------- */
  function diagnose(acc, ratio, n) {
    if (n < 3) return { text: 'Too few to judge', cls: '' };
    if (acc >= 0.95 && ratio <= 1) return { text: 'Strong', cls: 'strong' };
    if (acc >= 0.95) return { text: 'Accurate but slow', cls: 'warn' };
    if (acc < 0.8) return { text: 'Needs practice', cls: 'bad' };
    if (ratio <= 1) return { text: 'Fast but sloppy', cls: 'bad' };
    return { text: 'Developing', cls: 'warn' };
  }
  function kindFor(diagText) {
    if (diagText === 'Accurate but slow') return 'speed';
    if (diagText === 'Fast but sloppy' || diagText === 'Needs practice') return 'accuracy';
    return 'standard';
  }

  /* ---------- skill statistics ---------- */
  function localSkillStats() {
    var atts = S.load(KEY_ATT, []), by = {}, out = {};
    for (var i = atts.length - 1; i >= 0; i--) {
      var a = atts[i];
      if (!a || typeof a.s !== 'string' || a.r === 'skip' || !(a.target > 0)) continue;
      var list = by[a.s] || (by[a.s] = []);
      if (list.length < SKILL_WINDOW) list.push(a);
    }
    Object.keys(by).forEach(function (skill) {
      var list = by[skill];
      var right = list.filter(function (a) { return a.r === 'correct'; }).length;
      out[skill] = { n: list.length, acc: right / list.length,
        ratio: U.median(list.map(function (a) { return a.time / a.target; })),
        medTime: U.median(list.map(function (a) { return a.time; })) };
    });
    return out;
  }
  /* local attempts blended with an uploaded analysis (the uploaded one counts a little less) */
  function skillStats() {
    var loc = localSkillStats(), prof = S.load(KEY_PROFILE, null), pri = (prof && prof.skills) || {}, out = {};
    var keys = {};
    Object.keys(loc).forEach(function (k) { keys[k] = 1; });
    Object.keys(pri).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      var l = loc[k], p = pri[k];
      if (l && !p) { out[k] = { n: l.n, acc: l.acc, ratio: l.ratio, medTime: l.medTime, src: 'local' }; return; }
      if (p && !l) { out[k] = { n: p.n, acc: p.acc, ratio: p.ratio, medTime: p.medTime, src: 'uploaded' }; return; }
      var wl = l.n, wp = Math.min(p.n, SKILL_WINDOW) * 0.7, w = wl + wp;
      out[k] = { n: l.n + Math.round(wp), acc: (l.acc * wl + p.acc * wp) / w, ratio: (l.ratio * wl + p.ratio * wp) / w,
        medTime: (l.medTime * wl + p.medTime * wp) / w, src: 'mixed' };
    });
    return out;
  }
  function analyse() {
    var st = skillStats(), rows = [];
    Object.keys(st).forEach(function (skill) {
      var s = st[skill], dg = diagnose(s.acc, s.ratio, s.n);
      rows.push({ skill: skill, n: s.n, acc: s.acc, ratio: s.ratio, medTime: s.medTime, diag: dg, src: s.src,
        kind: kindFor(dg.text),
        weakness: (1 - s.acc) * 3 + Math.max(0, Math.min(3, s.ratio) - 1) * 1.2 });
    });
    rows.sort(function (a, b) { return b.weakness - a.weakness; });
    return rows;
  }
  function prescription(rows) {
    var weak = rows.filter(function (r) { return r.n >= 5 && r.diag.text !== 'Strong' && r.diag.text !== 'Too few to judge'; }).slice(0, 3);
    if (!weak.length) return null;
    var weights = {};
    weak.forEach(function (r) { weights[r.skill] = Math.max(0.5, r.weakness); });
    return { skills: weak.map(function (r) { return r.skill; }), weights: weights, kind: weak[0].kind, rows: weak };
  }
  function snapshotBefore(skills) {
    var st = skillStats(), out = {};
    skills.forEach(function (k) { if (st[k]) out[k] = { acc: st[k].acc, ratio: st[k].ratio, n: st[k].n }; });
    return out;
  }
  function buildDrillCfg(forceAuto, drillFocus, skillsList, drillKinds) {
    var rows = analyse(), focus = forceAuto ? 'auto' : drillFocus;
    var skills = [], weights = {}, kind = 'standard';
    if (focus !== 'auto' && skillsList.indexOf(focus) >= 0) {
      skills = [focus];
      var row = rows.filter(function (r) { return r.skill === focus; })[0];
      if (row && row.n >= 5) kind = row.kind;
    } else {
      var rx = prescription(rows);
      if (rx) { skills = rx.skills; weights = rx.weights; kind = rx.kind; }
    }
    return { skills: skills, weights: weights, kind: kind, before: snapshotBefore(skills) };
  }

  root.MathCoach = {
    diagnose: diagnose,
    kindFor: kindFor,
    localSkillStats: localSkillStats,
    skillStats: skillStats,
    analyse: analyse,
    prescription: prescription,
    snapshotBefore: snapshotBefore,
    buildDrillCfg: buildDrillCfg
  };
})(typeof window !== 'undefined' ? window : globalThis, window.MathEngine, window.MathStorage, window.MathUI);
