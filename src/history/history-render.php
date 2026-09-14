<?php
// =============================================================================
// The Evolution of Music & Audio — server-side HTML
//
// The PHP twin of the renderers in src/js/storefront/music-history.js. Both
// read the SAME content library (history-lib.php), so the words can never
// disagree; what differs is only that these emit finished HTML for a crawler
// while the JS builds the same markup after the SPA boots and replaces this
// block in place.
//
// KEEP THE TWO IN STEP. If you change a class name or the shape of a block
// here, change it in music-history.js too — the CSS in
// src/styles/components/music-history.css is written once for both, so a
// rename on one side silently unstyles that side only.
//
// Everything is escaped with velorex_e() except the section paragraphs, which
// are trusted editorial content committed to this repo (a few carry <em>) and
// are never database-backed or visitor-writable. That is the same reasoning
// the blog renderer uses for its already-sanitised bodies, arrived at from the
// other direction: this text cannot be edited without a commit.
// =============================================================================

require_once __DIR__ . '/history-lib.php';
require_once __DIR__ . '/../seo/seo-lib.php';   // velorex_e()

// Mirror of historyMotif() in music-history.js. Monochrome, tinted through
// currentColor, so one drawing serves the dark hub, the light theme and a card
// without three sets of assets. They are illustrations and read as such —
// see the imagery note in history-lib.php for why there are no photographs.
function velorex_history_motif(string $name): string {
    static $M = [
        'cylinder'  => '<rect x="14" y="18" width="30" height="28" rx="4"/><path d="M20 18v28M26 18v28M32 18v28M38 18v28" class="mh-line"/><path d="M44 24h8M48 20v8" class="mh-line"/>',
        'radio'     => '<rect x="8" y="20" width="48" height="30" rx="5"/><circle cx="22" cy="35" r="8" class="mh-hole"/><path d="M40 28h10M40 35h10M40 42h10" class="mh-line"/><path d="M46 20V8" class="mh-line"/>',
        'vinyl'     => '<circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="13" class="mh-line"/><circle cx="32" cy="32" r="7" class="mh-line"/><circle cx="32" cy="32" r="2.5" class="mh-hole"/>',
        'turntable' => '<rect x="6" y="16" width="52" height="34" rx="5"/><circle cx="27" cy="33" r="13" class="mh-line"/><circle cx="27" cy="33" r="2" class="mh-hole"/><path d="M50 21v16l-8 6" class="mh-line"/>',
        'reel'      => '<circle cx="21" cy="32" r="13"/><circle cx="21" cy="32" r="4" class="mh-hole"/><circle cx="47" cy="32" r="9" class="mh-line"/><circle cx="47" cy="32" r="3" class="mh-hole"/><path d="M21 45h26" class="mh-line"/>',
        'cassette'  => '<rect x="6" y="18" width="52" height="30" rx="5"/><circle cx="24" cy="32" r="6" class="mh-hole"/><circle cx="40" cy="32" r="6" class="mh-hole"/><path d="M16 44h32" class="mh-line"/>',
        'stereo'    => '<rect x="6" y="14" width="22" height="38" rx="3"/><circle cx="17" cy="26" r="6" class="mh-line"/><circle cx="17" cy="42" r="4" class="mh-line"/><rect x="34" y="14" width="24" height="16" rx="3" class="mh-line"/><rect x="34" y="36" width="24" height="16" rx="3" class="mh-line"/>',
        'amp'       => '<rect x="6" y="20" width="52" height="26" rx="5"/><circle cx="18" cy="33" r="6" class="mh-line"/><circle cx="34" cy="33" r="6" class="mh-line"/><path d="M46 27v12M52 27v12" class="mh-line"/>',
        'speaker'   => '<rect x="16" y="8" width="32" height="48" rx="5"/><circle cx="32" cy="38" r="10" class="mh-line"/><circle cx="32" cy="38" r="3" class="mh-hole"/><circle cx="32" cy="19" r="5" class="mh-line"/>',
        'cd'        => '<circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="8" class="mh-hole"/><path d="M32 10a22 22 0 0 1 19 11" class="mh-line"/>',
        'mp3'       => '<rect x="18" y="8" width="28" height="48" rx="6"/><rect x="23" y="15" width="18" height="14" rx="2" class="mh-line"/><circle cx="32" cy="42" r="7" class="mh-line"/>',
        'ipod'      => '<rect x="18" y="6" width="28" height="52" rx="7"/><rect x="23" y="12" width="18" height="16" rx="2" class="mh-line"/><circle cx="32" cy="42" r="9" class="mh-line"/><circle cx="32" cy="42" r="3" class="mh-hole"/>',
        'headphones'=> '<path d="M12 38V32a20 20 0 0 1 40 0v6" class="mh-line"/><rect x="6" y="34" width="12" height="18" rx="5"/><rect x="46" y="34" width="12" height="18" rx="5"/>',
        'digital'   => '<path d="M8 40h8v-12h8v20h8V22h8v18h8V30h8" class="mh-line"/>',
        'minidisc'  => '<rect x="10" y="12" width="44" height="40" rx="5"/><rect x="16" y="18" width="13" height="15" rx="2" class="mh-line"/><circle cx="39" cy="36" r="9" class="mh-line"/><circle cx="39" cy="36" r="3" class="mh-hole"/>',
        'phone'     => '<rect x="18" y="6" width="28" height="52" rx="6"/><path d="M27 14h10" class="mh-line"/><path d="M27 42a9 9 0 0 1 9-9" class="mh-line"/><path d="M25 49a16 16 0 0 1 16-16" class="mh-line"/>',
        'wave'      => '<path d="M7 32h4M15 21v22M23 13v38M31 19v26M39 9v46M47 23v18M55 32h4" class="mh-line"/>',
        'stream'    => '<circle cx="32" cy="46" r="6"/><path d="M20 36a17 17 0 0 1 24 0" class="mh-line"/><path d="M13 27a27 27 0 0 1 38 0" class="mh-line"/>',
    ];
    $body = $M[$name] ?? $M['vinyl'];
    return '<svg class="mh-motif" viewBox="0 0 64 64" role="img" aria-hidden="true" focusable="false">'
        . $body . '</svg>';
}

