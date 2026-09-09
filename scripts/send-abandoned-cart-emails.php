<?php
// =============================================================================
// Abandoned-cart recovery cron.
//
// Sends the stage-1 (2 hour) and stage-2 (24 hour) nudges for every eligible
// abandoned cart and abandoned checkout, then prunes snapshots that are too
// old to be worth keeping.
//
// HOW TO RUN
//   Local Docker dev:
//     docker exec velorex-php php /app/scripts/send-abandoned-cart-emails.php --dry-run
//   Hostinger — hPanel -> Advanced -> Cron Jobs -> Add new
//     Schedule: every 30 minutes  ->  */30 * * * *
//     Command:
//       php /home/u286479481/domains/velorexmusic.com/public_html/scripts/send-abandoned-cart-emails.php
//
// WHY EVERY 30 MINUTES AND NOT EVERY MINUTE
// The stages are 2h and 24h. A half-hour cadence puts the stage-1 email
// somewhere between 2:00 and 2:30 after abandonment, which is well inside the
// window where it still reads as helpful, and it keeps the job's own footprint
// on a shared host down to 48 short runs a day.
//
// FLAGS
//   --dry-run   report what WOULD be sent, send nothing, change nothing
//   --limit=N   cap the number of emails this run (default 100)
//   --quiet     only print the summary line
//
// SAFETY PROPERTIES
//   - CLI only. There is no HTTP entry point, so nobody on the internet can
//     trigger a mail run.
//   - Every eligibility rule lives in marketing_send_recovery() (api/_recovery.php),
//     shared with the admin's manual Send button. This script only decides
//     WHICH rows are due; it never decides whether a send is allowed.
//   - recovery_stage is stamped only after SMTP accepts the message, so a
//     failed send is retried next run rather than silently skipped forever.
//   - The per-run limit is a blast-radius cap. If something goes wrong with the
//     due-row query, the damage is bounded at N emails rather than the whole table.
// =============================================================================

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    echo "This script must be run from the command line.\n";
    exit(1);
}

// config.php reads $_SERVER['REQUEST_METHOD'] for the CORS preflight branch.
// There is no HTTP request here — stub it before the require so PHP does not
// emit "Undefined array key" warnings into the cron log. Same trick as
// scripts/migrate-product-images.php.
$_SERVER['REQUEST_METHOD'] = $_SERVER['REQUEST_METHOD'] ?? 'CLI';

require_once __DIR__ . '/../api/config.php';
require_once __DIR__ . '/../api/_marketing_helpers.php';
require_once __DIR__ . '/../api/_recovery.php';

$argvRaw = $argv ?? [];
$dryRun  = in_array('--dry-run', $argvRaw, true);
$quiet   = in_array('--quiet',   $argvRaw, true);
$limit   = 100;
foreach ($argvRaw as $a) {
    if (preg_match('/^--limit=(\d+)$/', $a, $m)) $limit = max(1, min(1000, (int)$m[1]));
}

function say(string $line, bool $force = false): void {
    global $quiet;
    if (!$quiet || $force) echo $line . "\n";
}

$startedAt = microtime(true);
say('[' . date('Y-m-d H:i:s') . '] abandoned-cart recovery run'
    . ($dryRun ? ' (DRY RUN — nothing will be sent)' : '') . ', limit ' . $limit);

try {
    $pdo = db();
    marketing_ensure_tables($pdo);
    $poReady = marketing_payment_orders_ready($pdo);
} catch (Throwable $e) {
    fwrite(STDERR, 'FATAL: could not reach the database: ' . $e->getMessage() . "\n");
    exit(1);
}

if (!mailer_is_configured() && !$dryRun) {
    // Not an error — the code is designed to be deployed before Brevo is set
    // up (CLAUDE.md §10). Say so clearly and stop, rather than looping through
    // rows and stamping nothing.
    say('SMTP is not configured — nothing to do. See CLAUDE.md §10 "Transactional email".', true);
    exit(0);
}

// -----------------------------------------------------------------------------
// Which rows are due?
//
// A row is due for stage N when it has been quiet for at least the stage's
// threshold and has not yet had stage N sent. Reading "quiet since" from
// carts.updated_at is what makes this self-correcting: a visitor who comes back
// and adds another record resets updated_at AND recovery_stage (see the
// ON DUPLICATE KEY clause in api/cart-sync.php), so they re-enter the sequence
// from the top instead of receiving a stale stage-2 about an old basket.
// -----------------------------------------------------------------------------

$due = [];

// ---- Pre-checkout carts -----------------------------------------------------
// The intervals and the LIMIT are interpolated rather than bound. They are
// compile-time integer constants and a locally-clamped int, never user input.
// Binding them would be the safer-looking choice and the riskier one: MySQL's
// support for a parameter marker inside INTERVAL is version-dependent, and a
// query that fails on the host but not locally shows up as "the recovery
// emails silently stopped", which is the worst possible failure mode for a
// cron job nobody watches.
$sql = 'SELECT id, recovery_stage,
               TIMESTAMPDIFF(HOUR, updated_at, NOW()) AS hours_quiet
          FROM carts
         WHERE email IS NOT NULL AND email <> ""
           AND converted_at IS NULL
           AND dismissed_at IS NULL
           AND recovery_stage < 2
           AND updated_at <= DATE_SUB(NOW(), INTERVAL ' . RECOVERY_STAGE1_HOURS . ' HOUR)
           AND updated_at >  DATE_SUB(NOW(), INTERVAL ' . RECOVERY_MAX_AGE_HOURS . ' HOUR)
         ORDER BY updated_at ASC
         LIMIT ' . (int)($limit * 2);
