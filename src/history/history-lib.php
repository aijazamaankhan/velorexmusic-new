<?php
// =============================================================================
// The Evolution of Music & Audio — content library
//
// Used by:
//   api/music-history.php   (JSON for the SPA)
//   seo-render.php          (server-rendered /music-history and /music-history/<slug>)
//   sitemap.php             (one URL per article)
//
// ONE canonical copy of the content, in PHP, read by all three. The blog keeps
// its text in the database because the owner writes posts; this is curated,
// fact-checked reference material that ships with the code, so it lives in the
// repo where it can be reviewed in a diff.
//
// WHAT THIS SECTION IS NOT
// It is not the history of Velorex Music, and none of the machines described
// here were made by Velorex. It is an independent account of how recording and
// playback technology developed, written to be useful to someone who owns a
// record and wonders where the format came from. Nothing here should read as a
// product claim — see the guard note in CLAUDE.md §41.
//
// SOURCING RULE
// Every date and first-of-its-kind claim is drawn from a primary or
// institutional source — Library of Congress, Smithsonian, the IEEE's
// Engineering and Technology History Wiki, or a manufacturer's own historical
// archive — and each article carries its sources at the foot. Where accounts
// genuinely differ (the phonograph's construction date is the standard
// example) the text says so rather than picking one and stating it flatly.
// Prose is written from the research, never copied from it.
//
// IMAGERY
// Era and article art is drawn in CSS/SVG rather than photographed. Historical
// product photography is almost always someone else's copyright, and museum
// scans carry credit requirements this codebase has no field for. A drawn
// motif is honest about being an illustration. See src/history/README.md for
// how to substitute real museum imagery with credit.
// =============================================================================

require_once __DIR__ . '/history-content.php';

