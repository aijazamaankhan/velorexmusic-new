<?php
// =============================================================================
// WhatsApp order alerts — a message to the owner's phone when an order lands.
//
// Used by: finalize_payment() in api/_payment_finalize.php, alongside the
// existing admin email.
//
// WHY THIS SHAPE
// Same discipline as api/_mailer.php, for the same reason: this runs AFTER the
// payment has been captured and the order committed. It must never throw, never
// block for long, and never be able to affect whether an order exists. A phone
// notification that fails is a notification that failed; it is not a lost sale.
//
// PROVIDERS
// Two are supported, chosen by WHATSAPP_PROVIDER:
//
//   'cloud'    Meta WhatsApp Cloud API — official, free tier, no SDK needed
//              (one HTTPS POST). Requires a Meta Business account, a dedicated
//              number, and an APPROVED TEMPLATE, because a business-initiated
//              message outside a 24-hour customer window can only be a
//              template. See the setup notes in CLAUDE.md.
//
//   'callmebot' CallMeBot — a free relay for sending to YOUR OWN number only.
//              No business account, no template approval, working in minutes.
//              It is not a commercial-grade channel and must never be used to
//              message a CUSTOMER — only the shop's own phone.
//
// Deliberately NOT used for customer-facing messages anywhere. Order receipts
// go by email (§10); adding a second channel for customers means a second
// consent story, and WhatsApp's rules on business-initiated messaging are
// stricter than email's.
// =============================================================================

require_once __DIR__ . '/config.php';

// Same pattern as mailer_last_error(): the reason a send failed, for an admin
// surface. Never exposed publicly — it can contain a provider error naming the
// configured phone number.
$GLOBALS['VELOREX_WA_LAST_ERROR'] = '';

function whatsapp_last_error(): string {
    return (string)($GLOBALS['VELOREX_WA_LAST_ERROR'] ?? '');
}

function whatsapp_set_last_error(string $msg): void {
    $msg = trim(preg_replace('/\s+/', ' ', $msg));
    $GLOBALS['VELOREX_WA_LAST_ERROR'] = mb_substr($msg, 0, 300);
}

function whatsapp_provider(): string {
    $p = defined('WHATSAPP_PROVIDER') ? strtolower(trim((string)WHATSAPP_PROVIDER)) : '';
    return in_array($p, ['cloud', 'callmebot'], true) ? $p : '';
}

function whatsapp_is_configured(): bool {
    $p = whatsapp_provider();
    if ($p === '') return false;

    if (!defined('WHATSAPP_TO') || trim((string)WHATSAPP_TO) === '') return false;

    if ($p === 'cloud') {
        return defined('WHATSAPP_TOKEN') && WHATSAPP_TOKEN !== ''
            && defined('WHATSAPP_PHONE_ID') && WHATSAPP_PHONE_ID !== ''
            && defined('WHATSAPP_TEMPLATE') && WHATSAPP_TEMPLATE !== '';
    }
    return defined('WHATSAPP_APIKEY') && WHATSAPP_APIKEY !== '';
}

// Digits only, no plus. Both providers want E.164 without the leading +.
function whatsapp_normalize_number(string $n): string {
    return preg_replace('/\D+/', '', $n);
}

/**
 * One HTTPS POST, bounded, never throwing.
 *
 * $params are the ordered template variables for the 'cloud' provider, and are
 * joined into the plain-text body for 'callmebot'. Keep them short: a template
 * variable may not contain a newline, and WhatsApp rejects the whole message if
 * one does.
 */
