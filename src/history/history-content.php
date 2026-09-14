<?php
// =============================================================================
// The Evolution of Music & Audio — the articles.
//
// Read the header of history-lib.php first: the sourcing rule, the "this is not
// Velorex history" rule and the imagery rule all apply to everything here.
//
// SHAPE OF AN ARTICLE
//   title/kicker/years/blurb  the card and the page hero
//   metaTitle/metaDescription what seo-render.php puts in <head>
//   intro                     one paragraph, the answer to "what am I looking at"
//   sections[]                {h, p[]} — Origin, How it worked, Golden years, …
//   brands[]                  {name, note} — historically relevant only
//   facts[]                   "Did you know" — each one checkable
//   nostalgia                 short, specific, and not maudlin
//   sources[]                 {t, u} — institutional wherever possible
//
// WRITING RULES THAT MATTER
//   - Hedge where the record is genuinely unsettled ("generally dated to",
//     "commercially adopted during"). Do not launder an uncertain date into a
//     confident one.
//   - Brands appear because they did something, never as a list of names.
//   - No superlatives that cannot be checked. "The first" is a factual claim.
// =============================================================================

require_once __DIR__ . '/history-content-2.php';
require_once __DIR__ . '/history-content-3.php';   // 1987 to today

function velorex_history_articles(): array {
    return [

    // -------------------------------------------------------------------------
    'gramophone' => [
        'title'  => 'Gramophones & Phonographs',
        'kicker' => 'The talking machine',
        'years'  => '1877 onwards',
        'motif'  => 'cylinder',
        'blurb'  => 'The machines that first made sound into something you could keep, replay and sell.',
        'metaTitle'       => 'Gramophones & Phonographs — How Recorded Sound Began',
        'metaDescription' => 'How the phonograph and the gramophone worked, why the flat disc beat the cylinder, and how recorded sound turned from a laboratory curiosity into an industry.',
        'intro' => 'Before 1877, every piece of music anyone had ever heard existed only while it was '
            . 'being played. The phonograph broke that, and the gramophone made it commercial. Within '
            . 'a single generation, a performance stopped being an event and became an object.',
        'sections' => [
            ['h' => 'Origin', 'p' => [
                'Thomas Edison arrived at recording sideways, out of work on the telegraph and the '
                . 'telephone: if a telegraph message could be recorded, why not a voice? He wrapped '
                . 'tinfoil around a cylinder and let a stylus press into it.',
                'The popular date is 12 August 1877, but historians treat that with caution — the '
                . 'diary of Edison\'s assistant Charles Batchelor puts construction in early December, '
                . 'and the patent was granted on 19 February 1878. Where sources disagree this plainly, '
                . 'it is worth saying so rather than picking the tidiest number.',
                'Ten years later Emile Berliner took a different path. His gramophone patent, granted '
                . '8 November 1887, recorded onto a flat disc rather than a cylinder — a decision that '
                . 'turned out to matter more than anything about the sound itself.',
            ]],
            ['h' => 'How it worked', 'p' => [
                'Both machines are purely mechanical, and that is the wonderful part: no electricity '
                . 'anywhere in the chain. You speak into a horn, the air moves a thin diaphragm, the '
                . 'diaphragm moves a needle, and the needle scratches the shape of that movement into a '
                . 'surface.',
                'To play it back you run the needle along the scratch again. The groove pushes the '
                . 'needle, the needle shakes the diaphragm, the horn makes it loud enough to hear. The '
                . 'same energy that made the sound in the room is stored as a physical shape and then '
                . 'released again.',
                'Edison\'s stylus moved up and down, cutting hills and valleys into the foil. Berliner\'s '
                . 'moved side to side, and his discs were etched into zinc with acid before being used '
                . 'as a master.',
            ]],
            ['h' => 'Why the disc won', 'p' => [
                'Cylinders sounded good. Some argue they sounded better. But you could not easily copy '
                . 'one — early cylinders were often recorded a few at a time, with performers playing '
                . 'the same piece over and over into banks of machines.',
                'A disc could be stamped. Make one master, press thousands of identical copies, ship '
                . 'them flat, stack them on a shelf. The gramophone did not win because it reproduced '
                . 'sound more faithfully; it won because it could be manufactured, distributed and '
                . 'stored. Almost every format since has been decided the same way.',
            ]],
            ['h' => 'What it changed', 'p' => [
                'Musicians could now be heard by people who would never be in the same room as them. '
                . 'A regional style could travel. A performance could outlive the performer.',
                'It also created something that had never existed: a music industry built on selling '
                . 'copies rather than tickets or sheet music. Every argument since — about formats, '
                . 'royalties, piracy, streaming — descends from that shift.',
            ]],
            ['h' => 'Why people still love them', 'p' => [
                'A wind-up gramophone needs no power and no electronics. Crank it, drop the needle, '
                . 'and a hundred-year-old machine plays. Very little else from the 1890s still performs '
                . 'its original function on demand.',
                'There is also the horn. On an acoustic machine the sound is genuinely coming out of '
                . 'that flared shape, not a driver hidden behind fabric — you can watch the mechanism '
                . 'doing the work.',
            ]],
        ],
        'brands' => [
            ['name' => 'Edison', 'note' => 'The cylinder line, from the 1877 tinfoil machine through wax and later celluloid.'],
            ['name' => 'Berliner', 'note' => 'Patented the flat disc gramophone in 1887 and set the direction for everything after.'],
            ['name' => 'Victor / RCA Victor', 'note' => 'Built the disc into a mass-market business; the Victrola put the horn inside the cabinet.'],
            ['name' => 'HMV', 'note' => 'His Master\'s Voice — the trademark that made the gramophone a household image.'],
        ],
        'facts' => [
            'The Library of Congress holds roughly 50,000 wax and celluloid cylinders, the largest such collection in the world.',
            'Scientific American reported a demonstration in its issue of 22 December 1877, describing a machine that spoke and asked after their health.',
            'Early tinfoil recordings survived only a handful of plays before the foil was ruined.',
            'Berliner etched his zinc discs in an acid bath — the groove was chemically bitten, not cut.',
        ],
        'nostalgia' => 'Almost nobody alive remembers these as everyday objects, and that is exactly why '
            . 'they fascinate. A gramophone in a room silences it. Someone winds the handle, lowers the '
            . 'arm, and a voice from a century ago arrives through a brass horn with no wire attached to '
            . 'anything.',
        'sources' => [
            ['t' => 'Library of Congress — History of the Cylinder Phonograph', 'u' => 'https://www.loc.gov/collections/edison-company-motion-pictures-and-sound-recordings/articles-and-essays/history-of-edison-sound-recordings/history-of-the-cylinder-phonograph/'],
            ['t' => 'Library of Congress — The Gramophone (Emile Berliner collection)', 'u' => 'https://www.loc.gov/collections/emile-berliner/articles-and-essays/gramophone/'],
            ['t' => 'Library of Congress — Gramophone patent no. 372,786, 8 November 1887', 'u' => 'https://www.loc.gov/item/berl0124/'],
            ['t' => 'Smithsonian NMAH — Edison\'s Talking Machine', 'u' => 'https://americanhistory.si.edu/explore/exhibitions/americas-listening/online/edisons-talking-machine'],
        ],
    ],

    // -------------------------------------------------------------------------
    'radio' => [
        'title'  => 'Radios',
        'kicker' => 'Music out of the air',
        'years'  => '1920s onwards',
        'motif'  => 'radio',
        'blurb'  => 'The first way to hear music you had not chosen, at the same moment as everyone else.',
        'metaTitle'       => 'Radios — How Broadcasting Brought Music Into the Home',
        'metaDescription' => 'How radio broadcasting began, how a receiver turns a signal into sound, and why hearing music you did not choose changed listening for good.',
        'intro' => 'A gramophone plays what you own. A radio plays what is being sent, right now, to '
            . 'everyone within range. That difference — shared, continuous, and free once you had the '
            . 'set — is what made radio the first mass medium for music.',
        'sections' => [
            ['h' => 'Origin', 'p' => [
                'The technology arrived before the idea. Wireless transmission was well understood as a '
                . 'way of sending messages between two points; broadcasting deliberately to an unknown '
                . 'audience was the genuinely new thought.',
                'Westinghouse was granted the first US broadcasting licence on 27 October 1920 for the '
                . 'station KDKA in Pittsburgh, which began scheduled programming with the Harding–Cox '
                . 'presidential election returns on 2 November 1920.',
                'The detail that says most about the era: results were telephoned over from a newspaper '
                . 'office and read into a microphone, and between them, someone played a phonograph into '
                . 'that same microphone to fill the gaps.',
            ]],
            ['h' => 'How it worked', 'p' => [
                'A transmitter takes an audio signal and rides it on a much higher-frequency carrier '
                . 'wave. The receiver does the reverse: it tunes to one carrier out of the many arriving '
                . 'at the aerial, strips the carrier away and leaves the audio behind.',
                'Tuning is the part everyone remembers physically. Turning the dial retunes a circuit so '
                . 'it responds strongly to one frequency and weakly to its neighbours — which is why '
                . 'stations arrive gradually, why they drift, and why you could sometimes hear two at once.',
                'Valves did the amplifying for the first few decades, which is why early sets are warm, '
                . 'heavy, and need a moment before they make a sound.',
            ]],
            ['h' => 'The golden years', 'p' => [
                'For roughly three decades the radio was the largest piece of furniture in the room and '
                . 'the reason people sat together facing the same direction. Programming was scheduled, '
                . 'so listening was scheduled too.',
                'Transistors changed the shape of it. A set that ran on a small battery and fitted in a '
                . 'hand could go to the beach, into a bedroom, onto a building site — and radio stopped '
                . 'being something a family did together and became something a person did alone.',
                'Radio also decided what became popular. For most of the twentieth century, whether a '
                . 'record sold depended heavily on whether it was played on air.',
            ]],
            ['h' => 'What came next', 'p' => [
                'FM brought better fidelity and, eventually, stereo, which is why music migrated there '
                . 'while speech stayed comfortable on AM. Later, radio became a feature inside other '
                . 'things — the car dashboard, the hi-fi tuner, the clock by the bed.',
                'Streaming has taken much of the function, but not all of it. A station still offers the '
                . 'one thing an algorithm imitates rather than provides: somebody choosing.',
            ]],
        ],
        'brands' => [
            ['name' => 'Westinghouse', 'note' => 'Licensed KDKA in 1920 and effectively started scheduled broadcasting in the US.'],
            ['name' => 'Philips', 'note' => 'A European mainstay in receivers from the valve era onwards.'],
            ['name' => 'Sony', 'note' => 'Built its early reputation on transistor radios that made listening personal and portable.'],
            ['name' => 'Marantz, Sansui, Pioneer', 'note' => 'The separate FM tuner became a serious hi-fi component in its own right in the 1970s.'],
        ],
        'facts' => [
            'KDKA transmitted its first scheduled programme at 100 watts — less power than many kitchen appliances.',
            'That first broadcast ran roughly eighteen hours, from a wooden shack on the roof of a Westinghouse plant.',
            'The station traces back to 8XK, an experimental amateur station licensed to Westinghouse engineer Frank Conrad in 1916.',
            'Early listeners often used headphones rather than a loudspeaker, because the signal was too weak to fill a room.',
        ],
        'nostalgia' => 'The radio is the machine people remember as a sound rather than an object: a '
            . 'kitchen in the morning, a workshop, a car on a long road. It asked nothing of you. You '
            . 'turned it on and something was already happening.',
        'sources' => [
            ['t' => 'IEEE ETHW — Westinghouse Radio Station KDKA, 1920', 'u' => 'https://ethw.org/Milestones:Westinghouse_Radio_Station_KDKA,_1920'],
            ['t' => 'IEEE ETHW — KDKA, First Commercial Radio Station', 'u' => 'https://ethw.org/KDKA,_First_Commercial_Radio_Station'],
            ['t' => 'IEEE ETHW — Frank Conrad', 'u' => 'https://ethw.org/Frank_Conrad'],
            ['t' => 'Smithsonian — 1920: A Year in the Collections', 'u' => 'https://avpreservation.si.edu/spotlight/1920'],
        ],
    ],

    // -------------------------------------------------------------------------
    'vinyl' => [
        'title'  => 'Vinyl Records',
        'kicker' => 'The album, invented',
        'years'  => '1948 onwards',
        'motif'  => 'vinyl',
        'blurb'  => 'The format that gave music twenty-three minutes a side — and gave us the album.',
        'metaTitle'       => 'Vinyl Records — The LP, the 45 and the Birth of the Album',
        'metaDescription' => 'How the 33⅓ rpm LP and the 45 rpm single arrived in 1948 and 1949, how a record stores sound, and why vinyl outlived the formats built to replace it.',
        'intro' => 'A 78 gave you around four minutes a side, so a long work arrived as a stack of discs '
            . 'in a bound sleeve — literally an album, like a photograph album. When Columbia fitted '
            . 'twenty-three minutes onto one side, the word stayed and the meaning changed.',
        'sections' => [
            ['h' => 'Origin', 'p' => [
                'Columbia introduced the long-playing microgroove record in June 1948: 33⅓ revolutions '
                . 'per minute, a much finer groove than the 78, and vinyl instead of brittle shellac. It '
                . 'held roughly twenty-three minutes a side.',
                'RCA Victor answered in 1949 with a different idea — the 7-inch 45 rpm disc with the '
                . 'large centre hole, designed around one song and a fast-changing stack.',
                'The two formats settled into a division of labour that lasted fifty years: the LP for '
                . 'the body of work, the 45 for the hit.',
            ]],
            ['h' => 'How it works', 'p' => [
                'The groove is not a channel the needle follows for guidance. The groove <em>is</em> the '
                . 'waveform: its side-to-side wiggle is a physical tracing of the sound pressure that '
                . 'was in the room.',
                'A stylus sits in that groove and is shaken by its walls. In a magnetic cartridge that '
                . 'movement wiggles a tiny magnet near a coil, generating a very small electrical signal '
                . 'shaped like the original sound. Everything downstream is amplification.',
                'Stereo, adopted for the LP in 1958, works by giving each wall of the V-shaped groove its '
                . 'own channel. One groove, two signals, read by the same stylus moving in two directions '
                . 'at once.',
            ]],
            ['h' => 'Why records need a phono stage', 'p' => [
                'Bass has big, wide wiggles and treble has small ones. Cut a record straight and the bass '
                . 'grooves would be so wide they would run into each other, while the treble would '
                . 'disappear into the noise.',
                'So records are cut with the bass reduced and the treble boosted, to a standard curve, '
                . 'and the player applies the exact opposite on the way back. That is what a phono input '
                . 'does that a line input does not — and why a turntable plugged into an ordinary input '
                . 'sounds thin and quiet.',
            ]],
            ['h' => 'What replaced it, and what happened next', 'p' => [
                'The cassette took portability and the compact disc took convenience, and by the early '
                . '1990s vinyl was widely treated as finished. It never entirely stopped: club DJs kept '
                . 'pressing plants busy through the whole period, because nothing else let you manipulate '
                . 'playback by hand.',
                'The revival since has been driven by the things digital cannot offer — artwork at a size '
                . 'you can read, a running order somebody intended, a shelf that shows what you have '
                . 'listened to for twenty years.',
            ]],
            ['h' => 'Why people still love it', 'p' => [
                'A record asks for attention. You choose it, clean it, cue it, and turn it over halfway '
                . 'through. That friction is the point: it makes listening a decision rather than a '
                . 'background condition.',
                'It is also the only common format where you can see the music. The loud passages are '
                . 'visibly wider in the groove.',
            ]],
        ],
        'brands' => [
            ['name' => 'Columbia', 'note' => 'Introduced the 33⅓ microgroove LP in June 1948; Peter Goldmark led the engineering team.'],
            ['name' => 'RCA Victor', 'note' => 'Introduced the 7-inch 45 rpm record and its fast-changing player in 1949.'],
            ['name' => 'Decca', 'note' => 'Among the companies adapting the LP for stereo playback from 1958.'],
        ],
        'facts' => [
            'The microgroove was perfected by Columbia and CBS engineers over the summer of 1947, a year before launch.',
            '"Album" predates the LP — it originally meant the bound book of sleeves that held a set of 78s.',
            'A 12-inch LP side has a groove roughly 400 metres long if you could straighten it out.',
            'The 45\'s wide centre hole exists so a spindle mechanism could drop and change records quickly.',
        ],
        'nostalgia' => 'The sequence is the same in every memory of it: the sleeve, the inner sleeve, the '
            . 'weight of the disc on your palm, the moment of silence after the needle lands and before '
            . 'the first note. Then, twenty minutes later, getting up to turn it over.',
        'sources' => [
            ['t' => 'Library of Congress — Inside the Archival Box: The First Long-Playing Disc', 'u' => 'https://blogs.loc.gov/now-see-hear/2019/04/inside-the-archival-box-the-first-long-playing-disc/'],
            ['t' => 'Smithsonian NMAH — RCA Victor CP-5203 turntable (45 rpm)', 'u' => 'https://americanhistory.si.edu/collections/object/nmah_706086'],
            ['t' => 'IEEE ETHW — Stereophonic Sound', 'u' => 'https://ethw.org/Stereophonic_Sound'],
        ],
    ],

    // -------------------------------------------------------------------------
    'turntables' => [
        'title'  => 'Turntables',
        'kicker' => 'Precision in the plinth',
        'years'  => '1950s onwards',
        'motif'  => 'turntable',
        'blurb'  => 'A machine whose entire job is to rotate at exactly one speed and be left alone.',
        'metaTitle'       => 'Turntables — How Record Players Work and Why They Sound Different',
        'metaDescription' => 'Belt drive against direct drive, tonearms, cartridges and isolation — how a turntable works, and why two of them playing one record sound different.',
        'intro' => 'A turntable has an unusually simple brief and an unusually hard one: spin at a '
            . 'constant speed, hold a stylus steady in a groove, and let nothing else — motor hum, '
            . 'footsteps, the speakers themselves — reach the needle.',
        'sections' => [
            ['h' => 'What it has to get right', 'p' => [
                'Speed accuracy, because a record running fast plays sharp. Speed <em>stability</em> '
                . 'matters even more: slow wavering is heard as wow, fast wavering as flutter, and the '
                . 'ear is unforgiving about both on sustained piano or voice.',
                'Isolation, because the stylus cannot tell the difference between vibration coming from '
                . 'the groove and vibration coming from the floor. This is why turntables have heavy '
                . 'plinths and suspended sub-chassis, and why placing one on the same shelf as a speaker '
                . 'is a bad idea.',
            ]],
            ['h' => 'Belt drive and direct drive', 'p' => [
                'In a belt drive, a motor sits away from the platter and turns it through an elastic '
                . 'belt. The belt absorbs motor vibration before it reaches the record — good for '
                . 'isolation, at the cost of a slower start and a belt that perishes over time.',
                'In a direct drive, the platter sits on the motor itself. Speed is locked electronically, '
                . 'start-up is immediate and torque is high — which is exactly what a DJ needs and exactly '
                . 'why the format survived in clubs. Isolation then has to be solved by mass and damping '
                . 'rather than by the drive.',
                'Neither is simply better. They are different answers to the same problem, and a good '
                . 'example of either beats a poor example of the other.',
            ]],
            ['h' => 'The tonearm and the cartridge', 'p' => [
                'The arm has to hold the cartridge at the right height and angle, apply a precise '
                . 'downward force, and otherwise offer as little resistance as possible while the groove '
                . 'moves it across the record.',
                'Because the arm swings in an arc while the groove was cut in a straight line, the stylus '
                . 'is only perfectly aligned at two points across the record — which is what alignment '
                . 'protractors exist to optimise.',
                'A record also drags the arm gently inwards. Anti-skate applies a small outward force to '
                . 'cancel that, so the stylus presses evenly on both groove walls rather than favouring '
                . 'one channel and wearing it faster.',
            ]],
            ['h' => 'What it evolved into', 'p' => [
                'Very little, and that is the interesting part. A well-made turntable from the 1970s does '
                . 'the same job to a similar standard as a new one, because the problem it solves has not '
                . 'changed. Modern designs add USB outputs and better bearings; they have not had to '
                . 'reinvent the principle.',
            ]],
        ],
        'brands' => [
            ['name' => 'Technics', 'note' => 'Direct drive built for torque and stability; the SL-1200 line became the standard DJ tool.'],
            ['name' => 'Thorens', 'note' => 'A long line of suspended belt-drive designs from the Swiss maker.'],
            ['name' => 'Garrard', 'note' => 'British idler and record-changer mechanisms widely used in mid-century systems.'],
            ['name' => 'Dual', 'note' => 'German automatics and changers, common in European homes through the 1970s.'],
            ['name' => 'Rega', 'note' => 'Made the case that a light, rigid arm and low mass could beat added complexity.'],
            ['name' => 'Audio-Technica', 'note' => 'Best known for cartridges, and one of the reasons a good stylus stayed affordable.'],
        ],
        'facts' => [
            'Tracking force is usually between about 1.5 and 2.5 grams — roughly the weight of a paperclip resting on a point microns wide.',
            'Playing a record with too little downforce damages it more than playing it with slightly too much: a light stylus rattles in the groove.',
            '33⅓ is not arbitrary — it comes from fitting a required playing time onto a disc of a practical size at a workable groove pitch.',
            'A stylus is a wearing part. Manufacturers typically rate them in the hundreds of hours, not years.',
        ],
        'nostalgia' => 'Setting one up is a ritual with real steps: level the plinth, balance the arm, '
            . 'dial the counterweight, set anti-skate. People who have done it once tend to remember the '
            . 'first time the arm floated level and stayed there.',
        'sources' => [
            ['t' => 'Smithsonian NMAH — RCA Victor CP-5203 turntable', 'u' => 'https://americanhistory.si.edu/collections/object/nmah_706086'],
            ['t' => 'IEEE ETHW — Stereophonic Sound', 'u' => 'https://ethw.org/Stereophonic_Sound'],
            ['t' => 'Library of Congress — Caring for cylinder and disc recordings', 'u' => 'https://www.loc.gov/preservation/care/cyn.html'],
        ],
    ],

    // -------------------------------------------------------------------------
    'reel-to-reel' => [
        'title'  => 'Reel-to-Reel',
        'kicker' => 'Tape arrives',
        'years'  => '1935 onwards',
        'motif'  => 'reel',
        'blurb'  => 'The format that let a recording be edited, copied and re-recorded — and rebuilt the studio around it.',
        'metaTitle'       => 'Reel-to-Reel — How Magnetic Tape Changed Recording',
        'metaDescription' => 'From the AEG Magnetophon to the Ampex 200A, how open-reel magnetic tape works and why the ability to edit and overdub changed what a recording could be.',
        'intro' => 'Before tape, a recording was a performance cut directly to disc: whatever happened, '
            . 'happened. Tape made a recording something you could cut, join, copy and build up in '
            . 'layers — which changed not just how records were made, but what a record could be.',
        'sections' => [
            ['h' => 'Origin', 'p' => [
                'The German manufacturer AEG showed the Magnetophon, a high-fidelity reel-to-reel '
                . 'recorder, at the Berlin radio exhibition in 1935. It was used heavily by German and '
                . 'French broadcasters through the following decade.',
                'American engineers encountered the technology at the end of the Second World War. Ampex '
                . 'developed it commercially, and its Model 200A entered regular US broadcast service at '
                . 'ABC in Chicago on 25 April 1948.',
                'Radio wanted it for a practical reason before an artistic one: a programme recorded on '
                . 'tape could be broadcast later, at a quality indistinguishable from live.',
            ]],
            ['h' => 'How it worked', 'p' => [
                'The tape carries a coating of magnetic particles. A record head produces a magnetic '
                . 'field that varies with the audio signal, and as the tape passes it, that pattern is '
                . 'frozen into the particles.',
                'Playback is the same in reverse: the magnetised tape moving past a play head induces a '
                . 'small voltage that follows the original signal. An erase head simply scrambles the '
                . 'pattern back to nothing.',
                'Faster tape means more physical space per second of sound, which is why professional '
                . 'machines ran at high speeds and why speed is quoted in inches per second.',
            ]],
            ['h' => 'What it made possible', 'p' => [
                'You can cut tape with a blade and join it with adhesive. That one property created '
                . 'editing — the best take of a verse joined to the best take of a chorus — and with it '
                . 'the idea that a record is assembled rather than captured.',
                'Multitrack recording followed, and with it overdubbing: a musician playing along with '
                . 'themselves. Effects like tape echo and flanging come directly from the physical '
                . 'behaviour of tape and were discovered by people playing with the machines.',
            ]],
            ['h' => 'Then and now', 'p' => [
                'The cassette took tape to consumers by hiding the reels; open reel stayed professional '
                . 'and enthusiast. Digital recording eventually replaced it for production work.',
                'It survives because of what it does to sound. Tape saturates gently rather than clipping '
                . 'harshly when pushed, and that particular kind of gracefulness is still sought out '
                . 'deliberately.',
            ]],
        ],
        'brands' => [
            ['name' => 'AEG', 'note' => 'Showed the Magnetophon in 1935, the machine the whole industry descends from.'],
            ['name' => 'Ampex', 'note' => 'The Model 200A put tape into American broadcasting in 1948; Bing Crosby was an early investor.'],
            ['name' => 'Akai, TEAC, Revox', 'note' => 'Made open-reel decks a realistic thing to own at home in the 1960s and 1970s.'],
        ],
        'facts' => [
            'ABC ran twelve Ampex 200A machines up to eighteen hours a day and reported about three minutes of downtime across a year.',
            'Bing Crosby wanted tape so he could pre-record his radio show rather than perform it twice for different time zones.',
            'Tape is why "cut" and "splice" are still studio verbs long after any blade stopped being involved.',
            'A reel of tape reveals its own contents — you can see how much programme is left.',
        ],
        'nostalgia' => 'Open reel is the format that looks like what it does. The tape is visible, the '
            . 'reels turn at a speed you can watch, and when it plays you can see exactly how much of the '
            . 'music is still to come.',
        'sources' => [
            ['t' => 'IEEE ETHW — Ampex Corporation', 'u' => 'https://ethw.org/Ampex_Corporation'],
            ['t' => 'IEEE ETHW — Bing Crosby and Magnetic Recording', 'u' => 'https://ethw.org/Bing_Crosby_and_Magnetic_Recording'],
            ['t' => 'Smithsonian NMAH — Reel-to-reel tape recorder', 'u' => 'https://americanhistory.si.edu/collections/object/nmah_1344605'],
        ],
    ],

    ] + velorex_history_articles_two() + velorex_history_articles_modern();
}
