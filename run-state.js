/* ==================================================================
   Math Trainer — Run / session state  (Phase 4b)

   Owns the TEMPORARY run/session state and its lifecycle transitions.
   Everything here is reset between runs and is never persisted.

   Responsibilities:
     • createRun(cfg)   — build a run object from a resolved start config (pure)
     • startRun(cfg)    — install a newly created run as the current state
     • getState()       — return the current run object, or null between runs
     • nextQuestion()   — select the next question for the current run
     • markEnded()      — flag the current run as ended
     • reset()          — clear the current run between runs

   game.js owns: the game clock timer, DOM rendering, input wiring,
   answer resolution (which runs against this state), user prefs, and
   persistence through MathStorage.
   ================================================================== */
(function (root, E) {
  'use strict';

  var state = null;   // the current run object, or null between runs

  /* Build a run object from a fully resolved start configuration.
     Pure: no DOM, no storage, no timer, no game.js rule tables. */
  function createRun(cfg) {
    var trick = cfg.trick || null;
    var count = trick ? cfg.trickPhase.count : (cfg.modeId === 'drill' ? 40 : (cfg.modeId === 'test80' ? 80 : undefined));
    var deck = (cfg.modeId === 'test80') ? E.buildDeck(cfg.tierId, count, cfg.rng) : null;

    return {
      id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts: Date.now(),
      mode: cfg.modeId,
      tier: cfg.tierId,
      penalty: cfg.penaltyId,
      rng: cfg.rng,
      ctx: { recent: [] },
      trick: trick,
      drill: cfg.drill || null,
      factor: cfg.factor,
      count: count,
      deck: deck,
      retry: [],
      timeouts: 0,
      attempts: [],
      points: 0,
      streak: 0,
      bestStreak: 0,
      wrongRow: 0,
      lives: cfg.maxLives,
      maxLives: cfg.maxLives,
      diff: cfg.diffId,
      correct: 0,
      wrong: 0,
      skipped: 0,
      topTierIndex: 0,
      q: null,
      qStart: 0,
      qLimit: 0,
      t0: performance.now(),
      ended: false,
      busy: false
    };
  }

  function currentTierId(s) {
    if (s.mode === 'limitless') return E.limitlessTier(s.correct);
    return s.tier;
  }

  function startRun(cfg) {
    state = createRun(cfg);
    return state;
  }

  function getState() { return state; }

  function markEnded() {
    if (state) state.ended = true;
  }

  function reset() {
    state = null;
  }

  /* Select the next question for the current run.
     Sets state.q / state.qStart / state.qLimit and returns the question.
     Mutates state only; no DOM, no storage. */
  function nextQuestion() {
    var s = state;
    if (!s) return null;
    var q = null;
    if (s.trick) {
      q = E.trickQuestion(s.trick.id, s.rng, s.ctx);
    } else {
      if (s.retry.length && s.attempts.length >= s.retry[0].at) {
        q = E.retryQuestion(s.retry.shift().q, s.rng, s.ctx);
        if (q) q.tag = 'Retry';
      }
      if (!q) {
        if (s.mode === 'drill') q = E.drillQuestion(s.drill.skills, s.drill.weights, s.tier, s.rng, s.ctx);
        else if (s.mode === 'test80') q = E.deckQuestion(s.deck[Math.min(s.attempts.length, s.deck.length - 1)], s.rng, s.ctx);
        else q = E.nextQuestion(currentTierId(s), s.rng, s.ctx);
      }
    }
    s.q = q;
    s.qStart = performance.now();
    s.qLimit = s.factor ? E.strictLimit(q, s.factor) : 0;
    if (q.tier) s.topTierIndex = Math.max(s.topTierIndex, E.TIER_BY_ID[q.tier].index);
    return q;
  }

  root.MathRunState = {
    state: getState,
    getState: getState,
    startRun: startRun,
    markEnded: markEnded,
    reset: reset,
    nextQuestion: nextQuestion
  };
})(typeof window !== 'undefined' ? window : globalThis, window.MathEngine);
