// Math Trainer theme layer. One entry per theme; add a new entry (and CSS block) for more.
(function () {
  'use strict';
  var KEY = 'limitless.math.v1.theme';
  var root = document.documentElement;

  var THEMES = {
    dark:  { name: 'Dark',  label: 'Dark',  color: '#08070d' },
    light: { name: 'Light', label: 'Light', color: '#dfe6ee' }
  };

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var bg = document.getElementById('theme-bg');
  var btn = document.getElementById('theme-toggle');
  var metaColor = document.querySelector('meta[name="theme-color"]');

  function current() { return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function paintToggle() {
    if (!btn) return;
    var other = current() === 'dark' ? 'light' : 'dark';
    btn.textContent = THEMES[other].label + ' mode';
    btn.setAttribute('aria-label', 'Switch to ' + THEMES[other].label.toLowerCase() + ' mode');
    btn.title = 'Switch to ' + THEMES[other].label.toLowerCase() + ' mode';
    if (metaColor) metaColor.setAttribute('content', THEMES[current()].color);
  }

  function apply(name, remember) {
    root.setAttribute('data-theme', name);
    if (remember) { try { localStorage.setItem(KEY, name); } catch (e) {} }
    paintToggle();
  }

  if (btn) btn.addEventListener('click', function () {
    var next = current() === 'dark' ? 'light' : 'dark';
    if (bg && !reduce) {                       // quick fade so the swap is not a hard cut
      bg.classList.add('is-swapping');
      setTimeout(function () { apply(next, true); bg.classList.remove('is-swapping'); }, 260);
    } else apply(next, true);
  });

  // follow the device setting until the visitor picks one manually
  var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)');
  if (mq && mq.addEventListener) mq.addEventListener('change', function (e) {
    var saved = null; try { saved = localStorage.getItem(KEY); } catch (er) {}
    if (!saved) apply(e.matches ? 'light' : 'dark', false);
  });

  window.MathTheme = { THEMES: THEMES, current: current, apply: apply };
  paintToggle();
})();