// The nine eras of the timeline, in order. `key` is what the URL and the
// client use; `label` is what a reader sees.
function velorex_history_eras(): array {
    return [
        [
            'key'   => 'early-recording',
            'years' => '1870s–1890s',
            'label' => 'Early Recording',
            'blurb' => 'Sound stops being a moment and becomes an object you can keep.',
            'detail' => 'For all of human history before this point, music existed only while '
                . 'someone was playing it. Within twenty years that changed twice: first with a '
                . 'cylinder that could capture a voice, then with a flat disc that could be pressed '
                . 'in quantity — which is what turned recording from a curiosity into an industry.',
            'points' => [
                'Edison worked out how to record on tinfoil-wrapped cylinders in 1877; the patent was granted in February 1878.',
                'Emile Berliner patented the gramophone — sound on a flat disc — in November 1887.',
                'The disc could be stamped from a master, so one performance could become thousands of copies.',
            ],
            'articles' => ['gramophone'],
            'motif' => 'cylinder',
        ],
        [
            'key'   => 'radio-home',
            'years' => '1900s–1930s',
            'label' => 'Radio & Home Listening',
            'blurb' => 'Music arrives in the house without anyone having to buy it first.',
            'detail' => 'The gramophone put recordings in the parlour, but you owned only what you '
                . 'had paid for. Broadcasting added something different: a continuous supply of music '
                . 'chosen by somebody else, free at the point of listening, and shared at the same '
                . 'instant by strangers across a whole city.',
            'points' => [
                'Westinghouse received the first US broadcasting licence for KDKA in October 1920.',
                'KDKA began scheduled programming with the Harding–Cox election returns on 2 November 1920.',
                'Between records, that first broadcast filled time by playing a phonograph into the microphone.',
            ],
            'articles' => ['radio'],
            'motif' => 'radio',
        ],
        [
            'key'   => 'hifi-vinyl',
            'years' => '1940s–1950s',
            'label' => 'Hi-Fi & Vinyl',
            'blurb' => 'A record finally long enough to hold a whole symphony — and a whole album.',
            'detail' => 'The 78 gave you about four minutes a side. The microgroove LP gave you '
                . 'twenty-three, and in doing so it invented the album as a form. Alongside it came '
                . 'magnetic tape in the studio and, by the end of the decade, stereo at home.',
            'points' => [
                'Columbia introduced the 33⅓ rpm microgroove LP in June 1948, holding about 23 minutes a side.',
                'RCA Victor answered with the 7-inch 45 rpm single in 1949.',
                'Ampex\'s Model 200A went into regular US broadcast service in April 1948, bringing tape into the studio.',
                'Record companies adapted the LP for stereo playback in 1958, one channel in each groove wall.',
            ],
            'articles' => ['vinyl', 'turntables', 'reel-to-reel'],
            'motif' => 'vinyl',
        ],
        [
            'key'   => 'cassette-arrives',
            'years' => '1960s',
            'label' => 'The Cassette Arrives',
            'blurb' => 'Recording stops being a professional act and becomes something anyone can do.',
            'detail' => 'Open-reel tape could already record beautifully, but threading it was a '
                . 'skill. Philips put the reels inside a sealed shell so the tape never had to be '
                . 'touched — and by licensing the format widely rather than guarding it, made it the '
                . 'thing everybody else built for.',
            'points' => [
                'Philips showed its first Compact Cassette recorder at the Berlin radio exhibition in August 1963.',
                'The shell meant no threading, no spooling, and a format a child could operate.',
                'Because it recorded as well as played, listeners could make their own tapes for the first time.',
            ],
            'articles' => ['cassette'],
            'motif' => 'cassette',
        ],
        [
            'key'   => 'stereo-portable',
            'years' => '1970s–1980s',
            'label' => 'Stereo & Portable Music',
            'blurb' => 'The separates era — and the moment music started following you outdoors.',
            'detail' => 'This is the period most people picture when they picture a stereo: a '
                . 'turntable, an amplifier, a cassette deck and a pair of speakers, bought separately '
                . 'and upgraded one box at a time. Then Sony took the headphones off the hi-fi and '
                . 'put them on a device you could walk with.',
            'points' => [
                'Sony launched the TPS-L2 in Japan on 1 July 1979; it reached the United States in 1980.',
                'It was sold as the Soundabout in the US, the Stowaway in the UK and the Freestyle in Sweden before Walkman won.',
                'The first model had two headphone jacks and a button that let one listener talk to the other.',
            ],
            'articles' => ['amplifiers', 'speakers', 'headphones'],
            'motif' => 'stereo',
        ],
        [
            'key'   => 'digital-revolution',
            'years' => '1980s–1990s',
            'label' => 'The Digital Revolution',
            'blurb' => 'Sound becomes numbers, and a laser replaces the needle.',
            'detail' => 'Every format until now had a physical thing rubbing against another physical '
                . 'thing. The compact disc read pits with light, so playing a record no longer wore it '
                . 'out — and the industry gained a format it could sell to people who already owned '
                . 'the same albums on vinyl.',
            'points' => [
                'Philips publicly demonstrated optical digital audio playback in March 1979.',
                'Philips and Sony agreed a common standard, and the CD launched in Japan in November 1982.',
                'Europe followed in March 1983.',
            ],
            'articles' => ['cd'],
            'motif' => 'cd',
        ],
        [
            'key'   => 'recordable-digital',
            'years' => '1987–1990s',
            'label' => 'Recordable Digital',
            'blurb' => 'Digital you could record on — and a mastering habit that made records louder every year.',
            'detail' => 'The CD could be played but not recorded, so for roughly a decade the cassette '
                . 'kept a job the CD could not take. Three formats arrived to fill that gap and none of '
                . 'them won it. Meanwhile, in the studio, the fixed ceiling of a digital master started '
                . 'a competition that quietly changed how records sounded.',
            'points' => [
                'Sony announced MiniDisc in September 1992; Philips and Matsushita launched Digital Compact Cassette the same year.',
                'ATRAC squeezed CD audio roughly five to one — the same perceptual idea as MP3, arriving in the same years.',
                'DAT recorded uncompressed audio with a rotating head and became a studio format rather than a home one.',
                'Sony ceased MiniDisc production in 2013; broadcasters and oral historians had kept it longest.',
            ],
            'articles' => ['minidisc', 'loudness-war'],
            'motif' => 'minidisc',
        ],
        [
            'key'   => 'home-theatre',
            'years' => '1990s–2000s',
            'label' => 'Surround Sound at Home',
            'blurb' => 'Speakers stop being a pair in front of you and become a room around you.',
            'detail' => 'Digital surround was a cinema technology first, and it reached living rooms '
                . 'almost sideways — carried there by a video format rather than by music. That is why '
                . 'home surround grew up around films, and why music mixed for more than two speakers '
                . 'stayed a specialist interest for another twenty years.',
            'points' => [
                'Dolby dates the first feature presented in Dolby Digital to Batman Returns in 1992.',
                'DTS followed as the competing digital cinema format; the Library of Congress catalogues both.',
                'The five in 5.1 are left, centre, right and two surrounds; the .1 is a band-limited effects channel.',
                'DVD carried multichannel soundtracks as standard, which is how surround reached ordinary houses.',
            ],
            'articles' => ['surround-sound'],
            'motif' => 'speaker',
        ],
        [
            'key'   => 'mp3-portable',
            'years' => '1990s–2000s',
            'label' => 'MP3 & Portable Digital Music',
            'blurb' => 'A compression format small enough to travel down a telephone line.',
            'detail' => 'A CD track is far too large to move around a 1990s internet. The answer was '
                . 'to throw away the parts of the signal a listener would not notice — and once a song '
                . 'was a small file rather than a disc, almost everything about how music was bought, '
                . 'shared and carried came loose at once.',
            'points' => [
                'MPEG-1, including the Layer 3 audio coding, was published as an ISO standard in 1993.',
                'The ".mp3" extension itself was chosen by an internal poll at Fraunhofer IIS on 14 July 1995.',
                'Layer 3 was developed collaboratively, with Fraunhofer and the University of Erlangen among the contributors.',
            ],
            'articles' => ['mp3'],
            'motif' => 'mp3',
        ],
        [
            'key'   => 'download-era',
            'years' => '1998–2005',
            'label' => 'File Sharing & Downloads',
            'blurb' => 'For about six years, who controlled distribution was genuinely an open question.',
            'detail' => 'Compression made a song small enough to move; what happened next was decided in '
                . 'court rather than in a laboratory. Two rulings shaped everything that followed — one '
                . 'that made portable players lawful to sell, and one that ended the service which had '
                . 'made downloading music feel normal.',
            'points' => [
                'In 1999 the Ninth Circuit found that the Diamond Rio merely let owners "space-shift" their own files — a personal use.',
                'Napster arrived in 1999 using a central index, and at its 2001 peak had around 1.5 million people sharing at once.',
                'Napster ceased operations on 1 July 2001, unable to comply with the injunction and keep running.',
                'What changed behaviour was not enforcement but a legal alternative that was easier than the illegal one.',
            ],
            'articles' => ['file-sharing'],
            'motif' => 'digital',
        ],
        [
            'key'   => 'music-goes-digital',
            'years' => '2000s–2010s',
            'label' => 'The Music Goes Digital',
            'blurb' => 'The collection leaves the shelf and moves into a pocket.',
            'detail' => 'Portable players had existed for years, but a hard disc changed the '
                . 'proposition: not a handful of albums chosen before leaving the house, but the whole '
                . 'library, all the time. Paired with a legal store, it also gave the industry its '
                . 'first workable answer to file sharing.',
            'points' => [
                'Apple released the first iPod on 23 October 2001, with a 5 GB drive holding about 1,000 songs.',
                'Windows support followed in 2002 and the iTunes Store in 2003.',
                'Buying a single track legally, in a few seconds, was the part that changed behaviour.',
            ],
            'articles' => ['portable-players', 'digital-audio'],
            'motif' => 'ipod',
        ],
        [
            'key'   => 'phone-era',
            'years' => '2007–2016',
            'label' => 'The Phone Takes Over',
            'blurb' => 'One device absorbs the player, the radio and eventually the headphone cable.',
            'detail' => 'The portable player had barely won before it was eaten — not by a better '
                . 'player, but by something already in the same pocket for other reasons. The network '
                . 'connection that came with it is the precondition for everything in the next era.',
            'points' => [
                'Apple introduced the iPhone on 9 January 2007, describing it as, among other things, a widescreen iPod with touch controls.',
                'A connected device could reach a catalogue rather than hold a library, which is what made streaming possible.',
                'AirPods were announced in September 2016 and began reaching customers that December.',
                'All Bluetooth listening is compressed — the radio link cannot carry an uncompressed stereo stream.',
            ],
            'articles' => ['smartphone-audio'],
            'motif' => 'phone',
        ],
        [
            'key'   => 'streaming',
            'years' => '2010s–today',
            'label' => 'Streaming & Connected Audio',
            'blurb' => 'Access replaces ownership — and the speaker gets its own network connection.',
            'detail' => 'The final step was to stop moving the file at all. Music became something you '
                . 'reach rather than something you hold, which solved the problem of carrying a '
                . 'collection and created a new one: nothing on the shelf to show for years of '
                . 'listening. It is not a coincidence that vinyl came back during exactly this period.',
            'points' => [
                'Playback moved from a device holding files to a service holding a catalogue.',
                'Bluetooth and wi-fi speakers removed the last cable between source and sound.',
                'Physical formats did not disappear — they changed role, from how you listen to what you keep.',
            ],
            'articles' => ['streaming'],
            'motif' => 'stream',
        ],
        [
            'key'   => 'modern-listening',
            'years' => '2015–today',
            'label' => 'Lossless, Spatial & the Revival',
            'blurb' => 'Fidelity stops being a paid upgrade, and the oldest format on this page keeps growing.',
            'detail' => 'The most recent chapter runs in two directions at once. Streaming absorbed the '
                . 'quality argument that SACD and DVD-Audio had lost, and made it standard rather than '
                . 'premium. At the same time the format everything here was supposed to have replaced '
                . 'went on selling more every year — not despite streaming, but because of what '
                . 'streaming does not give you.',
            'points' => [
                'Apple Music announced lossless and Dolby Atmos spatial audio in May 2021, at no additional cost.',
                'Lossless and hi-res are different claims: one is about packing the file, the other about the original recording.',
                'A spatial mix is a new creative decision about an old record, not a more faithful copy of it.',
                'RIAA year-end figures show vinyl outselling CDs on units for a third consecutive year in 2024.',
            ],
            'articles' => ['hi-res-audio', 'vinyl-revival'],
            'motif' => 'stream',
        ],
    ];
}

