<?php
// tests/coupon-triggers.php — run with:  php tests/coupon-triggers.php
//
// coupon_trigger_check() exercised against a fake PDO, so the branch logic can
// be tested without a MySQL connection. What matters here is that every "not
// satisfied" path REFUSES — a bug that accidentally returns '' hands out a
// discount to somebody who did not earn it.

class FakeStmt {
    public $rows;
    public function __construct($rows) { $this->rows = $rows; }
    public function execute($a = []) { return true; }
    public function fetchColumn() { return $this->rows; }
    public function fetch() { return is_array($this->rows) ? $this->rows : false; }
    public function fetchAll() { return is_array($this->rows) ? [$this->rows] : []; }
}
class FakePDO {
    public $answers = [];   // substring => value fetchColumn should return
    public $throwOn = null;
    public function prepare($sql) {
        if ($this->throwOn !== null && strpos($sql, $this->throwOn) !== false) {
            throw new RuntimeException('boom');
        }
        foreach ($this->answers as $needle => $val) {
            if (strpos($sql, $needle) !== false) return new FakeStmt($val);
        }
        return new FakeStmt(false);
    }
    public function query($sql) { return new FakeStmt(false); }
    public function exec($sql) { return 0; }
}

// Stubs for the two helpers coupon_trigger_check leans on.
function coupons_ensure_tables($pdo): void {}
function coupon_identity_email($pdo, ?int $userId, ?string $guestEmail): ?string {
    if ($userId !== null) return $userId === 99 ? null : 'user' . $userId . '@example.com';
    return ($guestEmail !== null && $guestEmail !== '') ? strtolower(trim($guestEmail)) : null;
}

// Pull just the trigger functions out of the helper file — requiring the whole
// file would drag in config.php and a real database.
$src = file_get_contents(__DIR__ . '/../api/_coupon_helpers.php');
if ($src === false) { fwrite(STDERR, "cannot read helpers\n"); exit(2); }
$start = strpos($src, 'function coupon_trigger_labels');
$end   = strpos($src, 'function coupon_evaluate');
if ($start === false || $end === false) { fwrite(STDERR, "markers not found\n"); exit(2); }
// Strip the PDO type hints so a fake can stand in. This relaxes ONLY the copy
// under test; the real file keeps its hints.
$code = substr($src, $start, $end - $start);
$code = str_replace('(PDO $pdo', '($pdo', $code);
eval($code);

$fails = 0;
function check($name, $got, $wantSatisfied) {
    global $fails;
    $satisfied = ($got === '');
    $ok = $satisfied === $wantSatisfied;
    if (!$ok) $fails++;
    printf("%-46s %-9s %s\n", $name,
        $satisfied ? 'ALLOWED' : 'refused',
        $ok ? 'ok' : ('FAIL (wanted ' . ($wantSatisfied ? 'ALLOWED' : 'refused') . ')'));
}

$C = function ($t, $v = null) { return ['trigger_event' => $t, 'trigger_value' => $v]; };

// ---- min_items: satisfied by the CART, no identity needed -------------------
$pdo = new FakePDO();
check('min_items 3, cart has 3',      coupon_trigger_check($pdo, $C('min_items', 3), null, null, ['itemCount' => 3]), true);
check('min_items 3, cart has 2',      coupon_trigger_check($pdo, $C('min_items', 3), null, null, ['itemCount' => 2]), false);
check('min_items 3, cart empty',      coupon_trigger_check($pdo, $C('min_items', 3), null, null, []), false);

// ---- none -------------------------------------------------------------------
check('none, anonymous',              coupon_trigger_check($pdo, $C('none'), null, null, []), true);

// ---- signup -----------------------------------------------------------------
$pdo = new FakePDO(); $pdo->answers = ['SELECT created_at FROM users' => date('Y-m-d H:i:s')];
check('signup, signed in',            coupon_trigger_check($pdo, $C('signup'), 7, null, []), true);
check('signup, anonymous',            coupon_trigger_check($pdo, $C('signup'), null, null, []), false);
check('signup within 30d, joined now',coupon_trigger_check($pdo, $C('signup', 30), 7, null, []), true);
$pdo->answers = ['SELECT created_at FROM users' => date('Y-m-d H:i:s', strtotime('-90 days'))];
check('signup within 30d, joined 90d',coupon_trigger_check($pdo, $C('signup', 30), 7, null, []), false);
$pdo->throwOn = 'SELECT created_at FROM users';
check('signup, lookup throws',        coupon_trigger_check($pdo, $C('signup', 30), 7, null, []), false);

// ---- subscribe --------------------------------------------------------------
$pdo = new FakePDO(); $pdo->answers = ['FROM subscribers' => 1];
check('subscribe, on the opted-in list', coupon_trigger_check($pdo, $C('subscribe'), 7, null, []), true);
$pdo->answers = ['FROM subscribers' => false];
check('subscribe, not subscribed',    coupon_trigger_check($pdo, $C('subscribe'), 7, null, []), false);
$pdo = new FakePDO();
check('subscribe, anonymous',         coupon_trigger_check($pdo, $C('subscribe'), null, null, []), false);
$pdo = new FakePDO(); $pdo->throwOn = 'FROM subscribers';
check('subscribe, no table',          coupon_trigger_check($pdo, $C('subscribe'), 7, null, []), false);

// ---- first_order / repeat_order ---------------------------------------------
$pdo = new FakePDO(); $pdo->answers = ['COUNT(*) FROM orders' => 0];
check('first_order, no prior orders', coupon_trigger_check($pdo, $C('first_order'), 7, null, []), true);
$pdo->answers = ['COUNT(*) FROM orders' => 2];
check('first_order, has ordered',     coupon_trigger_check($pdo, $C('first_order'), 7, null, []), false);
check('repeat_order 2, has 2',        coupon_trigger_check($pdo, $C('repeat_order', 2), 7, null, []), true);
$pdo->answers = ['COUNT(*) FROM orders' => 1];
check('repeat_order 2, has 1',        coupon_trigger_check($pdo, $C('repeat_order', 2), 7, null, []), false);
$pdo = new FakePDO();
check('first_order, anonymous',       coupon_trigger_check($pdo, $C('first_order'), null, null, []), false);
$pdo = new FakePDO(); $pdo->throwOn = 'COUNT(*) FROM orders';
check('first_order, count throws',    coupon_trigger_check($pdo, $C('first_order'), 7, null, []), false);

// ---- an unknown trigger must NOT open the code ------------------------------
$pdo = new FakePDO();
check('unknown trigger value',        coupon_trigger_check($pdo, $C('somethingelse'), 7, null, []), false);

echo $fails === 0 ? "\nALL PASS\n" : "\n$fails FAILED\n";
exit($fails === 0 ? 0 : 1);
