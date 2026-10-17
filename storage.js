/* ==================================================================
   Math Trainer — Storage layer (storage.js)

   Isolates all browser storage access behind a clean interface.
   game.js no longer touches localStorage/sessionStorage directly.

   Design goals:
   - Preserve existing storage keys and data formats exactly.
   - Fail silently on storage errors (quota, disabled, private mode),
     matching the original behaviour. Errors are NOT exposed to the
     application — load() returns the fallback, save() returns false.
   - Provide import/export validation helpers.
   - Support an injectable storage adapter so tests (and future cloud
     sync) can provide their own storage without touching window.localStorage.

   Load order: storage.js must be loaded BEFORE game.js.
   ================================================================== */
(function (root) {
  'use strict';

  var STORAGE_PREFIX = 'limitless.math.v1';

  var KEYS = {
    runs:    STORAGE_PREFIX + '.runs',
    att:     STORAGE_PREFIX + '.attempts',
    prefs:   STORAGE_PREFIX + '.prefs',
    meta:    STORAGE_PREFIX + '.meta',
    profile: STORAGE_PREFIX + '.profile',
    topic:   STORAGE_PREFIX + '.topic'   // sessionStorage only
  };

  var LIMITS = {
    MAX_RUNS:     500,
    MAX_ATTEMPTS: 5000,
    SKILL_WINDOW: 60
  };

  // ---------- storage adapter ----------
  // An adapter is an object with: getItem(key), setItem(key, value),
  // removeItem(key), length, key(index).
  // Default adapter wraps window.localStorage / window.sessionStorage.
  // Tests and future cloud sync can inject a different adapter via setAdapter().
  var _localAdapter = null;
  var _sessionAdapter = null;

  function _defaultLocal() {
    return typeof window !== 'undefined' ? window.localStorage : null;
  }
  function _defaultSession() {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  }

  function _local() { return _localAdapter || _defaultLocal(); }
  function _session() { return _sessionAdapter || _defaultSession(); }

  /**
   * Inject a custom storage adapter for localStorage operations.
   * Useful for tests and future cloud synchronization.
   * @param {Object} adapter - object with getItem/setItem/removeItem/length/key
   */
  function setLocalAdapter(adapter) {
    _localAdapter = adapter;
  }

  /**
   * Inject a custom storage adapter for sessionStorage operations.
   * @param {Object} adapter - object with getItem/setItem/removeItem/length/key
   */
  function setSessionAdapter(adapter) {
    _sessionAdapter = adapter;
  }

  // ---------- low-level storage access ----------
  function load(key, fallback) {
    try {
      var s = _local().getItem(key);
      return s ? JSON.parse(s) : fallback;
    } catch (e) {
      /* Storage may be disabled, in private mode, or over quota.
         Fail silently: return the fallback so the app keeps working. */
      return fallback;
    }
  }

  function save(key, val) {
    try {
      _local().setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      /* Storage may be disabled, in private mode, or over quota.
         Fail silently: return false. The app continues without saving. */
      return false;
    }
  }

  function loadTopic() {
    try {
      var s = _session().getItem(KEYS.topic);
      return s || null;
    } catch (e) {
      return null;
    }
  }

  function saveTopic(id) {
    try {
      _session().setItem(KEYS.topic, id || '');
    } catch (e) {}
  }

  // ---------- import / export validation ----------
  function isValidProgressFile(data) {
    return data &&
      data.app === 'limitless-math' &&
      Array.isArray(data.runs) &&
      Array.isArray(data.attempts);
  }

  function isValidProfileFile(data) {
    return data &&
      data.app === 'limitless-math-profile' &&
      typeof data.skills === 'object';
  }

  // ---------- storage health ----------
  function isAvailable() {
    try {
      _local().setItem('__math_storage_test', '1');
      _local().removeItem('__math_storage_test');
      return true;
    } catch (e) {
      return false;
    }
  }

  var api = {
    KEYS: KEYS,
    LIMITS: LIMITS,
    load: load,
    save: save,
    loadTopic: loadTopic,
    saveTopic: saveTopic,
    setLocalAdapter: setLocalAdapter,
    setSessionAdapter: setSessionAdapter,
    isValidProgressFile: isValidProgressFile,
    isValidProfileFile: isValidProfileFile,
    isAvailable: isAvailable
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MathStorage = api;
})(typeof window !== 'undefined' ? window : globalThis);
