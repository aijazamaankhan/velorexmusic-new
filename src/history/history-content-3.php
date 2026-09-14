<?php
// =============================================================================
// The Evolution of Music & Audio — the modern era (1987 to today).
//
// The third content file. Read the header of history-content.php for the
// article shape, and the header of history-lib.php for the sourcing, imagery
// and "this is not Velorex history" rules — all of which apply here.
//
// WHY THIS FILE EXISTS SEPARATELY
// The first two files carry the story up to the CD and the early MP3 years.
// Everything after that happened fast and in several directions at once —
// recordable digital formats, surround sound, file sharing, the phone, and a
// revival of the oldest format of all — so it is kept together here rather
// than threaded through the earlier files by date.
//
// A NOTE ON RECENT CLAIMS
// Recent history is where it is easiest to state a marketing line as a fact.
// Launch dates here come from the manufacturer's own announcement, court
// findings from the judgment, and sales figures from the RIAA's published
// year-end reports. Where a number moves every year (vinyl unit sales) the
// text names the year it belongs to rather than implying it still holds.
// =============================================================================

function velorex_history_articles_modern(): array {
    return [

    // -------------------------------------------------------------------------
    'minidisc' => [
        'title'  => 'MiniDisc & DAT',
        'kicker' => 'Digital you could record on',
        'years'  => '1987 onwards',
        'motif'  => 'minidisc',
        'blurb'  => 'The formats that tried to be a recordable CD — and mostly found their home in radio studios.',
        'metaTitle'       => 'MiniDisc & DAT — The Recordable Digital Formats of the 1990s',
        'metaDescription' => 'How DAT, MiniDisc and DCC tried to replace the cassette with recordable digital audio, how ATRAC worked, and why broadcasters kept them longest.',
        'intro' => 'The CD could be played but not recorded, so for about a decade the cassette kept a '
            . 'job the CD could not take. Three formats arrived to fill that gap, and the fight between '
            . 'them is one of the better examples of a format losing for reasons that had almost nothing '
            . 'to do with how it sounded.',
        'sections' => [
            ['h' => 'Origin', 'p' => [
                'Digital Audio Tape came first. Sony intended DAT to be the home digital recorder, but '
                . 'technical delays pushed the launch to the late 1980s, and by then currency movements '
                . 'had pushed the price of a machine far above what a home buyer would pay. It never '
                . 'reached ordinary living rooms.',
                'Two rival formats then arrived together in 1992, both aimed squarely at replacing the '
                . 'analogue cassette: Sony announced MiniDisc in September 1992 and shipped it that '
                . 'winter, while Philips and Matsushita launched the Digital Compact Cassette.',
                'Sony launched the first MiniDisc players and recorders in 1992 — small square '
                . 'cartridges a little under three inches across, holding around 74 to 80 minutes.',
            ]],
            ['h' => 'How it worked', 'p' => [
                'A MiniDisc is magneto-optical. A laser heats a tiny spot on the disc to the point where '
                . 'a magnetic field can flip it, and the spot holds that state once it cools — which is '
                . 'what makes the disc both recordable and re-recordable, unlike a pressed CD.',
                'Full CD data would not fit on something that small, so MiniDisc used ATRAC, a '
                . 'perceptual coding scheme: a transform breaks the signal into frequency bands and '
                . 'discards what a listener is unlikely to hear, reducing the CD\'s 1.4 Mbit/s to '
                . 'roughly 292 kbit/s — about a five-to-one reduction.',
                'That is the same underlying idea as MP3, arriving in the same years, and it is why '
                . 'both formats were argued about in identical terms.',
                'DAT took the opposite approach. It recorded uncompressed digital audio to tape using a '
                . 'rotating head, borrowed from video recorders, which is why a DAT machine cost what it '
                . 'cost and why studios liked it.',
            ]],
            ['h' => 'Where they actually lived', 'p' => [
                'DAT became a professional tool. Studios used it as a mastering and delivery format '
                . 'through the 1990s, and a great deal of music from that decade passed through a DAT '
                . 'machine on its way to a CD plant.',
                'MiniDisc found its most committed users in broadcasting and field recording. It was '
                . 'small, it survived being carried, it could be edited on the machine itself, and it '
                . 'did not skip — which is why radio journalists and oral historians kept using it long '
                . 'after the high street had moved on.',
                'Neither replaced the cassette at home. The cassette was already everywhere and already '
                . 'cheap, and by the time a MiniDisc recorder was affordable, the CD burner and then the '
                . 'MP3 player had taken the same job.',
            ]],
            ['h' => 'Then and now', 'p' => [
                'Sony ceased production of MiniDisc machines in 2013, which is the point at which the '
                . 'format is usually called obsolete.',
                'It has a small, genuine following now, for the same reason the cassette does: it is an '
                . 'object, the machines are beautifully made, and a format that failed commercially '
                . 'tends to have been over-engineered rather than under-engineered.',
            ]],
        ],
        'brands' => [
            ['name' => 'Sony',      'note' => 'Developed DAT and then MiniDisc, and kept MiniDisc in production until 2013.'],
            ['name' => 'Philips',   'note' => 'With Matsushita, launched Digital Compact Cassette in 1992 as the rival to MiniDisc.'],
            ['name' => 'Matsushita','note' => 'Co-developed DCC, which was backward-compatible with analogue cassettes and still lost.'],
        ],
        'facts' => [
            'MiniDisc and Digital Compact Cassette both launched in 1992, aimed at the same customer, and neither one won.',
            'ATRAC compressed CD audio roughly five to one, using the same perceptual principle as MP3.',
            'DAT recorded uncompressed audio using a rotating head borrowed from video recorder design.',
            'Broadcasters and oral historians kept MiniDisc in service long after consumers abandoned it.',
        ],
        'nostalgia' => 'Naming tracks on a MiniDisc with a jog dial, one character at a time, and doing '
            . 'it anyway because the display showing the title while it played felt like the future.',
        'sources' => [
            ['t' => 'British Library — Sound and Vision blog on MiniDisc', 'u' => 'https://blogs.bl.uk/sound-and-vision/2018/09/the-minidisc-revival-starts-here-maybe.html'],
            ['t' => 'Library of Congress — New Sound Recording Formats (cataloguing practice)', 'u' => 'https://www.loc.gov/catdir/cpso/soundrec.pdf'],
            ['t' => 'Library of Congress — Guide to Digital Audio Formats', 'u' => 'https://www.loc.gov/static/programs/national-recording-preservation-plan/documents/Digital-Audio-Types.pdf'],
        ],
    ],

    // -------------------------------------------------------------------------
    'surround-sound' => [
        'title'  => 'Surround Sound',
        'kicker' => 'The room fills up',
        'years'  => '1992 onwards',
        'motif'  => 'speaker',
        'blurb'  => 'How five speakers and a subwoofer moved from the cinema into the living room.',
        'metaTitle'       => 'Surround Sound — How 5.1 Moved From Cinema Into the Home',
        'metaDescription' => 'How Dolby Digital and DTS brought 5.1 to cinemas in the early 1990s, what the .1 actually is, and how DVD carried surround sound into living rooms.',
        'intro' => 'Stereo asks two speakers to suggest a whole scene in front of you. Surround stops '
            . 'suggesting: it puts real speakers behind the listener and sends them their own signal. '
            . 'The idea was a cinema technology first, and it arrived at home almost by accident, '
            . 'carried there by a video format.',
        'sections' => [
            ['h' => 'Origin', 'p' => [
                'Digital surround reached cinemas in the early 1990s. Dolby\'s own account puts the '
                . 'first feature presented in Dolby Digital at <em>Batman Returns</em> in 1992; DTS '
                . 'followed as a competing digital format, and for most of the decade a projection '
                . 'booth might be equipped for either.',
                'Both did the same fundamental job: carry discrete channels rather than channels '
                . 'derived from a matrix, so a sound placed at the rear left was genuinely only at the '
                . 'rear left.',
            ]],
            ['h' => 'What 5.1 actually means', 'p' => [
                'Dolby Digital delivers up to 5.1 discrete channels. The five are left, centre and '
                . 'right across the front, plus left and right surround behind the listener.',
                'The centre channel is the one that matters most and gets the least attention: it '
                . 'carries dialogue, anchored to the screen, so speech stays put no matter where in the '
                . 'room you sit. In a two-speaker system the centre is an illusion that only works in '
                . 'one seat.',
                'The <em>.1</em> is the low-frequency effects channel. It is called a tenth because it '
                . 'is band-limited — it carries only the bottom of the spectrum, so it needs a fraction '
                . 'of the bandwidth of a full channel. It is not "the subwoofer channel" exactly; bass '
                . 'management in the receiver decides what actually goes to the sub.',
            ]],
            ['h' => 'How it got into the house', 'p' => [
                'DVD is the reason. The format carried multichannel soundtracks as standard, so a '
                . 'living room that bought a DVD player had surround content whether or not it had '
                . 'planned to, and the receiver market followed within a couple of years.',
                'That is also why home surround grew up as a <em>film</em> technology rather than a '
                . 'music one. Music mixed for five speakers existed — SACD and DVD-Audio both carried '
                . 'it — but the discs that sold were films.',
            ]],
            ['h' => 'Then and now', 'p' => [
                'The channel count kept climbing, and then the model changed. Object-based systems '
                . 'stopped assigning a sound to a speaker and started describing where it should be, '
                . 'letting the receiver work out which speakers to use — which is what makes a soundbar '
                . 'or a pair of headphones able to attempt the same effect.',
                'For music, the interesting consequence arrived much later, when streaming services '
                . 'began carrying immersive mixes to ordinary headphones.',
            ]],
        ],
        'brands' => [
            ['name' => 'Dolby Laboratories', 'note' => 'Dolby Digital brought discrete 5.1 to cinemas from 1992 and then to home formats.'],
            ['name' => 'DTS',                'note' => 'The competing digital cinema sound format of the 1990s; its formats are catalogued by the Library of Congress.'],
        ],
        'facts' => [
            'Dolby dates the first feature presented in Dolby Digital to Batman Returns in 1992.',
            'The ".1" is a band-limited effects channel, which is why it counts as a fraction rather than a whole one.',
            'The centre channel exists mainly so dialogue stays anchored for listeners who are not sitting in the middle.',
            'Home surround spread through DVD players rather than through music releases.',
        ],
        'nostalgia' => 'Running speaker cable under the carpet to the back of the room, and then making '
            . 'everyone sit through the helicopter scene to prove it had been worth it.',
        'sources' => [
            ['t' => 'Dolby — Batman Returns and the first Dolby Digital feature', 'u' => 'https://www.dolby.com/experience/batman-returns/'],
            ['t' => 'Dolby Professional — Dolby Digital 5.1', 'u' => 'https://professional.dolby.com/tv/dolby-digital/'],
            ['t' => 'Library of Congress — Digital Theater Systems audio formats', 'u' => 'https://www.loc.gov/preservation/digital/formats/fdd/fdd000232.shtml'],
        ],
    ],

    // -------------------------------------------------------------------------
    'file-sharing' => [
        'title'  => 'File Sharing & Downloads',
        'kicker' => 'The industry loses control of distribution',
        'years'  => '1998–2005',
        'motif'  => 'digital',
        'blurb'  => 'Napster, the courts, and how buying a single track legally finally became possible.',
        'metaTitle'       => 'Napster & the Download Era — When Music Left the Shop',
        'metaDescription' => 'How Napster made file sharing ordinary, what the courts actually decided about MP3 players and P2P, and how legal downloads answered it.',
        'intro' => 'Compression made a song small enough to move. What happened next was not a '
            . 'technical story so much as a legal and commercial one: for about six years, the question '
            . 'of who controlled distribution was genuinely open, and it was settled in court.',
        'sections' => [
            ['h' => 'The first fight was about a device', 'p' => [
                'Before the file-sharing cases came a case about hardware. In 1998 the recording '
                . 'industry sought to stop the sale of the Diamond Rio, an early portable MP3 player, '
                . 'arguing it was a digital audio recording device subject to the Audio Home Recording '
                . 'Act of 1992.',
                'The Ninth Circuit disagreed in 1999. Its reasoning is worth quoting in substance: the '
                . 'Rio merely made copies in order to render portable — to "space-shift" — files that '
                . 'already resided on the user\'s hard drive, which the court called a paradigmatic '
                . 'noncommercial personal use.',
                'That sentence is why MP3 players were legal to sell, and it is the legal ground the '
                . 'entire portable-player industry was then built on.',
            ]],
            ['h' => 'Napster', 'p' => [
                'Napster arrived in 1999 and made peer-to-peer sharing something an ordinary person '
                . 'could do. The design was not fully decentralised: a central index held what was '
                . 'available, users searched that index by song or artist, and the file itself came '
                . 'directly from another user\'s computer.',
                'At its peak in 2001, as many as 1.5 million people were sharing files simultaneously. '
                . 'More consequentially, it established the idea of downloading a song from the internet '
                . 'as a normal thing to do.',
                'The lawsuits began in December 1999 and January 2000. After concluding it was not '
                . 'technically feasible to comply with the court\'s order and keep the network running, '
                . 'Napster ceased operations on 1 July 2001.',
            ]],
            ['h' => 'What replaced it', 'p' => [
                'Shutting one service down did not put the idea back. What changed behaviour was a '
                . 'legal alternative that was genuinely easier than the illegal one: a catalogue you '
                . 'could search, a single track for a fixed price, and a download that took seconds.',
                'The album was the casualty. For fifty years the unit of purchase had been a record, '
                . 'partly because a record was physically a set of songs. Once a single track could be '
                . 'bought on its own, a great many albums turned out to have been sold on the strength '
                . 'of two songs.',
            ]],
            ['h' => 'Why it still matters', 'p' => [
                'Every argument about streaming today — what an artist is paid, who decides what is '
                . 'available, whether you own anything — was first had in this period, with lower '
                . 'stakes and louder rhetoric.',
                'The lasting change is that distribution stopped being a physical business. Once that '
                . 'was true, the shift to access rather than ownership was a matter of time.',
            ]],
        ],
        'brands' => [
            ['name' => 'Napster',          'note' => 'Made peer-to-peer sharing mainstream from 1999; ceased operating on 1 July 2001 under court order.'],
            ['name' => 'Diamond Multimedia','note' => 'Maker of the Rio, whose defence in 1999 established that space-shifting your own files was lawful personal use.'],
            ['name' => 'Fraunhofer IIS',   'note' => 'Its Layer 3 coding is what made the files small enough for any of this to happen.'],
        ],
        'facts' => [
            'The Ninth Circuit\'s 1999 Rio ruling used the term "space-shift" — moving your own music to a portable device.',
            'Napster used a central index server, so it was not the fully decentralised system it is often remembered as.',
            'Napster ceased operations on 1 July 2001 after finding it could not comply with the injunction and keep running.',
            'Around 1.5 million people were sharing simultaneously at the service\'s 2001 peak.',
        ],
        'nostalgia' => 'Leaving a download running overnight on a dial-up line, and finding in the '
            . 'morning that the last thirty seconds were missing, or that the track was someone else\'s '
            . 'song entirely with the right filename.',
        'sources' => [
            ['t' => 'U.S. Copyright Office — A&M Records v. Napster (9th Cir. 2001) summary', 'u' => 'https://www.copyright.gov/fair-use/summaries/a&mrecords-napster-9thcir2001.pdf'],
            ['t' => 'RIAA v. Diamond Multimedia Systems (9th Cir. 1999), full opinion', 'u' => 'https://www.courtlistener.com/opinion/2472141/recording-industry-assn-of-america-inc-v-diamond-multimedia-systems/'],
            ['t' => 'Encyclopaedia Britannica — Napster', 'u' => 'https://www.britannica.com/topic/Napster'],
        ],
    ],

    // -------------------------------------------------------------------------
    'loudness-war' => [
        'title'  => 'The Loudness War',
        'kicker' => 'Why newer CDs sound flat',
        'years'  => '1990s–2000s',
        'motif'  => 'wave',
        'blurb'  => 'The decades-long competition to master records louder than everyone else, and what it cost.',
        'metaTitle'       => 'The Loudness War — Why Some CDs Sound Flat and Tiring',
        'metaDescription' => 'What dynamic range compression does, why digital mastering pushed records ever louder from the 1990s, and what that competition cost the music.',
        'intro' => 'Two copies of the same song can measure the same on paper and feel completely '
            . 'different to listen to. One of the largest reasons is a production practice that took '
            . 'hold with digital media and ran for roughly two decades — and it is the answer to why a '
            . 'remaster sometimes sounds worse than the record it replaced.',
        'sections' => [
            ['h' => 'What dynamic range is', 'p' => [
                'Dynamic range is the distance between the quietest and loudest parts of a recording. '
                . 'It is what makes a drum hit feel like an impact: the hit is loud <em>relative to</em> '
                . 'what surrounds it.',
                'Compression reduces that distance by pulling the loud parts down, after which the '
                . 'whole thing can be turned up. The result is a track that is louder on average while '
                . 'having less difference between its own parts.',
            ]],
            ['h' => 'Why digital made it a competition', 'p' => [
                'Digital media have a hard ceiling. With CD there is a maximum peak level defined by '
                . 'the number of bits available, and nothing can exceed it. Once a master reaches that '
                . 'ceiling, the only way to sound louder than the next record is to raise the average '
                . 'level underneath the peaks — through multiband compression, peak limiting and '
                . 'equalisation.',
                'The incentive was straightforward and short-term: on a radio playlist or a shop '
                . 'listening post, whichever track is louder tends to be judged as sounding better, for '
                . 'a few seconds.',
                'So each release had reason to be slightly louder than the last, and the practice '
                . 'ratcheted. The Audio Engineering Society has published work examining exactly this — '
                . 'including whether louder, hypercompressed masters actually sold better.',
            ]],
            ['h' => 'What it costs', 'p' => [
                'Listening fatigue is the usual complaint, and it is a real effect rather than a '
                . 'preference: a signal with little variation gives the ear nothing to relax against.',
                'The damage is also permanent in a specific way. Compression applied at the mastering '
                . 'stage is baked into the master; turning the volume down afterwards restores the '
                . 'level but not the dynamics. This is why an early pressing of an album is sometimes '
                . 'genuinely preferred over a later remaster of the same recording, and it is a '
                . 'measurable difference rather than nostalgia.',
            ]],
            ['h' => 'How it ended, mostly', 'p' => [
                'Loudness normalisation is what defused it. Streaming platforms play everything back at '
                . 'a matched loudness target, which means a hypercompressed master no longer sounds '
                . 'louder than anything else — it just sounds flatter, having given up its dynamics for '
                . 'an advantage that is now cancelled out.',
                'The practice has eased as a result, though it has not disappeared, and a great many '
                . 'records mastered between the mid-1990s and the late 2000s still carry it.',
            ]],
        ],
        'brands' => [],
        'facts' => [
            'The ceiling is the point: digital has an absolute maximum peak, so extra loudness has to come from raising the average.',
            'The Audio Engineering Society has published research asking whether louder, hypercompressed records actually sold better.',
            'Mastering compression cannot be undone by turning the volume down — the dynamics are already gone from the file.',
            'Streaming loudness normalisation removed the competitive advantage that drove the practice.',
        ],
        'nostalgia' => 'Putting a favourite album on after a newer CD and having to turn it up — then '
            . 'realising, a minute in, that the older record was the one that actually breathed.',
        'sources' => [
            ['t' => 'AES — The Loudness War: Do Louder, Hypercompressed Recordings Sell Better?', 'u' => 'http://www.aes.org/e-lib/browse.cfm?elib=15934'],
            ['t' => 'AES — Loudness Basics', 'u' => 'https://aes.org/resources/audio-topics/loudness-project/loudness-basics/'],
        ],
    ],

    // -------------------------------------------------------------------------
    'smartphone-audio' => [
        'title'  => 'The Phone Becomes the Stereo',
        'kicker' => 'One device absorbs the rest',
        'years'  => '2007 onwards',
        'motif'  => 'phone',
        'blurb'  => 'How a telephone replaced the portable player, the radio, and eventually the headphone cable.',
        'metaTitle'       => 'The Phone Becomes the Stereo — Smartphones and Wireless Audio',
        'metaDescription' => 'How the 2007 iPhone absorbed the portable music player, why the headphone jack disappeared, and what wireless earbuds changed about listening.',
        'intro' => 'The portable player had barely won before it was eaten. What ended it was not a '
            . 'better player but a device that was already in the same pocket for other reasons — and '
            . 'the second-order effects of that, on headphones and on how people listen, are still '
            . 'working through.',
        'sections' => [
            ['h' => 'Origin', 'p' => [
                'Apple introduced the iPhone on 9 January 2007, and described it as three products in '
                . 'one: a mobile phone, a widescreen iPod with touch controls, and an internet '
                . 'communications device.',
                'The middle item is the one that mattered here. The company that had built the dominant '
                . 'portable music player put that player inside a phone, and in doing so began '
                . 'dismantling its own product category.',
                'It went on sale in the United States in June 2007, with Europe following later that '
                . 'year.',
            ]],
            ['h' => 'Why one device won', 'p' => [
                'A dedicated player is better at being a player. The phone won anyway, because carrying '
                . 'two devices to do one thing each loses to carrying one device that does both '
                . 'adequately — the same logic that had killed the separate camera for most people.',
                'A network connection changed the proposition a second time. A player held whatever you '
                . 'had loaded onto it; a connected phone could reach a catalogue, which is the '
                . 'precondition for streaming and the reason streaming arrived when it did rather than '
                . 'earlier.',
            ]],
            ['h' => 'The cable goes', 'p' => [
                'Bluetooth audio existed for years before it was good. What made wireless listening '
                . 'ordinary was a generation of earbuds with custom wireless chips, designed to solve '
                . 'pairing and battery life rather than only to carry audio.',
                'Apple announced AirPods in September 2016 and began delivering them that December. The '
                . 'design case made the tradeoff explicit: a low-power chip handling the connection, '
                . 'optical sensors and accelerometers detecting when a bud was in the ear, and about '
                . 'five hours of listening with more in the case.',
                'Wireless audio is compressed audio — the link has limited bandwidth, so a codec sits '
                . 'between the phone and the ear. That is the honest cost, and it is why the same '
                . 'listener can prefer a wire at home and wireless on a train.',
            ]],
            ['h' => 'What it changed', 'p' => [
                'Listening became more private and more constant. Headphones stopped being something '
                . 'you put on for music and became the default state of being outdoors, with music '
                . 'competing for attention against podcasts, calls and silence.',
                'It also moved the important part of the signal chain. For most people the deciding '
                . 'factor in how music sounds is no longer an amplifier or a speaker; it is a pair of '
                . 'earbuds and the codec talking to them.',
            ]],
        ],
        'brands' => [
            ['name' => 'Apple',      'note' => 'Put a music player inside a phone in 2007, and removed the headphone cable with AirPods from 2016.'],
            ['name' => 'Bluetooth SIG','note' => 'Maintains the wireless standard, including the A2DP profile that carries stereo audio.'],
        ],
        'facts' => [
            'The iPhone was announced on 9 January 2007 and described, in Apple\'s own words, as a widescreen iPod with touch controls.',
            'AirPods were announced in September 2016 and started reaching customers in December of that year.',
            'Apple rated the first AirPods at up to five hours of listening on a charge, with the case holding more.',
            'All Bluetooth listening is compressed: the radio link cannot carry an uncompressed stereo stream.',
        ],
        'nostalgia' => 'The last time you untangled a pair of wired earbuds out of a coat pocket — and '
            . 'how quickly that stopped being a thing anyone did.',
        'sources' => [
            ['t' => 'Apple Newsroom — Apple Reinvents the Phone with iPhone (9 January 2007)', 'u' => 'https://www.apple.com/newsroom/2007/01/09Apple-Reinvents-the-Phone-with-iPhone/'],
            ['t' => 'Apple Newsroom — Apple reinvents the wireless headphone with AirPods (September 2016)', 'u' => 'https://www.apple.com/newsroom/2016/09/apple-reinvents-the-wireless-headphones-with-airpods/'],
            ['t' => 'Apple Newsroom — Apple AirPods are now available (December 2016)', 'u' => 'https://www.apple.com/newsroom/2016/12/apple-airpods-are-now-available/'],
        ],
    ],

    // -------------------------------------------------------------------------
    'hi-res-audio' => [
        'title'  => 'Hi-Res, Lossless & Spatial',
        'kicker' => 'Better than CD, or differently than CD',
        'years'  => '1999 onwards',
        'motif'  => 'cd',
        'blurb'  => 'SACD, DVD-Audio, lossless streaming and Dolby Atmos — what each actually offers.',
        'metaTitle'       => 'Hi-Res, Lossless & Spatial Audio — What They Actually Offer',
        'metaDescription' => 'SACD and DVD-Audio in 1999, what lossless streaming really means, and how Dolby Atmos music differs from the surround sound that came before.',
        'intro' => 'Every decade since the CD has produced a format promising to be better than it. '
            . 'Some of those claims are about resolution, some about compression, and some about where '
            . 'the sound appears to come from — three different things that get sold under one word, '
            . '"quality". They are worth separating.',
        'sections' => [
            ['h' => 'The disc formats that tried', 'p' => [
                'Super Audio CD was introduced in 1999, developed by Sony with Philips and documented '
                . 'in the specification known as the Scarlet Book. It did not use the CD\'s method of '
                . 'representing a signal at all: it used Direct Stream Digital, a one-bit encoding '
                . 'running at a very high sample rate, which the Library of Congress catalogues as its '
                . 'own format.',
                'DVD-Audio arrived alongside it, taking the more conventional route of raising the '
                . 'sample rate and bit depth of ordinary linear encoding, and adding multichannel '
                . 'capacity.',
                'Both were technically serious and both failed commercially. They needed new players, '
                . 'they arrived exactly as listeners were moving to compressed files on portable '
                . 'devices, and the improvement they offered was inaudible to most people on most '
                . 'equipment.',
            ]],
            ['h' => 'Lossless is not hi-res', 'p' => [
                'These two words get used interchangeably and mean different things.',
                '<em>Lossless</em> means the file reconstructs the original bit-for-bit — nothing was '
                . 'discarded, only packed more efficiently. A lossless copy of a CD is exactly a CD.',
                '<em>Hi-res</em> means the original itself has a higher sample rate or bit depth than '
                . 'CD. That is a claim about the recording, not about the packaging, and a hi-res file '
                . 'of a recording that was made at CD resolution gains nothing.',
                'So a lossless stream fixes a real problem — the audible cost of low-bitrate '
                . 'compression — while hi-res addresses a limit that is much harder to demonstrate '
                . 'anyone can hear.',
            ]],
            ['h' => 'Streaming took the argument over', 'p' => [
                'Apple announced Spatial Audio with Dolby Atmos and Lossless Audio for Apple Music in '
                . 'May 2021, arriving from June, at no additional cost — more than 75 million songs in '
                . 'lossless, and Atmos tracks playing by default on its own headphones.',
                'Free was the significant part. Fidelity had been a paid tier for twenty years; making '
                . 'it standard turned it from a product into a baseline, and competitors followed.',
            ]],
            ['h' => 'Spatial is a different claim', 'p' => [
                'Spatial audio is not about resolution at all. It is object-based: a mix describes '
                . 'where sounds should be in space, and the playback system works out how to produce '
                . 'that with whatever it has, including two earbuds.',
                'That makes it the first genuinely new listening proposition since stereo — and also '
                . 'the most divisive, because an Atmos mix of an old record is a new interpretation of '
                . 'it, not a more accurate copy. Some are revelatory and some undo decisions the '
                . 'original engineer made on purpose.',
            ]],
        ],
        'brands' => [
            ['name' => 'Sony & Philips', 'note' => 'Jointly introduced Super Audio CD in 1999, using Direct Stream Digital rather than CD-style encoding.'],
            ['name' => 'Dolby',          'note' => 'Atmos brought object-based mixing to music, where sounds are placed in space rather than assigned to channels.'],
            ['name' => 'Apple',          'note' => 'Made lossless and spatial audio standard on Apple Music in 2021 rather than a paid upgrade.'],
        ],
        'facts' => [
            'SACD was introduced in 1999 and uses Direct Stream Digital, a one-bit encoding the Library of Congress catalogues separately from CD audio.',
            'Lossless and hi-res are different claims: one is about packing, the other about the original recording.',
            'Apple Music announced lossless and Dolby Atmos in May 2021, at no extra cost, from June.',
            'A spatial mix is a new creative decision about an old recording, not a more faithful copy of it.',
        ],
        'nostalgia' => 'Hearing a hybrid SACD in a shop demo, being certain you could tell, and never '
            . 'quite being that certain again at home.',
        'sources' => [
            ['t' => 'Library of Congress — Direct Stream Digital (DSD) format description', 'u' => 'https://www.loc.gov/preservation/digital/formats/fdd/fdd000230.shtml'],
            ['t' => 'Library of Congress — Guide to Digital Audio Formats', 'u' => 'https://www.loc.gov/static/programs/national-recording-preservation-plan/documents/Digital-Audio-Types.pdf'],
            ['t' => 'Apple Newsroom — Apple Music announces Spatial Audio and Lossless Audio (May 2021)', 'u' => 'https://www.apple.com/newsroom/2021/05/apple-music-announces-spatial-audio-and-lossless-audio/'],
        ],
    ],

    // -------------------------------------------------------------------------
    'vinyl-revival' => [
        'title'  => 'The Vinyl Revival',
        'kicker' => 'The format that refused',
        'years'  => '2007 onwards',
        'motif'  => 'vinyl',
        'blurb'  => 'Why the oldest format on this page is the one still growing.',
        'metaTitle'       => 'The Vinyl Revival — Why Records Came Back and Stayed',
        'metaDescription' => 'Why vinyl returned as streaming took over, what the RIAA figures actually show, and what a record offers that a stream cannot.',
        'intro' => 'Every format on this page was replaced by the next one. Vinyl is the exception: it '
            . 'was replaced, spent about twenty years as a specialist concern, and then began growing '
            . 'again during precisely the period when music became most convenient to stream. That '
            . 'timing is the whole story.',
        'sections' => [
            ['h' => 'What the numbers show', 'p' => [
                'The RIAA\'s published year-end reports are the reliable record for the United States, '
                . 'and they are worth reading carefully because units and revenue tell different '
                . 'stories.',
                'By the 2024 report, vinyl had outsold CDs on units for a third consecutive year — 44 '
                . 'million records against 33 million CDs — and accounted for close to three-quarters '
                . 'of physical format revenue. In 2025 the gap widened again, to 46.8 million records '
                . 'against 29.5 million CDs.',
                'Keep the scale honest, though. Streaming was around 84% of total US recorded music '
                . 'revenue in 2024. Vinyl is the largest physical format by a wide margin and a small '
                . 'part of the whole business — both things are true, and a headline that gives only '
                . 'the first is selling something.',
            ]],
            ['h' => 'Why it happened', 'p' => [
                'The usual explanation is sound quality, and it is the weakest one. A record has '
                . 'measurable disadvantages — surface noise, inner-groove distortion, wear with every '
                . 'play — and most listeners comparing formats are actually comparing masterings, since '
                . 'a vinyl master is often cut with more dynamic range than the CD of the same album '
                . '(see the loudness war).',
                'The better explanation is that vinyl offers the things streaming removed. It is an '
                . 'object you own rather than a licence you rent. It has artwork at a size you can '
                . 'actually look at. It has a side that ends, which makes listening a decision with a '
                . 'beginning and a finish.',
                'And it is the only way left to pay an artist a meaningful amount in one transaction, '
                . 'which is why so many acts now treat the record as the product and the stream as the '
                . 'advertisement.',
            ]],
            ['h' => 'The industry it rebuilt', 'p' => [
                'Pressing plants had been closing for decades; the revival meant re-learning a '
                . 'manufacturing process that nearly lapsed, on machinery much of which is older than '
                . 'the people running it. That is a real constraint, and it is why lead times on a new '
                . 'pressing can still run to months.',
                'It also rebuilt the record shop as a place rather than a warehouse — which matters, '
                . 'because browsing is the part of buying music that algorithms replaced least well.',
            ]],
            ['h' => 'Where it sits now', 'p' => [
                'Vinyl is no longer a revival in any meaningful sense; it is simply how physical music '
                . 'is sold. The interesting question has moved on to whether the CD follows the same '
                . 'path, having spent long enough out of fashion to be rediscovered as an object — and '
                . 'the early signs suggest it might.',
            ]],
        ],
        'brands' => [],
        'facts' => [
            'RIAA year-end figures show vinyl outselling CDs on units for a third consecutive year in 2024.',
            'In 2025 US vinyl reached 46.8 million units against 29.5 million CDs.',
            'Streaming was roughly 84% of total US recorded music revenue in 2024, so vinyl\'s growth sits inside a streaming business.',
            'A vinyl master is often cut with more dynamic range than the CD of the same album, which explains part of the perceived difference.',
        ],
        'nostalgia' => 'Standing up halfway through an album to turn it over, and discovering that the '
            . 'interruption was never the annoyance it sounds like when described.',
        'sources' => [
            ['t' => 'RIAA — 2024 Year-End Music Industry Revenue Report', 'u' => 'https://www.riaa.com/wp-content/uploads/2025/03/RIAA-2024Year-End-Revenue-Report.pdf'],
            ['t' => 'RIAA — 2025 Year-End Revenue Report', 'u' => 'https://www.riaa.com/wp-content/uploads/2026/03/RIAA-Year-End-Revenue-2025.pdf'],
            ['t' => 'RIAA — Sales & Revenue report archive', 'u' => 'https://www.riaa.com/reportcat/sales-revenue/'],
        ],
    ],

    ];
}
