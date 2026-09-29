<?php
// tests/spin-wheel.php — run with:  php tests/spin-wheel.php
//
// The pure parts of api/_spin_helpers.php, without a database:
//   - spin_validate_config() refuses the configs that would cost money or
//     break the wheel;
//   - spin_describe() says what the coupon enforces;
//   - spin_draw() follows the weights and never picks a zero-weight slice
//     (zero-weight slices are filtered out before it is called);
//   - spinDescribe() in src/js/admin/spin-wheel.js produces the SAME text
//     as spin_describe() (needs `node` on PATH; skipped otherwise).

$src = file_get_contents(__DIR__ . '/../api/_spin_helpers.php');
$start = strpos($src, 'const SPIN_IP_DAILY_LIMIT');
if ($src === false || $start === false) { fwrite(STDERR, "cannot read helpers\n"); exit(2); }
eval(substr($src, $start));

$fails = 0;
function ok($name, $cond) {
    global $fails;
    if (!$cond) $fails++;
    printf("%-64s %s\n", $name, $cond ? 'ok' : 'FAIL');
}

$base = spin_default_config();

// ---- Defaults ---------------------------------------------------------------
[$c, $e] = spin_validate_config($base);
ok('default config validates', !$e);
ok('default config ships disabled', $base['enabled'] === false);

// ---- Refusals -----------------------------------------------------------------
$t = $base; $t['prizes'] = array_slice($t['prizes'], 0, 3);
ok('fewer than 4 slices refused', (bool)spin_validate_config($t)[1]);

$t = $base; $t['prizes'] = array_merge($t['prizes'], $t['prizes']);
ok('more than 8 slices refused', (bool)spin_validate_config($t)[1]);

$t = $base; $t['prizes'][1]['value'] = 95;
ok('percent over 90 refused', (bool)spin_validate_config($t)[1]);

$t = $base; $t['prizes'][4]['value'] = 2000; $t['prizes'][4]['minOrder'] = 2000;
ok('fixed amount >= its minimum order refused (free order)', (bool)spin_validate_config($t)[1]);

$t = $base; foreach ($t['prizes'] as &$p) { $p['type'] = 'none'; } unset($p);
ok('a wheel with no real prize refused', (bool)spin_validate_config($t)[1]);

$t = $base; foreach ($t['prizes'] as $i => &$p) { if ($i > 2) $p['on'] = false; } unset($p);
ok('fewer than 4 LIVE slices refused', (bool)spin_validate_config($t)[1]);

$t = $base; $t['prizes'][0]['color'] = 'red;background:url(x)';
[$c] = spin_validate_config($t);
ok('bad colour replaced with a safe hex', (bool)preg_match('/^#[0-9a-f]{6}$/', $c['prizes'][0]['color']));

$t = $base; $t['prizes'][0]['id'] = '<script>'; $t['prizes'][1]['id'] = 'p1';
[$c] = spin_validate_config($t);
$ids = array_column($c['prizes'], 'id');
ok('slice ids are sanitised and unique', count(array_unique($ids)) === count($ids)
    && !array_filter($ids, fn($i) => !preg_match('/^[a-z0-9]{1,16}$/', $i)));

$t = $base; $t['gameStyle'] = 'roulette<script>';
[$c] = spin_validate_config($t);
ok('unknown game style falls back to wheel', $c['gameStyle'] === 'wheel');
foreach (['wheel', 'jackpot', 'scratch', 'box', 'record', 'envelope'] as $st) {
    $t = $base; $t['gameStyle'] = $st;
    [$c] = spin_validate_config($t);
    if ($c['gameStyle'] !== $st) { ok("game style $st kept", false); }
}
ok('all six game styles accepted', true);

$t = $base; $t['enabled'] = true;
[$c] = spin_validate_config($t);
$html = spin_terms_table_html($c);
ok('terms table lists every live prize with its chance',
    substr_count($html, '<tr>') === count(spin_live_prizes($c)) + 1 && strpos($html, '1 in') !== false);
ok('terms table says the game is off when disabled', strpos(spin_terms_table_html($base), 'not running') !== false);

