/* ==================================================================
   Node.js DOM stub for running Math Trainer tests outside a browser.

   Storage isolation strategy:

   1. All storage access goes through mock adapters injected into
      MathStorage via test-setup.js (runs between storage.js and game.js).
   2. window.localStorage/sessionStorage are also replaced by mocks as
      defense in depth.
   3. No real browser storage is ever read, snapshotted, or modified.
   ================================================================== */
(function () {
  'use strict';

  // ---------- window globals ----------
  // In Chrome, globalThis === window, so globalThis.window = globalThis
  // would do window.window = window which can fail in strict mode if
  // window.window is non-writable. Only assign if window doesn't exist.
  if (typeof window === 'undefined') {
    globalThis.window = globalThis;
  }
  if (typeof window.Event === 'undefined') {
    globalThis.window.Event = function (type, opts) {
      this.type = type;
      this.bubbles = opts && opts.bubbles;
      this.cancelable = opts && opts.cancelable;
      this.preventDefault = function () {};
    };
  }
  if (typeof window.KeyboardEvent === 'undefined') {
    globalThis.window.KeyboardEvent = function (type, opts) {
      this.type = type;
      this.key = opts && opts.key;
      this.code = opts && opts.code;
      this.bubbles = opts && opts.bubbles;
      this.cancelable = opts && opts.cancelable;
      this.preventDefault = function () {};
    };
  }
  globalThis.window.scrollTo = function () {};
  globalThis.window.matchMedia = function () {
    return { matches: false, addEventListener: function () {} };
  };
  globalThis.window.Blob = function () {};
  globalThis.window.URL = {
    createObjectURL: function () { return 'blob:mock'; },
    revokeObjectURL: function () {}
  };
  globalThis.window.FileReader = function () {
    this.onload = null;
    this.result = '';
    this.readAsText = function () {};
  };
  globalThis.performance = { now: function () { return Date.now(); } };

  // ---------- storage mock ----------
  function MockStorage() {
    var store = {};
    return {
      getItem: function (k) { return k in store ? String(store[k]) : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; },
      clear: function () { store = {}; },
      __keys: function () { return Object.keys(store); },
      __get: function (k) { return store[k]; },
      __all: function () { return Object.assign({}, store); },
      __reset: function () { store = {}; },
      length: function () { return Object.keys(store).length; },
      key: function (i) { return Object.keys(store)[i] || null; }
    };
  }

  var localStorageMock = MockStorage();
  var sessionStorageMock = MockStorage();

  // Expose the mocks as injectable adapters for MathStorage.
  // test-setup.js calls MathStorage.setLocalAdapter()/setSessionAdapter()
  // to inject these mocks BEFORE game.js loads. Do not touch native
  // window.localStorage/window.sessionStorage — game.js uses MathStorage
  // adapters exclusively.
  globalThis.window.__testStorageAdapter = {
    local: localStorageMock,
    session: sessionStorageMock
  };

  globalThis.window.__testStorage = {
    local: localStorageMock,
    session: sessionStorageMock
  };

  // ---------- element factory ----------
  var elementsById = {};
  var elementsByClass = {};

  function makeElement(tag) {
    var el = {
      tagName: tag.toUpperCase(),
      children: [],
      className: '',
      textContent: '',
      value: '',
      id: '',
      hidden: false,
      style: {},
      _attrs: {},
      _listeners: {},
      _selected: false,
      get firstChild() { return this.children[0] || null; },

      classList: {
        _classes: [],
        add: function (c) { this._classes.push(c); el.className = this._classes.join(' '); _registerClass(el, c); },
        remove: function (c) { var i = this._classes.indexOf(c); if (i >= 0) this._classes.splice(i, 1); el.className = this._classes.join(' '); },
        toggle: function (c) { var i = this._classes.indexOf(c); if (i >= 0) this._classes.splice(i, 1); else this._classes.push(c); el.className = this._classes.join(' '); },
        contains: function (c) { return this._classes.indexOf(c) >= 0; }
      },

      setAttribute: function (k, v) {
        this._attrs[k] = v;
        if (k === 'id') { elementsById[v] = el; el.id = v; }
        if (k === 'class') { _registerClass(el, v); el.className = v; }
      },
      getAttribute: function (k) { return this._attrs[k]; },
      removeAttribute: function (k) { delete this._attrs[k]; },

      appendChild: function (c) { this.children.push(c); return c; },
      removeChild: function (c) { var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); },

      addEventListener: function (type, listener) {
        if (!this._listeners[type]) this._listeners[type] = [];
        this._listeners[type].push(listener);
      },
      removeEventListener: function (type, listener) {
        if (this._listeners[type]) {
          var i = this._listeners[type].indexOf(listener);
          if (i >= 0) this._listeners[type].splice(i, 1);
        }
      },
      dispatchEvent: function (event) {
        var type = event.type || event;
        var listeners = this._listeners[type] || [];
        listeners.forEach(function (fn) { try { fn(event); } catch (e) { console.error('listener error:', e); } });
        return true;
      },

      focus: function () {},
      scrollIntoView: function () {},
      options: [],
      selectedIndex: -1
    };

    Object.defineProperty(el, 'id', {
      get: function () { return el._attrs.id || ''; },
      set: function (v) { el._attrs.id = v; elementsById[v] = el; }
    });
    Object.defineProperty(el, 'value', {
      get: function () { return el._attrs.value || ''; },
      set: function (v) { el._attrs.value = v; }
    });
    Object.defineProperty(el, 'selected', {
      get: function () { return el._selected; },
      set: function (v) { el._selected = v; }
    });

    return el;

    function _registerClass(el, classStr) {
      var classes = String(classStr).split(/\s+/);
      classes.forEach(function (c) {
        if (c && !elementsByClass[c]) elementsByClass[c] = [];
        if (c && elementsByClass[c].indexOf(el) < 0) elementsByClass[c].push(el);
      });
    }
  }

  // ---------- document ----------
  var documentElement = {
    setAttribute: function (k, v) { this._attrs[k] = v; },
    getAttribute: function (k) { return this._attrs[k]; },
    _attrs: {}
  };

  var bodyEl = {
    appendChild: function (el) { if (el.id) elementsById[el.id] = el; return el; },
    setAttribute: function (k, v) { this._attrs[k] = v; },
    getAttribute: function (k) { return this._attrs[k]; },
    _attrs: {}
  };

  globalThis.document = {
    documentElement: documentElement,
    body: bodyEl,
    createElement: function (tag) { return makeElement(tag); },
    createTextNode: function (t) { return { textContent: t, nodeType: 3 }; },
    createElementNS: function (ns, tag) {
      var el = makeElement(tag);
      el.setAttributeNS = function () {};
      return el;
    },
    getElementById: function (id) { return elementsById[id] || null; },
    querySelector: function (sel) {
      if (sel.startsWith('#')) return elementsById[sel.slice(1)] || null;
      if (sel.startsWith('.')) {
        var cls = sel.slice(1);
        var arr = elementsByClass[cls];
        if (arr && arr.length > 0) return arr[0];
        return elementsById[cls] || null;
      }
      return null;
    },
    querySelectorAll: function () { return []; }
  };
})();