// Fill the static motif slots in index.html (the hero collage and the
// nostalgia mosaic) server-side.
//
// Those slots are empty divs carrying data-motif, and historyFillMotifs() in
// the JS draws them after the SPA boots. That left nine empty outlined boxes
// in the hero, above the fold, until hydration finished — which reads as a
// broken page rather than a loading one. Filling them here means the first
// paint is complete; the JS fill is idempotent (it skips a slot that already
// has a child), so the two cannot fight.
function velorex_history_fill_motifs(string $html): string {
    return preg_replace_callback(
        '#<div class="(mh-collage-item|mh-mosaic-item)" data-motif="([a-z0-9-]+)"></div>#',
        static fn(array $m): string =>
            '<div class="' . $m[1] . '" data-motif="' . $m[2] . '">'
            . velorex_history_motif($m[2]) . '</div>',
        $html
    ) ?? $html;
}

// The hub: timeline rail with one era already open, then the topic cards.
//
// The server picks an era rather than leaving the panel empty, so a crawler
// (and anyone whose JavaScript is slow or blocked) reads real prose instead of
// an empty tab panel. $activeEra lets /music-history?era=… server-render the
// era that was linked to.
function velorex_history_index_html(array $index, string $activeEra = ''): string {
    $eras  = $index['eras'] ?? [];
    $cards = $index['cards'] ?? [];
    if (!$eras) return '';

    $active = $eras[0];
    if ($activeEra !== '') {
        foreach ($eras as $e) {
            if ($e['key'] === $activeEra) { $active = $e; break; }
        }
    }

    $rail = '';
    foreach ($eras as $e) {
        $on = $e['key'] === $active['key'];
        $rail .= '<button type="button" class="mh-era-btn' . ($on ? ' is-active' : '') . '"'
            . ' data-era="' . velorex_e($e['key']) . '"'
            . ' aria-selected="' . ($on ? 'true' : 'false') . '"'
            . ' onclick="historySelectEra(\'' . velorex_e($e['key']) . '\')">'
            . '<span class="mh-era-years">' . velorex_e($e['years']) . '</span>'
            . '<span class="mh-era-label">' . velorex_e($e['label']) . '</span>'
            . '</button>';
    }

    $timeline = '<section class="mh-timeline" id="mh-timeline" aria-label="Timeline of audio eras">'
        . '<div class="mh-section-head">'
        .   '<h2 class="mh-h2">The <span>Timeline</span></h2>'
        .   '<p class="mh-sub">Every moment where the way people listened changed shape. Pick one.</p>'
        . '</div>'
        . '<div class="mh-rail-wrap"><div class="mh-rail" role="tablist">' . $rail . '</div></div>'
        . '<div class="mh-era-panel" id="mh-era-panel" role="tabpanel" aria-live="polite">'
        .   velorex_history_era_html($active, $index['titles'] ?? [])
        . '</div>'
        . '</section>';

    $grid = '';
    foreach ($cards as $c) {
        $grid .= '<a class="mh-card" href="/music-history/' . velorex_e($c['slug']) . '"'
            // Read by music-history-audio.js for the hover cue. Emitted
            // here too, so the server-rendered grid behaves identically as
            // soon as the script loads rather than after a re-render.
            . ' data-sound="' . velorex_e($c['motif'] ?? 'vinyl') . '"'
            . ' onclick="navigate(\'music-history-article\',{slug:\'' . velorex_e($c['slug']) . '\'});return false;">'
            . '<span class="mh-card-art">' . velorex_history_motif($c['motif'] ?? 'vinyl') . '</span>'
            . '<span class="mh-card-kicker">' . velorex_e($c['kicker']) . '</span>'
            . '<span class="mh-card-title">' . velorex_e($c['title']) . '</span>'
            . '<span class="mh-card-years">' . velorex_e($c['years']) . '</span>'
            . '<span class="mh-card-blurb">' . velorex_e($c['blurb']) . '</span>'
            . '<span class="mh-card-go">Read <i class="fas fa-arrow-right"></i></span>'
            . '</a>';
    }

    $topics = '<section class="mh-cards-section" id="mh-topics">'
        . '<div class="mh-section-head">'
        .   '<h2 class="mh-h2">The <span>Machines</span></h2>'
        .   '<p class="mh-sub">Every machine and format in the story, with how it worked, '
        .     'why it mattered and what replaced it.</p>'
        . '</div>'
        . '<div class="mh-cards">' . $grid . '</div>'
        . '</section>';

    return $timeline . $topics;
}

