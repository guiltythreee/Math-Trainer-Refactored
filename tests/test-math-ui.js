/* ==================================================================
   Characterisation tests for MathUI (math-ui.js)

   Tests the pure UI / DOM utilities extracted from game.js:
   - Time formatting (fmtClock, fmtSec)
   - Percentage formatting (pct)
   - List formatting (sentenceList)
   - Zero padding (pad)
   - Element creation (h)
   - Element clearing (clear)
   - SVG element creation (svgEl)
   - Tile component (tile)
   - Stat cell formatting (statCell)
   - Chip component (makeChip)
   ================================================================== */
(function () {
  'use strict';
  var U = window.MathUI;
  var T = window.Test;

  if (!U) {
    console.error('[test-math-ui] MathUI not found — load math-ui.js first.');
    return;
  }

  window.__testSuiteStarted_ui = true;

  // ------------------------------------------------------------------
  // 1. fmtClock: time formatting
  // ------------------------------------------------------------------
  (function () {
    T.assertEqual(U.fmtClock(0), '0:00', 'fmtClock: 0 seconds');
    T.assertEqual(U.fmtClock(5), '0:05', 'fmtClock: 5 seconds');
    T.assertEqual(U.fmtClock(65), '1:05', 'fmtClock: 65 seconds');
    T.assertEqual(U.fmtClock(3661), '61:01', 'fmtClock: 3661 seconds');
    T.assertEqual(U.fmtClock(3599), '59:59', 'fmtClock: 3599 seconds');
    T.assertEqual(U.fmtClock(-10), '0:00', 'fmtClock: negative clamped to 0');
    T.assertEqual(U.fmtClock(0.5), '0:01', 'fmtClock: fractional rounds up');
  })();

  // ------------------------------------------------------------------
  // 2. fmtSec: seconds formatting
  // ------------------------------------------------------------------
  (function () {
    T.assertEqual(U.fmtSec(0), '0.0 s', 'fmtSec: 0 seconds');
    T.assertEqual(U.fmtSec(1.5), '1.5 s', 'fmtSec: 1.5 seconds');
    T.assertEqual(U.fmtSec(0.33), '0.3 s', 'fmtSec: 0.33 seconds');
    T.assertEqual(U.fmtSec(10), '10.0 s', 'fmtSec: 10 seconds');
    T.assertEqual(U.fmtSec(2.05), '2.1 s', 'fmtSec: 2.05 seconds');
  })();

  // ------------------------------------------------------------------
  // 3. pct: percentage formatting
  // ------------------------------------------------------------------
  (function () {
    T.assertEqual(U.pct(0), '0%', 'pct: 0');
    T.assertEqual(U.pct(0.85), '85%', 'pct: 0.85');
    T.assertEqual(U.pct(1), '100%', 'pct: 1');
    T.assertEqual(U.pct(0.5), '50%', 'pct: 0.5');
    T.assertEqual(U.pct(0.333), '33%', 'pct: 0.333');
  })();

  // ------------------------------------------------------------------
  // 4. sentenceList: list formatting
  // ------------------------------------------------------------------
  (function () {
    T.assertEqual(U.sentenceList([]), '', 'sentenceList: empty array');
    T.assertEqual(U.sentenceList(['a']), 'a', 'sentenceList: one item');
    T.assertEqual(U.sentenceList(['a', 'b']), 'a and b', 'sentenceList: two items');
    T.assertEqual(U.sentenceList(['a', 'b', 'c']), 'a, b and c', 'sentenceList: three items');
    T.assertEqual(U.sentenceList(['x', 'y', 'z', 'w']), 'x, y, z and w', 'sentenceList: four items');
  })();

  // ------------------------------------------------------------------
  // 6. h: element creation
  // ------------------------------------------------------------------
  (function () {
    var el = U.h('div');
    T.assertEqual(el.tagName, 'DIV', 'h: tag name');
    T.assertEqual(el.className, '', 'h: no class');

    var el2 = U.h('span', 'my-class', 'hello');
    T.assertEqual(el2.tagName, 'SPAN', 'h: span tag');
    T.assertEqual(el2.className, 'my-class', 'h: class set');
    T.assertEqual(el2.textContent, 'hello', 'h: text set');

    var el3 = U.h('p', null, null);
    T.assertEqual(el3.textContent, '', 'h: null text');
  })();

  // ------------------------------------------------------------------
  // 7. clear: remove all children
  // ------------------------------------------------------------------
  (function () {
    var parent = U.h('div');
    parent.appendChild(U.h('span', null, 'a'));
    parent.appendChild(U.h('span', null, 'b'));
    parent.appendChild(U.h('span', null, 'c'));
    T.assertEqual(parent.children.length, 3, 'clear: 3 children before');
    U.clear(parent);
    T.assertEqual(parent.children.length, 0, 'clear: 0 children after');
  })();

  // ------------------------------------------------------------------
  // 8. svgEl: SVG element creation
  // ------------------------------------------------------------------
  (function () {
    var svg = U.svgEl('svg', { viewBox: '0 0 100 100', class: 'test-svg' });
    T.assertEqual(svg.tagName, 'SVG', 'svgEl: tag name');
    T.assertEqual(svg.getAttribute('viewBox'), '0 0 100 100', 'svgEl: viewBox attr');
    T.assertEqual(svg.getAttribute('class'), 'test-svg', 'svgEl: class attr');

    var rect = U.svgEl('rect', { x: 10, y: 20, width: 30, height: 40 });
    T.assertEqual(rect.getAttribute('x'), 10, 'svgEl: numeric attr');
    T.assertEqual(rect.getAttribute('height'), 40, 'svgEl: height attr');
  })();

  // ------------------------------------------------------------------
  // 9. tile: tile component
  // ------------------------------------------------------------------
  (function () {
    var tile = U.tile('Accuracy', '85%', '40 right, 8 wrong');
    T.assertEqual(tile.tagName, 'DIV', 'tile: div');
    T.assertEqual(tile.className, 'tile', 'tile: class');
    T.assertEqual(tile.children.length, 3, 'tile: 3 children');
    T.assertEqual(tile.children[0].className, 'tile-label', 'tile: label child');
    T.assertEqual(tile.children[0].textContent, 'Accuracy', 'tile: label text');
    T.assertEqual(tile.children[1].className, 'tile-value', 'tile: value child');
    T.assertEqual(tile.children[1].textContent, '85%', 'tile: value text');
    T.assertEqual(tile.children[2].className, 'tile-sub', 'tile: sub child');
    T.assertEqual(tile.children[2].textContent, '40 right, 8 wrong', 'tile: sub text');
  })();

  // ------------------------------------------------------------------
  // 10. statCell: stat cell formatting
  // ------------------------------------------------------------------
  (function () {
    T.assertEqual(U.statCell(null), '–', 'statCell: null');
    T.assertEqual(U.statCell(undefined), '–', 'statCell: undefined');
    T.assertEqual(U.statCell({ acc: 0.95, med: 2.5 }), '95% right · 2.5 s median', 'statCell: formatted');
    T.assertEqual(U.statCell({ acc: 0, med: 0 }), '0% right · 0.0 s median', 'statCell: zero values');
  })();

  // ------------------------------------------------------------------
  // 11. makeChip: chip component
  // ------------------------------------------------------------------
  (function () {
    var chip = U.makeChip('diff', 'easy', 'Wayfarer', 'More time', true, false, function () {});
    T.assertEqual(chip.tagName, 'LABEL', 'makeChip: label tag');
    T.assertEqual(chip.className, 'chip is-selected', 'makeChip: selected class');
    T.assertEqual(chip.children.length, 3, 'makeChip: 3 children');
    T.assertEqual(chip.children[0].tagName, 'INPUT', 'makeChip: input child');
    T.assertEqual(chip.children[0].type, 'radio', 'makeChip: input type radio');
    T.assertEqual(chip.children[0].name, 'diff', 'makeChip: input name');
    T.assertEqual(chip.children[0].value, 'easy', 'makeChip: input value');
    T.assertEqual(chip.children[0].checked, true, 'makeChip: input checked');
    T.assertEqual(chip.children[0].disabled, false, 'makeChip: input not disabled');
    T.assertEqual(chip.children[1].className, 'chip-name', 'makeChip: name child');
    T.assertEqual(chip.children[1].textContent, 'Wayfarer', 'makeChip: name text');
    T.assertEqual(chip.children[2].className, 'chip-desc', 'makeChip: desc child');
    T.assertEqual(chip.children[2].textContent, 'More time', 'makeChip: desc text');

    var chip2 = U.makeChip('penalty', 'strict', 'Strict', '−10 points', false, true, function () {});
    T.assertEqual(chip2.className, 'chip is-disabled', 'makeChip: disabled class');
    T.assertEqual(chip2.children[0].checked, false, 'makeChip: not checked');
    T.assertEqual(chip2.children[0].disabled, true, 'makeChip: input disabled');
  })();

  // ------------------------------------------------------------------
  // 12. Report results
  // ------------------------------------------------------------------
  console.log('[test-math-ui] ' + T.summary());
  T.results.forEach(function (res) {
    console.log('  [' + res.status + '] ' + res.message);
  });
  window.__testUiDone = true;
})();
