<?php
// =============================================================================
// /api/unsubscribe.php — opt out of marketing email (PUBLIC, token-addressed)
//
//   GET  ?token=<32hex>   -> a small confirmation page with a one-click button
//   POST ?token=<32hex>   -> performs the unsubscribe, renders the result
//
// WHY GET DOES NOT UNSUBSCRIBE
// Mail clients, corporate link scanners and chat previews routinely fetch every
// URL in an email before a human sees it. If GET performed the opt-out, a
// scanner would silently unsubscribe people who never clicked anything, and we
// would have no way to tell that apart from a real opt-out. So GET only shows
// a button, and the state change happens on POST.
//
// That also matches RFC 8058 one-click: the marketing emails send
//   List-Unsubscribe: <this url>
//   List-Unsubscribe-Post: List-Unsubscribe=One-Click
// so Gmail/Apple Mail's own "Unsubscribe" affordance POSTs here directly and
// the customer never has to open a page at all.
//
// This endpoint renders HTML, not JSON — it is opened by a person from their
// inbox. The Content-Type set by config.php is replaced below.
// =============================================================================

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_marketing_helpers.php';

header('Content-Type: text/html; charset=utf-8');
// Never let a shared cache hold a page whose content depends on a private token.
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function unsub_page(string $heading, string $body, string $formToken = ''): string {
    $h = htmlspecialchars($heading, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    // $body is trusted, template-authored HTML from this file only.
    $button = '';
    if ($formToken !== '') {
        $t = htmlspecialchars($formToken, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $button =
            '<form method="post" action="?token=' . $t . '" style="margin-top:28px;">'
          .   '<button type="submit" style="background:#ed2c15;color:#fff;border:0;border-radius:10px;'
          .     'padding:14px 28px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;">'
          .     'Yes, unsubscribe me'
          .   '</button>'
          . '</form>'
          . '<p style="margin-top:18px;font-size:13px;color:#8a8a99;">'
          .   'Changed your mind? Just close this tab — nothing has happened yet.'
          . '</p>';
    }

    return '<!doctype html><html lang="en"><head>'
        . '<meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<meta name="robots" content="noindex, nofollow">'
        . '<title>' . $h . ' · Velorex Music</title>'
        . '</head>'
        . '<body style="margin:0;background:#0a0a14;color:#f2f2f5;'
        .   'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">'
        . '<div style="max-width:520px;margin:0 auto;padding:80px 24px;text-align:center;">'
        .   '<a href="/" style="display:inline-block;font-size:22px;font-weight:800;letter-spacing:0.02em;'
        .     'color:#fff;text-decoration:none;margin-bottom:36px;">Velorex Music</a>'
        .   '<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);'
        .     'border-radius:16px;padding:36px 28px;">'
        .     '<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;">' . $h . '</h1>'
        .     '<div style="font-size:15px;line-height:1.6;color:#b9b9c6;">' . $body . '</div>'
        .     $button
        .   '</div>'
        .   '<p style="margin-top:28px;font-size:13px;color:#6f6f80;">'
        .     '<a href="/" style="color:#6f6f80;">Back to velorexmusic.com</a>'
        .   '</p>'
        . '</div></body></html>';
}

$token = isset($_GET['token']) ? (string)$_GET['token'] : '';

if (!marketing_valid_key($token)) {
    http_response_code(400);
    echo unsub_page(
        'That link looks wrong',
        '<p style="margin:0;">This unsubscribe link is incomplete or has been altered in transit. '
      . 'Reply to any email from us and we will take you off the list by hand.</p>'
    );
    exit;
}

try {
    $pdo = db();
    marketing_ensure_tables($pdo);

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $email = marketing_unsubscribe_by_token($pdo, $token);
        if ($email === null) {
            // Unknown token. Show the same calm outcome rather than "no such
            // subscriber" — the person's goal is to stop receiving mail, and
            // an unknown token already achieves that.
            echo unsub_page(
                'You are unsubscribed',
                '<p style="margin:0;">You will not receive marketing email from Velorex Music. '
              . 'Order receipts and delivery updates are unaffected.</p>'
            );
            exit;
        }
        echo unsub_page(
            'You are unsubscribed',
            '<p style="margin:0 0 10px;"><strong style="color:#f2f2f5;">'
          . htmlspecialchars($email, ENT_QUOTES | ENT_HTML5, 'UTF-8')
          . '</strong> has been removed from our mailing list.</p>'
          . '<p style="margin:0;">You will still get receipts and delivery updates for orders you place — '
          . 'those are not marketing, and we cannot turn them off.</p>'
        );
        exit;
    }

    // GET — confirmation page.
    $st = $pdo->prepare('SELECT email, status FROM subscribers WHERE token = :t LIMIT 1');
    $st->execute([':t' => $token]);
    $row = $st->fetch();

    if ($row && $row['status'] === 'unsubscribed') {
        echo unsub_page(
            'You are already unsubscribed',
            '<p style="margin:0;">Nothing more to do — we are not sending you marketing email.</p>'
        );
        exit;
    }

    $who = $row
        ? '<strong style="color:#f2f2f5;">' . htmlspecialchars((string)$row['email'], ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</strong>'
        : 'this address';

    echo unsub_page(
        'Unsubscribe from Velorex Music?',
        '<p style="margin:0 0 10px;">We will stop sending new-arrival and offer emails to ' . $who . '.</p>'
      . '<p style="margin:0;">Order receipts and delivery updates will keep coming — those are not marketing.</p>',
        $token
    );
} catch (Throwable $e) {
    error_log('[unsubscribe] ' . $e->getMessage());
    http_response_code(500);
    echo unsub_page(
        'Something went wrong',
        '<p style="margin:0;">We could not process that just now. Please reply to any email from us '
      . 'and we will remove you by hand.</p>'
    );
}
