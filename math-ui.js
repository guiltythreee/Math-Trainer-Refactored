/* ==================================================================
   Math Trainer — UI / DOM helpers  (Phase 4d)

   Pure UI utilities extracted from game.js: formatting, element
   creation, and SVG helpers.  No game state, no storage, no timer,
   no gameplay logic — only the global `document` is used.
   ================================================================== */
(function (root) {
  'use strict';

  /* ---------- formatting ---------- */
  function fmtClock(sec) {
    sec = Math.max(0, Math.ceil(sec));
    return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
  }
  function fmtSec(x) { return (Math.round(x * 10) / 10).toFixed(1) + ' s'; }
  function pct(x) { return Math.round(x * 100) + '%'; }
  function sentenceList(arr) {
    if (arr.length <= 1) return arr.join('');
    return arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
  }

  /* ---------- math helpers ---------- */
  function median(arr) {
    if (!arr.length) return 0;
    var a = arr.slice().sort(function (x, y) { return x - y; }), m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  /* ---------- DOM helpers ---------- */
  function h(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function svgEl(name, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  /* ---------- UI components ---------- */
  function tile(label, value, sub) {
    var t = h('div', 'tile');
    t.appendChild(h('div', 'tile-label', label));
    t.appendChild(h('div', 'tile-value', value));
    t.appendChild(h('div', 'tile-sub', sub));
    return t;
  }
  function statCell(s) { return s ? pct(s.acc) + ' right · ' + fmtSec(s.med) + ' median' : '–'; }
  function makeChip(group, value, name, desc, selected, disabled, onPick) {
    var label = h('label', 'chip' + (selected ? ' is-selected' : '') + (disabled ? ' is-disabled' : ''));
    var input = document.createElement('input');
    input.type = 'radio'; input.name = group; input.value = value;
    input.checked = selected; input.disabled = !!disabled;
    input.addEventListener('change', function () { onPick(value); });
    label.appendChild(input);
    label.appendChild(h('div', 'chip-name', name));
    label.appendChild(h('div', 'chip-desc', desc));
    return label;
  }

  root.MathUI = {
    fmtClock: fmtClock,
    fmtSec: fmtSec,
    pct: pct,
    sentenceList: sentenceList,
    median: median,
    h: h,
    clear: clear,
    svgEl: svgEl,
    tile: tile,
    statCell: statCell,
    makeChip: makeChip
  };
})(typeof window !== 'undefined' ? window : globalThis);