// The storefront and admin style lists must match the server's.
$sfJs = file_get_contents(__DIR__ . '/../src/js/storefront/spin-wheel.js');
$adJs = file_get_contents(__DIR__ . '/../src/js/admin/spin-wheel.js');
$gmJs = file_get_contents(__DIR__ . '/../src/js/storefront/spin-games.js');
foreach (SPIN_GAME_STYLES as $st) {
    if (!preg_match('/\b' . $st . ':\s*\{/', $sfJs) || strpos($adJs, "id: '" . $st . "'") === false
        || !preg_match('/\b' . $st . '\(ctx\)/', $gmJs)) {
        ok("style $st present in storefront text, admin picker and games", false);
    }
}
ok('style lists agree across server, storefront, admin and games', true);

$t = $base; $t['validDays'] = 999; $t['delaySec'] = -5;
[$c] = spin_validate_config($t);
ok('validDays and delaySec clamped', $c['validDays'] === 60 && $c['delaySec'] === 0);

$t = $base; $t['prizes'][0]['maxOff'] = 500;   // free delivery
[$c] = spin_validate_config($t);
ok('max discount dropped on a non-percent prize', $c['prizes'][0]['maxOff'] === 0);

// ---- Wording ---------------------------------------------------------------
$d = spin_describe(['type' => 'percent', 'value' => 10, 'minOrder' => 5000, 'maxOff' => 1000, 'minLps' => 0]);
ok('10% over ₹5,000 wording', $d['label'] === '10% OFF' && $d['sub'] === '₹5,000+'
    && $d['cond'] === 'On orders of ₹5,000 or more. Max discount ₹1,000.');
$d = spin_describe(['type' => 'percent', 'value' => 10, 'minOrder' => 0, 'maxOff' => 800, 'minLps' => 2]);
ok('2+ LPs wording', $d['sub'] === '2+ LPs' && strpos($d['cond'], '2 or more vinyl LPs') !== false);
$d = spin_describe(['type' => 'free_shipping', 'value' => 0, 'minOrder' => 0, 'maxOff' => 0, 'minLps' => 0]);
ok('free delivery wording', $d['label'] === 'FREE' && $d['sub'] === 'DELIVERY');
ok('Indian digit grouping', spin_money(150000) === '₹1,50,000' && spin_money(999) === '₹999');

// ---- The draw ----------------------------------------------------------------
$live = [['weight' => 90], ['weight' => 10]];
$hits = [0, 0];
for ($i = 0; $i < 20000; $i++) $hits[spin_draw($live)]++;
$share = $hits[1] / 20000;
ok(sprintf('draw follows weights (10%% slice hit %.1f%%)', $share * 100), $share > 0.08 && $share < 0.12);
$live = [['weight' => 1], ['weight' => 1], ['weight' => 1], ['weight' => 1]];
$seen = [];
for ($i = 0; $i < 400; $i++) $seen[spin_draw($live)] = true;
ok('every live slice can be drawn', count($seen) === 4);
ok('codes use the unambiguous alphabet', (bool)preg_match('/^SPIN-[A-HJKMNP-Z2-9]{6}$/', spin_new_code()));

// ---- PHP / admin-JS wording parity -------------------------------------------
$cases = [];
foreach (['free_shipping', 'percent', 'fixed', 'none'] as $type) {
    foreach ([[0, 0, 0], [5000, 0, 1000], [0, 2, 800], [150000, 3, 0], [2000, 0, 0]] as [$min, $lps, $max]) {
        $cases[] = ['type' => $type, 'value' => $type === 'percent' ? 15 : 250, 'minOrder' => $min, 'minLps' => $lps, 'maxOff' => $max];
    }
}
$js = file_get_contents(__DIR__ . '/../src/js/admin/spin-wheel.js');
$a = strpos($js, 'function spinMoney');
$b = strpos($js, 'function spinLive');
$node = trim((string)@shell_exec(PHP_OS_FAMILY === 'Windows' ? 'where node 2>NUL' : 'command -v node 2>/dev/null'));
if ($a === false || $b === false) {
    ok('admin spinDescribe found', false);
} elseif ($node === '') {
    echo "node not on PATH — parity check skipped\n";
} else {
    $tmp = tempnam(sys_get_temp_dir(), 'spw') . '.js';
    file_put_contents($tmp, substr($js, $a, $b - $a)
        . "\nprocess.stdout.write(JSON.stringify(" . json_encode($cases) . ".map(spinDescribe)));");
    $out = json_decode((string)shell_exec('node ' . escapeshellarg($tmp)), true);
    @unlink($tmp);
    $php = array_map('spin_describe', $cases);
    ok('admin preview wording === server wording (' . count($cases) . ' cases)', $out === $php);
}

echo $fails ? "\n$fails FAILED\n" : "\nall passed\n";
exit($fails ? 1 : 0);
