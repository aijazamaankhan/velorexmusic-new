/* =============================================================================
   Velorex Music — hover sounds for The Machines grid (/music-history)

   Each card can play a short cue suggesting the machine it describes: crackle
   for the gramophone, static for the radio, a mechanical clunk for the
   cassette, a laser whir for the CD, an airy rise for streaming.

   THREE DECISIONS WORTH KNOWING ABOUT

   1. The sounds are SYNTHESISED, not sampled. There is no audio file in the
      repo and nothing to license, which is the same reasoning that keeps this
      section's artwork drawn rather than photographed (history-lib.php).
      A recording of a real gramophone is someone's copyright; an oscillator
      and a noise buffer are not. It is also about 4 KB instead of 400.

   2. It is OFF until the visitor turns it on, and the toggle is in the section
      header where the sounds happen. Sound that starts because a pointer
      crossed something is hostile — on a phone in a quiet room it is worse
      than hostile. The preference is remembered, so nobody has to keep
      switching it back on.

      This also happens to be the only way it CAN work: browsers refuse to
      start audio without a user gesture, and moving a mouse is not one. The
      click on the toggle is the gesture that unlocks the AudioContext.

   3. Nothing here may break the page. Every entry point is wrapped, a missing
      AudioContext just hides the toggle, and no failure path throws.

   Cross-module touch points (resolved at runtime): none. This file is
   self-contained and is safe to delete — the grid works without it.
   ============================================================================= */

    const HistoryAudio = {
      KEY: 'vv_mh_sound',
      ctx: null,
      enabled: false,
      _lastName: '',
      _lastAt: 0,

      // Hover is meaningless on a touch screen, and a control that does
      // nothing is worse than no control. Same guard cursor.js uses.
      supported() {
        try {
          if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return false;
          return !!(window.AudioContext || window.webkitAudioContext);
        } catch (e) { return false; }
      },

      _read() {
        try { return localStorage.getItem(this.KEY) === 'on'; } catch (e) { return false; }
      },
      _write(on) {
        try { localStorage.setItem(this.KEY, on ? 'on' : 'off'); } catch (e) { /* private mode */ }
      },

      // Called after the grid renders. Restores the remembered preference but
      // does NOT create an AudioContext — that waits for the toggle click,
      // because a context created without a gesture starts suspended anyway.
      init() {
        if (!this.supported()) return;
        this.enabled = this._read();
        this.syncButton();
      },

      syncButton() {
        const btn = document.getElementById('mh-sound-toggle');
        if (!btn) return;
        btn.hidden = !this.supported();
        btn.setAttribute('aria-pressed', this.enabled ? 'true' : 'false');
        btn.classList.toggle('is-on', this.enabled);
        const label = this.enabled ? 'Sound on' : 'Sound off';
        const icon = this.enabled ? 'fa-volume-high' : 'fa-volume-xmark';
        btn.innerHTML = '<i class="fas ' + icon + '"></i> ' + label;
        btn.setAttribute('aria-label', this.enabled
          ? 'Hover sounds are on. Turn them off.'
          : 'Hover sounds are off. Turn them on.');
      },

      toggle() {
        if (!this.supported()) return;
        this.enabled = !this.enabled;
        this._write(this.enabled);
        this.syncButton();
        if (this.enabled) {
          this._ensure();
          // Play one cue immediately so turning it on demonstrates what it
          // does, rather than leaving the visitor to guess.
          this.play('vinyl');
        }
      },

      _ensure() {
        if (this.ctx) {
          // Browsers suspend the context when a tab is backgrounded.
          if (this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) {} }
          return this.ctx;
        }
        try {
          const AC = window.AudioContext || window.webkitAudioContext;
          this.ctx = new AC();
        } catch (e) { this.ctx = null; }
        return this.ctx;
      },

      // ---- primitives -------------------------------------------------------
      // Every voice ramps its gain rather than switching it, because a gain
      // that jumps to or from zero is an audible click on every cue.
      _env(gain, at, attack, hold, release, peak) {
        const g = gain.gain;
        g.setValueAtTime(0.0001, at);
        g.exponentialRampToValueAtTime(peak, at + attack);
        g.setValueAtTime(peak, at + attack + hold);
        g.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
      },

      _tone(opts) {
        const ctx = this.ctx;
        if (!ctx) return;
        const at = ctx.currentTime + (opts.delay || 0);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = opts.type || 'sine';
        osc.frequency.setValueAtTime(opts.freq, at);
        if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, at + opts.dur);
        osc.connect(gain).connect(ctx.destination);
        this._env(gain, at, opts.attack || 0.012, opts.hold || 0, opts.release || opts.dur,
                  opts.peak || 0.05);
        osc.start(at);
        osc.stop(at + (opts.attack || 0.012) + (opts.hold || 0) + (opts.release || opts.dur) + 0.05);
      },

      // White noise through a filter. This is what every mechanical and
      // atmospheric sound here is built from — crackle, hiss, static, clunk.
      _noise(opts) {
        const ctx = this.ctx;
        if (!ctx) return;
        const at = ctx.currentTime + (opts.delay || 0);
        const dur = opts.dur || 0.2;
        const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < frames; i++) {
          let v = Math.random() * 2 - 1;
          // "crackle" is sparse impulses rather than a continuous hiss: mostly
          // silence with occasional pops is what a worn record sounds like.
          if (opts.sparse) v = Math.random() < opts.sparse ? v : 0;
          data[i] = v;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;

        const filter = ctx.createBiquadFilter();
        filter.type = opts.filter || 'bandpass';
        filter.frequency.setValueAtTime(opts.freq || 1200, at);
        if (opts.to) filter.frequency.exponentialRampToValueAtTime(opts.to, at + dur);
        filter.Q.value = opts.q || 1;

        const gain = ctx.createGain();
        src.connect(filter).connect(gain).connect(ctx.destination);
        this._env(gain, at, opts.attack || 0.01, opts.hold || dur * 0.4,
                  opts.release || dur * 0.5, opts.peak || 0.04);
        src.start(at);
        src.stop(at + dur + 0.05);
      },

      // ---- the cues ---------------------------------------------------------
      // Keyed by the motif already on each card, so adding an article with a
      // known motif gets a sound with no extra wiring.
      VOICES: {
        cylinder:  function (a) { a._noise({ sparse: 0.05, dur: 0.55, freq: 1700, q: 0.8, peak: 0.05 });
                                  a._tone({ freq: 220, to: 190, dur: 0.5, type: 'sine', peak: 0.025 }); },
        vinyl:     function (a) { a._noise({ sparse: 0.06, dur: 0.6, freq: 2400, q: 0.7, peak: 0.05 });
                                  a._tone({ freq: 110, dur: 0.45, type: 'sine', peak: 0.02 }); },
        turntable: function (a) { a._noise({ sparse: 0.05, dur: 0.5, freq: 2200, q: 0.8, peak: 0.045 });
                                  a._tone({ freq: 60, dur: 0.4, type: 'sine', peak: 0.05 }); },
        radio:     function (a) { a._noise({ dur: 0.5, freq: 900, to: 2600, q: 1.4, filter: 'bandpass', peak: 0.045 });
                                  a._tone({ freq: 1400, to: 700, dur: 0.36, type: 'sine', peak: 0.022 }); },
        reel:      function (a) { a._noise({ dur: 0.6, freq: 3000, q: 0.6, filter: 'highpass', peak: 0.03 });
                                  a._tone({ freq: 150, to: 165, dur: 0.5, type: 'triangle', peak: 0.022 }); },
        cassette:  function (a) { a._noise({ dur: 0.09, freq: 2600, q: 0.9, peak: 0.09, attack: 0.002, release: 0.07 });
                                  a._noise({ delay: 0.1, dur: 0.4, freq: 4200, filter: 'highpass', peak: 0.022 }); },
        minidisc:  function (a) { a._tone({ freq: 900, to: 1700, dur: 0.26, type: 'sine', peak: 0.035 });
                                  a._noise({ delay: 0.22, dur: 0.08, freq: 3000, peak: 0.05, attack: 0.002 }); },
        cd:        function (a) { a._tone({ freq: 2600, to: 5200, dur: 0.3, type: 'sine', peak: 0.028 });
                                  a._noise({ dur: 0.35, freq: 5000, to: 9000, filter: 'highpass', peak: 0.018 }); },
        amp:       function (a) { a._tone({ freq: 50, dur: 0.5, type: 'sawtooth', peak: 0.035 });
                                  a._noise({ dur: 0.06, freq: 1800, peak: 0.05, attack: 0.002, release: 0.05 }); },
        speaker:   function (a) { a._tone({ freq: 90, to: 45, dur: 0.45, type: 'sine', peak: 0.09 }); },
        headphones:function (a) { a._noise({ dur: 0.5, freq: 700, to: 3200, q: 1.1, peak: 0.03 }); },
        stereo:    function (a) { a._tone({ freq: 330, dur: 0.3, type: 'triangle', peak: 0.03 });
                                  a._tone({ delay: 0.12, freq: 494, dur: 0.34, type: 'triangle', peak: 0.028 }); },
        mp3:       function (a) { a._tone({ freq: 1200, dur: 0.09, type: 'square', peak: 0.022 });
                                  a._tone({ delay: 0.11, freq: 1800, dur: 0.12, type: 'square', peak: 0.02 }); },
        ipod:      function (a) { a._noise({ dur: 0.04, freq: 5200, peak: 0.05, attack: 0.001, release: 0.03 });
                                  a._noise({ delay: 0.09, dur: 0.04, freq: 5200, peak: 0.04, attack: 0.001, release: 0.03 });
                                  a._noise({ delay: 0.18, dur: 0.04, freq: 5200, peak: 0.035, attack: 0.001, release: 0.03 }); },
        phone:     function (a) { a._tone({ freq: 880, dur: 0.1, type: 'sine', peak: 0.03 });
                                  a._tone({ delay: 0.1, freq: 1320, dur: 0.22, type: 'sine', peak: 0.028 }); },
        digital:   function (a) { a._tone({ freq: 440, to: 1760, dur: 0.28, type: 'square', peak: 0.018 }); },
        wave:      function (a) { a._tone({ freq: 180, dur: 0.4, type: 'sawtooth', peak: 0.04 });
                                  a._tone({ freq: 184, dur: 0.4, type: 'sawtooth', peak: 0.04 }); },
        stream:    function (a) { a._tone({ freq: 523, to: 1046, dur: 0.45, type: 'sine', peak: 0.028 });
                                  a._noise({ dur: 0.5, freq: 2000, to: 7000, filter: 'highpass', peak: 0.014 }); },
      },

      play(name) {
        if (!this.enabled) return;
        try {
          const now = Date.now();
          // Crossing a card's own padding can fire twice, and sweeping the
          // grid should not stack a dozen voices. One cue per card per 320ms.
          if (name === this._lastName && now - this._lastAt < 320) return;
          this._lastName = name;
          this._lastAt = now;

          const ctx = this._ensure();
          if (!ctx || ctx.state === 'closed') return;
          if (ctx.state === 'suspended') ctx.resume();

          const voice = this.VOICES[name] || this.VOICES.vinyl;
          voice(this);
        } catch (e) {
          // A cue that fails is not worth a broken page, or a console full of
          // noise when a tab is throttled in the background.
        }
      },
    };

    // Delegated, so a re-render of the grid cannot leave a stale listener
    // behind or need re-binding. Bound once per document.
    function historyBindCardSounds() {
      if (document.body.dataset.vlxMhSoundBound) return;
      document.body.dataset.vlxMhSoundBound = '1';
      document.addEventListener('mouseover', function (e) {
        const card = e.target.closest ? e.target.closest('.mh-card[data-sound]') : null;
        if (!card) return;
        // Ignore movement WITHIN a card: only entering it should sound.
        if (e.relatedTarget && card.contains(e.relatedTarget)) return;
        HistoryAudio.play(card.getAttribute('data-sound'));
      });
    }

    function historyToggleSound() { HistoryAudio.toggle(); }
