/* ==================================================================
   Limitless Math Trainer — question engine

   How it works (bottom up):
   1. Numbers are handled as exact fractions {n, d}. Decimals are built
      from whole numbers, so there are no floating-point surprises.
   2. A "recipe" (generator) picks random numbers, then calculates the
      answer itself. Every question carries: skill, difficulty score,
      time target, a machine-readable expression (for independent tests).
   3. A tier is a weighted list of recipes plus the settings they use.
   ================================================================== */
(function (root) {
  'use strict';

  var MINUS = '−', TIMES = '×', DIVIDE = '÷';

  /* ---------- seeded random numbers (same seed = same questions) ---------- */
  function makeRng(seed) {
    var a = (seed >>> 0) || 1;
    var f = function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = function (lo, hi) { return lo + Math.floor(f() * (hi - lo + 1)); };
    f.pick = function (arr) { return arr[Math.floor(f() * arr.length)]; };
    f.chance = function (p) { return f() < p; };
    return f;
  }

  /* ---------- exact fractions ---------- */
  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { var t = a % b; a = b; b = t; }
    return a;
  }
  function rat(n, d) {
    if (d === undefined) d = 1;
    if (d < 0) { n = -n; d = -d; }
    var g = gcd(n, d) || 1;
    return { n: n / g + 0, d: d / g };
  }
  function rAdd(a, b) { return rat(a.n * b.d + b.n * a.d, a.d * b.d); }
  function rSub(a, b) { return rat(a.n * b.d - b.n * a.d, a.d * b.d); }
  function ratEq(a, b) { return a.n === b.n && a.d === b.d; }
  function lcm(a, b) { return a / gcd(a, b) * b; }

  function digits(n) { return String(Math.abs(n)).length; }
  function nd(r, d) { return r.int(Math.pow(10, d - 1), Math.pow(10, d) - 1); }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function round1(x) { return Math.round(x * 10) / 10; }

  /* scaled whole number -> text, e.g. (1366, 2) -> "13.66" */
  function fmtScaled(v, dp) {
    var neg = v < 0; v = Math.abs(v);
    var s = String(v);
    if (dp > 0) {
      while (s.length < dp + 1) s = '0' + s;
      s = s.slice(0, s.length - dp) + '.' + s.slice(s.length - dp);
    }
    return (neg ? '-' : '') + s;
  }

  /* fraction -> text: a decimal if it terminates, otherwise "n/d" */
  function ratToText(r) {
    for (var k = 0; k <= 8; k++) {
      var p = Math.pow(10, k);
      if (p % r.d === 0) return fmtScaled(r.n * (p / r.d), k);
    }
    return r.n + '/' + r.d;
  }

  function withCommas(text) {
    return String(text).replace(/^(-?)(\d+)/, function (m, sign, int) {
      return sign + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    });
  }

  function sup(n) {
    var map = '⁰¹²³⁴⁵⁶⁷⁸⁹';
    return String(n).replace(/\d/g, function (c) { return map[+c]; });
  }

  /* ---------- reading what the player typed ---------- */
  function parseInput(s) {
    s = String(s).trim().replace(/,/g, '').replace(/−/g, '-');
    if (!s) return null;
    var m = s.match(/^(-?)(\d+)\/(\d+)$/);
    if (m) {
      var den = parseInt(m[3], 10);
      if (!den || m[2].length > 9 || m[3].length > 9) return null;
      return rat((m[1] ? -1 : 1) * parseInt(m[2], 10), den);
    }
    m = s.match(/^(-?)(\d*)(?:\.(\d*))?$/);
    if (!m) return null;
    var ip = m[2] || '', fp = m[3] || '';
    if (ip === '' && fp === '') return null;
    if ((ip + fp).length > 15 || fp.length > 8) return null;
    var n = parseInt((ip || '0') + fp, 10) * (m[1] ? -1 : 1);
    return rat(n, Math.pow(10, fp.length));
  }

  /* submit=false: only an exact match counts (used for auto-advance)
     submit=true : tolerance questions (roots, estimates) also accepted */
  function checkAnswer(q, input, submit) {
    var v = parseInput(input);
    if (!v) return { status: 'incomplete' };
    if (ratEq(v, q.answer)) return { status: 'correct', exact: true };
    if (submit && q.tol) {
      var x = v.n / v.d, c = q.tol.center;
      var lim = q.tol.abs !== undefined ? q.tol.abs : Math.abs(c) * q.tol.rel;
      if (Math.abs(x - c) <= lim + 1e-9) return { status: 'correct', exact: false };
    }
    return { status: submit ? 'wrong' : 'pending' };
  }

  /* ---------- building a question ---------- */
  function Q(skill, text, expr, answer, diff, extra) {
    var q = {
      skill: skill, text: text, expr: expr, answer: answer,
      answerText: ratToText(answer), diff: round1(Math.max(1, diff))
    };
    if (extra) for (var k in extra) q[k] = extra[k];
    /* probabilities read best as fractions: 7/64, not 0.109375 (a decimal is still accepted) */
    if (q.tag === 'Fraction or decimal') q.answerText = answer.d === 1 ? String(answer.n) : answer.n + '/' + answer.d;
    return q;
  }

  var FRIENDLY = [5, 11, 25, 50, 99, 101, 125];   /* numbers with an easy shortcut */

  function countCarries(a, b) {
    var c = 0, carry = 0;
    while (a > 0 || b > 0) {
      var s = (a % 10) + (b % 10) + carry;
      carry = s >= 10 ? 1 : 0; c += carry;
      a = Math.floor(a / 10); b = Math.floor(b / 10);
    }
    return c;
  }
  function countBorrows(a, b) {      /* a > b */
    var c = 0, borrow = 0;
    while (a > 0 || b > 0) {
      var s = (a % 10) - (b % 10) - borrow;
      borrow = s < 0 ? 1 : 0; c += borrow;
      a = Math.floor(a / 10); b = Math.floor(b / 10);
    }
    return c;
  }

  /* ==================================================================
     RECIPES — each returns a question. p = settings from the tier.
     ================================================================== */
  var G = {};

  G.add = function (r, p) {
    var a, b, n = 0;
    do {
      a = nd(r, p.da); b = nd(r, p.db); n++;
    } while (n < 100 && ((a % 10 === 0 && b % 10 === 0) || (p.da > 1 && a % 100 === 0) || (p.db > 1 && b % 100 === 0)));
    var diff = 0.5 * Math.max(p.da, p.db) + 0.4 * countCarries(a, b) + 0.2 * Math.min(p.da, p.db);
    return Q('Addition', a + ' + ' + b, a + '+' + b, rat(a + b), diff);
  };

  G.sub = function (r, p) {
    var a, b, n = 0;
    do {
      a = nd(r, p.da); b = nd(r, p.db); n++;
      if (a < b) { var t = a; a = b; b = t; }
    } while (n < 100 && (a === b || (a % 10 === 0 && b % 10 === 0)));
    var diff = 0.55 * Math.max(p.da, p.db) + 0.4 * countBorrows(a, b) + 0.2 * Math.min(p.da, p.db);
    return Q('Subtraction', a + ' ' + MINUS + ' ' + b, a + '-' + b, rat(a - b), diff);
  };

  G.table = function (r, p) {
    var a = r.int(p.lo, p.hi), b = r.int(p.lo, p.hi);
    return Q('Multiplication', a + ' ' + TIMES + ' ' + b, a + '*' + b, rat(a * b), 1.2);
  };

  G.mul = function (r, p) {
    var mode = p.shortcut || 'any';
    for (var i = 0; ; i++) {
      var a, b;
      if (p.near100) { a = r.int(88, 99); b = r.int(88, 99); }
      else { a = nd(r, p.da); b = nd(r, p.db); }
      var friendly = FRIENDLY.indexOf(a) >= 0 || FRIENDLY.indexOf(b) >= 0;
      if (i < 150) {
        if (mode === 'none' && friendly) continue;
        if (mode === 'only' && !friendly) continue;
        if (a < 2 || b < 2) continue;
        if ((a % 10 === 0 || b % 10 === 0) && r.chance(0.8)) continue;
        if (!p.near100 && p.da === p.db && a === b && r.chance(0.7)) continue;
      }
      var da = digits(a), db = digits(b);
      var diff = p.near100 ? 5.5 : 1.15 * da * db - (friendly ? 1.5 : 0);
      var extra = p.near100 ? { tag: 'Near-100' } : (friendly ? { tag: 'Shortcut' } : null);
      return Q('Multiplication', a + ' ' + TIMES + ' ' + b, a + '*' + b, rat(a * b), diff, extra);
    }
  };

  G.div = function (r, p) {
    for (var i = 0; ; i++) {
      var q = nd(r, p.dq), d = nd(r, p.dd);
      if (i < 150 && (q < 3 || d < 3 || q % 10 === 0 || d % 10 === 0)) continue;
      var a = q * d;
      var diff = 0.6 * p.dq * p.dd + 0.4 * (p.dq + p.dd);
      return Q('Division', a + ' ' + DIVIDE + ' ' + d, a + '/' + d, rat(q), diff);
    }
  };

  /* decimal add/subtract: ia/ib = digits of the whole numbers, dpa/dpb = decimal places */
  G.decAdd = function (r, p) {
    for (var i = 0; ; i++) {
      var A = nd(r, p.ia + p.dpa), B = nd(r, p.ib + p.dpb);
      if (i < 150 && ((p.dpa > 0 && A % 10 === 0) || (p.dpb > 0 && B % 10 === 0))) continue;
      var plus = r.chance(0.5);
      var a = rat(A, Math.pow(10, p.dpa)), b = rat(B, Math.pow(10, p.dpb));
      var ans = plus ? rAdd(a, b) : rSub(a, b);
      if (!plus && ans.n < 0) {          /* keep subtraction positive: swap */
        var t = A; A = B; B = t;
        var t2 = p.dpa; var dpa = p.dpb, dpb = t2;
        a = rat(A, Math.pow(10, dpa)); b = rat(B, Math.pow(10, dpb));
        ans = rSub(a, b);
        var sa = fmtScaled(A, dpa), sb = fmtScaled(B, dpb);
        return Q('Decimals', sa + ' ' + MINUS + ' ' + sb, sa + '-' + sb, ans, 0.8 + 0.5 * (p.ia + p.ib) + 0.7 * (p.dpa + p.dpb));
      }
      if (ans.n === 0) continue;
      var s1 = fmtScaled(A, p.dpa), s2 = fmtScaled(B, p.dpb);
      return Q('Decimals', s1 + ' ' + (plus ? '+' : MINUS) + ' ' + s2, s1 + (plus ? '+' : '-') + s2, ans,
        0.8 + 0.5 * (p.ia + p.ib) + 0.7 * (p.dpa + p.dpb));
    }
  };

  /* decimal multiply: da/db = digits of the scaled whole numbers */
  G.decMul = function (r, p) {
    for (var i = 0; ; i++) {
      var A = nd(r, p.da), B = nd(r, p.db);
      if (i < 150 && ((p.dpa > 0 && A % 10 === 0) || (p.dpb > 0 && B % 10 === 0) || A < 2 || B < 2)) continue;
      var friendly = FRIENDLY.indexOf(A) >= 0 || FRIENDLY.indexOf(B) >= 0;
      var s1 = fmtScaled(A, p.dpa), s2 = fmtScaled(B, p.dpb);
      var diff = 0.8 * p.da * p.db + 0.3 * (p.da + p.db) + 0.6 * (p.dpa + p.dpb) - (friendly ? 1 : 0);
      return Q('Decimals', s1 + ' ' + TIMES + ' ' + s2, s1 + '*' + s2,
        rat(A * B, Math.pow(10, p.dpa + p.dpb)), diff);
    }
  };

  /* decimal division built backwards so it always divides cleanly */
  G.decDiv = function (r, p) {
    for (var i = 0; ; i++) {
      var q = nd(r, p.dq), d = nd(r, p.dd);
      if (i < 150 && (q < 3 || d < 2 || (p.dpq > 0 && q % 10 === 0) || (p.dpd > 0 && d % 10 === 0))) continue;
      var dividend = q * d;               /* has dpq + dpd decimal places */
      var s1 = fmtScaled(dividend, p.dpq + p.dpd), s2 = fmtScaled(d, p.dpd);
      var diff = 0.6 * p.dq * p.dd + 0.4 * (p.dq + p.dd) + 0.8 * p.dpd + 0.5 * p.dpq + 0.6;
      return Q('Decimals', s1 + ' ' + DIVIDE + ' ' + s2, s1 + '/' + s2, rat(q, Math.pow(10, p.dpq)), diff);
    }
  };

  /* signed numbers: x o1 y o2 z with at least one negative */
  function apply(o, a, b) { return o === '+' ? a + b : o === '-' ? a - b : a * b; }
  G.neg = function (r, p) {
    for (var i = 0; i < 400; i++) {
      var o1 = r.pick(p.ops1), o2 = r.pick(p.ops2);
      var x = r.int(p.lo, p.hi), y = r.int(p.lo, p.hi), z = r.int(p.zlo, p.zhi);
      var sx = r.chance(0.5) ? -1 : 1, sy = r.chance(0.5) ? -1 : 1, sz = r.chance(0.3) ? -1 : 1;
      if (sx === 1 && sy === 1 && sz === 1) continue;
      if (x === y) continue;
      x *= sx; y *= sy; z *= sz;
      var v = (o1 === '*' || o2 !== '*') ? apply(o2, apply(o1, x, y), z) : apply(o1, x, apply(o2, y, z));
      var f = function (n) { return n < 0 ? '(' + MINUS + (-n) + ')' : String(n); };
      var e = function (n) { return n < 0 ? '(-' + (-n) + ')' : String(n); };
      var sym = function (o) { return o === '*' ? TIMES : o === '-' ? MINUS : '+'; };
      var hasMul = (o1 === '*' || o2 === '*');
      var negs = (x < 0) + (y < 0) + (z < 0);
      var diff = 2 + 0.6 * (digits(x) + digits(y) + digits(z)) + 0.4 * negs + (hasMul ? 1.5 + 0.5 * digits(x) * digits(y) : 0);
      return Q('Negatives', f(x) + ' ' + sym(o1) + ' ' + f(y) + ' ' + sym(o2) + ' ' + f(z),
        e(x) + o1 + e(y) + o2 + e(z), rat(v), diff);
    }
    throw new Error('neg: could not generate');
  };

  /* percentages ---------------------------------------------------- */
  G.pctOf = function (r, p) {
    for (var i = 0; i < 400; i++) {
      var pct = r.pick(p.set), p10 = Math.round(pct * 10), dp = p.dp || 0;
      var mod = Math.pow(10, 3 - dp), step = mod / gcd(p10, mod);
      var lo = Math.ceil(p.lo / step), hi = Math.floor(p.hi / step);
      if (hi < lo) continue;
      var N = step * r.int(lo, hi);
      var easy = [5, 10, 20, 25, 50].indexOf(pct) >= 0;
      var diff = 1.6 + (p10 % 10 !== 0 ? 0.9 : 0) + 0.45 * digits(N) + 0.5 * dp - (easy ? 0.9 : 0);
      return Q('Percentages', pct + '% of ' + N, pct + '/100*' + N, rat(N * p10, 1000), diff);
    }
    throw new Error('pctOf: could not generate');
  };

  G.pctChange = function (r, p) {
    for (var i = 0; i < 400; i++) {
      var pct = r.pick(p.set), p10 = Math.round(pct * 10);
      var up = p.decrease ? r.chance(0.5) : true;
      var factor = 1000 + (up ? p10 : -p10);
      var step = 1000 / gcd(factor, 1000);
      var lo = Math.ceil(p.lo / step), hi = Math.floor(p.hi / step);
      if (hi < lo) continue;
      var old = step * r.int(lo, hi), nw = old * factor / 1000;
      var diff = 4.5 + (p10 % 10 !== 0 ? 1.2 : 0) + 0.7 * digits(old);
      return Q('Percentages', old + ' → ' + nw + '  (% change)', '(' + nw + '-' + old + ')/' + old + '*100',
        rat(up ? p10 : -p10, 10), diff);
    }
    throw new Error('pctChange: could not generate');
  };

  G.pctWhat = function (r, p) {
    for (var i = 0; i < 400; i++) {
      var pct = r.pick(p.set), p10 = Math.round(pct * 10);
      var step = 1000 / gcd(p10, 1000);
      var lo = Math.ceil(p.lo / step), hi = Math.floor(p.hi / step);
      if (hi < lo) continue;
      var B = step * r.int(lo, hi), A = B * p10 / 1000;
      if (A === B || A < 1) continue;
      var diff = 3.2 + (p10 % 10 !== 0 ? 0.8 : 0) + 0.4 * digits(B);
      return Q('Percentages', A + ' is what % of ' + B + '?', A + '/' + B + '*100', rat(p10, 10), diff);
    }
    throw new Error('pctWhat: could not generate');
  };

  /* fractions ------------------------------------------------------ */
  G.fracAdd = function (r, p) {
    for (var i = 0; i < 500; i++) {
      var b = r.pick(p.dens), d = r.pick(p.dens);
      if (b === d) continue;
      var a = r.int(1, b - 1), c = r.int(1, d - 1);
      if (gcd(a, b) !== 1 || gcd(c, d) !== 1) continue;
      var plus = r.chance(0.6);
      if (!plus && a * d < c * b) { var t = a; a = c; c = t; t = b; b = d; d = t; }
      var ans = plus ? rAdd(rat(a, b), rat(c, d)) : rSub(rat(a, b), rat(c, d));
      if (ans.n === 0) continue;
      var diff = 3 + Math.log(lcm(b, d)) / Math.LN2;
      return Q('Fractions', a + '/' + b + ' ' + (plus ? '+' : MINUS) + ' ' + c + '/' + d,
        a + '/' + b + (plus ? '+' : '-') + c + '/' + d, ans, diff);
    }
    throw new Error('fracAdd: could not generate');
  };

  G.fracOfInt = function (r, p) {
    for (var i = 0; i < 400; i++) {
      var b = r.pick(p.dens), a = r.int(1, b - 1);
      if (gcd(a, b) !== 1) continue;
      var lo = Math.ceil(p.lo / b), hi = Math.floor(p.hi / b);
      if (hi < lo) continue;
      var N = b * r.int(lo, hi);
      return Q('Fractions', a + '/' + b + ' of ' + N, a + '/' + b + '*' + N, rat(a * N / b), 2.8 + 0.4 * digits(N));
    }
    throw new Error('fracOfInt: could not generate');
  };

  G.fracToDec = function (r, p) {
    for (var i = 0; i < 400; i++) {
      var d = r.pick(p.dens), n = r.int(1, d - 1);
      if (gcd(n, d) !== 1) continue;
      return Q('Fractions', n + '/' + d + ' as a decimal', n + '/' + d, rat(n, d), 2 + 0.5 * Math.log(d) / Math.LN2);
    }
    throw new Error('fracToDec: could not generate');
  };

  /* squares, cubes, roots, powers ---------------------------------- */
  G.square = function (r, p) {
    var n;
    if (p.five) n = r.int(Math.ceil((p.lo - 5) / 10), Math.floor((p.hi - 5) / 10)) * 10 + 5;
    else n = r.int(p.lo, p.hi);
    var diff = 0.9 + 0.1 * n - (n % 10 === 5 ? 1.5 : 0);
    return Q('Squares & roots', n + '²', n + '^2', rat(n * n), diff, n % 10 === 5 && n > 15 ? { tag: 'Ends in 5' } : null);
  };
  G.cube = function (r, p) {
    var n = r.int(p.lo, p.hi);
    return Q('Squares & roots', n + '³', n + '^3', rat(n * n * n), 1.5 + 0.4 * n);
  };
  G.sqrtPerfect = function (r, p) {
    var m = r.int(p.lo, p.hi);
    return Q('Squares & roots', '√' + (m * m), String(m), rat(m), 1.5 + 0.18 * m,
      { verify: { kind: 'root', k: 2, radicand: m * m, root: m } });
  };
  G.cbrtPerfect = function (r, p) {
    var m = r.int(p.lo, p.hi);
    return Q('Squares & roots', '∛' + (m * m * m), String(m), rat(m), 2 + 0.35 * m,
      { verify: { kind: 'root', k: 3, radicand: m * m * m, root: m } });
  };
  G.sqrtApprox = function (r, p) {
    for (var i = 0; i < 500; i++) {
      var n = r.int(p.lo, p.hi), s = Math.sqrt(n);
      if (Number.isInteger(s)) continue;
      var f100 = s * 100 - Math.floor(s * 100);
      if (Math.abs(f100 - 0.5) < 0.1) continue;     /* avoid unclear rounding */
      return Q('Squares & roots', '√' + n + '  (2 d.p.)', String(n), rat(Math.round(s * 100), 100),
        8 + 1.5 * digits(n), { tol: { abs: 0.01, center: s }, verify: { kind: 'sqrt2dp', radicand: n } });
    }
    throw new Error('sqrtApprox: could not generate');
  };
  G.pow = function (r, p) {
    for (var i = 0; i < 300; i++) {
      var base = r.pick(p.bases), e = r.int(p.elo, p.ehi), k = r.int(p.klo || 1, p.khi || 1);
      var v = Math.pow(base, e) * k;
      if (v > 1e9) continue;
      var text = base + sup(e) + (k === 1 ? '' : ' ' + TIMES + ' ' + k);
      var expr = base + '^' + e + (k === 1 ? '' : '*' + k);
      return Q('Powers', text, expr, rat(v), 4 + 1.3 * digits(v));
    }
    throw new Error('pow: could not generate');
  };

  /* estimation: exact match auto-advances, anything within 1% counts on Enter */
  G.est = function (r, p) {
    var truth, text, expr, diff;
    if (p.kind === 'div') {
      var N = r.int(p.nlo, p.nhi), D = r.int(p.dlo, p.dhi);
      truth = rat(N, D); text = N + ' ' + DIVIDE + ' ' + D + ' ≈ ?'; expr = N + '/' + D;
      diff = 7 + 0.7 * digits(N) + 0.7 * digits(D);
    } else {
      var A = r.int(p.alo, p.ahi), B = r.int(p.blo, p.bhi);
      if (A % 10 === 0) A += 1;
      if (B % 10 === 0) B += 1;
      var sa = fmtScaled(A, p.dpa), sb = fmtScaled(B, p.dpb);
      truth = rat(A * B, Math.pow(10, p.dpa + p.dpb));
      text = sa + ' ' + TIMES + ' ' + sb + ' ≈ ?'; expr = sa + '*' + sb;
      diff = 7 + 0.6 * digits(A) * digits(B) + 0.5 * (p.dpa + p.dpb);
    }
    var tn = truth.n / truth.d;
    return Q('Estimation', text + '  (within 1%)', expr, rat(Math.floor(tn + 0.5)), diff,
      { tol: { rel: 0.01, center: tn }, verify: { kind: 'est' } });
  };

  G.proportion = function (r, p) {
    var a = r.int(3, p.amax || 12), b = r.int(3, p.amax || 12);
    if (a === b) b += 1;
    var k = r.int(2, 9);
    return Q('Ratios', a + ' : ' + b + ' = ' + (a * k) + ' : ?', (a * k) + '/' + a + '*' + b, rat(b * k),
      3 + 0.5 * digits(a * k));
  };

  G.mean = function (r, p) {
    for (var i = 0; i < 300; i++) {
      var n = r.pick([4, 5]), m = r.int(p.lo, p.hi), offs = [], s = 0;
      for (var j = 0; j < n - 1; j++) { var o = r.int(-p.spread, p.spread); offs.push(o); s += o; }
      offs.push(-s);
      var vals = offs.map(function (o) { return m + o; });
      if (vals.some(function (v) { return v < 1; }) || Math.abs(offs[n - 1]) > p.spread * 2) continue;
      return Q('Averages', 'Mean of ' + vals.join(', '), '(' + vals.join('+') + ')/' + n, rat(m), 3 + 0.5 * n);
    }
    throw new Error('mean: could not generate');
  };

  /* mixed operations, brackets, two-step chains -------------------- */
  G.chain = function (r, p) {
    var a, b, c, d, v;
    switch (p.kind) {
      case 'A':
        a = r.int(12, 89); b = r.int(12, 89); c = r.int(3, 9); d = r.int(11, 99);
        v = (a + b) * c - d;
        return Q('Mixed operations', '(' + a + ' + ' + b + ') ' + TIMES + ' ' + c + ' ' + MINUS + ' ' + d,
          '(' + a + '+' + b + ')*' + c + '-' + d, rat(v), 7);
      case 'B':
        c = r.int(3, 12); var k = r.int(8, 40); var s = c * k;
        a = r.int(10, s - 10); b = s - a; d = r.int(3, 9);
        return Q('Mixed operations', '(' + a + ' + ' + b + ') ' + DIVIDE + ' ' + c + ' ' + TIMES + ' ' + d,
          '(' + a + '+' + b + ')/' + c + '*' + d, rat(k * d), 7.5);
      case 'C':
        var X, Y, W, Z, q;
        do { X = r.int(105, 999); } while (X % 10 === 0);
        do { Y = r.int(21, 99); } while (Y % 10 === 0);
        W = r.pick([4, 5, 6, 8, 12, 15, 25]); q = r.int(10, 60); Z = q * W;
        return Q('Mixed operations',
          fmtScaled(X, 1) + ' ' + TIMES + ' ' + fmtScaled(Y, 1) + ' ' + MINUS + ' ' + fmtScaled(Z, 1) + ' ' + DIVIDE + ' ' + fmtScaled(W, 1),
          fmtScaled(X, 1) + '*' + fmtScaled(Y, 1) + '-' + fmtScaled(Z, 1) + '/' + fmtScaled(W, 1),
          rSub(rat(X * Y, 100), rat(q)), 10);
      case 'D':
        a = r.int(12, 49); b = r.int(3, 19); c = r.int(12, 49); d = r.int(3, 19);
        return Q('Mixed operations', a + ' ' + TIMES + ' ' + b + ' + ' + c + ' ' + TIMES + ' ' + d,
          a + '*' + b + '+' + c + '*' + d, rat(a * b + c * d), 9);
      case 'E':
        a = r.int(21, 89); b = r.int(21, 89); c = r.int(51, 99); d = r.int(11, c - 15);
        return Q('Mixed operations', '(' + a + ' + ' + b + ') ' + TIMES + ' (' + c + ' ' + MINUS + ' ' + d + ')',
          '(' + a + '+' + b + ')*(' + c + '-' + d + ')', rat((a + b) * (c - d)), 12);
      case 'F':
        do {
          a = r.int(12, 49); b = r.int(12, 49); c = r.int(12, 49); d = r.int(12, 49);
        } while (a * b <= c * d);
        return Q('Mixed operations', a + ' ' + TIMES + ' ' + b + ' ' + MINUS + ' ' + c + ' ' + TIMES + ' ' + d,
          a + '*' + b + '-' + c + '*' + d, rat(a * b - c * d), 13);
    }
    throw new Error('chain: unknown kind ' + p.kind);
  };

  /* ==================================================================
     ARCANA — counting, probability, expected value, modular arithmetic,
     logarithms. Answers are exact fractions (typed as 5/36 or 0.25).
     ================================================================== */
  function choose(n, k) {
    if (k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    var v = 1;
    for (var i = 1; i <= k; i++) v = v * (n - k + i) / i;     /* stays a whole number at every step */
    return Math.round(v);
  }
  function perm(n, k) { var v = 1; for (var i = 0; i < k; i++) v *= (n - i); return v; }
  function sub(n) {
    var map = '₀₁₂₃₄₅₆₇₈₉';
    return String(n).replace(/\d/g, function (c) { return map[+c]; });
  }
  function ipow(b, e) { var v = 1; for (var i = 0; i < e; i++) v *= b; return v; }

  /* the 36 outcomes of two dice, and named events on them.
     "py" is the same event written for the independent Python check. */
  var D2 = [];
  for (var _a = 1; _a <= 6; _a++) for (var _b = 1; _b <= 6; _b++) D2.push([_a, _b]);
  function count2(f, g) {
    var num = 0, den = 0;
    D2.forEach(function (o) { if (!g || g(o[0], o[1])) { den++; if (f(o[0], o[1])) num++; } });
    return [num, den];
  }
  function dieEvents() {
    var list = [], s;
    for (s = 2; s <= 12; s++) (function (s) { list.push({ kind: 'sum', text: 'the sum is ' + s, f: function (a, b) { return a + b === s; }, py: 'd1+d2==' + s }); })(s);
    for (s = 4; s <= 10; s++) (function (s) { list.push({ kind: 'sum', text: 'the sum is at least ' + s, f: function (a, b) { return a + b >= s; }, py: 'd1+d2>=' + s }); })(s);
    for (s = 4; s <= 10; s++) (function (s) { list.push({ kind: 'sum', text: 'the sum is at most ' + s, f: function (a, b) { return a + b <= s; }, py: 'd1+d2<=' + s }); })(s);
    list.push({ kind: 'misc', text: 'the dice show a double', f: function (a, b) { return a === b; }, py: 'd1==d2' });
    list.push({ kind: 'misc', text: 'at least one die shows a 6', f: function (a, b) { return a === 6 || b === 6; }, py: 'd1==6 or d2==6' });
    list.push({ kind: 'misc', text: 'both dice are odd', f: function (a, b) { return a % 2 === 1 && b % 2 === 1; }, py: 'd1%2==1 and d2%2==1' });
    list.push({ kind: 'misc', text: 'the product is even', f: function (a, b) { return (a * b) % 2 === 0; }, py: '(d1*d2)%2==0' });
    list.push({ kind: 'misc', text: 'the dice differ by exactly 2', f: function (a, b) { return Math.abs(a - b) === 2; }, py: 'abs(d1-d2)==2' });
    list.push({ kind: 'misc', text: 'the larger die is at least 5', f: function (a, b) { return Math.max(a, b) >= 5; }, py: 'max(d1,d2)>=5' });
    list.push({ kind: 'misc', text: 'the first die is even', f: function (a, b) { return a % 2 === 0; }, py: 'd1%2==0' });
    list.push({ kind: 'misc', text: 'the first die is higher than the second', f: function (a, b) { return a > b; }, py: 'd1>d2' });
    return list;
  }
  var DIE_EVENTS = dieEvents();

  G.probDice = function (r, p) {
    for (var i = 0; i < 500; i++) {
      var A = r.pick(DIE_EVENTS);
      if (!p.cond) {
        var c = count2(A.f);
        if (c[0] === 0 || c[0] === c[1]) continue;
        return Q('Probability', 'Two dice: P(' + A.text + ')', '', rat(c[0], c[1]), 4.5 + (A.kind === 'misc' ? 1 : 0) + (c[0] > 18 ? 0.5 : 0),
          { tag: 'Fraction or decimal', verify: { kind: 'dice', event: A.py, cond: null } });
      }
      var B = r.pick(DIE_EVENTS);
      if (B === A) continue;
      var d = count2(B.f);
      var n = count2(function (a, b) { return A.f(a, b) && B.f(a, b); });
      if (d[0] < 3 || d[0] === 36 || n[0] === 0 || n[0] === d[0]) continue;
      return Q('Probability', 'Two dice: P(' + A.text + ', given ' + B.text + ')', '', rat(n[0], d[0]), 8.5 + (d[0] > 18 ? 0.5 : 0),
        { tag: 'Fraction or decimal', verify: { kind: 'dice', event: A.py, cond: B.py } });
    }
    throw new Error('probDice: could not generate');
  };

  G.probCoin = function (r, p) {
    var n = r.int(p.nlo, p.nhi), atLeast = !!(p.atLeast && r.chance(0.5)), k, num = 0, j;
    if (atLeast) {
      k = r.int(Math.max(1, Math.floor(n / 2) - 1), n - 1);
      for (j = k; j <= n; j++) num += choose(n, j);
    } else {
      k = r.int(1, n - 1); num = choose(n, k);
    }
    var den = ipow(2, n);
    return Q('Probability', 'Flip a fair coin ' + n + ' times: P(' + (atLeast ? 'at least ' : 'exactly ') + k + ' head' + (k > 1 ? 's' : '') + ')',
      '', rat(num, den), (atLeast ? 6.5 + 0.7 * n : 4.8 + 0.6 * n),
      { tag: 'Fraction or decimal', verify: { kind: 'coin', n: n, k: k, atLeast: atLeast } });
  };

  G.probBag = function (r, p) {
    for (var i = 0; i < 300; i++) {
      var red = r.int(p.lo, p.hi), blue = r.int(p.lo, p.hi), n = red + blue;
      var mode = r.pick(['red', 'blue', 'mixed']), num;
      if (mode === 'red') num = red * (red - 1);
      else if (mode === 'blue') num = blue * (blue - 1);
      else num = 2 * red * blue;
      if (num === 0) continue;
      var what = mode === 'mixed' ? 'one of each colour' : 'both ' + mode;
      return Q('Probability', 'Bag: ' + red + ' red, ' + blue + ' blue. Draw 2 without replacing: P(' + what + ')', '',
        rat(num, n * (n - 1)), 7 + 0.15 * n, { tag: 'Fraction or decimal', verify: { kind: 'bag', red: red, blue: blue, mode: mode } });
    }
    throw new Error('probBag: could not generate');
  };

  /* expected value */
  G.evGame = function (r, p) {
    for (var i = 0; i < 300; i++) {
      var q = r.pick(p.dens), a = r.int(1, q - 1);
      if (gcd(a, q) !== 1) continue;
      var W = r.int(2, p.wmax), L = r.int(1, p.lmax);
      var ans = rSub(rat(W * a, q), rat(L * (q - a), q));
      if (ans.n === 0) continue;
      var odd = [2, 4, 5, 10].indexOf(q) < 0;
      return Q('Expected value', 'Win ' + W + ' with probability ' + a + '/' + q + ', otherwise lose ' + L + '. Expected value?',
        W + '*' + a + '/' + q + '-' + L + '*(' + q + '-' + a + ')/' + q, ans, 5 + (odd ? 1.2 : 0) + 0.3 * (digits(W) + digits(L)),
        { tag: 'Fraction or decimal' });
    }
    throw new Error('evGame: could not generate');
  };

  var DIE_RULES = [
    { text: 'the number shown', pay: [1, 2, 3, 4, 5, 6], d: 4 },
    { text: 'the number shown, squared', pay: [1, 4, 9, 16, 25, 36], d: 6.5 },
    { text: 'twice the number, minus 3', pay: [-1, 1, 3, 5, 7, 9], d: 5.5 },
    { text: '12 if you roll a 6, otherwise 0', pay: [0, 0, 0, 0, 0, 12], d: 4.5 },
    { text: 'the number if it is even, otherwise 0', pay: [0, 2, 0, 4, 0, 6], d: 5 },
    { text: 'the larger of the number and 3', pay: [3, 3, 3, 4, 5, 6], d: 5.5 },
    { text: '7 minus the number', pay: [6, 5, 4, 3, 2, 1], d: 4 },
    { text: 'the number cubed', pay: [1, 8, 27, 64, 125, 216], d: 8 },
    { text: '5 for a 1 or 2, 2 for a 3 or 4, 0 for a 5 or 6', pay: [5, 5, 2, 2, 0, 0], d: 5.5 }
  ];
  G.evDie = function (r, p) {
    var rule = r.pick(p.easy ? DIE_RULES.slice(0, 5) : DIE_RULES), mult = p.mult ? r.int(2, 9) : 1;
    var pay = rule.pay.map(function (x) { return x * mult; });
    var sum = pay.reduce(function (s, x) { return s + x; }, 0);
    var text = 'Roll a fair die and win ' + (mult > 1 ? mult + ' × (' + rule.text + ')' : rule.text) + '. Expected winnings?';
    return Q('Expected value', text, '(' + pay.join('+') + ')/6', rat(sum, 6), rule.d + (mult > 1 ? 1.5 : 0),
      { tag: 'Fraction or decimal' });
  };
  var EV2 = [
    { text: 'the larger die', f: function (a, b) { return Math.max(a, b); }, py: 'max(d1,d2)', d: 10 },
    { text: 'the smaller die', f: function (a, b) { return Math.min(a, b); }, py: 'min(d1,d2)', d: 10 },
    { text: 'the product', f: function (a, b) { return a * b; }, py: 'd1*d2', d: 8 },
    { text: 'the difference (larger minus smaller)', f: function (a, b) { return Math.abs(a - b); }, py: 'abs(d1-d2)', d: 10.5 },
    { text: 'the number of sixes', f: function (a, b) { return (a === 6 ? 1 : 0) + (b === 6 ? 1 : 0); }, py: '(d1==6)+(d2==6)', d: 7 },
    { text: 'the sum', f: function (a, b) { return a + b; }, py: 'd1+d2', d: 6 }
  ];
  G.ev2d6 = function (r, p) {
    var e = r.pick(EV2), tot = 0;
    D2.forEach(function (o) { tot += e.f(o[0], o[1]); });
    return Q('Expected value', 'Roll two fair dice. Expected value of ' + e.text + '?', '', rat(tot, 36), e.d,
      { tag: 'Fraction or decimal', verify: { kind: 'ev2d6', value: e.py } });
  };

  /* counting */
  G.comb = function (r, p) {
    var n = r.int(p.nlo, p.nhi), isPerm = r.chance(p.perm || 0);
    var k = isPerm ? r.int(2, Math.min(4, n - 1)) : r.int(2, Math.max(2, n - 2));
    if (!isPerm && k > n - k && r.chance(0.5)) k = n - k;
    var kk = Math.min(k, n - k);
    if (isPerm) {
      return Q('Combinatorics', 'Arrange ' + k + ' of ' + n + ' different books in a row: ways?', '', rat(perm(n, k)),
        3.5 + 1.2 * k, { verify: { kind: 'comb', n: n, k: k, perm: true } });
    }
    return Q('Combinatorics', n + ' choose ' + k, '', rat(choose(n, k)), 3 + 1.1 * kk + 0.15 * n,
      { verify: { kind: 'comb', n: n, k: k, perm: false } });
  };

  /* remainders */
  G.mod = function (r, p) {
    var kind = r.pick(p.kinds), m = r.int(p.mlo, p.mhi), a, b, e, v, text;
    if (kind === 'rem') {
      a = r.int(p.alo, p.ahi); if (a % m === 0) a += 1;
      v = a % m; text = a + ' mod ' + m;
      return Q('Modular arithmetic', text, '', rat(v), 3 + 0.7 * digits(a) + 0.35 * digits(m), { verify: { kind: 'mod', op: 'rem', a: a, m: m } });
    }
    if (kind === 'mul') {
      a = r.int(p.alo, p.ahi); b = r.int(p.alo, p.ahi);
      v = (a % m) * (b % m) % m; text = '(' + a + ' × ' + b + ') mod ' + m;
      return Q('Modular arithmetic', text, '', rat(v), 5.5 + 0.5 * digits(a) + 0.3 * digits(m), { verify: { kind: 'mod', op: 'mul', a: a, b: b, m: m } });
    }
    a = r.int(2, p.bmax || 9); e = r.int(3, p.emax || 8);
    v = 1; for (var i = 0; i < e; i++) v = (v * a) % m;
    return Q('Modular arithmetic', a + sup(e) + ' mod ' + m, '', rat(v), 6.5 + 0.5 * e, { verify: { kind: 'mod', op: 'pow', a: a, e: e, m: m } });
  };

  /* logarithms: every question is one fact  base^(p/q) = argument  */
  G.log = function (r, p) {
    var kind = r.pick(p.kinds), b, k, x, y, i, j, c, q, pp, text, ans, argN, argD, base;
    if (kind === 'int') {
      b = r.pick(p.bases); k = r.int(p.klo, p.khi);
      var arg = ipow(b, k);
      return Q('Logarithms', 'log' + sub(b) + ' ' + arg, '', rat(k), 3.5 + 0.35 * k,
        { verify: { kind: 'log', base: b, argN: arg, argD: 1, p: k, q: 1 } });
    }
    if (kind === 'neg') {
      b = r.pick(p.bases); k = r.int(1, p.khi);
      var den = ipow(b, k);
      var shown = b === 10 ? fmtScaled(1, k) : '1/' + den;
      return Q('Logarithms', 'log' + sub(b) + ' ' + (b === 10 ? shown : '(' + shown + ')'), '', rat(-k), 4.5 + 0.3 * k,
        { verify: { kind: 'log', base: b, argN: 1, argD: den, p: -k, q: 1 } });
    }
    if (kind === 'sum') {
      b = r.pick(p.bases); i = r.int(1, p.khi); j = r.int(1, p.khi);
      var plus = r.chance(0.5);
      if (!plus && i <= j) { var t = i; i = j; j = t; if (i === j) i++; }
      var ex = ipow(b, i), ey = ipow(b, j);
      var res = plus ? i + j : i - j;
      return Q('Logarithms', 'log' + sub(b) + ' ' + ex + (plus ? ' + ' : ' ' + MINUS + ' ') + 'log' + sub(b) + ' ' + ey, '', rat(res), 5 + 0.3 * (i + j),
        { verify: { kind: 'log', base: b, argN: plus ? ex * ey : ex, argD: plus ? 1 : ey, p: res, q: 1 } });
    }
    /* 'frac': log base c^q of c^p, e.g. log4 8 = 3/2 */
    for (var tries = 0; tries < 200; tries++) {
      c = r.pick([2, 3, 5]); q = r.int(2, c === 2 ? 3 : (c === 3 ? 3 : 3)); pp = r.int(1, c === 2 ? 6 : (c === 3 ? 4 : 3));
      if (gcd(pp, q) === q) continue;                 /* skip answers that are whole numbers */
      base = ipow(c, q); argN = ipow(c, pp);
      if (base > 130 || argN > 130) continue;
      return Q('Logarithms', 'log' + sub(base) + ' ' + argN, '', rat(pp, q), 7 + 0.4 * pp,
        { tag: 'Fraction or decimal', verify: { kind: 'log', base: base, argN: argN, argD: 1, p: rat(pp, q).n, q: rat(pp, q).d } });
    }
    throw new Error('log: could not generate');
  };

  /* ==================================================================
     TRICKS — each recipe builds a question that its shortcut solves well,
     and a "hint" showing the shortcut worked out.
     ================================================================== */
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  G.trick = function (r, p) {
    var a, b, n, k, m, ans;
    switch (p.kind) {
      case 'eleven':
        n = r.chance(0.55) ? r.int(13, 98) : r.int(102, 989);
        if (n % 11 === 0 || n % 10 === 0) n += 1;
        ans = n * 11;
        return Q('Multiplication', r.chance(0.5) ? n + ' × 11' : '11 × ' + n, n + '*11', rat(ans), 4.5,
          { tag: 'Rune of Eleven', hint: n + ' × 11 = ' + n + '0 + ' + n + ' = ' + ans });
      case 'nearHundred':
        a = r.int(91, 99); b = r.int(91, 99);
        var da = 100 - a, db = 100 - b;
        return Q('Multiplication', a + ' × ' + b, a + '*' + b, rat(a * b), 5.5,
          { tag: 'Near-Hundred Pair', hint: a + ' × ' + b + ': gaps ' + da + ' and ' + db + '. ' + a + ' − ' + db + ' = ' + (a - db) + ', ' + da + ' × ' + db + ' = ' + pad2(da * db) + ' → ' + (a * b) });
      case 'endsIn5':
        k = r.int(1, 9); n = k * 10 + 5;
        return Q('Squares & roots', n + '²', n + '^2', rat(n * n), 3.5,
          { tag: 'Squares Ending in Five', hint: n + '² : ' + k + ' × ' + (k + 1) + ' = ' + (k * (k + 1)) + ', then 25 → ' + (n * n) });
      case 'times5':
        n = r.int(13, 199); if (n % 10 === 0) n += 3;
        return Q('Multiplication', n + ' × 5', n + '*5', rat(n * 5), 3,
          { tag: 'Halve and Ten', hint: n + ' × 5 = ' + (n * 10) + ' ÷ 2 = ' + (n * 5) });
      case 'times25':
        n = r.int(12, 99); if (n % 10 === 0) n += 1;
        return Q('Multiplication', n + ' × 25', n + '*25', rat(n * 25), 4.5,
          { tag: 'Quarter of a Hundred', hint: n + ' × 25 = ' + (n * 100) + ' ÷ 4 = ' + (n * 25) });
      case 'times99':
        n = r.int(12, 99); if (n % 10 === 0) n += 1;
        return Q('Multiplication', n + ' × 99', n + '*99', rat(n * 99), 4.5,
          { tag: 'One Short of a Hundred', hint: n + ' × 99 = ' + (n * 100) + ' − ' + n + ' = ' + (n * 99) });
      case 'diffSquares':
        m = r.pick([20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90]); k = r.int(1, 9);
        return Q('Multiplication', (m - k) + ' × ' + (m + k), (m - k) + '*' + (m + k), rat(m * m - k * k), 6,
          { tag: 'Mirror Squares', hint: (m - k) + ' × ' + (m + k) + ' = ' + m + '² − ' + k + '² = ' + (m * m) + ' − ' + (k * k) + ' = ' + (m * m - k * k) });
      case 'pctFlip':
        b = r.pick([25, 50, 75]); a = 4 * r.int(3, 24);
        if (a === b) a += 4;
        ans = a * b / 100;
        return Q('Percentages', a + '% of ' + b, a + '/100*' + b, rat(a * b, 100), 4,
          { tag: 'Percent Mirror', hint: a + '% of ' + b + ' = ' + b + '% of ' + a + ' = ' + ratToText(rat(a * b, 100)) });
    }
    throw new Error('trick: unknown kind ' + p.kind);
  };

  var TRICKS = [
    { id: 'eleven', name: 'Rune of Eleven', short: 'n × 11  =  n × 10 + n',
      blurb: 'Multiply anything by 11 in one breath.',
      when: 'Any number times 11.',
      steps: ['Add a zero to the number (that is ×10).', 'Add the number once more.'],
      example: '43 × 11 = 430 + 43 = 473. For two digits you can also split them: 4 _ 3, put 4+3 in the gap: 473.' },
    { id: 'nearHundred', name: 'Near-Hundred Pair', short: 'gaps to 100: cross-subtract, multiply gaps',
      blurb: 'Two numbers just under 100, solved with their gaps.',
      when: 'Both numbers are between 91 and 99.',
      steps: ['Write each number’s gap to 100 (97 → 3, 96 → 4).', 'Subtract one gap from the other number: 97 − 4 = 93. This is the left part.', 'Multiply the two gaps: 3 × 4 = 12. This is the right part, always two digits.', 'Glue them together: 93|12.'],
      example: '97 × 96 → 93 and 12 → 9312.' },
    { id: 'endsIn5', name: 'Squares Ending in Five', short: 'k5² = k × (k+1), then 25',
      blurb: 'Square 15, 25, 35 … 95 instantly.',
      when: 'The number ends in 5.',
      steps: ['Cover the 5. What is left is k (85 → 8).', 'Multiply k by the next number up: 8 × 9 = 72.', 'Write 25 after it.'],
      example: '85² → 72 and 25 → 7225.' },
    { id: 'times5', name: 'Halve and Ten', short: 'n × 5  =  half of n × 10',
      blurb: 'Times 5 is just half of times 10.',
      when: 'Any number times 5.',
      steps: ['Add a zero (×10).', 'Halve the result.'],
      example: '38 × 5 = 380 ÷ 2 = 190. Or halve first: 19, then add the zero: 190.' },
    { id: 'times25', name: 'Quarter of a Hundred', short: 'n × 25  =  n × 100 ÷ 4',
      blurb: 'Times 25 is a hundred, quartered.',
      when: 'Any number times 25.',
      steps: ['Multiply by 100 (add two zeros).', 'Halve it twice (divide by 4).'],
      example: '36 × 25 = 3600 ÷ 4 = 900.' },
    { id: 'times99', name: 'One Short of a Hundred', short: 'n × 99  =  n × 100 − n',
      blurb: 'Times 99 is a hundred, minus one.',
      when: 'Any number times 99.',
      steps: ['Multiply by 100.', 'Subtract the number once.'],
      example: '37 × 99 = 3700 − 37 = 3663.' },
    { id: 'diffSquares', name: 'Mirror Squares', short: '(m−k)(m+k) = m² − k²',
      blurb: 'Two numbers equally far from a round middle.',
      when: 'The two numbers sit the same distance either side of a friendly middle number.',
      steps: ['Find the middle number and the distance: 47 and 53 → middle 50, distance 3.', 'Square the middle: 50² = 2500.', 'Subtract the square of the distance: 2500 − 9.'],
      example: '47 × 53 = 2500 − 9 = 2491.' },
    { id: 'pctFlip', name: 'Percent Mirror', short: 'a% of b  =  b% of a',
      blurb: 'Swap the two numbers to make a hard percentage easy.',
      when: 'An awkward percentage of 25, 50 or 75.',
      steps: ['Swap the percentage and the number: a% of b = b% of a.', '25%, 50% and 75% are quarter, half and three quarters. Use them.'],
      example: '36% of 75 = 75% of 36 = ¾ × 36 = 27.' }
  ];
  var TRICK_BY_ID = {};
  TRICKS.forEach(function (t) { TRICK_BY_ID[t.id] = t; });

  /* ==================================================================
     TIERS — which recipes, how often, with which settings
     [recipe, weight, settings]
     ================================================================== */
  var EASY_PCT = [5, 10, 20, 25, 50];
  var MID_PCT = [8, 12, 15, 16, 18, 30, 35, 40, 45, 60, 75];
  var HARD_PCT = [2.5, 7.5, 12.5, 17.5, 22.5, 37.5, 62.5, 87.5];

  var TIERS = [
    { id: 'acolyte', name: 'Acolyte', label: 'Easy', emblem: '✧', accuracy: 0.95,
      blurb: 'Build speed and accuracy with the basics.',
      recipes: [
        ['add', 3, { da: 2, db: 2 }], ['sub', 3, { da: 2, db: 2 }],
        ['table', 2, { lo: 3, hi: 12 }], ['div', 2, { dq: 1, dd: 1 }],
        ['square', 1, { lo: 2, hi: 15 }], ['mul', 1, { da: 2, db: 1, shortcut: 'any' }]
      ] },
    { id: 'scribe', name: 'Scribe', label: 'Easy+', emblem: '✶', accuracy: 0.95,
      blurb: 'Bigger numbers, first decimals and percentages.',
      recipes: [
        ['add', 2, { da: 3, db: 2 }], ['sub', 2, { da: 3, db: 2 }], ['add', 1, { da: 3, db: 3 }],
        ['mul', 3, { da: 2, db: 1, shortcut: 'any' }], ['div', 2, { dq: 2, dd: 1 }],
        ['decAdd', 2, { ia: 1, ib: 1, dpa: 1, dpb: 1 }], ['decMul', 1, { da: 1, dpa: 1, db: 1, dpb: 0 }],
        ['square', 1, { lo: 11, hi: 25 }], ['pctOf', 1, { set: EASY_PCT, lo: 40, hi: 400, dp: 0 }]
      ] },
    { id: 'adept', name: 'Adept', label: 'Medium', emblem: '❂', accuracy: 0.95,
      blurb: 'Two-digit products, negatives, percentages, decimals.',
      recipes: [
        ['mul', 4, { da: 2, db: 2, shortcut: 'any' }],
        ['add', 1, { da: 3, db: 3 }], ['sub', 1, { da: 3, db: 3 }],
        ['neg', 1, { ops1: ['*'], ops2: ['+', '-'], lo: 6, hi: 25, zlo: 10, zhi: 99 }],
        ['neg', 1, { ops1: ['+', '-'], ops2: ['+', '-'], lo: 20, hi: 99, zlo: 20, zhi: 99 }],
        ['pctOf', 2, { set: MID_PCT, lo: 80, hi: 900, dp: 0 }],
        ['decMul', 2, { da: 2, dpa: 1, db: 2, dpb: 1 }],
        ['decAdd', 1, { ia: 2, ib: 1, dpa: 2, dpb: 1 }],
        ['div', 1, { dq: 2, dd: 2 }], ['square', 1, { lo: 16, hi: 30 }],
        ['fracToDec', 1, { dens: [4, 5, 8, 16, 20, 25] }],
        ['proportion', 1, { amax: 12 }], ['mean', 1, { lo: 20, hi: 90, spread: 12 }],
        ['fracOfInt', 1, { dens: [3, 4, 5, 6, 8, 12], lo: 60, hi: 960 }]
      ] },
    { id: 'magister', name: 'Magister', label: 'Hard', emblem: '❖', accuracy: 0.92,
      blurb: 'Three-digit products, brackets, fractions, percentage change.',
      recipes: [
        ['mul', 3, { da: 3, db: 2, shortcut: 'any' }],
        ['chain', 1, { kind: 'A' }], ['chain', 1, { kind: 'B' }], ['chain', 1, { kind: 'D' }],
        ['decMul', 2, { da: 3, dpa: 1, db: 2, dpb: 1 }], ['decDiv', 1, { dq: 2, dpq: 0, dd: 2, dpd: 1 }],
        ['fracAdd', 2, { dens: [3, 4, 5, 6, 8, 9, 10, 12] }],
        ['pctChange', 2, { set: [10, 15, 20, 25, 30, 35, 40, 12.5], lo: 40, hi: 800, decrease: true }],
        ['pctWhat', 1, { set: [15, 35, 45, 62.5, 12.5, 85, 24, 36], lo: 40, hi: 800 }],
        ['cube', 1, { lo: 3, hi: 15 }], ['sqrtPerfect', 1, { lo: 15, hi: 45 }], ['cbrtPerfect', 1, { lo: 3, hi: 15 }],
        ['neg', 1, { ops1: ['*'], ops2: ['+', '-'], lo: 12, hi: 60, zlo: 20, zhi: 199 }],
        ['fracToDec', 1, { dens: [8, 16, 25, 32, 40, 50] }],
        ['evGame', 1, { dens: [2, 4, 5, 10], wmax: 20, lmax: 9 }], ['comb', 1, { nlo: 5, nhi: 9, perm: 0.2 }],
        ['probCoin', 1, { nlo: 3, nhi: 6 }]
      ] },
    { id: 'archon', name: 'Archon', label: 'Extreme', emblem: '⚜', accuracy: 0.90,
      blurb: 'Estimation, powers, awkward fractions, decimal chains.',
      recipes: [
        ['mul', 2, { da: 3, db: 3, shortcut: 'any' }], ['mul', 1, { da: 4, db: 2, shortcut: 'any' }],
        ['chain', 2, { kind: 'C' }], ['chain', 1, { kind: 'E' }],
        ['fracAdd', 2, { dens: [7, 9, 11, 12, 14, 15, 18] }],
        ['pow', 1, { bases: [2], elo: 10, ehi: 16, klo: 1, khi: 9 }],
        ['est', 1, { kind: 'mul', alo: 31, ahi: 99, dpa: 1, blo: 201, bhi: 999, dpb: 1 }],
        ['est', 1, { kind: 'div', nlo: 2000, nhi: 99999, dlo: 13, dhi: 98 }],
        ['pctChange', 2, { set: [12.5, 17.5, 22.5, 27.5, 32.5, 7.5, 37.5], lo: 80, hi: 1600, decrease: true }],
        ['pctOf', 1, { set: HARD_PCT, lo: 200, hi: 4000, dp: 1 }],
        ['sqrtApprox', 1, { lo: 20, hi: 500 }],
        ['square', 1, { lo: 35, hi: 95, five: true }], ['mul', 1, { near100: true }],
        ['decDiv', 1, { dq: 2, dpq: 1, dd: 2, dpd: 1 }],
        ['probDice', 1, { cond: true }], ['evDie', 1, {}], ['log', 1, { kinds: ['int', 'neg', 'sum'], bases: [2, 3, 5, 10], klo: 2, khi: 6 }],
        ['mod', 1, { kinds: ['rem', 'mul'], alo: 100, ahi: 999, mlo: 7, mhi: 17 }]
      ] },
    { id: 'abyss', name: 'Abyss', label: 'Hell', emblem: '☠', accuracy: 0.85,
      blurb: 'Brutal products, double products, hard estimation.',
      recipes: [
        ['mul', 2, { da: 4, db: 3, shortcut: 'any' }], ['mul', 2, { da: 5, db: 2, shortcut: 'any' }],
        ['chain', 2, { kind: 'E' }], ['chain', 2, { kind: 'F' }], ['chain', 1, { kind: 'C' }],
        ['decMul', 2, { da: 3, dpa: 2, db: 3, dpb: 1 }],
        ['est', 2, { kind: 'mul', alo: 301, ahi: 999, dpa: 2, blo: 301, bhi: 999, dpb: 1 }],
        ['est', 1, { kind: 'div', nlo: 20000, nhi: 999999, dlo: 113, dhi: 987 }],
        ['fracAdd', 1, { dens: [11, 13, 14, 15, 16, 18, 21] }],
        ['pctChange', 1, { set: [17.5, 22.5, 27.5, 32.5, 37.5, 42.5, 47.5], lo: 400, hi: 8000, decrease: true }],
        ['sqrtApprox', 1, { lo: 500, hi: 9999 }],
        ['pow', 1, { bases: [3, 6, 7, 12], elo: 4, ehi: 8, klo: 3, khi: 9 }],
        ['neg', 1, { ops1: ['*'], ops2: ['+', '-'], lo: 21, hi: 99, zlo: 100, zhi: 999 }],
        ['decDiv', 1, { dq: 3, dpq: 1, dd: 2, dpd: 1 }],
        ['probBag', 1, { lo: 4, hi: 10 }], ['ev2d6', 1, {}], ['comb', 1, { nlo: 10, nhi: 16, perm: 0.25 }],
        ['log', 1, { kinds: ['frac', 'sum', 'neg'], bases: [2, 3, 5], klo: 2, khi: 6 }],
        ['mod', 1, { kinds: ['mul', 'pow'], alo: 100, ahi: 999, mlo: 7, mhi: 23, bmax: 9, emax: 9 }]
      ] }
  ];

  var TIER_BY_ID = {};
  TIERS.forEach(function (t, i) { t.index = i; TIER_BY_ID[t.id] = t; });

  /* difficulty bands, measured by tests/measure (see test script) */
  var BANDS = {
    acolyte: [1, 4], scribe: [1, 6], adept: [2, 9],
    magister: [4, 13], archon: [4.5, 17], abyss: [7, 24]
  };

  function targetFor(diff) { return round1(clamp(1.3 + 0.75 * diff, 1.5, 30)); }

  function weightedPick(r, recipes, skillMult) {
    var total = 0, i, w;
    for (i = 0; i < recipes.length; i++) {
      w = recipes[i][1] * (skillMult && skillMult[recipes[i][0]] ? skillMult[recipes[i][0]] : 1);
      total += w;
    }
    var x = r() * total;
    for (i = 0; i < recipes.length; i++) {
      w = recipes[i][1] * (skillMult && skillMult[recipes[i][0]] ? skillMult[recipes[i][0]] : 1);
      if (x < w) return recipes[i];
      x -= w;
    }
    return recipes[recipes.length - 1];
  }

  /* ctx.recent: array of recent question texts (avoids repeats)
     ctx.recipeBoost: { recipeName: multiplier } (used by weak-spot drills later) */
  function nextQuestion(tierId, r, ctx) {
    ctx = ctx || {};
    var tier = TIER_BY_ID[tierId];
    var recent = ctx.recent || (ctx.recent = []);
    for (var attempt = 0; attempt < 25; attempt++) {
      var rec = weightedPick(r, tier.recipes, ctx.recipeBoost);
      var q = G[rec[0]](r, rec[2]);
      if (!q || recent.indexOf(q.text) >= 0) continue;
      q.id = rec[0];
      q.tier = tier.id;
      q.settings = rec[2];
      q.target = targetFor(q.diff);
      recent.push(q.text);
      if (recent.length > 20) recent.shift();
      return q;
    }
    throw new Error('Could not build a fresh question for ' + tierId);
  }

  /* the 80-in-8 mix: mostly the chosen tier, a fifth from the tier below */
  function mixTier(r, tierId) {
    var t = TIER_BY_ID[tierId];
    if (t.index > 0 && r() < 0.2) return TIERS[t.index - 1].id;
    return tierId;
  }

  /* Limitless: climbs one tier every 8 correct answers, starting at Adept */
  function limitlessTier(correctCount) {
    return TIERS[Math.min(TIERS.length - 1, 2 + Math.floor(correctCount / 8))].id;
  }

  /* ==================================================================
     SKILLS, DRILLS, DECKS, TRICKS — what the trainer uses on top of tiers
     ================================================================== */
  var RECIPE_SKILL = {
    add: 'Addition', sub: 'Subtraction', table: 'Multiplication', mul: 'Multiplication', div: 'Division',
    decAdd: 'Decimals', decMul: 'Decimals', decDiv: 'Decimals', neg: 'Negatives',
    pctOf: 'Percentages', pctChange: 'Percentages', pctWhat: 'Percentages',
    fracAdd: 'Fractions', fracOfInt: 'Fractions', fracToDec: 'Fractions',
    square: 'Squares & roots', cube: 'Squares & roots', sqrtPerfect: 'Squares & roots', cbrtPerfect: 'Squares & roots', sqrtApprox: 'Squares & roots',
    pow: 'Powers', est: 'Estimation', proportion: 'Ratios', mean: 'Averages', chain: 'Mixed operations',
    probDice: 'Probability', probCoin: 'Probability', probBag: 'Probability',
    evGame: 'Expected value', evDie: 'Expected value', ev2d6: 'Expected value',
    comb: 'Combinatorics', mod: 'Modular arithmetic', log: 'Logarithms'
  };
  var SKILLS = ['Addition', 'Subtraction', 'Multiplication', 'Division', 'Decimals', 'Negatives', 'Percentages', 'Fractions',
    'Squares & roots', 'Powers', 'Estimation', 'Ratios', 'Averages', 'Mixed operations',
    'Probability', 'Expected value', 'Combinatorics', 'Modular arithmetic', 'Logarithms'];

  /* extra, easier/harder presets for the advanced skills so a drill can be set at any tier.
     [recipe, weight, settings, tierIndex] */
  var EXTRA = [
    ['probCoin', 1, { nlo: 3, nhi: 4 }, 1], ['probDice', 1, { cond: false }, 1],
    ['probCoin', 1, { nlo: 5, nhi: 7, atLeast: true }, 3], ['probDice', 1, { cond: true }, 3], ['probBag', 1, { lo: 2, hi: 6 }, 3],
    ['probCoin', 1, { nlo: 7, nhi: 9, atLeast: true }, 5], ['probBag', 1, { lo: 4, hi: 10 }, 5],
    ['evGame', 1, { dens: [2, 4, 5, 10], wmax: 12, lmax: 6 }, 1], ['evDie', 1, { easy: true }, 1],
    ['evGame', 1, { dens: [3, 6, 8], wmax: 30, lmax: 12 }, 3], ['evDie', 1, {}, 3],
    ['ev2d6', 1, {}, 5], ['evDie', 1, { mult: true }, 5],
    ['comb', 1, { nlo: 4, nhi: 6, perm: 0.2 }, 1], ['comb', 1, { nlo: 7, nhi: 10, perm: 0.25 }, 3], ['comb', 1, { nlo: 10, nhi: 16, perm: 0.25 }, 5],
    ['mod', 1, { kinds: ['rem'], alo: 20, ahi: 99, mlo: 3, mhi: 9 }, 1],
    ['mod', 1, { kinds: ['rem', 'mul'], alo: 100, ahi: 999, mlo: 7, mhi: 17 }, 3],
    ['mod', 1, { kinds: ['mul', 'pow'], alo: 100, ahi: 999, mlo: 7, mhi: 23, bmax: 9, emax: 9 }, 5],
    ['log', 1, { kinds: ['int'], bases: [2, 3, 10], klo: 1, khi: 5 }, 1],
    ['log', 1, { kinds: ['int', 'neg', 'sum'], bases: [2, 3, 5, 10], klo: 2, khi: 6 }, 3],
    ['log', 1, { kinds: ['frac', 'sum', 'neg'], bases: [2, 3, 5], klo: 2, khi: 6 }, 5]
  ];

  /* every (recipe, weight, settings, tierIndex) the drills may draw from */
  var DRILL_ENTRIES = [];
  TIERS.forEach(function (t) { t.recipes.forEach(function (rec) { DRILL_ENTRIES.push([rec[0], rec[1], rec[2], t.index]); }); });
  EXTRA.forEach(function (e) { DRILL_ENTRIES.push(e); });

  function entryQuestion(rec, tierId, r, ctx) {
    ctx = ctx || {};
    var recent = ctx.recent || (ctx.recent = []);
    for (var attempt = 0; attempt < 25; attempt++) {
      var q = G[rec[0]](r, rec[2]);
      if (!q || recent.indexOf(q.text) >= 0) continue;
      q.id = rec[0]; q.tier = tierId; q.settings = rec[2];
      q.target = targetFor(q.diff);
      recent.push(q.text);
      if (recent.length > 20) recent.shift();
      return q;
    }
    /* a small pool (e.g. squares up to 15) can run out of fresh questions: allow a repeat, but not back-to-back */
    for (var again = 0; again < 40; again++) {
      var q2 = G[rec[0]](r, rec[2]);
      if (q2 && q2.text !== recent[recent.length - 1]) {
        q2.id = rec[0]; q2.tier = tierId; q2.settings = rec[2]; q2.target = targetFor(q2.diff);
        recent.push(q2.text); if (recent.length > 20) recent.shift();
        return q2;
      }
    }
    throw new Error('Could not build a question for ' + rec[0]);
  }

  /* weak-spot drill: ~75% from the chosen skills (nearest to the chosen tier), the rest general.
     skills: array of skill names; weights: optional { skill: number } */
  function drillQuestion(skills, weights, tierId, r, ctx) {
    var ti = TIER_BY_ID[tierId].index;
    if (!skills || !skills.length || r() > 0.75) return nextQuestion(tierId, r, ctx);
    var total = 0, i;
    for (i = 0; i < skills.length; i++) total += (weights && weights[skills[i]]) || 1;
    var x = r() * total, skill = skills[skills.length - 1];
    for (i = 0; i < skills.length; i++) {
      var w = (weights && weights[skills[i]]) || 1;
      if (x < w) { skill = skills[i]; break; }
      x -= w;
    }
    var pool = DRILL_ENTRIES.filter(function (e) { return RECIPE_SKILL[e[0]] === skill; });
    if (!pool.length) return nextQuestion(tierId, r, ctx);
    var best = Infinity;
    pool.forEach(function (e) { best = Math.min(best, Math.abs(e[3] - ti)); });
    var near = pool.filter(function (e) { return Math.abs(e[3] - ti) === best; });
    var rec = weightedPick(r, near, null);
    return entryQuestion(rec, TIERS[rec[3]].id, r, ctx);
  }

  /* a fresh question from the same recipe and settings (used after a miss in accuracy drills) */
  function retryQuestion(q, r, ctx) {
    if (!q || !q.settings || !G[q.id]) return null;
    return entryQuestion([q.id, 1, q.settings], q.tier, r, ctx);
  }

  /* 80-in-8 "deck": a fixed mix of recipes, in shuffled order, no long runs of one recipe */
  function allocate(recipes, total) {
    var sum = 0, i;
    recipes.forEach(function (rec) { sum += rec[1]; });
    var raw = recipes.map(function (rec) { return rec[1] / sum * total; });
    var base = raw.map(Math.floor), used = 0;
    base.forEach(function (b) { used += b; });
    var order = raw.map(function (x, k) { return [x - Math.floor(x), k]; }).sort(function (a, b) { return b[0] - a[0]; });
    for (i = 0; i < total - used; i++) base[order[i][1]]++;
    return base;     /* how many slots each recipe gets */
  }
  function buildDeck(tierId, count, r) {
    var t = TIER_BY_ID[tierId], below = t.index > 0 ? TIERS[t.index - 1] : null;
    var nBelow = below ? Math.round(count * 0.2) : 0, slots = [];
    function add(tier, n) {
      var counts = allocate(tier.recipes, n);
      counts.forEach(function (c, k) { for (var j = 0; j < c; j++) slots.push({ tier: tier.id, rec: tier.recipes[k] }); });
    }
    add(t, count - nBelow);
    if (below) add(below, nBelow);
    var i, j;
    for (i = slots.length - 1; i > 0; i--) {                 /* shuffle */
      j = Math.floor(r() * (i + 1));
      var tmp = slots[i]; slots[i] = slots[j]; slots[j] = tmp;
    }
    for (i = 1; i < slots.length; i++) {                      /* break up repeats of the same recipe */
      if (slots[i].rec[0] !== slots[i - 1].rec[0]) continue;
      for (j = i + 1; j < slots.length; j++) {
        if (slots[j].rec[0] !== slots[i - 1].rec[0] && (i + 1 >= slots.length || slots[j].rec[0] !== slots[i + 1].rec[0])) {
          var t2 = slots[i]; slots[i] = slots[j]; slots[j] = t2; break;
        }
      }
    }
    return slots;
  }
  function deckQuestion(slot, r, ctx) { return entryQuestion(slot.rec, slot.tier, r, ctx); }

  /* trick questions */
  function trickQuestion(id, r, ctx) {
    ctx = ctx || {};
    var recent = ctx.recent || (ctx.recent = []);
    for (var attempt = 0; attempt < 40; attempt++) {
      var q = G.trick(r, { kind: id });
      if (recent.indexOf(q.text) >= 0) continue;
      q.id = 'trick:' + id; q.tier = null; q.settings = null;
      q.target = targetFor(q.diff);
      recent.push(q.text);
      if (recent.length > 20) recent.shift();
      return q;
    }
    for (var again = 0; again < 60; again++) {          /* tiny pools (squares ending in 5) repeat, but never back-to-back */
      var q2 = G.trick(r, { kind: id });
      if (q2.text !== recent[recent.length - 1]) {
        q2.id = 'trick:' + id; q2.tier = null; q2.settings = null; q2.target = targetFor(q2.diff);
        recent.push(q2.text); if (recent.length > 20) recent.shift();
        return q2;
      }
    }
    throw new Error('Could not build a trick question for ' + id);
  }

  /* strict timer: a hard per-question limit, as a multiple of the target time */
  function strictLimit(q, factor) { return round1(clamp(q.target * (factor || 1.6), 3, 45)); }

  var api = {
    TIERS: TIERS, TIER_BY_ID: TIER_BY_ID, BANDS: BANDS, GENERATORS: G,
    makeRng: makeRng, nextQuestion: nextQuestion, mixTier: mixTier, limitlessTier: limitlessTier,
    checkAnswer: checkAnswer, parseInput: parseInput, ratToText: ratToText, ratEq: ratEq,
    withCommas: withCommas, targetFor: targetFor,
    SKILLS: SKILLS, RECIPE_SKILL: RECIPE_SKILL, TRICKS: TRICKS, TRICK_BY_ID: TRICK_BY_ID,
    drillQuestion: drillQuestion, retryQuestion: retryQuestion, buildDeck: buildDeck, deckQuestion: deckQuestion,
    trickQuestion: trickQuestion, strictLimit: strictLimit
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MathEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
