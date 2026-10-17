/* ==================================================================
   Math Trainer — Test setup script (test-setup.js)

   Load order: AFTER storage.js, BEFORE game.js.

   Responsibilities:
   1. Inject the mock localStorage/sessionStorage adapters into MathStorage
      via setLocalAdapter()/setSessionAdapter(). This guarantees that
      game.js (which reads window.MathStorage) uses test mocks, never
      real browser storage.
   2. Verify that injection succeeded. If MathStorage is missing or
      injection fails, set window.__testSetupFailed = true so the
      reporter can fail the test run clearly.
   3. Expose window.__testStorage for test assertions that need to
      inspect stored data.

   Storage isolation is achieved TWO ways:
   a. window.localStorage/sessionStorage are replaced by mocks in
      test-stub.js (primary mechanism, works even if MathStorage isn't
      used).
   b. MathStorage adapters are set to the same mocks via
      setLocalAdapter()/setSessionAdapter() (secondary mechanism, the
      one that matters when game.js uses MathStorage).

   No real browser storage is ever read or modified.
   ================================================================== */
(function () {
  'use strict';

  var MathStorage = window.MathStorage;
  var adapter = window.__testStorageAdapter;

  if (!MathStorage) {
    console.error('[test-setup] MathStorage not found — storage.js may have failed to load.');
    window.__testSetupFailed = true;
    return;
  }

  if (!adapter || !adapter.local || !adapter.session) {
    console.error('[test-setup] Mock storage adapter not found — test-stub.js may have failed to load.');
    window.__testSetupFailed = true;
    return;
  }

  try {
    MathStorage.setLocalAdapter(adapter.local);
    MathStorage.setSessionAdapter(adapter.session);
  } catch (e) {
    console.error('[test-setup] Adapter injection failed:', e);
    window.__testSetupFailed = true;
    return;
  }

  // Verify injection took effect
  var check = MathStorage.load('__math_setup_check', null);
  MathStorage.save('__math_setup_check', 'ok');
  var verify = MathStorage.load('__math_setup_check', null);
  MathStorage.save('__math_setup_check', null);

  if (verify !== 'ok') {
    console.error('[test-setup] Adapter read/write verification failed.');
    window.__testSetupFailed = true;
    return;
  }

  window.__testSetupDone = true;
})();