// One era panel — the PHP twin of historyRenderEra().
//
// $titles is the index payload's slug -> title map, which covers articles with
// no hub card (vinyl, mp3) as well as the twelve that have one. The JS twin
// reads the same map for the same reason.
function velorex_history_era_html(array $era, array $titles): string {
    $points = '';
    foreach (($era['points'] ?? []) as $p) {
        $points .= '<li>' . velorex_e($p) . '</li>';
    }

    $links = '';
    foreach (($era['articles'] ?? []) as $slug) {
        $title = $titles[$slug] ?? $slug;
        $links .= '<a class="mh-era-link" href="/music-history/' . velorex_e($slug) . '"'
            . ' onclick="navigate(\'music-history-article\',{slug:\'' . velorex_e($slug) . '\'});return false;">'
            . velorex_e($title) . ' <i class="fas fa-arrow-right"></i></a>';
    }

    return '<div class="mh-era-art">' . velorex_history_motif($era['motif'] ?? 'vinyl') . '</div>'
        . '<div class="mh-era-copy">'
        .   '<span class="mh-era-kicker">' . velorex_e($era['years']) . '</span>'
        .   '<h3 class="mh-era-title">' . velorex_e($era['label']) . '</h3>'
        .   '<p class="mh-era-blurb">' . velorex_e($era['blurb']) . '</p>'
        .   '<p class="mh-era-detail">' . velorex_e($era['detail']) . '</p>'
        .   ($points ? '<ul class="mh-era-points">' . $points . '</ul>' : '')
        .   ($links ? '<div class="mh-era-links">' . $links . '</div>' : '')
        . '</div>';
}