// The twelve category cards, in reading order. The order here is also the
// order of the previous/next links inside an article.
function velorex_history_order(): array {
    return [
        'gramophone', 'radio', 'turntables', 'amplifiers', 'speakers', 'reel-to-reel',
        'cassette', 'cd', 'portable-players', 'headphones', 'digital-audio', 'streaming',
        'vinyl', 'mp3',
        // 1987 to today, added with history-content-3.php.
        'minidisc', 'surround-sound', 'loudness-war', 'file-sharing',
        'smartphone-audio', 'hi-res-audio', 'vinyl-revival',
    ];
}

// Cards shown on the hub.
//
// Not every article gets one. `vinyl`, `mp3`, `loudness-war` and `file-sharing`
// are reachable from their era panel and from the prev/next chain instead —
// they are subjects rather than machines, and the grid is introduced as the
// equipment. An article with no card is still in the sitemap and still
// indexable; it is only the tile that is withheld.
function velorex_history_cards(): array {
    return [
        'gramophone', 'radio', 'turntables', 'amplifiers', 'speakers', 'reel-to-reel',
        'cassette', 'cd', 'minidisc', 'surround-sound', 'portable-players', 'headphones',
        'digital-audio', 'smartphone-audio', 'streaming', 'hi-res-audio', 'vinyl-revival',
    ];
}

