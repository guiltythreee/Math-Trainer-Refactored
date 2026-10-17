/* ==================================================================
   Test reporter — runs AFTER all test suites have loaded.

   Loaded last with `defer`, so it executes after:
   test-stub.js, test-dom.js, storage.js, test-setup.js, engine.js,
   run-state.js, game.js, test-engine.js, test-game.js, test-gameplay.js,
   test-storage.js, test-run-state.js.

   Responsibilities:
   1. Detect which suites started vs. crashed/timed out using per-suite
      flags (__testSuiteStarted_engine, _game, _gameplay, _storage).
   2. Check that test-setup.js succeeded (mock adapters injected before
      game.js). If setup failed, storage isolation is compromised and
      the test run must fail.
   3. Enforce a 10-second timeout; any incomplete suite = overall failure.
   4. Render pass/fail results in the page.
   ================================================================== */
(function () {
  'use strict';

  var summary = document.getElementById('summary');
  var suitesBox = document.getElementById('suites');
  var coverageBox = document.getElementById('coverage');
  var tbody = document.getElementById('results');

  var expectedSuites = ['engine', 'game', 'gameplay', 'storage', 'runstate', 'xpstate', 'ui', 'coachstate'];
  var doneFlags = {
    engine: '__testEngineDone',
    game: '__testGameDone',
    gameplay: '__testGameplayDone',
    storage: '__testStorageDone',
    runstate: '__testRunStateDone',
    xpstate: '__testXpStateDone',
    ui: '__testUiDone',
    coachstate: '__testCoachStateDone'
  };
  var startedFlags = {
    engine: '__testSuiteStarted_engine',
    game: '__testSuiteStarted_game',
    gameplay: '__testSuiteStarted_gameplay',
    storage: '__testSuiteStarted_storage',
    runstate: '__testSuiteStarted_runstate',
    xpstate: '__testSuiteStarted_xpstate',
    ui: '__testSuiteStarted_ui',
    coachstate: '__testSuiteStarted_coachstate'
  };
  var suiteComplete = { engine: false, game: false, gameplay: false, storage: false, runstate: false, xpstate: false, ui: false, coachstate: false };
  var suiteError = { engine: null, game: null, gameplay: null, storage: null, runstate: null, xpstate: null, ui: null, coachstate: null };
  var timeoutMs = 10000;
  var startTime = Date.now();
  var globalFailure = false;

  // ---------- 1. Check test-setup.js succeeded ----------
  // test-setup.js runs between storage.js and game.js and injects the
  // mock storage adapter into MathStorage. If it failed, storage
  // isolation is compromised and the test run must fail.
  if (typeof window.__testSetupFailed !== 'undefined' && window.__testSetupFailed === true) {
    globalFailure = true;
  }
  var setupDone = typeof window.__testSetupDone !== 'undefined' &&
                  window.__testSetupDone === true;

  // ---------- suite DOM boxes ----------
  function createSuiteDiv(name) {
    var div = document.createElement('div');
    div.className = 'suite-box';
    div.id = 'suite-' + name;
    var h2 = document.createElement('h2');
    h2.textContent = name;
    var p = document.createElement('p');
    p.textContent = 'Waiting…';
    div.appendChild(h2);
    div.appendChild(p);
    suitesBox.appendChild(div);
    return div;
  }

  var suiteDivs = {};
  expectedSuites.forEach(function (name) {
    suiteDivs[name] = createSuiteDiv(name);
  });

  function updateSuite(name, status, detail) {
    var div = suiteDivs[name];
    if (!div) return;
    var p = div.querySelector('p');
    p.textContent = detail || status;
    div.className = 'suite-box ' + status;
  }

  function allSuitesResolved() {
    return expectedSuites.every(function (name) {
      return suiteComplete[name] || suiteError[name] !== null;
    });
  }

  // ---------- 2. Crash detection using per-suite flags ----------
  function checkCrashes() {
    expectedSuites.forEach(function (name) {
      var started = typeof window[startedFlags[name]] !== 'undefined' &&
                    window[startedFlags[name]] === true;
      if (!started && !suiteComplete[name] && !suiteError[name]) {
        suiteError[name] = 'Suite did not execute (script may have failed to load)';
        suiteComplete[name] = true;
        updateSuite(name, 'fail', 'Did not execute');
        globalFailure = true;
      }
    });
  }

  // ---------- render ----------
  function render() {
    var now = Date.now();
    var elapsed = now - startTime;

    // Check completion flags (set by each test suite when it finishes)
    expectedSuites.forEach(function (name) {
      if (!suiteComplete[name] && typeof window[doneFlags[name]] !== 'undefined') {
        suiteComplete[name] = true;
        updateSuite(name, 'done', 'Completed');
      }
    });

    // Check for timeout
    if (!allSuitesResolved() && elapsed >= timeoutMs) {
      expectedSuites.forEach(function (name) {
        if (!suiteComplete[name]) {
          suiteError[name] = 'Timeout after ' + timeoutMs + 'ms';
          suiteComplete[name] = true;
          updateSuite(name, 'stuck', 'Not completed within ' + timeoutMs + 'ms');
          globalFailure = true;
        }
      });
    }

    // Check for crashes (suites that never started)
    checkCrashes();

    // If everything resolved (or timed out), render final results
    if (allSuitesResolved()) {
      var T = window.Test;
      var pass = T ? T.passed() : 0;
      var fail = T ? T.failed() : 0;
      var total = pass + fail;

      var overallFail = globalFailure || fail > 0 || !setupDone;
      summary.textContent = 'Tests: ' + pass + ' passed, ' + fail + ' failed out of ' + total;
      if (globalFailure) {
        summary.textContent += ' · 1+ suite(s) did not complete';
      }
      if (!setupDone) {
        summary.textContent += ' · test setup failed (storage adapter not injected)';
      }
      summary.className = overallFail ? 'fail' : 'pass';

      // Build suite summary boxes
      expectedSuites.forEach(function (name) {
        var div = suiteDivs[name];
        var p = div.querySelector('p');
        if (suiteError[name]) {
          p.textContent = suiteError[name];
          div.className = 'suite-box fail';
        } else {
          p.textContent = 'Completed';
          div.className = 'suite-box done';
        }
      });

      // Coverage note
      coverageBox.textContent = 'Coverage: unit tests (engine config, scoring, mastery conditions) + ' +
        'E2E tests (complete drill sessions, mixed answers, skip/escape/penalty flows) + ' +
        'storage layer tests (keys, limits, load/save, validation). ' +
        'Storage isolation via MathStorage mock adapter injection (test-setup.js, runs before game.js).';

      // Render results table
      if (T && T.results) {
        T.results.forEach(function (res) {
          var tr = document.createElement('tr');
          tr.className = res.status.toLowerCase();
          var tdStatus = document.createElement('td');
          tdStatus.textContent = res.status;
          var tdMsg = document.createElement('td');
          tdMsg.textContent = res.message;
          tr.appendChild(tdStatus);
          tr.appendChild(tdMsg);
          tbody.appendChild(tr);
        });
      }
      return;
    }

    // Not all done yet — poll again
    if (elapsed < timeoutMs) {
      setTimeout(render, 100);
    } else {
      render(); // force final render with timeout
    }
  }

  render();
})();