function whatsapp_send(array $params, string $plainFallback): bool {
    whatsapp_set_last_error('');

    if (!whatsapp_is_configured()) {
        whatsapp_set_last_error('WhatsApp is not configured (WHATSAPP_* in the secrets file).');
        return false;
    }
    if (!function_exists('curl_init')) {
        whatsapp_set_last_error('cURL is unavailable on this host.');
        return false;
    }

    $to = whatsapp_normalize_number((string)WHATSAPP_TO);
    if ($to === '') {
        whatsapp_set_last_error('WHATSAPP_TO has no digits in it.');
        return false;
    }

    if (whatsapp_provider() === 'cloud') {
        $url  = 'https://graph.facebook.com/v21.0/' . rawurlencode((string)WHATSAPP_PHONE_ID) . '/messages';
        $lang = defined('WHATSAPP_TEMPLATE_LANG') && WHATSAPP_TEMPLATE_LANG !== ''
            ? (string)WHATSAPP_TEMPLATE_LANG : 'en';
        $payload = [
            'messaging_product' => 'whatsapp',
            'to'                => $to,
            'type'              => 'template',
            'template' => [
                'name'     => (string)WHATSAPP_TEMPLATE,
                'language' => ['code' => $lang],
                'components' => [[
                    'type'       => 'body',
                    // A template variable cannot contain a newline; WhatsApp
                    // rejects the whole message if one does. Stripped rather
                    // than trusted, because these values come from order data.
                    'parameters' => array_map(static function ($p) {
                        return ['type' => 'text', 'text' => trim(preg_replace('/\s+/', ' ', (string)$p))];
                    }, array_values($params)),
                ]],
            ],
        ];
        $headers = [
            'Authorization: Bearer ' . (string)WHATSAPP_TOKEN,
            'Content-Type: application/json',
        ];
        $body = json_encode($payload);
        $post = true;
    } else {
        // CallMeBot: everything in the query string, GET.
        $url = 'https://api.callmebot.com/whatsapp.php?'
            . http_build_query([
                'phone'  => $to,
                'text'   => $plainFallback,
                'apikey' => (string)WHATSAPP_APIKEY,
            ]);
        $headers = [];
        $body = null;
        $post = false;
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        // Short, and shorter than the mailer's: this fires after the customer
        // has paid and is waiting on a response. A provider having a bad
        // minute must not hold up their confirmation screen.
        CURLOPT_TIMEOUT        => 8,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_HTTPHEADER     => $headers,
    ]);
    if ($post) {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }

    $res  = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);

    if ($res === false) {
        whatsapp_set_last_error('Network error: ' . $err);
        error_log('[whatsapp] curl failed: ' . $err);
        return false;
    }
    if ($code < 200 || $code >= 300) {
        // The provider's own words. Meta returns a JSON error whose `message`
        // names the actual problem — an unapproved template, a number not on
        // the allow list during testing — and that is what an owner needs.
        $detail = (string)$res;
        $j = json_decode($detail, true);
        if (is_array($j) && isset($j['error']['message'])) $detail = (string)$j['error']['message'];
        whatsapp_set_last_error('HTTP ' . $code . ': ' . $detail);
        error_log('[whatsapp] HTTP ' . $code . ' — ' . mb_substr((string)$res, 0, 300));
        return false;
    }
    return true;
}

/**
 * The order alert. Best-effort by design — the caller ignores the result.
 *
 * Template variables, in order:
 *   1 order id   2 total   3 item count   4 customer name   5 city
 * A Cloud API template body must line up with this order, e.g.
 *   "New order {{1}} — {{2}}, {{3}} items. {{4}}, {{5}}."
 */
function whatsapp_notify_new_order(array $orderData): bool {
    if (!whatsapp_is_configured()) return false;

    $id      = (string)($orderData['id'] ?? '');
    $total   = (int)($orderData['total'] ?? 0);
    $items   = is_array($orderData['items'] ?? null) ? $orderData['items'] : [];
    $count   = 0;
    foreach ($items as $l) { if (is_array($l)) $count += (int)($l['qty'] ?? 0); }
    $contact = is_array($orderData['contact'] ?? null) ? $orderData['contact'] : [];
    $addr    = is_array($orderData['shippingAddress'] ?? null) ? $orderData['shippingAddress'] : [];

    $name = (string)($contact['fullName'] ?? ($addr['fullName'] ?? 'Guest'));
    $city = (string)($addr['city'] ?? '');
    $amt  = 'Rs ' . number_format($total);   // not the ₹ glyph: template
                                             // parameters are safest as ASCII

    $params = [$id, $amt, (string)$count, $name !== '' ? $name : 'Guest', $city !== '' ? $city : 'India'];

    $plain = 'New order ' . $id . ' - ' . $amt . ', ' . $count . ' item'
        . ($count === 1 ? '' : 's') . '. ' . ($name !== '' ? $name : 'Guest')
        . ($city !== '' ? (', ' . $city) : '');

    return whatsapp_send($params, $plain);
}
