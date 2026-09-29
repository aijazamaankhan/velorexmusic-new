/* =============================================================================
   Velorex Music — Spin & Win game styles (storefront)
   Used by: src/js/storefront/spin-wheel.js (the controller), index.html

   SIX WAYS TO REVEAL ONE RESULT. None of these decides anything: every game
   calls ctx.request(), which POSTs /api/spin-wheel.php, and the server draws
   the prize there (CLAUDE.md §48). A game only animates towards the answer it
   was given. If you add a style, keep it that way — and add it to
   SPIN_GAME_STYLES in api/_spin_helpers.php and to the two text maps.

   Contract. SpinGames.create(style, ctx) returns { mount(stage), auto() }.
     ctx.prizes        live slices from the server: {id,color,label,sub,icon,none}
     ctx.request()     Promise<result|null>. Starts the play ONCE; null = failed
                       (the controller has already said why and will remount).
     ctx.lock()        the visitor has committed; the side button disables.
     ctx.done(result)  the reveal has finished; the controller shows the prize.
     ctx.reduce        prefers-reduced-motion — every game shortens to a fade.

   Honesty rules baked in:
     - Pick-one games (box, record) open ONLY the chosen item. The others fade
       out unopened; they never show "you could have won X", which would be a
       made-up claim — there was only ever one prize.
     - The jackpot shows three DIFFERENT prizes on a loss, never two matching
       and one off. An engineered near-miss is a gambling trick.
   ============================================================================= */

    const SpinFx = {
      wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); },

      // Radial burst of sparks at (x, y) inside `host` (which must be a
      // positioned element). Pure decoration; removed after it plays.
      sparks(host, x, y, n, spread) {
        if (!host || SpinFx.reduced()) return;
        n = n || 18; spread = spread || 110;
        const cols = ['#ffd700', '#ffffff', '#ff5a42', '#ffe9a3'];
        for (let i = 0; i < n; i++) {
          const s = document.createElement('span');
          s.className = 'sg-spark';
          const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
          const d = spread * (0.55 + Math.random() * 0.6);
          s.style.left = x + 'px'; s.style.top = y + 'px';
          s.style.setProperty('--dx', (Math.cos(a) * d).toFixed(1) + 'px');
          s.style.setProperty('--dy', (Math.sin(a) * d).toFixed(1) + 'px');
          s.style.background = cols[i % cols.length];
          s.style.animationDelay = (Math.random() * 0.12).toFixed(2) + 's';
          host.appendChild(s);
          setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 1300);
        }
      },

      reduced() {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      },

      esc(s) { return (typeof Utils !== 'undefined' && Utils.escape) ? Utils.escape(String(s == null ? '' : s)) : String(s); },

      // The face shown on a card, label or box for a result.
      face(ctx, d) {
        const p = ctx.prizes.find(function (x) { return x.id === d.prizeId; });
        if (!d.win) return { big: 'SO CLOSE!', sub: 'Better luck next time', none: true };
        return { big: p ? p.label : (d.title || ''), sub: p ? p.sub : '', none: false };
      },

      polar(r, deg) {
        const a = (deg - 90) * Math.PI / 180;
        return [(r * Math.cos(a)).toFixed(2), (r * Math.sin(a)).toFixed(2)];
      },

      isDark(hex) {
        const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
        if (!m) return true;
        const n = parseInt(m[1], 16);
        const c = [n >> 16, (n >> 8) & 255, n & 255].map(function (v) {
          v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] < 0.12;
      },
    };

    const SpinGames = {
      create(style, ctx) {
        const f = SpinGames[style] && typeof SpinGames[style] === 'function' ? SpinGames[style] : SpinGames.wheel;
        return f(ctx);
      },

      // -------------------------------------------------------------------
      // 1. Wheel
      // -------------------------------------------------------------------
      wheel(ctx) {
        let svg = null, rot = 0, started = false;
        return {
          mount(stage) {
            stage.innerHTML = ''
              + '<div class="sg-wheel">'
              +   '<div class="sg-pointer"></div>'
              +   '<svg class="sg-wheel-svg" viewBox="-200 -200 400 400" aria-hidden="true"></svg>'
              +   '<div class="sg-hub"><img src="/src/img/logo-mark.svg" alt="" width="64" height="64"></div>'
              + '</div>';
            svg = stage.querySelector('svg');
            const P = ctx.prizes, n = P.length, sl = 360 / n, E = SpinFx.esc;
            let h = '<circle r="198" fill="#0d0a14" stroke="#ffd700" stroke-width="4"/>';
            P.forEach(function (p, i) {
              const p0 = SpinFx.polar(186, i * sl), p1 = SpinFx.polar(186, (i + 1) * sl);
              h += '<path d="M0 0 L' + p0[0] + ' ' + p0[1] + ' A186 186 0 ' + (sl > 180 ? 1 : 0) + ' 1 ' + p1[0] + ' ' + p1[1] + ' Z"'
                + ' fill="' + E(p.color) + '" stroke="#0d0a14" stroke-width="2"/>';
              const ink = SpinFx.isDark(p.color) ? '#ffd700' : '#ffffff';
              h += '<g transform="rotate(' + (i * sl + sl / 2) + ')">'
                + '<text y="-128" text-anchor="middle" fill="' + ink + '" font-weight="800" font-size="' + (String(p.label).length > 8 ? 15 : 21) + '">' + E(p.label) + '</text>'
                + '<text y="-104" text-anchor="middle" fill="' + ink + '" opacity=".85" font-weight="600" font-size="13">' + E(p.sub) + '</text></g>';
            });
            for (let r = 70; r < 186; r += 14) h += '<circle r="' + r + '" fill="none" stroke="rgba(0,0,0,.18)"/>';
            for (let i = 0; i < 24; i++) {
              const c = SpinFx.polar(193, i * 15);
              h += '<circle class="sg-bulb" cx="' + c[0] + '" cy="' + c[1] + '" r="3.2" fill="' + (i % 2 ? '#ffd700' : '#ffffff') + '"/>';
            }
            svg.innerHTML = h;
          },
          async auto() {
            if (started) return; started = true;
            ctx.lock();
            const d = await ctx.request();
            if (!d) return;
            const n = ctx.prizes.length, sl = 360 / n;
            let i = ctx.prizes.findIndex(function (p) { return p.id === d.prizeId; });
            if (i < 0) i = 0;
            const target = 360 - (i * sl + sl / 2) + (Math.random() - 0.5) * sl * 0.6;
            rot += 360 * 7 + (((target - rot % 360) % 360) + 360) % 360;
            svg.style.transform = 'rotate(' + rot + 'deg)';
            await SpinFx.wait(ctx.reduce ? 700 : 5300);
            ctx.done(d);
          },
        };
      },

      // -------------------------------------------------------------------
      // 2. Jackpot — rAF physics: wind-up, blur at speed, a long brake,
      //    overshoot and settle, reels landing ~3s, ~5s, ~7s.
      // -------------------------------------------------------------------
      jackpot(ctx) {
        const H = 100, WIN = 150;
        let root = null, started = false;
        const rand = function () { return ctx.prizes[Math.floor(Math.random() * ctx.prizes.length)]; };
        const sym = function (p) {
          return '<div class="sg-sym"><div><i class="fas ' + SpinFx.esc(p.icon || 'fa-star') + '"></i>'
            + '<b>' + SpinFx.esc(p.label) + '</b><small>' + SpinFx.esc(p.sub) + '</small></div></div>';
        };
        const at = function (idx) { return -(idx * H - (WIN - H) / 2); };
        return {
          mount(stage) {
            stage.innerHTML = ''
              + '<div class="sg-slot">'
              +   '<div class="sg-slot-top">VELOREX <span>&#9733;</span> JACKPOT</div>'
              +   '<div class="sg-slot-lights">' + '<i></i>'.repeat(11) + '</div>'
              +   '<div class="sg-reels">' + '<div class="sg-reel"><div class="sg-strip"></div></div>'.repeat(3) + '</div>'
              +   '<div class="sg-lever" aria-hidden="true"></div>'
              + '</div>';
            root = stage.querySelector('.sg-slot');
            root.querySelectorAll('.sg-strip').forEach(function (s) {
              s.innerHTML = [rand(), rand(), rand()].map(sym).join('');
              s.style.transform = 'translateY(' + at(1) + 'px)';
            });
            root.querySelector('.sg-lever').addEventListener('click', () => this.auto());
          },
          async auto() {
            if (started) return; started = true;
            ctx.lock();
            root.querySelector('.sg-lever').classList.add('is-pulled');
            setTimeout(function () { root.querySelector('.sg-lever').classList.remove('is-pulled'); }, 380);
            const d = await ctx.request();
            if (!d) return;
            const prize = ctx.prizes.find(function (p) { return p.id === d.prizeId; }) || ctx.prizes[0];
            let finals;
            if (d.win) finals = [prize, prize, prize];
            else {
              // Three different symbols. Never two matching and one off.
              const pool = ctx.prizes.slice().sort(function () { return Math.random() - 0.5; });
              finals = [pool[0], pool[1 % pool.length], pool[2 % pool.length]];
              if (finals[0].id === finals[1].id && finals[1].id === finals[2].id) finals[2] = prize;
            }
            const stopAt = ctx.reduce ? [400, 550, 700] : [3200, 5000, 7000];
            const strips = Array.prototype.slice.call(root.querySelectorAll('.sg-strip'));
            let landed = 0;
            await new Promise(function (resolve) {
              strips.forEach(function (strip, r) {
                // Top to bottom: [spare, FINAL, ...fillers, START, spare]; the
                // reel travels START → FINAL, so symbols roll DOWNWARD.
                const fillers = Array.from({ length: 22 + r * 12 }, rand);
                const list = [rand(), finals[r]].concat(fillers, [rand(), rand()]);
                strip.innerHTML = list.map(sym).join('');
                const from = at(list.length - 2), to = at(1);
                const WIND = 240, OVER = 14, SETTLE = 420, T = stopAt[r];
                const t0 = performance.now() + r * 90;
                strip.style.transform = 'translateY(' + from + 'px)';
                const frame = function (now) {
                  const t = now - t0;
                  let y, blur = 0;
                  if (t < 0) y = from;
                  else if (t < WIND) y = from - 16 * Math.sin((t / WIND) * Math.PI);
                  else if (t < WIND + T) {
                    const u = (t - WIND) / T, e = 1 - Math.pow(1 - u, 4);
                    y = from + (to + OVER - from) * e;
                    blur = Math.min(3.2, 4 * Math.pow(1 - u, 3) * 1.1);
                  } else if (t < WIND + T + SETTLE) {
                    const u = (t - WIND - T) / SETTLE;
                    y = to + OVER * Math.pow(1 - u, 3);
                  } else {
                    strip.style.transform = 'translateY(' + to + 'px)';
                    strip.style.filter = '';
                    if (root.animate) root.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(3px)' }, { transform: 'translateY(0)' }], { duration: 120 });
                    if (++landed === 3) resolve();
                    return;
                  }
                  strip.style.transform = 'translateY(' + y.toFixed(1) + 'px)';
                  strip.style.filter = blur > 0.2 ? 'blur(' + blur.toFixed(2) + 'px)' : '';
                  requestAnimationFrame(frame);
                };
                requestAnimationFrame(frame);
              });
            });
            if (d.win) {
              root.classList.add('is-win');
              const b = root.getBoundingClientRect();
              SpinFx.sparks(root, b.width / 2, b.height / 2, 26, 160);
            }
            await SpinFx.wait(500);
            ctx.done(d);
          },
        };
      },

      // -------------------------------------------------------------------
      // 3. Scratch card — textured metallic foil, a shine sweep, a coin that
      //    follows the pointer, foil flakes, continuous strokes, a progress
      //    readout, and an auto-scratch for people who would rather not.
      // -------------------------------------------------------------------
      scratch(ctx) {
        let card, canvas, g, under, coin, hint, result = null, pending = null;
        let revealed = false, drawing = false, last = null, moves = 0, autoRunning = false;
        const self = {
          mount(stage) {
            stage.innerHTML = ''
              + '<div class="sg-scratch-wrap">'
              +   '<div class="sg-scratch">'
              +     '<div class="sg-scratch-under"><div class="sg-scratch-wait"><i class="fas fa-compact-disc fa-spin"></i></div></div>'
              +     '<canvas aria-label="Scratch card"></canvas>'
              +     '<div class="sg-shine" aria-hidden="true"></div>'
              +     '<div class="sg-coin" aria-hidden="true">&#8377;</div>'
              +   '</div>'
              +   '<div class="sg-hint">Scratch the gold foil with your finger or mouse</div>'
              + '</div>';
            card = stage.querySelector('.sg-scratch');
            canvas = card.querySelector('canvas');
            under = card.querySelector('.sg-scratch-under');
            coin = card.querySelector('.sg-coin');
            hint = stage.querySelector('.sg-hint');
            requestAnimationFrame(paint);
            canvas.addEventListener('pointerdown', function (e) {
              if (revealed || autoRunning) return;
              ctx.lock(); ensure();
              drawing = true; last = null; card.classList.add('is-scratching');
              try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
              stroke(e);
            });
            canvas.addEventListener('pointermove', function (e) {
              moveCoin(e);
              if (drawing) stroke(e);
            });
            const up = function () { drawing = false; last = null; };
            canvas.addEventListener('pointerup', up);
            canvas.addEventListener('pointercancel', up);
            canvas.addEventListener('pointerleave', function () { coin.classList.remove('is-on'); });
          },
          async auto() {
            if (revealed || autoRunning) return;
            autoRunning = true; ctx.lock();
            const d = await ensure();
            if (!d) return;
            card.classList.add('is-scratching');
            const r = canvas.getBoundingClientRect();
            const pts = [];
            for (let row = 0; row < 7; row++) {
              const y = r.height * (0.1 + row * 0.13);
              pts.push([row % 2 ? r.width * 0.92 : r.width * 0.08, y], [row % 2 ? r.width * 0.08 : r.width * 0.92, y + r.height * 0.06]);
            }
            coin.classList.add('is-on');
            last = null;
            const dur = ctx.reduce ? 200 : 1500, t0 = performance.now();
            await new Promise(function (resolve) {
              const step = function (now) {
                const u = Math.min(1, (now - t0) / dur), f = u * (pts.length - 1);
                const k = Math.floor(f), fr = f - k, a = pts[k], b = pts[Math.min(k + 1, pts.length - 1)];
                const x = a[0] + (b[0] - a[0]) * fr, y = a[1] + (b[1] - a[1]) * fr;
                scratchAt(x, y);
                coin.style.transform = 'translate(' + x + 'px,' + y + 'px) translate(-50%,-50%) rotate(' + (u * 540) + 'deg)';
                if (u < 1) requestAnimationFrame(step); else resolve();
              };
              requestAnimationFrame(step);
            });
            reveal();
          },
        };

        function ensure() {
          if (!pending) {
            pending = ctx.request().then(function (d) {
              if (!d) return null;
              result = d;
              const f = SpinFx.face(ctx, d);
              under.innerHTML = '<div class="sg-face' + (f.none ? ' is-none' : '') + '"><div class="sg-face-big">'
                + SpinFx.esc(f.big) + '</div><div class="sg-face-sub">' + SpinFx.esc(f.sub) + '</div></div>';
              return d;
            });
          }
          return pending;
        }

        function paint() {
          const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
          canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
          g = canvas.getContext('2d');
          g.setTransform(dpr, 0, 0, dpr, 0, 0);
          const W = r.width, Hh = r.height;
          // Brushed-gold base.
          const grad = g.createLinearGradient(0, 0, W, Hh);
          grad.addColorStop(0, '#a97b12'); grad.addColorStop(0.3, '#f6d770');
          grad.addColorStop(0.5, '#fff1b5'); grad.addColorStop(0.7, '#e2b53e'); grad.addColorStop(1, '#8e6509');
          g.fillStyle = grad; g.fillRect(0, 0, W, Hh);
          // Fine brushed lines.
          g.globalAlpha = 0.12; g.strokeStyle = '#fff';
          for (let x = -Hh; x < W; x += 3) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + Hh, Hh); g.stroke(); }
          // Grain.
          for (let i = 0; i < 1600; i++) {
            g.globalAlpha = Math.random() * 0.18;
            g.fillStyle = Math.random() < 0.5 ? '#fff' : '#4a3300';
            g.fillRect(Math.random() * W, Math.random() * Hh, 1.2, 1.2);
          }
          // Faint pattern of notes and rupee signs.
          g.globalAlpha = 0.16; g.fillStyle = '#5c4100'; g.font = '600 15px sans-serif'; g.textAlign = 'center';
          for (let y = 18; y < Hh; y += 30) for (let x = 16 + (y % 60 ? 14 : 0); x < W; x += 34) g.fillText((x + y) % 3 ? '♪' : '₹', x, y);
          // Embossed call to action.
          g.globalAlpha = 1; g.font = '800 20px Poppins, sans-serif';
          g.fillStyle = 'rgba(255,255,255,.65)'; g.fillText('SCRATCH TO REVEAL', W / 2 + 1, Hh / 2 + 8);
          g.fillStyle = 'rgba(74,50,0,.75)'; g.fillText('SCRATCH TO REVEAL', W / 2, Hh / 2 + 7);
          // From here on, drawing ERASES.
          g.globalCompositeOperation = 'destination-out';
          g.fillStyle = '#000'; g.strokeStyle = '#000';
          g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 36;
        }

        function point(e) {
          const r = canvas.getBoundingClientRect();
          return [e.clientX - r.left, e.clientY - r.top];
        }
        function moveCoin(e) {
          if (revealed || autoRunning || !(window.matchMedia && window.matchMedia('(pointer: fine)').matches)) return;
          const p = point(e);
          coin.classList.add('is-on');
          coin.style.transform = 'translate(' + p[0] + 'px,' + p[1] + 'px) translate(-50%,-50%) rotate(-18deg)';
        }
        function stroke(e) { const p = point(e); scratchAt(p[0], p[1]); }
        function scratchAt(x, y) {
          if (!g || revealed) return;
          g.beginPath();
          if (!last) { g.arc(x, y, 18, 0, Math.PI * 2); g.fill(); }
          else { g.moveTo(last[0], last[1]); g.lineTo(x, y); g.stroke(); }
          last = [x, y];
          if (!SpinFx.reduced() && Math.random() < 0.55) flake(x, y);
          if (++moves % 6 === 0) check();
        }
        function flake(x, y) {
          const f = document.createElement('span');
          f.className = 'sg-flake';
          f.style.left = x + 'px'; f.style.top = y + 'px';
          f.style.setProperty('--dx', ((Math.random() - 0.5) * 60).toFixed(0) + 'px');
          f.style.setProperty('--rot', (Math.random() * 360).toFixed(0) + 'deg');
          card.appendChild(f);
          setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 900);
        }
        function cleared() {
          const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
          let c = 0, n = 0;
          for (let i = 3; i < d.length; i += 64) { n++; if (d[i] < 128) c++; }
          return n ? c / n : 0;
        }
        function check() {
          if (!result || revealed || autoRunning) return;
          const pct = cleared();
          if (pct > 0.55) reveal();
          else hint.textContent = 'Keep going… ' + Math.round(pct * 100) + '% scratched';
        }
        async function reveal() {
          if (revealed) return;
          const d = await ensure();
          if (!d) return;
          revealed = true;
          coin.classList.remove('is-on');
          card.classList.add('is-revealed');
          hint.textContent = d.win ? 'You won!' : 'Thanks for playing';
          const b = card.getBoundingClientRect();
          if (d.win) SpinFx.sparks(card, b.width / 2, b.height / 2, 24, 150);
          await SpinFx.wait(ctx.reduce ? 200 : 1000);
          ctx.done(d);
        }
        return self;
      },

      // -------------------------------------------------------------------
      // 4. Mystery box — three bobbing boxes; the chosen one comes forward,
      //    rumbles harder and harder over light rays, and bursts open.
      // -------------------------------------------------------------------
      box(ctx) {
        let root = null, picked = false;
        const self = {
          mount(stage) {
            let h = '<div class="sg-boxes"><div class="sg-rays" aria-hidden="true"></div>';
            for (let i = 0; i < 3; i++) {
              h += '<button type="button" class="sg-gift" style="--i:' + i + '" aria-label="Open gift box ' + (i + 1) + '">'
                + '<span class="sg-gift-in">'
                +   '<span class="sg-gift-beam"></span>'
                +   '<span class="sg-gift-card"></span>'
                +   '<span class="sg-gift-body"></span>'
                +   '<span class="sg-gift-lid"><span class="sg-bow"></span></span>'
                + '</span><span class="sg-gift-shadow"></span></button>';
            }
            stage.innerHTML = h + '</div>';
            root = stage.querySelector('.sg-boxes');
            root.querySelectorAll('.sg-gift').forEach(function (b) { b.addEventListener('click', function () { pick(b); }); });
          },
          auto() {
            const all = root.querySelectorAll('.sg-gift');
            pick(all[Math.floor(Math.random() * all.length)]);
          },
        };
        async function pick(gift) {
          if (picked) return; picked = true;
          ctx.lock();
          const req = ctx.request();
          root.querySelectorAll('.sg-gift').forEach(function (x) { x.disabled = true; if (x !== gift) x.classList.add('is-away'); });
          const rb = root.getBoundingClientRect(), gb = gift.getBoundingClientRect();
          const dx = (rb.left + rb.width / 2) - (gb.left + gb.width / 2);
          gift.classList.add('is-chosen');
          gift.style.transform = 'translate(' + dx.toFixed(1) + 'px, 4%) scale(1.5)';
          await SpinFx.wait(ctx.reduce ? 50 : 650);
          root.querySelector('.sg-rays').classList.add('is-on');
          gift.classList.add('is-rumble');
          const res = await Promise.all([req, SpinFx.wait(ctx.reduce ? 50 : 1600)]);
          const d = res[0];
          if (!d) return;
          const f = SpinFx.face(ctx, d);
          gift.querySelector('.sg-gift-card').innerHTML = '<b>' + SpinFx.esc(f.big) + '</b><small>' + SpinFx.esc(f.sub) + '</small>';
          gift.classList.remove('is-rumble');
          gift.classList.add('is-open');
          if (f.none) gift.classList.add('is-none');
          const nb = gift.getBoundingClientRect(), rr = root.getBoundingClientRect();
          SpinFx.sparks(root, nb.left - rr.left + nb.width / 2, nb.top - rr.top + nb.height * 0.3, d.win ? 26 : 10, 140);
          await SpinFx.wait(ctx.reduce ? 200 : 1300);
          ctx.done(d);
        }
        return self;
      },

      // -------------------------------------------------------------------
      // 5. Pick a record — six sleeves; the chosen record goes onto a
      //    turntable, spins up, the tonearm drops, and it slows to a stop
      //    with the prize reading upright on the label.
      // -------------------------------------------------------------------
      record(ctx) {
        let stageEl = null, picked = false;
        const covers = [
          ['#ed2c15', '#3b0a05', 'Side A'], ['#1f6feb', '#0a1633', 'Encore'], ['#d97706', '#3a1d00', 'Gold'],
          ['#7c3aed', '#1e0b3d', 'Groove'], ['#0f766e', '#04201d', 'Retro'], ['#be185d', '#3a0619', 'Bonus'],
        ];
        const self = {
          mount(stage) {
            stageEl = stage;
            let h = '<div class="sg-records">';
            covers.forEach(function (c, i) {
              h += '<button type="button" class="sg-sleeve" style="--c1:' + c[0] + ';--c2:' + c[1] + ';--i:' + i + '" aria-label="Pick record ' + (i + 1) + '">'
                + '<span class="sg-sleeve-disc"><span></span></span>'
                + '<span class="sg-sleeve-art sg-art-' + (i % 3) + '">'
                +   '<span class="sg-sleeve-brand">VELOREX</span>'
                +   '<span class="sg-sleeve-name">' + c[2] + '</span>'
                + '</span></button>';
            });
            stage.innerHTML = h + '</div>';
            stage.querySelectorAll('.sg-sleeve').forEach(function (b) { b.addEventListener('click', function () { pick(b); }); });
          },
          auto() {
            const all = stageEl.querySelectorAll('.sg-sleeve');
            pick(all[Math.floor(Math.random() * all.length)]);
          },
        };
        async function pick(sleeve) {
          if (picked) return; picked = true;
          ctx.lock();
          const req = ctx.request();
          stageEl.querySelectorAll('.sg-sleeve').forEach(function (x) { x.disabled = true; if (x !== sleeve) x.classList.add('is-away'); });
          sleeve.classList.add('is-out');
          const labelColor = getComputedStyle(sleeve).getPropertyValue('--c1') || '#ed2c15';
          await SpinFx.wait(ctx.reduce ? 50 : 800);

          // The turntable.
          stageEl.innerHTML = ''
            + '<div class="sg-tt">'
            +   '<div class="sg-platter">'
            +     '<div class="sg-vinyl"><div class="sg-vlabel" style="--lc:' + SpinFx.esc(labelColor.trim()) + '">'
            +       '<span class="sg-vlabel-t"><b>VELOREX</b><small>MUSIC</small></span>'
            +     '</div></div>'
            +     '<div class="sg-sheen" aria-hidden="true"></div>'
            +     '<div class="sg-spindle" aria-hidden="true"></div>'
            +   '</div>'
            +   '<div class="sg-arm" aria-hidden="true"><span class="sg-arm-base"></span><span class="sg-arm-rod"></span><span class="sg-arm-head"></span></div>'
            +   '<div class="sg-eq" aria-hidden="true">' + '<i></i>'.repeat(7) + '</div>'
            +   '<div class="sg-tt-led" aria-hidden="true"></div>'
            + '</div>';
          const tt = stageEl.querySelector('.sg-tt'), vinyl = tt.querySelector('.sg-vinyl');
          const label = tt.querySelector('.sg-vlabel-t'), arm = tt.querySelector('.sg-arm'), eq = tt.querySelector('.sg-eq');
          requestAnimationFrame(function () { tt.classList.add('is-in'); });
          await SpinFx.wait(ctx.reduce ? 30 : 250);
          vinyl.classList.add('is-placed');
          const d = (await Promise.all([req, SpinFx.wait(ctx.reduce ? 50 : 800)]))[0];
          if (!d) return;
          const f = SpinFx.face(ctx, d);

          if (ctx.reduce) {
            label.innerHTML = '<b>' + SpinFx.esc(f.big) + '</b><small>' + SpinFx.esc(f.sub) + '</small>';
            tt.classList.add('is-reveal');
            await SpinFx.wait(300);
            ctx.done(d);
            return;
          }

          // Motor: angle in degrees, v in deg/s. 33⅓ rpm is 200 deg/s.
          let angle = 0, v = 0, phase = 'up', t0 = performance.now(), last = t0;
          let a0 = 0, v0 = 200, T = 1, tStop = 0;
          const V = 200;
          label.innerHTML = '<b>' + SpinFx.esc(f.big) + '</b><small>' + SpinFx.esc(f.sub) + '</small>';
          tt.classList.add('is-on');
          const stopped = new Promise(function (resolve) {
            const frame = function (now) {
              const dt = (now - last) / 1000; last = now;
              if (phase === 'up') { v = Math.min(V, v + V * dt / 0.7); angle += v * dt; }
              else if (phase === 'play') { angle += V * dt; v = V; }
              else if (phase === 'down') {
                const t = Math.min(T, (now - tStop) / 1000);
                angle = a0 + v0 * t - (v0 * t * t) / (2 * T);
                v = v0 * (1 - t / T);
                if (t >= T) { vinyl.style.transform = 'rotate(0deg)'; label.style.filter = ''; resolve(); return; }
              }
              vinyl.style.transform = 'rotate(' + (angle % 360).toFixed(2) + 'deg)';
              const blur = Math.max(0, (v / V) * 2.6 - 0.3);
              label.style.filter = blur > 0.15 ? 'blur(' + blur.toFixed(2) + 'px)' : '';
              requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
          });
          await SpinFx.wait(700); phase = 'play';
          arm.classList.add('is-swing');                    // tonearm swings in
          await SpinFx.wait(1250);
          arm.classList.add('is-down'); eq.classList.add('is-live'); tt.classList.add('is-playing');
          await SpinFx.wait(1200);                           // the needle plays
          arm.classList.remove('is-down'); eq.classList.remove('is-live'); tt.classList.remove('is-playing');
          await SpinFx.wait(250);
          arm.classList.remove('is-swing');                 // arm lifts home
          // Brake so the record stops at a whole turn: the label ends upright.
          // The stopping time is clamped so the reveal never drags; the brake
          // starting speed then differs a little from 33 rpm, which at this
          // blur is invisible.
          a0 = angle;
          const af = Math.ceil((a0 + 220) / 360) * 360;
          T = Math.max(1.6, Math.min(2.6, (af - a0) / 100));
          v0 = 2 * (af - a0) / T;
          tStop = performance.now(); phase = 'down';
          await stopped;
          tt.classList.remove('is-on'); tt.classList.add('is-reveal');
          const pb = tt.querySelector('.sg-platter').getBoundingClientRect(), tb = tt.getBoundingClientRect();
          if (d.win) SpinFx.sparks(tt, pb.left - tb.left + pb.width / 2, pb.top - tb.top + pb.height / 2, 24, 150);
          await SpinFx.wait(1100);
          ctx.done(d);
        }
        return self;
      },

      // -------------------------------------------------------------------
      // 6. Lucky envelope — floats with a moving sheen; the wax seal cracks
      //    in two, the flap opens in 3D, the card rises and comes forward.
      // -------------------------------------------------------------------
      envelope(ctx) {
        let env = null, opened = false;
        const self = {
          mount(stage) {
            stage.innerHTML = ''
              + '<div class="sg-env-wrap">'
              +   '<button type="button" class="sg-env" aria-label="Open the envelope">'
              +     '<span class="sg-env-back"></span>'
              +     '<span class="sg-env-card"><span class="sg-env-card-in"><i>VELOREX MUSIC</i><b></b><small></small></span></span>'
              +     '<span class="sg-env-pocket"></span>'
              +     '<span class="sg-env-flap"></span>'
              +     '<span class="sg-env-shine"></span>'
              +     '<span class="sg-env-seal"><span class="sg-seal-half l"></span><span class="sg-seal-half r"></span>'
              +       '<img src="/src/img/logo-mark.svg" alt="" width="40" height="40"></span>'
              +   '</button>'
              +   '<div class="sg-hint">Tap the envelope to break the seal</div>'
              + '</div>';
            env = stage.querySelector('.sg-env');
            env.addEventListener('click', function () { open(); });
          },
          auto() { open(); },
        };
        async function open() {
          if (opened) return; opened = true;
          ctx.lock();
          env.disabled = true;
          const req = ctx.request();
          const wrap = env.parentNode;
          const eb = env.getBoundingClientRect(), wb = wrap.getBoundingClientRect();
          env.classList.add('is-crack');
          SpinFx.sparks(wrap, eb.left - wb.left + eb.width / 2, eb.top - wb.top + eb.height * 0.52, 14, 80);
          await SpinFx.wait(ctx.reduce ? 30 : 380);
          env.classList.add('is-flap');
          await SpinFx.wait(ctx.reduce ? 30 : 620);
          env.classList.add('is-flap-back');
          const d = await req;
          if (!d) return;
          const f = SpinFx.face(ctx, d);
          env.querySelector('.sg-env-card-in b').textContent = f.big;
          env.querySelector('.sg-env-card-in small').textContent = f.sub;
          if (f.none) env.classList.add('is-none');
          env.classList.add('is-rise');
          await SpinFx.wait(ctx.reduce ? 50 : 950);
          env.classList.add('is-front');
          wrap.querySelector('.sg-hint').textContent = d.win ? 'You won!' : 'Thanks for playing';
          if (d.win) SpinFx.sparks(wrap, eb.left - wb.left + eb.width / 2, eb.top - wb.top + eb.height * 0.2, 26, 160);
          await SpinFx.wait(ctx.reduce ? 200 : 1100);
          ctx.done(d);
        }
        return self;
      },
    };