// One article — the PHP twin of historyArticleHtml().
function velorex_history_article_html(array $a): string {
    $sections = '';
    $i = 0;
    foreach (($a['sections'] ?? []) as $s) {
        $paras = '';
        foreach (($s['p'] ?? []) as $p) {
            // Raw on purpose — see the file header.
            $paras .= '<p>' . $p . '</p>';
        }
        $sections .= '<section class="mh-art-section" id="mh-s' . $i . '">'
            . '<h2 class="mh-art-h2">' . velorex_e($s['h']) . '</h2>' . $paras . '</section>';
        $i++;
    }

    $brands = '';
    if (!empty($a['brands'])) {
        $rows = '';
        foreach ($a['brands'] as $b) {
            $rows .= '<div class="mh-brand"><strong>' . velorex_e($b['name']) . '</strong>'
                . '<span>' . velorex_e($b['note']) . '</span></div>';
        }
        // The disclaimer is not decoration. These are other companies' products
        // and the section must never read as a Velorex catalogue.
        $brands = '<section class="mh-art-section"><h2 class="mh-art-h2">Names that mattered</h2>'
            . '<p class="mh-art-note">Listed because of what they did, not as recommendations. '
            . 'Velorex Music did not make any of these.</p>'
            . '<div class="mh-brands">' . $rows . '</div></section>';
    }

    $facts = '';
    if (!empty($a['facts'])) {
        $items = '';
        foreach ($a['facts'] as $f) $items .= '<li>' . velorex_e($f) . '</li>';
        $facts = '<section class="mh-art-section"><h2 class="mh-art-h2">Did you know?</h2>'
            . '<ul class="mh-facts">' . $items . '</ul></section>';
    }

    $nostalgia = !empty($a['nostalgia'])
        ? '<section class="mh-nostalgia-block"><h2 class="mh-art-h2">Remember this?</h2>'
          . '<p>' . velorex_e($a['nostalgia']) . '</p></section>'
        : '';

    $sources = '';
    if (!empty($a['sources'])) {
        $items = '';
        foreach ($a['sources'] as $s) {
            $items .= '<li><a href="' . velorex_e($s['u']) . '" target="_blank" rel="noopener noreferrer">'
                . velorex_e($s['t']) . '</a></li>';
        }
        $sources = '<section class="mh-sources"><h2>Sources &amp; further reading</h2><ul>' . $items
            . '</ul><p class="mh-sources-note">Written from these sources, not copied from them. '
            . 'External links open in a new tab.</p></section>';
    }

    $prev = !empty($a['prev'])
        ? '<a class="mh-nav-prev" href="/music-history/' . velorex_e($a['prev']['slug']) . '"'
          . ' onclick="navigate(\'music-history-article\',{slug:\'' . velorex_e($a['prev']['slug']) . '\'});return false;">'
          . '<i class="fas fa-arrow-left"></i><span><small>Previous</small>' . velorex_e($a['prev']['title']) . '</span></a>'
        : '<span></span>';
    $next = !empty($a['next'])
        ? '<a class="mh-nav-next" href="/music-history/' . velorex_e($a['next']['slug']) . '"'
          . ' onclick="navigate(\'music-history-article\',{slug:\'' . velorex_e($a['next']['slug']) . '\'});return false;">'
          . '<span><small>Next</small>' . velorex_e($a['next']['title']) . '</span><i class="fas fa-arrow-right"></i></a>'
        : '<span></span>';

    return '<article class="mh-article">'
        . '<header class="mh-art-hero">'
        .   '<div class="mh-art-hero-art">' . velorex_history_motif($a['motif'] ?? 'vinyl') . '</div>'
        .   '<div>'
        .     '<span class="mh-art-kicker">' . velorex_e($a['kicker']) . '</span>'
        .     '<h1 class="mh-art-title">' . velorex_e($a['title']) . '</h1>'
        .     '<span class="mh-art-years">' . velorex_e($a['years']) . '</span>'
        .     '<p class="mh-art-intro">' . velorex_e($a['intro']) . '</p>'
        .   '</div>'
        . '</header>'
        . $sections . $brands . $facts . $nostalgia . $sources
        . '<nav class="mh-art-nav">' . $prev . $next . '</nav>'
        . '<div class="mh-back"><a href="/music-history"'
        .   ' onclick="navigate(\'music-history\');return false;">'
        .   '<i class="fas fa-arrow-left"></i> Back to the timeline</a></div>'
        . '</article>';
}