$st = $pdo->prepare($sql);
$st->execute();
foreach ($st->fetchAll() as $r) {
    $hours = (int)$r['hours_quiet'];
    $stage = (int)$r['recovery_stage'];
    // Stage 2 is only due once the 24-hour mark has passed AND stage 1 went out.
    if ($stage === 0 && $hours >= RECOVERY_STAGE1_HOURS) {
        $due[] = ['kind' => 'cart', 'id' => (int)$r['id'], 'stage' => 1, 'hours' => $hours];
    } elseif ($stage === 1 && $hours >= RECOVERY_STAGE2_HOURS) {
        $due[] = ['kind' => 'cart', 'id' => (int)$r['id'], 'stage' => 2, 'hours' => $hours];
    }
}

// ---- Checkout-stage abandonment --------------------------------------------
if ($poReady) {
    $sql = 'SELECT razorpay_order_id, recovery_stage,
                   TIMESTAMPDIFF(HOUR, created_at, NOW()) AS hours_quiet
              FROM payment_orders
             WHERE status = "created"
               AND dismissed_at IS NULL
               AND recovery_stage < 2
               AND created_at <= DATE_SUB(NOW(), INTERVAL ' . RECOVERY_STAGE1_HOURS . ' HOUR)
               AND created_at >  DATE_SUB(NOW(), INTERVAL ' . RECOVERY_MAX_AGE_HOURS . ' HOUR)
             ORDER BY created_at ASC
             LIMIT ' . (int)($limit * 2);
    $st = $pdo->prepare($sql);
    $st->execute();
    foreach ($st->fetchAll() as $r) {
        $hours = (int)$r['hours_quiet'];
        $stage = (int)$r['recovery_stage'];
        if ($stage === 0 && $hours >= RECOVERY_STAGE1_HOURS) {
            $due[] = ['kind' => 'checkout', 'id' => (string)$r['razorpay_order_id'], 'stage' => 1, 'hours' => $hours];
        } elseif ($stage === 1 && $hours >= RECOVERY_STAGE2_HOURS) {
            $due[] = ['kind' => 'checkout', 'id' => (string)$r['razorpay_order_id'], 'stage' => 2, 'hours' => $hours];
        }
    }
} else {
    say('payment_orders recovery columns unavailable — checkout-stage recovery skipped this run.');
}

say('Due: ' . count($due) . ' row(s)');

// -----------------------------------------------------------------------------
// Send
// -----------------------------------------------------------------------------
$sent = 0;
$skipped = 0;
$failed = 0;
$skipReasons = [];

foreach ($due as $row) {
    if ($sent >= $limit) {
        say('Per-run limit of ' . $limit . ' reached — the rest will go out next run.');
        break;
    }

    $label = $row['kind'] . ' ' . $row['id'] . ' (stage ' . $row['stage'] . ', quiet ' . $row['hours'] . 'h)';

    if ($dryRun) {
        say('  WOULD SEND  ' . $label);
        $sent++;
        continue;
    }

    try {
        $res = marketing_send_recovery($pdo, $row['kind'], $row['id'], 'cron');
    } catch (Throwable $e) {
        // A single bad row must never abort the run — the remaining customers
        // are still waiting on their emails.
        $failed++;
        fwrite(STDERR, '  ERROR       ' . $label . ' -> ' . $e->getMessage() . "\n");
        continue;
    }

    if ($res['ok']) {
        $sent++;
        say('  sent        ' . $label);
    } else {
        // Not a failure: these are the eligibility rules doing their job
        // (unsubscribed, already purchased, no email on file).
        $skipped++;
        $skipReasons[$res['error']] = ($skipReasons[$res['error']] ?? 0) + 1;
        say('  skipped     ' . $label . ' -> ' . $res['error']);
    }
}

// -----------------------------------------------------------------------------
// Prune
//
// Cart snapshots are personal data with no purpose once the cart is cold: past
// RECOVERY_MAX_AGE_HOURS nothing will ever be sent about them, and the admin
// panel's window is shorter still. Keeping them forever would mean holding a
// growing record of what strangers browsed, for no reason we could defend.
// Rows that converted are kept a little longer so the panel can show the
// recovery actually worked.
// -----------------------------------------------------------------------------
$pruned = 0;
if (!$dryRun) {
    try {
        $st = $pdo->prepare(
            'DELETE FROM carts
              WHERE updated_at < DATE_SUB(NOW(), INTERVAL 90 DAY)'
        );
        $st->execute();
        $pruned = $st->rowCount();
    } catch (Throwable $e) {
        fwrite(STDERR, 'Prune failed: ' . $e->getMessage() . "\n");
    }
}

$elapsed = round(microtime(true) - $startedAt, 2);
say('Done in ' . $elapsed . 's — ' . $sent . ' sent, ' . $skipped . ' skipped, '
    . $failed . ' failed, ' . $pruned . ' old snapshot(s) pruned.', true);

if ($skipReasons && !$quiet) {
    say('Skip reasons:');
    foreach ($skipReasons as $reason => $n) say('  ' . $n . ' x ' . $reason);
}

exit($failed > 0 ? 1 : 0);
