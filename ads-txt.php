<?php
// =============================================================================
// ads-txt.php — serves /ads.txt (rewritten in .htaccess)
//
// Two jobs, both of which AdSense requires and neither of which the ad code
// itself covers:
//
//   1. SITE VERIFICATION. Google offers three ways to prove you own a site:
//      paste their snippet into every page's <head>, add a meta tag, or add an
//      ads.txt line. The snippet option would load ad code on the whole
//      storefront, which is exactly the thing §40 exists to prevent — so this
//      is the method to choose in the AdSense verification screen.
//
//   2. "Earnings at risk". AdSense flags any site without an ads.txt and
//      throttles programmatic demand. It is not optional once ads are live.
//
// Generated from the publisher id in Settings → Ads rather than kept as a
// static file, so there is one place to type it and no file to forget. Change
// the setting, and this changes with it.
//
// 404s when no publisher id is set. An EMPTY ads.txt is worse than none:
// crawlers cache it, and an empty file is read as "no seller is authorised to
// sell this inventory", which suppresses ads rather than merely failing to
// enable them.
// =============================================================================

require_once __DIR__ . '/api/_settings_helpers.php';

$client = '';
try {
    $client = trim((string)settings_get(db(), 'adsense_client'));
} catch (Throwable $e) {
    error_log('[ads.txt] settings unavailable: ' . $e->getMessage());
}

// Same shape check the storefront applies before it will load anything.
if (!preg_match('/^ca-pub-(\d{10,20})$/', $client, $m)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo "# No AdSense publisher id configured.\n";
    exit;
}

// ads.txt wants the id WITHOUT the "ca-" prefix. Getting this wrong is the
// single most common reason a correct-looking ads.txt is rejected.
$pub = 'pub-' . $m[1];

header('Content-Type: text/plain; charset=utf-8');
// A day: long enough to be cheap, short enough that switching the id in
// Settings is picked up the same day rather than whenever a crawler feels like
// revalidating.
header('Cache-Control: public, max-age=86400');

// f08c47fec0942fa0 is Google's own certification-authority id, identical for
// every AdSense publisher — it is not a secret and not account-specific.
echo "google.com, {$pub}, DIRECT, f08c47fec0942fa0\n";