function velorex_history_article(string $slug): ?array {
    $all = velorex_history_articles();
    if (!isset($all[$slug])) return null;

    $a = $all[$slug];
    $a['slug'] = $slug;

    // Previous/next are derived from the order list rather than stored on each
    // article, so inserting one in the middle cannot leave a dangling link.
    $order = velorex_history_order();
    $i = array_search($slug, $order, true);
    $a['prev'] = ($i !== false && $i > 0) ? $order[$i - 1] : null;
    $a['next'] = ($i !== false && $i < count($order) - 1) ? $order[$i + 1] : null;

    foreach (['prev', 'next'] as $k) {
        if ($a[$k] !== null && isset($all[$a[$k]])) {
            $a[$k] = ['slug' => $a[$k], 'title' => $all[$a[$k]]['title']];
        } else {
            $a[$k] = null;
        }
    }
    return $a;
}

// The shape the hub needs: enough for a card, never the whole article.
function velorex_history_card(string $slug): ?array {
    $all = velorex_history_articles();
    if (!isset($all[$slug])) return null;
    $a = $all[$slug];
    return [
        'slug'   => $slug,
        'title'  => $a['title'],
        'kicker' => $a['kicker'],
        'years'  => $a['years'],
        'blurb'  => $a['blurb'],
        'motif'  => $a['motif'] ?? 'vinyl',
    ];
}

// Everything the hub page renders, in one payload.
//
// `titles` covers EVERY article, not just the twelve with cards. An era panel
// links to whatever articles belong to it, and two of them (vinyl, mp3) have
// no card — reading their names off the card list alone printed the raw slug
// at the reader on the client while the server rendered the real title, so the
// page changed under you as the SPA booted. One map, read by both.
function velorex_history_index(): array {
    $cards = [];
    foreach (velorex_history_cards() as $slug) {
        $c = velorex_history_card($slug);
        if ($c) $cards[] = $c;
    }
    $titles = [];
    foreach (velorex_history_order() as $slug) {
        $c = velorex_history_card($slug);
        if ($c) $titles[$slug] = $c['title'];
    }
    return [
        'eras'   => velorex_history_eras(),
        'cards'  => $cards,
        'titles' => $titles,
    ];
}
