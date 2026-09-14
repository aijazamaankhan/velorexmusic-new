/* =============================================================================
   Velorex Music — The Evolution of Music & Audio (storefront)
   Routes: /music-history  and  /music-history/<slug>

   This is an INDEPENDENT educational section. Nothing described here was made
   by Velorex, and no copy should ever imply otherwise — see the guard in
   src/history/history-lib.php.

   Content comes from /api/music-history.php, which reads the same PHP library
   seo-render.php renders from. So a crawler that never runs JavaScript and a
   visitor who does are looking at the same words; the SPA replaces the
   server-rendered block in place rather than fetching different content.

   Era art is drawn in CSS/SVG (see historyMotif). Historical product
   photography is almost always someone else's copyright and museum scans carry
   credit requirements this codebase has no field for, so a drawn motif is the
   honest option — it does not pretend to be a photograph of anything.

   Cross-module touch points (resolved at runtime):
     - API_BASE, Utils.escape, Seo, navigate, currentParams, updateBreadcrumbs
   ============================================================================= */

    const MusicHistory = {
      index: null,          // { eras, cards }
      articles: {},         // slug -> article, cached per page load
      activeEra: null,      // era key currently selected on the hub

      // ---- data ------------------------------------------------------------
      async loadIndex() {
        if (this.index) return this.index;
        const res = await fetch(API_BASE + '/music-history.php');
        const data = await res.json();
        if (!data || !data.ok) throw new Error('Could not load the timeline');
        this.index = { eras: data.eras || [], cards: data.cards || [], titles: data.titles || {} };
        return this.index;
      },

      async loadArticle(slug) {
        if (this.articles[slug]) return this.articles[slug];
        const res = await fetch(API_BASE + '/music-history.php?slug=' + encodeURIComponent(slug));
        if (res.status === 404) return null;
        const data = await res.json();
        if (!data || !data.ok || !data.article) return null;
        this.articles[slug] = data.article;
        return data.article;
      },
    };

    /* ---------------------------------------------------------------------------
       Motifs — small inline SVGs standing in for each era and topic.

       Deliberately simple and monochrome, tinted by CSS with currentColor, so
       one drawing works on the dark hub, the light-theme hub and inside a card
       without three sets of assets. They are illustrations and read as such.
       --------------------------------------------------------------------------- */
    function historyMotif(name) {
      const open = '<svg class="mh-motif" viewBox="0 0 64 64" role="img" aria-hidden="true" focusable="false">';
      const M = {
        cylinder: '<rect x="14" y="18" width="30" height="28" rx="4"/><path d="M20 18v28M26 18v28M32 18v28M38 18v28" class="mh-line"/><path d="M44 24h8M48 20v8" class="mh-line"/>',
        radio:    '<rect x="8" y="20" width="48" height="30" rx="5"/><circle cx="22" cy="35" r="8" class="mh-hole"/><path d="M40 28h10M40 35h10M40 42h10" class="mh-line"/><path d="M46 20V8" class="mh-line"/>',
        vinyl:    '<circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="13" class="mh-line"/><circle cx="32" cy="32" r="7" class="mh-line"/><circle cx="32" cy="32" r="2.5" class="mh-hole"/>',
        turntable:'<rect x="6" y="16" width="52" height="34" rx="5"/><circle cx="27" cy="33" r="13" class="mh-line"/><circle cx="27" cy="33" r="2" class="mh-hole"/><path d="M50 21v16l-8 6" class="mh-line"/>',
        reel:     '<circle cx="21" cy="32" r="13"/><circle cx="21" cy="32" r="4" class="mh-hole"/><circle cx="47" cy="32" r="9" class="mh-line"/><circle cx="47" cy="32" r="3" class="mh-hole"/><path d="M21 45h26" class="mh-line"/>',
        cassette: '<rect x="6" y="18" width="52" height="30" rx="5"/><circle cx="24" cy="32" r="6" class="mh-hole"/><circle cx="40" cy="32" r="6" class="mh-hole"/><path d="M16 44h32" class="mh-line"/>',
        stereo:   '<rect x="6" y="14" width="22" height="38" rx="3"/><circle cx="17" cy="26" r="6" class="mh-line"/><circle cx="17" cy="42" r="4" class="mh-line"/><rect x="34" y="14" width="24" height="16" rx="3" class="mh-line"/><rect x="34" y="36" width="24" height="16" rx="3" class="mh-line"/>',
        amp:      '<rect x="6" y="20" width="52" height="26" rx="5"/><circle cx="18" cy="33" r="6" class="mh-line"/><circle cx="34" cy="33" r="6" class="mh-line"/><path d="M46 27v12M52 27v12" class="mh-line"/>',
        speaker:  '<rect x="16" y="8" width="32" height="48" rx="5"/><circle cx="32" cy="38" r="10" class="mh-line"/><circle cx="32" cy="38" r="3" class="mh-hole"/><circle cx="32" cy="19" r="5" class="mh-line"/>',
        cd:       '<circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="8" class="mh-hole"/><path d="M32 10a22 22 0 0 1 19 11" class="mh-line"/>',
        mp3:      '<rect x="18" y="8" width="28" height="48" rx="6"/><rect x="23" y="15" width="18" height="14" rx="2" class="mh-line"/><circle cx="32" cy="42" r="7" class="mh-line"/>',
        ipod:     '<rect x="18" y="6" width="28" height="52" rx="7"/><rect x="23" y="12" width="18" height="16" rx="2" class="mh-line"/><circle cx="32" cy="42" r="9" class="mh-line"/><circle cx="32" cy="42" r="3" class="mh-hole"/>',
        headphones:'<path d="M12 38V32a20 20 0 0 1 40 0v6" class="mh-line"/><rect x="6" y="34" width="12" height="18" rx="5"/><rect x="46" y="34" width="12" height="18" rx="5"/>',
        digital:  '<path d="M8 40h8v-12h8v20h8V22h8v18h8V30h8" class="mh-line"/>',
        minidisc: '<rect x="10" y="12" width="44" height="40" rx="5"/><rect x="16" y="18" width="13" height="15" rx="2" class="mh-line"/><circle cx="39" cy="36" r="9" class="mh-line"/><circle cx="39" cy="36" r="3" class="mh-hole"/>',
        phone:    '<rect x="18" y="6" width="28" height="52" rx="6"/><path d="M27 14h10" class="mh-line"/><path d="M27 42a9 9 0 0 1 9-9" class="mh-line"/><path d="M25 49a16 16 0 0 1 16-16" class="mh-line"/>',
        wave:     '<path d="M7 32h4M15 21v22M23 13v38M31 19v26M39 9v46M47 23v18M55 32h4" class="mh-line"/>',
        stream:   '<circle cx="32" cy="46" r="6"/><path d="M20 36a17 17 0 0 1 24 0" class="mh-line"/><path d="M13 27a27 27 0 0 1 38 0" class="mh-line"/>',
      };
      return open + (M[name] || M.vinyl) + '</svg>';
    }

    // The hero collage and the nostalgia mosaic are static markup carrying
    // data-motif attributes, so a crawler sees the copy without needing the
    // drawings. This fills them in once the script runs. Idempotent — a filled
    // slot is skipped, so calling it on every navigation costs nothing.
    function historyFillMotifs(root) {
      (root || document).querySelectorAll('[data-motif]').forEach(function (el) {
        if (el.firstElementChild) return;
        el.innerHTML = historyMotif(el.getAttribute('data-motif'));
      });
    }

    /* ---------------------------------------------------------------------------
       HUB — /music-history
       --------------------------------------------------------------------------- */
    async function initPageMusicHistory() {
      const host = document.getElementById('music-history-body');
      if (!host) return;

      let data;
      try {
        data = await MusicHistory.loadIndex();
      } catch (e) {
        // The server-rendered markup is already on the page for a crawler and
        // for a first paint. Leaving it alone is a better failure than
        // replacing it with an error.
        console.warn('music history index failed:', e);
        return;
      }

      // Deep-link support: /music-history?era=cassette-arrives selects an era.
      const wanted = (typeof currentParams !== 'undefined' && currentParams.era) ? String(currentParams.era) : '';
      const found = data.eras.find(function (e) { return e.key === wanted; });
      MusicHistory.activeEra = found ? found.key : data.eras[0].key;

      host.innerHTML = historyTimelineHtml(data.eras) + historyCardsHtml(data.cards);
      historyRenderEra();
      historyFillMotifs(document.getElementById('page-music-history'));
      historyBindRail();
      // Sound is opt-in and remembered; init() only restores the toggle state
      // and never creates an AudioContext (see the header of the audio file).
      try { HistoryAudio.init(); historyBindCardSounds(); } catch (e) {}
      // On the next frame, because historyBindRail() adds .has-overflow, which
      // reserves the arrow gutters and therefore changes the track width the
      // reveal measures against. Instant, not smooth: this is first paint, and
      // animating the rail from 1877 to the linked era looks like a glitch
      // rather than a transition.
      if (MusicHistory.activeEra !== data.eras[0].key) {
        requestAnimationFrame(function () { historyRailReveal(true); });
      }
      try { updateBreadcrumbs('music-history', {}); } catch (e) {}
    }

    function historyTimelineHtml(eras) {
      // The rail is one horizontally scrollable strip at every width. On a
      // phone it simply becomes a swipe — which keeps ONE implementation
      // rather than a desktop timeline and a separate mobile list that would
      // drift apart.
      const rail = eras.map(function (e) {
        return '<button type="button" class="mh-era-btn" data-era="' + Utils.escape(e.key) + '"'
          + ' onclick="historySelectEra(\'' + Utils.escape(e.key) + '\')">'
          + '<span class="mh-era-years">' + Utils.escape(e.years) + '</span>'
          + '<span class="mh-era-label">' + Utils.escape(e.label) + '</span>'
          + '</button>';
      }).join('');

      return ''
        + '<section class="mh-timeline" id="mh-timeline" aria-label="Timeline of audio eras">'
        +   '<div class="mh-section-head">'
        +     '<h2 class="mh-h2">The <span>Timeline</span></h2>'
        +     '<p class="mh-sub">Every moment where the way people listened changed shape. Pick one.</p>'
        +   '</div>'
        +   '<div class="mh-rail-wrap">'
        +     '<button type="button" class="mh-rail-nav mh-rail-prev" aria-label="Earlier eras"'
        +       ' onclick="historyRailScroll(-1)"><i class="fas fa-chevron-left"></i></button>'
        +     '<div class="mh-rail" role="tablist">' + rail + '</div>'
        +     '<button type="button" class="mh-rail-nav mh-rail-next" aria-label="Later eras"'
        +       ' onclick="historyRailScroll(1)"><i class="fas fa-chevron-right"></i></button>'
        +   '</div>'
        +   '<div class="mh-era-panel" id="mh-era-panel" role="tabpanel" aria-live="polite"></div>'
        + '</section>';
    }

    /* ---- Rail navigation --------------------------------------------------
       The rail hides its scrollbar, so without these the only way past the
       sixth era is a trackpad swipe. bindRail() is idempotent: it flags the
       element it bound, because initPageMusicHistory() can run more than once
       and stacked listeners would scroll several times per click.
       --------------------------------------------------------------------- */
    function historyRail() { return document.querySelector('.mh-rail'); }

    function historyRailScroll(dir) {
      const rail = historyRail();
      if (!rail) return;
      // Page by most of a screenful, keeping one button visible for context.
      const step = Math.max(160, rail.clientWidth * 0.8);
      rail.scrollBy({ left: dir * step, behavior: 'smooth' });
    }

    // Arrows are hidden when there is nothing that way, so they never invite a
    // click that does nothing.
    function historyRailSync() {
      const rail = historyRail();
      if (!rail) return;
      const wrap = rail.parentElement;
      const max = rail.scrollWidth - rail.clientWidth;
      const x = rail.scrollLeft;
      const overflows = max > 4;
      wrap.classList.toggle('has-overflow', overflows);
      wrap.classList.toggle('at-start', !overflows || x <= 4);
      wrap.classList.toggle('at-end', !overflows || x >= max - 4);
    }

    function historyBindRail() {
      const rail = historyRail();
      if (!rail || rail.dataset.vlxRailBound) return;
      rail.dataset.vlxRailBound = '1';

      rail.addEventListener('scroll', historyRailSync, { passive: true });
      window.addEventListener('resize', historyRailSync);

      // A vertical wheel over a horizontal strip should move it sideways —
      // otherwise a mouse user has no gesture at all. Only claim the event
      // when the rail can actually move that way, so the page still scrolls
      // normally at either end.
      rail.addEventListener('wheel', function (e) {
        if (e.ctrlKey) return;                       // leave zoom alone
        const dominant = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
        if (!dominant) return;
        const max = rail.scrollWidth - rail.clientWidth;
        if (max <= 4) return;
        const next = rail.scrollLeft + dominant;
        if (next < 0 || next > max) return;          // let the page take over
        e.preventDefault();
        rail.scrollLeft = next;
      }, { passive: false });

      historyRailSync();
    }

    // Bring the selected era fully into view, centred where there is room.
    //
    // Deliberately NOT scrollIntoView(): that also scrolls every scrollable
    // ancestor including the window, so selecting a late era jumped the page
    // vertically, and its 'inline: center' + 'block: nearest' combination
    // refused to move the rail at all on a fresh deep link. Centring a known
    // offset in a known width is exact, and touches nothing else.
    function historyRailReveal(instant) {
      const rail = historyRail();
      const btn = rail && rail.querySelector('.mh-era-btn.is-active');
      if (!rail || !btn) return;

      const max = rail.scrollWidth - rail.clientWidth;
      if (max <= 0) { historyRailSync(); return; }

      let target = btn.offsetLeft - (rail.clientWidth - btn.offsetWidth) / 2;
      target = Math.max(0, Math.min(target, max));

      // A move of a few pixels is not worth animating, and at the ends the
      // clamp usually produces exactly that.
      if (Math.abs(target - rail.scrollLeft) < 2) { historyRailSync(); return; }

      if (instant || !rail.scrollTo) {
        rail.scrollLeft = target;
      } else {
        rail.scrollTo({ left: target, behavior: 'smooth' });
      }
      historyRailSync();
    }

    // Clicking an era updates content in place and records it in the URL, so
    // the back button steps through eras and a link can be shared.
    function historySelectEra(key) {
      MusicHistory.activeEra = key;
      historyRenderEra();
      // Pull the chosen era into view. Picking the last one from a button that
      // is half off the edge and having it stay half off the edge is the whole
      // reason this exists.
      historyRailReveal(false);
      try {
        const url = '/music-history?era=' + encodeURIComponent(key);
        window.history.replaceState({ page: 'music-history', params: { era: key } }, '', url);
      } catch (e) {}
    }

    function historyRenderEra() {
      const data = MusicHistory.index;
      if (!data) return;
      const era = data.eras.find(function (e) { return e.key === MusicHistory.activeEra; }) || data.eras[0];
      if (!era) return;

      document.querySelectorAll('.mh-era-btn').forEach(function (b) {
        const on = b.getAttribute('data-era') === era.key;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });

      const points = (era.points || []).map(function (p) {
        return '<li>' + Utils.escape(p) + '</li>';
      }).join('');

      // titles covers every article; cards covers only the twelve with a hub
      // tile. An era can link to one without a card (vinyl, mp3), and reading
      // the name off the card list alone printed the raw slug here while the
      // server had rendered the real title.
      const links = (era.articles || []).map(function (slug) {
        const title = (data.titles && data.titles[slug]) || slug;
        return '<a class="mh-era-link" href="/music-history/' + Utils.escape(slug) + '"'
          + ' onclick="navigate(\'music-history-article\',{slug:\'' + Utils.escape(slug) + '\'});return false;">'
          + Utils.escape(title) + ' <i class="fas fa-arrow-right"></i></a>';
      }).join('');

      const panel = document.getElementById('mh-era-panel');
      if (!panel) return;
      panel.innerHTML = ''
        + '<div class="mh-era-art">' + historyMotif(era.motif) + '</div>'
        + '<div class="mh-era-copy">'
        +   '<span class="mh-era-kicker">' + Utils.escape(era.years) + '</span>'
        +   '<h3 class="mh-era-title">' + Utils.escape(era.label) + '</h3>'
        +   '<p class="mh-era-blurb">' + Utils.escape(era.blurb) + '</p>'
        +   '<p class="mh-era-detail">' + Utils.escape(era.detail) + '</p>'
        +   (points ? '<ul class="mh-era-points">' + points + '</ul>' : '')
        +   (links ? '<div class="mh-era-links">' + links + '</div>' : '')
        + '</div>';
    }

    function historyCardsHtml(cards) {
      const grid = cards.map(function (c) {
        return '<a class="mh-card" href="/music-history/' + Utils.escape(c.slug) + '"'
          + ' data-sound="' + Utils.escape(c.motif || 'vinyl') + '"'
          + ' onclick="navigate(\'music-history-article\',{slug:\'' + Utils.escape(c.slug) + '\'});return false;">'
          + '<span class="mh-card-art">' + historyMotif(c.motif) + '</span>'
          + '<span class="mh-card-kicker">' + Utils.escape(c.kicker) + '</span>'
          + '<span class="mh-card-title">' + Utils.escape(c.title) + '</span>'
          + '<span class="mh-card-years">' + Utils.escape(c.years) + '</span>'
          + '<span class="mh-card-blurb">' + Utils.escape(c.blurb) + '</span>'
          + '<span class="mh-card-go">Read <i class="fas fa-arrow-right"></i></span>'
          + '</a>';
      }).join('');

      return ''
        + '<section class="mh-cards-section" id="mh-topics">'
        +   '<div class="mh-section-head mh-section-head-row">'
        +     '<div>'
        +     '<h2 class="mh-h2">The <span>Machines</span></h2>'
        +     '<p class="mh-sub">Every machine and format in the story, with how it worked, '
        +       'why it mattered and what replaced it.</p>'
        +     '</div>'
        // Rendered here and NOT by seo-render.php: without a script it would
        // be a control that does nothing. It also starts hidden and is
        // revealed only where hover and Web Audio both exist.
        +     '<button type="button" id="mh-sound-toggle" class="mh-sound-toggle" hidden'
        +       ' aria-pressed="false" onclick="historyToggleSound()"></button>'
        +   '</div>'
        +   '<div class="mh-cards">' + grid + '</div>'
        + '</section>';
    }

    /* ---------------------------------------------------------------------------
       ARTICLE — /music-history/<slug>
       --------------------------------------------------------------------------- */
    async function initPageMusicHistoryArticle(params) {
      const host = document.getElementById('music-history-article-body');
      if (!host) return;

      const slug = params && params.slug ? String(params.slug) : '';
      if (!slug) { navigate('music-history', {}, { replace: true }); return; }

      let article;
      try {
        article = await MusicHistory.loadArticle(slug);
      } catch (e) {
        console.warn('music history article failed:', e);
        return;   // leave the server-rendered copy in place
      }
      if (!article) {
        host.innerHTML = '<div class="mh-missing"><h2>That topic does not exist</h2>'
          + '<a class="btn btn-primary" href="/music-history"'
          + ' onclick="navigate(\'music-history\');return false;">Back to the timeline</a></div>';
        return;
      }

      host.innerHTML = historyArticleHtml(article);
      try { Seo.update('music-history-article', { slug: slug, article: article }); } catch (e) {}
      try { updateBreadcrumbs('music-history-article', { slug: slug, title: article.title }); } catch (e) {}
      window.scrollTo({ top: 0, behavior: 'auto' });
    }

    function historyArticleHtml(a) {
      const sections = (a.sections || []).map(function (s, i) {
        const paras = (s.p || []).map(function (p) {
          // Section prose is trusted editorial content from the repo, not user
          // input — a few paragraphs carry <em> deliberately. It never touches
          // the database and no visitor can write it.
          return '<p>' + p + '</p>';
        }).join('');
        return '<section class="mh-art-section" id="mh-s' + i + '">'
          + '<h2 class="mh-art-h2">' + Utils.escape(s.h) + '</h2>' + paras + '</section>';
      }).join('');

      const brands = (a.brands || []).length
        ? '<section class="mh-art-section"><h2 class="mh-art-h2">Names that mattered</h2>'
          + '<p class="mh-art-note">Listed because of what they did, not as recommendations. '
          + 'Velorex Music did not make any of these.</p>'
          + '<div class="mh-brands">' + a.brands.map(function (b) {
              return '<div class="mh-brand"><strong>' + Utils.escape(b.name) + '</strong>'
                + '<span>' + Utils.escape(b.note) + '</span></div>';
            }).join('') + '</div></section>'
        : '';

      const facts = (a.facts || []).length
        ? '<section class="mh-art-section"><h2 class="mh-art-h2">Did you know?</h2>'
          + '<ul class="mh-facts">' + a.facts.map(function (f) {
              return '<li>' + Utils.escape(f) + '</li>';
            }).join('') + '</ul></section>'
        : '';

      const nostalgia = a.nostalgia
        ? '<section class="mh-nostalgia-block"><h2 class="mh-art-h2">Remember this?</h2>'
          + '<p>' + Utils.escape(a.nostalgia) + '</p></section>'
        : '';

      const sources = (a.sources || []).length
        ? '<section class="mh-sources"><h2>Sources &amp; further reading</h2><ul>'
          + a.sources.map(function (s) {
              return '<li><a href="' + Utils.escape(s.u) + '" target="_blank" rel="noopener noreferrer">'
                + Utils.escape(s.t) + '</a></li>';
            }).join('')
          + '</ul><p class="mh-sources-note">Written from these sources, not copied from them. '
          + 'External links open in a new tab.</p></section>'
        : '';

      const prev = a.prev
        ? '<a class="mh-nav-prev" href="/music-history/' + Utils.escape(a.prev.slug) + '"'
          + ' onclick="navigate(\'music-history-article\',{slug:\'' + Utils.escape(a.prev.slug) + '\'});return false;">'
          + '<i class="fas fa-arrow-left"></i><span><small>Previous</small>' + Utils.escape(a.prev.title) + '</span></a>'
        : '<span></span>';
      const next = a.next
        ? '<a class="mh-nav-next" href="/music-history/' + Utils.escape(a.next.slug) + '"'
          + ' onclick="navigate(\'music-history-article\',{slug:\'' + Utils.escape(a.next.slug) + '\'});return false;">'
          + '<span><small>Next</small>' + Utils.escape(a.next.title) + '</span><i class="fas fa-arrow-right"></i></a>'
        : '<span></span>';

      return ''
        + '<article class="mh-article">'
        +   '<header class="mh-art-hero">'
        +     '<div class="mh-art-hero-art">' + historyMotif(a.motif) + '</div>'
        +     '<div>'
        +       '<span class="mh-art-kicker">' + Utils.escape(a.kicker) + '</span>'
        +       '<h1 class="mh-art-title">' + Utils.escape(a.title) + '</h1>'
        +       '<span class="mh-art-years">' + Utils.escape(a.years) + '</span>'
        +       '<p class="mh-art-intro">' + Utils.escape(a.intro) + '</p>'
        +     '</div>'
        +   '</header>'
        +   sections + brands + facts + nostalgia + sources
        +   '<nav class="mh-art-nav">' + prev + next + '</nav>'
        +   '<div class="mh-back"><a href="/music-history"'
        +     ' onclick="navigate(\'music-history\');return false;">'
        +     '<i class="fas fa-arrow-left"></i> Back to the timeline</a></div>'
        + '</article>';
    }
