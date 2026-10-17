/* ==================================================================
   Test DOM stubs

   This file creates all DOM elements that game.js needs on load.
   It does NOT create its own storage mocks — it uses the mocks
   already installed by test-stub.js (which loads first). This
   ensures window.__testStorage retains the assertRealStorageUntouched
   verification method.
   ================================================================== */
(function () {
  'use strict';

  // Storage mocks are already installed by test-stub.js before this file loads.
  // Use them directly:
  var STORAGE = window.__testStorage;

  // ---------- DOM elements ----------
  function el(tag, id) {
    var e = document.createElement(tag);
    if (id) e.id = id;
    document.body.appendChild(e);
    return e;
  }

  // Screen containers
  el('section', 'screen-menu');
  el('section', 'screen-play');
  el('section', 'screen-results');
  el('section', 'screen-tricks');

  // Menu — profile / coach
  el('div', 'profile-strip');
  el('div', 'coach');
  el('p', 'profile-note');

  // Menu — mode / drill / difficulty
  el('div', 'mode-chips');
  el('div', 'drill-panel');
  el('select', 'drill-focus');
  el('p', 'drill-note');
  el('div', 'diff-panel');
  el('div', 'diff-chips');
  el('p', 'diff-note');

  // Menu — tier / penalty / timer
  el('div', 'tier-chips');
  el('div', 'tier-panel');
  el('div', 'penalty-chips');
  el('div', 'penalty-panel');
  el('p', 'penalty-note');
  el('div', 'timer-chips');
  el('div', 'timer-panel');

  // Menu — start / tricks / history
  el('button', 'btn-start');
  el('span', 'start-note');
  el('p', 'trick-summary');
  el('button', 'btn-tricks');
  el('div', 'history');
  el('button', 'btn-export');
  el('input', 'file-import');
  el('span', 'io-note');

  // Play — HUD
  el('div', 'hud-clock-label');
  el('div', 'hud-clock');
  el('div', 'hud-progress');
  el('div', 'hud-points');
  el('div', 'hud-combo');
  el('div', 'hud-lives-wrap');
  el('div', 'hud-lives');

  // Play — arena
  el('div', 'qbar');
  el('div', 'qbar-fill');
  el('div', 'q-tag');
  el('div', 'method');
  el('div', 'question');
  el('input', 'answer');
  el('div', 'feedback');

  // Results
  el('h1', 'res-title');
  el('p', 'res-sub');
  el('div', 'res-tiles');
  el('div', 'res-verdict');
  el('div', 'res-extra');
  el('div', 'res-pace');
  el('div', 'res-skills');
  el('div', 'res-coach-panel');
  el('div', 'res-coach');
  el('button', 'btn-res-drill');
  el('button', 'btn-res-profile');
  el('div', 'res-mistakes-panel');
  el('div', 'res-mistakes');
  el('button', 'btn-again');
  el('button', 'btn-menu');

  // Trick Chamber
  el('div', 'trick-list');
  el('div', 'trick-detail');
  el('button', 'btn-tricks-back');

  // Nav
  el('button', 'nav-topic');
  el('span', 'nav-topic-name');
  el('button', 'nav-home');

  // Coach / profile import/export
  el('button', 'btn-coach-drill');
  el('button', 'btn-profile-export');
  el('input', 'file-profile');

  // Arena click target (className needed for game.js querySelector('.arena'))
  var arenaEl = el('div', 'arena');
  arenaEl.className = 'arena';
})();
