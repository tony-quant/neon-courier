// js/audio.js — sound effects generated with Web Audio. No audio files.
// The AudioContext is created on the first user gesture (browsers require it).
(function () {
  'use strict';
  const KEY = 'platformer.muted';
  const VOLUME = 0.22;
  let ctx = null;
  let master = null;
  let muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) { muted = false; }

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    return ctx;
  }

  function note(freq, start, dur, type, vol, slideTo) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + start;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  const SFX = {
    jump: function () { note(260, 0, 0.14, 'square', 0.5, 620); },
    coin: function () { note(988, 0, 0.07, 'square', 0.45); note(1319, 0.06, 0.12, 'square', 0.45); },
    stomp: function () { note(330, 0, 0.12, 'triangle', 0.8, 90); },
    hurt: function () { note(220, 0, 0.32, 'sawtooth', 0.45, 55); },
    checkpoint: function () { [523, 659, 784].forEach(function (f, i) { note(f, i * 0.08, 0.1, 'square', 0.4); }); },
    win: function () { [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) { note(f, i * 0.11, 0.16, 'square', 0.4); }); },
  };

  function setMuted(v) {
    muted = !!v;
    try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) { /* storage blocked: keep in memory */ }
    if (master) master.gain.value = muted ? 0 : VOLUME;
  }

  window.Sound = {
    play: function (name) {
      const f = SFX[name];
      if (f && !muted) f();
    },
    unlock: function () { ensure(); },
    isMuted: function () { return muted; },
    setMuted: setMuted,
    toggle: function () { setMuted(!muted); return muted; },
  };
})();
