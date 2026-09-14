<?php
// =============================================================================
// The Evolution of Music & Audio — articles, part two.
//
// Split from history-content.php purely for file size; the two are merged by
// velorex_history_articles(). Read that file's header for the writing and
// sourcing rules, which apply identically here.
// =============================================================================

function velorex_history_articles_two(): array {
    return [

    // -------------------------------------------------------------------------
    'amplifiers' => [
        'title'  => 'Amplifiers',
        'kicker' => 'The box in the middle',
        'years'  => '1920s onwards',
        'motif'  => 'amp',
        'blurb'  => 'The component nobody listens to directly, and the one everything else depends on.',
        'metaTitle'       => 'Amplifiers — Valves, Transistors and How Your Stereo Gets Loud',
        'metaDescription' => 'What an amplifier does, why valve and transistor designs sound different, what a watt really buys, and why speaker matching matters more than power.',
        'intro' => 'A cartridge produces thousandths of a volt. A speaker needs volts and real current. '
            . 'The amplifier bridges that gap — and because everything passes through it, its character '
            . 'is on everything you hear.',
        'sections' => [
            ['h' => 'What it actually does', 'p' => [
                'An amplifier does not make the signal bigger in the way a magnifying glass makes print '
                . 'bigger. It uses the small incoming signal as a set of instructions for how to shape a '
                . 'much larger flow of power drawn from the mains.',
                'That is why a good power supply matters so much. The music you hear is, quite literally, '
                . 'mains electricity being sculpted into the shape of the input signal — and an amplifier '
                . 'that cannot deliver current quickly enough will run out of headroom exactly when the '
                . 'music gets demanding.',
            ]],
            ['h' => 'Valves and transistors', 'p' => [
                'Valve amplifiers came first and dominated until the 1960s. They tend to distort '
                . 'gradually as they are pushed, adding harmonics that many listeners find pleasant, and '
                . 'they run hot and need periodic replacement.',
                'Transistors are efficient, cool, cheap to make and capable of far more power. Early '
                . 'solid-state designs earned a reputation for hardness — partly because when they do '
                . 'run out, they clip abruptly rather than softening.',
                'The disagreement between the two camps is now sixty years old and shows no sign of '
                . 'resolving, which is usually a sign that both sides are describing something real.',
            ]],
            ['h' => 'Integrated, pre and power', 'p' => [
                'A preamplifier selects the source and controls volume. A power amplifier does the heavy '
                . 'lifting. An integrated amplifier puts both in one box, which is what most people own.',
                'Splitting them lets each be optimised and keeps the sensitive low-level circuitry away '
                . 'from the heat and magnetic fields of the power section. It also doubles the number of '
                . 'boxes, cables and decisions.',
                'A receiver adds a radio tuner to the same chassis — for many households in the 1970s, '
                . 'that one box was the entire system.',
            ]],
            ['h' => 'Why watts mislead', 'p' => [
                'Loudness does not scale with power the way people expect. Doubling the watts produces a '
                . 'modest increase in perceived volume, which is why a 100-watt amplifier does not sound '
                . 'twice as loud as a 50-watt one.',
                'Speaker sensitivity often matters more. An efficient speaker can go louder on ten watts '
                . 'than an inefficient one does on a hundred. Matching amplifier to speaker is the real '
                . 'skill; the number on the front panel is the least useful part of the specification.',
            ]],
        ],
        'brands' => [
            ['name' => 'Marantz', 'note' => 'Valve designs of the 1950s and 60s that are still benchmarks for the era.'],
            ['name' => 'Sansui, Pioneer', 'note' => 'Defined the 1970s Japanese receiver — heavy, powerful and built to be kept.'],
            ['name' => 'Yamaha', 'note' => 'Pursued measurable transparency as an explicit design goal.'],
            ['name' => 'Denon', 'note' => 'Long line of integrated amplifiers and receivers bridging hi-fi and home cinema.'],
        ],
        'facts' => [
            'Perceived loudness roughly doubles for about a tenfold increase in power, not a doubling.',
            'A phono input is not just a louder line input — it applies a standard equalisation curve without which records sound thin.',
            'Most amplifiers spend nearly all their life delivering a fraction of a watt; the rated power is headroom for peaks.',
            'Valve amplifiers need a speaker connected before being driven hard — an unloaded output transformer can be damaged.',
        ],
        'nostalgia' => 'The amplifier was the piece you saved for, and the one with the physical controls '
            . 'worth touching: a heavy volume knob with a little resistance in it, a row of switches that '
            . 'clicked, and a faint warmth on the top panel after an evening.',
        'sources' => [
            ['t' => 'IEEE ETHW — Stereophonic Sound', 'u' => 'https://ethw.org/Stereophonic_Sound'],
            ['t' => 'Audio Engineering Society — A History and Evolution of the Recording Studio', 'u' => 'https://www.aes.org/aeshc/pdf/putnam_history-of-recording-studios.pdf'],
        ],
    ],

    // -------------------------------------------------------------------------
    'speakers' => [
        'title'  => 'Speakers',
        'kicker' => 'Turning current back into air',
        'years'  => '1920s onwards',
        'motif'  => 'speaker',
        'blurb'  => 'The last component in the chain, and the one that changes the sound most.',
        'metaTitle'       => 'Speakers — How Loudspeakers Work and Why Rooms Matter',
        'metaDescription' => 'Drivers, crossovers, cabinets and acoustic suspension — how a loudspeaker turns electricity into sound, and why the room is part of the speaker.',
        'intro' => 'Everything upstream deals in electricity. The speaker is where that becomes moving '
            . 'air — a mechanical job, in a room, subject to physics that no amount of electronics can '
            . 'route around. It is why two systems sharing every other component still sound different.',
        'sections' => [
            ['h' => 'How a driver works', 'p' => [
                'A coil of wire sits in the gap of a permanent magnet and is glued to a cone. Send '
                . 'current through the coil and it becomes an electromagnet, pushed or pulled by the '
                . 'fixed magnet depending on the direction of the current.',
                'The cone moves with it, pushing air away and pulling it back thousands of times a '
                . 'second. That pressure wave is the sound. The whole principle is a century old and has '
                . 'not needed replacing.',
            ]],
            ['h' => 'Why there is more than one', 'p' => [
                'A cone big enough to move the air for deep bass is far too heavy to start and stop fast '
                . 'enough for treble. So the job is divided: a woofer for low frequencies, a tweeter for '
                . 'high, sometimes a midrange between them.',
                'A crossover — a filter network inside the cabinet — decides which frequencies go where. '
                . 'It is a large part of why speakers using identical drivers can sound entirely '
                . 'different, and one of the harder things in the whole chain to get right.',
            ]],
            ['h' => 'The cabinet is not just a box', 'p' => [
                'The back of a cone radiates sound too, exactly out of phase with the front. Left alone '
                . 'those two cancel each other, and the bass disappears. The cabinet exists to stop that.',
                'A sealed box traps the rear wave and uses the compressed air inside as a spring. Acoustic '
                . 'Research popularised this acoustic-suspension approach in the 1950s, and it is why '
                . 'genuinely deep bass became possible from a bookshelf-sized enclosure rather than a '
                . 'piece of furniture.',
                'A ported box instead lets the rear wave out through a tuned tube, in phase, to reinforce '
                . 'the bass — more output for the size, at the cost of control below the tuning point.',
            ]],
            ['h' => 'The room is part of the speaker', 'p' => [
                'Most of what reaches your ears indoors has bounced off something. Room dimensions '
                . 'reinforce some bass notes and cancel others, and hard surfaces smear detail.',
                'This is why placement changes sound so dramatically, and why moving a speaker away from '
                . 'a wall often does more than replacing the amplifier. It is the cheapest upgrade in '
                . 'audio and the one people try last.',
            ]],
        ],
        'brands' => [
            ['name' => 'Acoustic Research', 'note' => 'Popularised acoustic suspension, making real bass possible from a small sealed cabinet.'],
            ['name' => 'JBL', 'note' => 'Studio monitors and high-efficiency designs widely used in professional rooms.'],
            ['name' => 'Bose', 'note' => 'Pursued reflected-sound designs aimed at how speakers behave in real rooms.'],
            ['name' => 'Yamaha', 'note' => 'The NS-10 became an industry reference for mixing, more for its honesty than its beauty.'],
        ],
        'facts' => [
            'Speaker sensitivity is quoted in dB for one watt at one metre; a few dB difference is worth more than a large power increase.',
            'Getting a speaker \'s two drivers to arrive in step matters as much as the drivers themselves — that is the crossover\'s real job.',
            'Bass is the hardest thing to reproduce in a room, and the frequency range most affected by where you stand.',
            'Cone materials are a trade-off between stiffness, mass and damping; no single material wins on all three.',
        ],
        'nostalgia' => 'Speakers were furniture. Big boxes on the floor with fabric grilles that came off '
            . 'to reveal the drivers, positioned by trial and error, and argued about. Taking the grilles '
            . 'off was, and still is, the first thing anyone does.',
        'sources' => [
            ['t' => 'IEEE ETHW — Stereophonic Sound', 'u' => 'https://ethw.org/Stereophonic_Sound'],
            ['t' => 'Audio Engineering Society — Historical publications', 'u' => 'https://www.aes.org/aeshc/'],
        ],
    ],

    // -------------------------------------------------------------------------
    'cassette' => [
        'title'  => 'Cassette Players',
        'kicker' => 'Music you could make yourself',
        'years'  => '1963 onwards',
        'motif'  => 'cassette',
        'blurb'  => 'The format that put recording in ordinary hands — and invented the mixtape.',
        'metaTitle'       => 'Cassette Players — The Compact Cassette, Walkman and Mixtape Era',
        'metaDescription' => 'How Philips introduced the Compact Cassette in 1963, how the mechanism works, why the Walkman changed listening, and why cassette culture came back.',
        'intro' => 'Every format before it was something you bought. The cassette was the first that '
            . 'ordinary people could also <em>write</em> — and once anyone could make a tape, music '
            . 'started being passed between people rather than only sold to them.',
        'sections' => [
            ['h' => 'Origin', 'p' => [
                'Philips introduced the Compact Cassette at the Funkausstellung, the Berlin radio '
                . 'exhibition, in August 1963. Open-reel tape already sounded better; the cassette\'s '
                . 'advantage was that it required no skill at all.',
                'The reels lived inside a sealed plastic shell, so the tape was never threaded, never '
                . 'touched and difficult to damage. You pushed it in and pressed a button.',
                'Philips also licensed the format widely rather than keeping it proprietary. That '
                . 'decision — more than any technical one — is why the cassette became the thing every '
                . 'other manufacturer built for.',
            ]],
            ['h' => 'How it worked', 'p' => [
                'Two small reels, a length of magnetic tape, and a shell with openings along one edge. '
                . 'Behind those openings sit the erase head, the record/play head, and a capstan and '
                . 'pinch roller that pull the tape past at a constant speed.',
                'The capstan matters more than it looks. The take-up reel changes diameter as it fills, '
                . 'so it cannot set the speed; the capstan does, and the reels merely keep up. A worn '
                . 'pinch roller is the usual reason an old deck plays at the wrong pitch.',
                'Tape moved at 1⅞ inches per second — slow, which is what made long recordings fit and '
                . 'also what made hiss the format\'s defining problem. Dolby noise reduction was the '
                . 'standard answer.',
            ]],
            ['h' => 'The golden years', 'p' => [
                'Two things made the cassette dominant. The car, because a cassette tolerated heat and '
                . 'vibration far better than a record could. And the Walkman: Sony launched the TPS-L2 in '
                . 'Japan on 1 July 1979, and music became something that followed you down the street.',
                'The first Walkman had two headphone sockets and a button that let one listener talk to '
                . 'the other over the music — Sony was not yet certain that listening alone in public '
                . 'would be socially acceptable.',
                'Then there was the mixtape. Making one took as long as it took to play, in real time, '
                . 'and every choice was final. That cost is precisely what made it a gift.',
            ]],
            ['h' => 'Then and now', 'p' => [
                'The CD offered better sound and instant track access, and the cassette faded through the '
                . '1990s. Sony continued the TPS-L2 line until the format\'s decline in the mid-2000s.',
                'Its return is not really about fidelity — by any measurement the cassette loses. It is '
                . 'about the object: cheap to produce in small runs, physical enough to sell at a show, '
                . 'and hand-labelled in a way a download cannot be.',
            ]],
        ],
        'brands' => [
            ['name' => 'Philips', 'note' => 'Created the Compact Cassette in 1963 and licensed it widely, which is why it became universal.'],
            ['name' => 'Sony', 'note' => 'The Walkman line, from the TPS-L2 of 1979, made personal portable listening ordinary.'],
            ['name' => 'Nakamichi', 'note' => 'Pushed cassette decks to a standard many thought the format incapable of.'],
            ['name' => 'TDK, Maxell', 'note' => 'The tapes themselves — the choice of Type I, II or IV was a real decision people made.'],
            ['name' => 'JVC, Panasonic, Akai', 'note' => 'Made decks and portables that put the format in most homes.'],
        ],
        'facts' => [
            'The Walkman launched under three different names — Soundabout in the US, Stowaway in the UK, Freestyle in Sweden — before Sony standardised on Walkman.',
            'The TPS-L2 weighed about 14 ounces and ran on two AA batteries.',
            'A pencil fits a cassette hub because the hub was designed to be turned by a spindle — winding tape by hand saved batteries.',
            'Type IV metal tapes needed a deck that could bias for them; using the wrong setting produced a dull, distorted recording.',
        ],
        'nostalgia' => 'Recording off the radio meant sitting with a finger over the pause button waiting '
            . 'for the DJ to stop talking. You almost always caught a word of speech at the start, and '
            . 'after enough plays that word became part of the song.',
        'sources' => [
            ['t' => 'Philips — First Philips cassette recorder, 1963', 'u' => 'https://www.philips.com/a-w/about/news/media-library/20190101-First-Philips-cassette-recorder-1963.html'],
            ['t' => 'Smithsonian NMAH — Sony TPS-L2 "Walkman" cassette player', 'u' => 'https://americanhistory.si.edu/collections/object/nmah_714276'],
            ['t' => 'Smithsonian Music — The Sony TPS-L2 Walkman', 'u' => 'https://music.si.edu/object-day/sony-tps-l2-walkman-cassette-player'],
            ['t' => 'IEEE ETHW — Walkman', 'u' => 'https://ethw.org/Walkman'],
        ],
    ],

    // -------------------------------------------------------------------------
    'cd' => [
        'title'  => 'CD Players',
        'kicker' => 'A laser instead of a needle',
        'years'  => '1982 onwards',
        'motif'  => 'cd',
        'blurb'  => 'The first format where playing something did not slowly wear it out.',
        'metaTitle'       => 'CD Players — How the Compact Disc Worked and Why It Took Over',
        'metaDescription' => 'Philips and Sony, the 1982 launch, how a laser reads pits on a disc, what sampling really means, and why the CD replaced vinyl and cassette so quickly.',
        'intro' => 'Every earlier format worked by contact — a needle in a groove, a head against tape — '
            . 'and every play took a little of the recording away. The CD read the disc with light, and '
            . 'the hundredth play was identical to the first.',
        'sections' => [
            ['h' => 'Origin', 'p' => [
                'Philips demonstrated optical digital audio playback to the international press in March '
                . '1979, showing that a disc read by laser could reproduce stereo audio.',
                'Rather than fight a format war, Philips and Sony formed an alliance in 1979 and agreed a '
                . 'single standard — a decision that spared the CD the fate of competing formats that '
                . 'split the market and died.',
                'The Compact Disc launched in Japan in November 1982 and reached Europe in March 1983.',
            ]],
            ['h' => 'How it worked', 'p' => [
                'Sound is measured many thousands of times a second and each measurement stored as a '
                . 'number. Play it back in order at the same rate and the waveform is reconstructed.',
                'Those numbers live on the disc as microscopic pits pressed into a reflective layer. A '
                . 'laser shines on the track; light reflects differently from a pit than from the flat '
                . 'land beside it, and the player reads that difference as ones and zeros.',
                'Because it is reading numbers rather than tracing a shape, small imperfections can be '
                . 'corrected mathematically. That is why a lightly scratched CD often plays perfectly '
                . 'while an equivalently damaged record does not.',
                'Discs are read from the centre outwards — the opposite of a record — and the disc slows '
                . 'as the laser moves out, so the track passes the laser at a constant speed.',
            ]],
            ['h' => 'Why it took over so fast', 'p' => [
                'No surface noise, no hiss, no wear. Instant track access instead of lifting an arm or '
                . 'winding tape. Small enough for the car and eventually for a pocket.',
                'It also gave the industry something no new format had offered before: a reason for '
                . 'people to buy music they already owned, again. Back catalogue reissues were a large '
                . 'part of the economics of the era.',
            ]],
            ['h' => 'Then and now', 'p' => [
                'The MP3 and then streaming took the convenience argument further than a disc could '
                . 'follow, and CD sales fell sharply through the 2000s.',
                'What remains is a format that is genuinely good and now inexpensive. A CD is a perfect '
                . 'copy of a master that does not degrade, does not depend on a subscription, and cannot '
                . 'be removed from your shelf by a licensing dispute.',
            ]],
        ],
        'brands' => [
            ['name' => 'Philips', 'note' => 'Demonstrated optical digital audio in 1979 and co-developed the standard.'],
            ['name' => 'Sony', 'note' => 'The other half of the alliance, and the company that later made the format portable.'],
            ['name' => 'Denon, Marantz, Technics', 'note' => 'Built the separate CD player into a serious hi-fi component through the 1980s.'],
        ],
        'facts' => [
            'Philips and Sony agreed a common standard rather than competing — unusual, and the main reason the CD had no format war.',
            'The disc spins more slowly as the laser tracks outward, keeping the data passing at a constant rate.',
            'Error correction is built into the format itself, which is why a scratch that would ruin a record is often inaudible.',
            'The CD reads from the inside out; a record plays from the outside in.',
        ],
        'nostalgia' => 'The CD had its own set of small rituals: the hinge of the jewel case, the tiny '
            . 'booklet with lyrics printed too small, the drawer sliding shut on its own, and the pause '
            . 'while the player read the disc and told you how many tracks were coming.',
        'sources' => [
            ['t' => 'Philips — Compact Disc, 1982–1983', 'u' => 'https://www.philips.com/a-w/about/news/media-library/20190101-Philips-Compact-Disc-player-1982-1983.html'],
            ['t' => 'Philips Research — The history of the CD: the beginning', 'u' => 'https://www.philips.com/a-w/research/technologies/cd/beginning.htm'],
            ['t' => 'IEEE ETHW — Compact Discs (CDs)', 'u' => 'https://ethw.org/Compact_Discs_(CDs)'],
            ['t' => 'Smithsonian Music — Laser for Sony Discman', 'u' => 'https://music.si.edu/object-day/laser-sony-discman'],
        ],
    ],

    // -------------------------------------------------------------------------
    'mp3' => [
        'title'  => 'MP3 & Compression',
        'kicker' => 'Throwing away what you cannot hear',
        'years'  => '1993 onwards',
        'motif'  => 'mp3',
        'blurb'  => 'The idea that made music small enough to move, and loosened everything else.',
        'metaTitle'       => 'MP3 — How Audio Compression Changed the Music Industry',
        'metaDescription' => 'How MPEG-1 Layer 3 works, where the name came from, and why making music files small enough to send changed distribution, ownership and the industry itself.',
        'intro' => 'A CD track holds far more data than a 1990s internet connection could move in any '
            . 'reasonable time. Compression solved that not by storing the sound more cleverly, but by '
            . 'deciding which parts of it a listener would never notice were gone.',
        'sections' => [
            ['h' => 'Origin', 'p' => [
                'MPEG-1, the standard that includes Layer 3 audio coding, was published by ISO in 1993. '
                . 'The three audio layers were developed collaboratively, with Fraunhofer IIS and the '
                . 'University of Erlangen among the contributing institutions.',
                'The familiar name came later and more casually than the technology: the ".mp3" file '
                . 'extension was settled by an internal email poll at Fraunhofer IIS on 14 July 1995.',
            ]],
            ['h' => 'How it works', 'p' => [
                'The technique is called perceptual coding, and it is built on how hearing actually '
                . 'behaves rather than on the mathematics of the waveform.',
                'A loud sound masks a quieter one at a nearby frequency — you genuinely cannot hear the '
                . 'quieter one while the louder is present. The encoder finds those masked components and '
                . 'simply does not store them. It also spends fewer bits on frequencies where the ear is '
                . 'less sensitive.',
                'This is lossy: the discarded information is gone permanently. Encoding an MP3 back to a '
                . 'CD does not restore it, and re-encoding an MP3 repeatedly compounds the damage — which '
                . 'is why bitrate arguments were so heated and why archives keep lossless masters.',
            ]],
            ['h' => 'What it changed', 'p' => [
                'A song became a file: something you could email, put on a hard disc, carry a thousand of, '
                . 'and copy perfectly and instantly at no cost. Distribution stopped being a physical '
                . 'problem, and with it went the industry\'s main point of control.',
                'The consequences arrived faster than anyone\'s business model. File sharing, the collapse '
                . 'of the album as a purchase unit, the legal download store, and eventually streaming '
                . 'are all downstream of making the file small.',
            ]],
            ['h' => 'Then and now', 'p' => [
                'Newer codecs — AAC and others — do the same job more efficiently, and bandwidth is now '
                . 'cheap enough that lossless streaming is ordinary. The specific format matters less '
                . 'than it did.',
                'The idea, though, is now everywhere. Every streamed song you hear is compressed by some '
                . 'descendant of this reasoning about what the ear will not miss.',
            ]],
        ],
        'brands' => [
            ['name' => 'Fraunhofer IIS', 'note' => 'Central to Layer 3\'s development, and where the ".mp3" extension was chosen in 1995.'],
            ['name' => 'MPEG / ISO', 'note' => 'Published MPEG-1 in 1993 as an open international standard rather than one company\'s format.'],
            ['name' => 'University of Erlangen', 'note' => 'Among the academic partners in the collaborative development of the layers.'],
        ],
        'facts' => [
            'The name was decided by an internal poll, not a committee — on 14 July 1995.',
            'MPEG-1 defined three audio layers of increasing complexity; Layer 3 is the most efficient and the hardest to encode.',
            'Perceptual coding works because of masking: a loud tone genuinely renders a nearby quiet one inaudible.',
            'Lossy compression is one-way. Nothing downstream can recover what the encoder discarded.',
        ],
        'nostalgia' => 'For a certain generation the memory is a progress bar: a single song arriving over '
            . 'a dial-up connection across several minutes, the filename usually wrong, the artist often '
            . 'misattributed, and the last few seconds sometimes missing.',
        'sources' => [
            ['t' => 'Fraunhofer IIS — 30 Years of .mp3', 'u' => 'https://www.iis.fraunhofer.de/en/magazin/panorama/2025/30-years-of-mp3.html'],
            ['t' => 'Library of Congress — MP3 (MPEG Layer III Audio Encoding) format description', 'u' => 'https://www.loc.gov/preservation/digital/formats/fdd/fdd000012.shtml'],
            ['t' => 'Fraunhofer — MP3 and AAC explained (AES)', 'u' => 'https://www.iis.fraunhofer.de/content/dam/iis/de/doc/ame/conference/AES-17-Conference_mp3-and-AAC-explained_AES17.pdf'],
        ],
    ],

    // -------------------------------------------------------------------------
    'portable-players' => [
        'title'  => 'Portable Music Players',
        'kicker' => 'The collection in a pocket',
        'years'  => '1979 onwards',
        'motif'  => 'ipod',
        'blurb'  => 'From one cassette at a time to the entire library, always with you.',
        'metaTitle'       => 'Portable Music Players — From the Walkman to the iPod',
        'metaDescription' => 'How portable listening went from the 1979 Walkman through the Discman to hard-disc players, and how carrying a whole collection changed listening.',
        'intro' => 'Portable music has been reinvented roughly once a decade, and each time the change '
            . 'was really about how much you could bring. One tape. One disc. Then everything.',
        'sections' => [
            ['h' => 'One album at a time', 'p' => [
                'Sony launched the TPS-L2 in Japan on 1 July 1979, reaching the United States the '
                . 'following year. It played cassettes, ran on two AA batteries, and did not record — an '
                . 'omission that seemed strange until people used it.',
                'You chose what to bring before leaving the house, and lived with that decision. The '
                . 'mixtape existed partly because of this constraint: if you could only carry ninety '
                . 'minutes, they had better be the right ninety minutes.',
                'Portable CD players followed and brought better sound, but a spinning disc and walking '
                . 'are poor companions — skip-protection buffers existed entirely to paper over that.',
            ]],
            ['h' => 'Everything at once', 'p' => [
                'Apple released the first iPod on 23 October 2001: a 5 GB hard drive holding roughly a '
                . 'thousand songs. The number mattered less than the shift it represented — you were no '
                . 'longer choosing what to bring.',
                'Windows support arrived in 2002 and the iTunes Store in 2003, and the store may have '
                . 'been the more consequential half. Buying a single track legally in a few seconds gave '
                . 'people an alternative to file sharing that was simply easier than stealing.',
            ]],
            ['h' => 'What it changed', 'p' => [
                'Listening became private and continuous. Music filled commutes, walks, gyms and queues '
                . '— time that had previously been silent or shared.',
                'It also changed the shape of a collection. Shelf space had always been the limit; now '
                . 'the limit was a number on a specification sheet, and shortly after that, nothing.',
            ]],
            ['h' => 'Then and now', 'p' => [
                'The dedicated player was absorbed by the phone, which already had the screen, the '
                . 'storage and the network. Standalone players survive mainly for people who want '
                . 'high-resolution playback or a device that does not interrupt.',
                'That last motivation is quietly growing. A player that cannot receive a notification is '
                . 'now a feature rather than a limitation.',
            ]],
        ],
        'brands' => [
            ['name' => 'Sony', 'note' => 'The Walkman from 1979, and the Discman that followed it.'],
            ['name' => 'Apple', 'note' => 'The iPod of 2001 paired hard-disc capacity with a legal store; the combination is what worked.'],
            ['name' => 'Panasonic, Aiwa', 'note' => 'Personal cassette and CD players that made portable listening affordable.'],
        ],
        'facts' => [
            'The first iPod held about 1,000 songs on a 5 GB drive.',
            'The original Walkman had two headphone jacks — Sony expected listening to remain a shared activity.',
            'Portable CD players buffered audio into memory specifically so walking would not cause skipping.',
            'iTunes selling single tracks legally is widely credited with reducing casual file sharing more than enforcement did.',
        ],
        'nostalgia' => 'The universal memory is the battery. Working out whether you had enough for the '
            . 'journey home, the sound slowing and deepening as they died, and the spare pair carried '
            . 'loose in a bag.',
        'sources' => [
            ['t' => 'Smithsonian NMAH — iPod', 'u' => 'https://americanhistory.si.edu/collections/object/nmah_1334905'],
            ['t' => 'Smithsonian NMAH — Apple\'s iTunes', 'u' => 'https://americanhistory.si.edu/explore/exhibitions/americas-listening/online/apples-itunes'],
            ['t' => 'Smithsonian NMAH — Sony TPS-L2 "Walkman"', 'u' => 'https://americanhistory.si.edu/collections/object/nmah_714276'],
        ],
    ],

    // -------------------------------------------------------------------------
    'headphones' => [
        'title'  => 'Headphones',
        'kicker' => 'Listening alone, together',
        'years'  => '1910s onwards',
        'motif'  => 'headphones',
        'blurb'  => 'Equipment borrowed from telephone exchanges that ended up defining modern listening.',
        'metaTitle'       => 'Headphones — From Radio Necessity to Personal Listening',
        'metaDescription' => 'How headphones went from a necessity of early radio to the main way people hear music, and what open, closed and noise-cancelling designs trade away.',
        'intro' => 'Headphones began as a workaround. Early radio signals were too weak to drive a '
            . 'loudspeaker, so listeners pressed a small transducer to each ear. A century later, they '
            . 'are how most music in the world is heard.',
        'sections' => [
            ['h' => 'Origin', 'p' => [
                'The earliest sets came out of telephone and telegraph work, where an operator needed to '
                . 'hear a faint signal in a noisy room. Early radio inherited both the hardware and the '
                . 'reason.',
                'As amplification improved, loudspeakers took over the living room and headphones became '
                . 'specialist equipment — for studios, for radio operators, and for listening without '
                . 'disturbing anybody.',
                'The Walkman turned that around completely. From 1979, headphones stopped being what you '
                . 'used when a speaker was impossible and became the normal way to listen.',
            ]],
            ['h' => 'Open, closed and in-ear', 'p' => [
                'A closed-back design seals around the ear. It keeps outside noise out and your music in, '
                . 'at the cost of a smaller sense of space — the sound is unmistakably happening inside '
                . 'your head.',
                'An open-back design lets air and sound pass through the rear of the earcup. It usually '
                . 'sounds more natural and less pressurised, and it leaks in both directions — unusable '
                . 'on a train, excellent in a quiet room.',
                'In-ear designs seal in the ear canal itself. Enormous isolation for the size, and the '
                . 'reason the whole category could shrink to something carried in a pocket.',
            ]],
            ['h' => 'Noise cancelling', 'p' => [
                'A microphone on the outside listens to the surrounding noise. The electronics generate '
                . 'the exact inverse of that sound and add it to what you hear, so the two largely cancel '
                . 'before reaching your ear.',
                'It works best on steady, low-frequency noise — aircraft cabins, train rumble, air '
                . 'conditioning — and much less well on speech, which is irregular and higher up. That is '
                . 'physics rather than a shortcoming of any particular product.',
            ]],
            ['h' => 'Why it matters more than it used to', 'p' => [
                'Headphones bypass the room entirely, which removes the single biggest variable in home '
                . 'audio. A modest pair can deliver a level of clarity that would take a substantially '
                . 'more expensive speaker system in a real room.',
                'They also changed how music is made. Producers know most listeners are on headphones or '
                . 'earbuds, and mixes are checked accordingly.',
            ]],
        ],
        'brands' => [
            ['name' => 'Sony', 'note' => 'The MDR headphones bundled with the Walkman put the category in millions of hands.'],
            ['name' => 'Audio-Technica', 'note' => 'Long-running studio and consumer lines that made monitoring quality affordable.'],
            ['name' => 'Bose', 'note' => 'Drove consumer adoption of active noise cancellation, particularly for travel.'],
            ['name' => 'JBL, Yamaha', 'note' => 'Studio monitoring headphones widely used in professional rooms.'],
        ],
        'facts' => [
            'Early radio listeners used headphones because receivers could not drive a loudspeaker.',
            'Noise cancelling works far better on constant low-frequency noise than on voices.',
            'Open-back headphones leak sound outward — audible to the person next to you at moderate volume.',
            'Headphones remove room acoustics from the equation, which is why they are used for critical listening.',
        ],
        'nostalgia' => 'Untangling the cable before you could listen to anything. Foam earpads that '
            . 'crumbled after a few years. And the specific unfairness of one channel cutting out unless '
            . 'the plug was held at exactly the right angle.',
        'sources' => [
            ['t' => 'Smithsonian — TPS-L2 Walkman and MDR-3L2 headphones', 'u' => 'https://www.si.edu/object/tps-l2-walkman-cassette-player-and-mdr-3l2-headphones:chndm_2017-51-4-a_c'],
            ['t' => 'IEEE ETHW — Walkman', 'u' => 'https://ethw.org/Walkman'],
        ],
    ],

    // -------------------------------------------------------------------------
    'digital-audio' => [
        'title'  => 'Digital Audio',
        'kicker' => 'Sound as numbers',
        'years'  => '1970s onwards',
        'motif'  => 'digital',
        'blurb'  => 'The idea underneath the CD, the MP3 and everything streaming today.',
        'metaTitle'       => 'Digital Audio — Sampling, Bit Depth and What They Actually Mean',
        'metaDescription' => 'What sample rate and bit depth control, why 44.1 kHz was chosen, how lossless differs from lossy, and why digital audio is widely misunderstood.',
        'intro' => 'Digital audio is one idea applied repeatedly: measure the sound often enough, and '
            . 'accurately enough, and the numbers hold everything a listener can hear. Almost every '
            . 'argument about digital sound is really an argument about "enough".',
        'sections' => [
            ['h' => 'Sampling', 'p' => [
                'Take a measurement of the waveform many thousands of times a second. Each measurement '
                . 'is a sample; play them back in order at the same rate and the wave is reconstructed.',
                'How often is often enough? The governing result is that you must sample at more than '
                . 'twice the highest frequency you want to capture. Human hearing tops out around 20 kHz, '
                . 'so a rate above 40 kHz suffices — which is why the CD\'s 44.1 kHz is not arbitrary.',
                'A very common misunderstanding is that the output is a staircase of steps. It is not. '
                . 'Given a properly band-limited signal there is exactly one waveform that passes through '
                . 'those points, and reconstruction recovers it — the steps are an artefact of how the '
                . 'process is usually drawn, not of how it works.',
            ]],
            ['h' => 'Bit depth', 'p' => [
                'Bit depth is how precisely each individual sample is measured. More bits means finer '
                . 'gradations between the quietest and loudest representable sound.',
                'Bit depth therefore controls dynamic range and the noise floor — not, as is often '
                . 'assumed, frequency response or "detail". Sixteen bits, as used on CD, spans a range '
                . 'wider than most listening rooms are quiet enough to reveal.',
                'Higher depths matter most in production, where repeated processing accumulates rounding '
                . 'errors and headroom is needed before anything is mixed down.',
            ]],
            ['h' => 'Lossless and lossy', 'p' => [
                'Lossless compression — FLAC and ALAC among them — makes the file smaller with no '
                . 'discarded information at all, exactly like zipping a document. Decode it and you have '
                . 'the original bit for bit.',
                'Lossy compression — MP3, AAC — makes files much smaller by permanently discarding parts '
                . 'of the signal judged inaudible. It is far more efficient, and it is one-way.',
                'For listening, a good lossy encode at a high bitrate is very hard to distinguish from '
                . 'lossless. For archiving, only lossless makes sense, because you cannot know what a '
                . 'future format will need.',
            ]],
            ['h' => 'Why it still gets argued about', 'p' => [
                'Some of the disagreement is real: early converters genuinely were poor, and bad '
                . 'mastering is bad regardless of format. Much of the rest is a mastering argument wearing '
                . 'a format argument\'s clothes — the same album is often mastered differently for vinyl '
                . 'and for digital, and people compare the masters while believing they are comparing the '
                . 'media.',
            ]],
        ],
        'brands' => [
            ['name' => 'Philips & Sony', 'note' => 'Set the first mass-market digital audio standard with the CD in 1982.'],
            ['name' => 'Fraunhofer IIS', 'note' => 'Perceptual coding work that made digital audio small enough to distribute.'],
            ['name' => 'Denon, Yamaha, Technics', 'note' => 'Brought digital conversion into consumer components through the 1980s.'],
        ],
        'facts' => [
            'The CD\'s 44.1 kHz rate follows from needing more than twice the ~20 kHz limit of human hearing.',
            'Bit depth sets dynamic range and noise floor — not frequency response.',
            'The "staircase" picture of digital audio is a drawing convention, not what a reconstructed signal looks like.',
            'Lossless compression is genuinely lossless: decode a FLAC and you get the original bits back exactly.',
        ],
        'nostalgia' => 'Digital audio\'s nostalgia is oddly domestic: ripping a CD collection one disc at '
            . 'a time, correcting track names by hand, and the particular satisfaction of a library where '
            . 'every album finally had the right artwork.',
        'sources' => [
            ['t' => 'Library of Congress — MP3 format description', 'u' => 'https://www.loc.gov/preservation/digital/formats/fdd/fdd000012.shtml'],
            ['t' => 'IEEE ETHW — Compact Discs (CDs)', 'u' => 'https://ethw.org/Compact_Discs_(CDs)'],
            ['t' => 'Philips Research — The history of the CD', 'u' => 'https://www.philips.com/a-w/research/technologies/cd/introduction.html'],
        ],
    ],

    // -------------------------------------------------------------------------
    'streaming' => [
        'title'  => 'Streaming & Wireless Audio',
        'kicker' => 'Access instead of ownership',
        'years'  => '2000s onwards',
        'motif'  => 'stream',
        'blurb'  => 'Music stopped being something you keep and became something you reach.',
        'metaTitle'       => 'Streaming & Wireless Audio — How Music Became a Service',
        'metaDescription' => 'How streaming replaced files, how Bluetooth and wi-fi speakers differ, what you give up by not owning music, and why physical formats came back.',
        'intro' => 'Downloads still gave you a file that was yours. Streaming removed even that: the '
            . 'music stays on somebody else\'s server and arrives when you ask. It is the largest change '
            . 'in how people get music since the gramophone, and the one with the least visible hardware.',
        'sections' => [
            ['h' => 'What changed', 'p' => [
                'The unit of purchase disappeared. You no longer buy an album or a track; you rent access '
                . 'to a catalogue, and stop paying when you stop listening.',
                'Scarcity disappeared with it. For most of recorded history, hearing a specific song '
                . 'meant owning it, borrowing it or waiting for the radio. Now almost anything is a '
                . 'search away, which is genuinely wonderful and has quietly removed the anticipation '
                . 'that used to be part of music.',
            ]],
            ['h' => 'Bluetooth and wi-fi are not the same thing', 'p' => [
                'Bluetooth sends audio from your device to the speaker over a short-range link with '
                . 'limited bandwidth, so the audio is re-compressed on the way. It is simple, works '
                . 'anywhere, and your phone is doing the playing.',
                'A wi-fi speaker joins your network and fetches the stream itself. Your phone acts as a '
                . 'remote control, not a source — so a call does not interrupt the music, range is the '
                . 'whole house, and no extra compression is imposed.',
                'This is why multi-room systems are wi-fi based: keeping several speakers in sync is a '
                . 'network problem, not a wireless-headphone problem.',
            ]],
            ['h' => 'What you give up', 'p' => [
                'Catalogues change. Albums leave over licensing disputes, and a playlist can quietly lose '
                . 'tracks. Nothing you have listened to for a decade is guaranteed to be there tomorrow.',
                'There is also nothing to show for it. A decade of streaming leaves no shelf, no sleeves, '
                . 'nothing to lend, nothing to inherit. It is not sentimentality to notice that — it is a '
                . 'genuine difference in what the money bought.',
                'That absence is a large part of why vinyl and cassette returned during precisely the '
                . 'years streaming became dominant. The two are not really competing: one is how people '
                . 'listen, the other is what they keep.',
            ]],
            ['h' => 'Where it is going', 'p' => [
                'Bandwidth is now cheap enough that lossless streaming is ordinary rather than premium, '
                . 'so the fidelity argument that dogged early services has largely gone away.',
                'The open question is curation. Access to everything creates a discovery problem that '
                . 'algorithms only partly solve, which is why human recommendation — a shop, a station, a '
                . 'friend — has become valuable again rather than obsolete.',
            ]],
        ],
        'brands' => [
            ['name' => 'Bose, JBL', 'note' => 'Among the makers who took wireless speakers from novelty to mainstream.'],
            ['name' => 'Sony, Yamaha, Denon', 'note' => 'Built streaming into traditional hi-fi components rather than replacing them.'],
        ],
        'facts' => [
            'A wi-fi speaker fetches the stream itself; over Bluetooth your phone is the source and does the decoding.',
            'Bluetooth re-compresses audio to fit its bandwidth, which is why codec support is quoted at all.',
            'Vinyl\'s revival happened during streaming\'s rise, not before it — the two grew together.',
            'Streaming rights are licensed per territory, so a catalogue genuinely differs from country to country.',
        ],
        'nostalgia' => 'It is early for nostalgia here, but it is starting: the first playlist someone '
            . 'made for you, the shared account nobody ever cancelled, and the specific irritation of '
            . 'discovering that an album you had listened to for years had simply gone.',
        'sources' => [
            ['t' => 'Smithsonian NMAH — Apple\'s iTunes and the digital transition', 'u' => 'https://americanhistory.si.edu/explore/exhibitions/americas-listening/online/apples-itunes'],
            ['t' => 'Library of Congress — MP3 format description', 'u' => 'https://www.loc.gov/preservation/digital/formats/fdd/fdd000012.shtml'],
        ],
    ],

    ];
}
