<?php
// Transactional email templates. Each function returns
//   [ 'subject' => string, 'html' => string, 'text' => string ]
// so the caller can hand the parts to send_mail() without thinking about
// MIME multipart boundaries.
//
// Design notes for the HTML:
//   - Inline CSS only. Gmail strips <style> blocks in many client variants
//     (especially the mobile app), and Outlook desktop ignores anything in
//     a <head> CSS rule that uses class selectors. Inline styles work.
//   - Table-based layout. flexbox/grid don't render in Outlook 2016+ which
//     uses Word's HTML renderer.
//   - One <a> button styled both via background-color AND a contained
//     <span> so Outlook's "bullet-proof button" technique kicks in.
//   - The pre-header (a hidden <span> at the top) is what mobile clients
//     show as the snippet line under the subject.
//   - 600px max width — Outlook web caps to ~660, most clients reflow
//     responsively below 480.

function _vv_money(int $rupees): string {
    return '₹' . number_format($rupees, 0, '.', ',');
}

function _vv_esc(?string $v): string {
    return htmlspecialchars((string)$v, ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

// One-line address renderer matching the format used in the order detail
// modal. Falls back to whichever fields are present.
function _vv_format_address(array $a, bool $html = true): string {
    $sep = $html ? '<br>' : "\n";
    $lines = [];
    if (!empty($a['fullName']))   $lines[] = $a['fullName'];
    if (!empty($a['line1']))      $lines[] = $a['line1'];
    if (!empty($a['line2']))      $lines[] = $a['line2'];
    if (!empty($a['landmark']))   $lines[] = $a['landmark'];
    $locality = array_filter([$a['city'] ?? '', $a['state'] ?? '', $a['postalCode'] ?? '']);
    if ($locality)                 $lines[] = implode(', ', $locality);
    if (!empty($a['countryCode'])) $lines[] = strtoupper($a['countryCode']);
    if (!empty($a['phone']))       $lines[] = '📞 ' . $a['phone'];
    $out = implode($sep, $lines);
    return $html ? $out : strip_tags($out);
}

// Returns the absolute base URL for emails — prefers a configured constant
// so emails sent from a staging environment don't accidentally link to
// production. Falls back to the production hostname.
function _vv_base_url(): string {
    if (defined('SITE_BASE_URL') && SITE_BASE_URL !== '') {
        return rtrim(SITE_BASE_URL, '/');
    }
    return 'https://velorexmusic.com';
}

function order_receipt_email(array $orderData): array {
    $id        = (string)($orderData['id'] ?? '');
    $date      = (string)($orderData['date'] ?? '');
    $items     = is_array($orderData['items'] ?? null) ? $orderData['items'] : [];
    $subtotal  = (int)($orderData['subtotal'] ?? 0);
    $shipping  = (int)($orderData['shipping'] ?? 0);
    $total     = (int)($orderData['total'] ?? 0);
    $addr      = is_array($orderData['shippingAddress'] ?? null) ? $orderData['shippingAddress'] : [];
    $contact   = is_array($orderData['contact'] ?? null) ? $orderData['contact'] : [];
    $fullName  = (string)($contact['fullName'] ?? ($addr['fullName'] ?? 'Customer'));
    $firstName = trim(explode(' ', trim($fullName))[0]) ?: 'there';

    $base      = _vv_base_url();
    // Pre-fill both fields in the tracking link so the customer just clicks
    // through. track-order.html auto-submits when both ?id= and ?email= are
    // present. Email isn't sensitive in a URL — it's already in this email's
    // To: header — but including it removes a guess-and-retype step.
    $contactEmail = (string)($contact['email'] ?? '');
    $trackUrl  = $base . '/track-order.html?id=' . urlencode($id)
               . ($contactEmail !== '' ? '&email=' . urlencode($contactEmail) : '');
    $storeUrl  = $base . '/';

    $subject   = "Your Velorex Music order #{$id} is confirmed";

    // -------- Plain-text version (graceful fallback for HTML-stripped clients) --------
    $textLines = [];
    $textLines[] = "Hi " . $firstName . ",";
    $textLines[] = "";
    $textLines[] = "Thanks for shopping with Velorex Music! Your order is confirmed.";
    $textLines[] = "";
    $textLines[] = "ORDER " . $id;
    $textLines[] = "Placed on " . $date;
    $textLines[] = "";
    $textLines[] = "ITEMS";
    foreach ($items as $item) {
        if (!is_array($item)) continue;
        $line = '  ' . ($item['qty'] ?? 1) . ' × ' . ($item['name'] ?? '—')
              . ' @ ' . _vv_money((int)($item['price'] ?? 0))
              . '   = ' . _vv_money((int)($item['lineTotal'] ?? 0));
        $textLines[] = $line;
    }
    $textLines[] = "";
    $textLines[] = "Subtotal: " . _vv_money($subtotal);
    $textLines[] = "Shipping: " . ($shipping === 0 ? 'FREE' : _vv_money($shipping));
    $textLines[] = "TOTAL:    " . _vv_money($total);
    $textLines[] = "";
    $textLines[] = "SHIPPING TO";
    $textLines[] = _vv_format_address($addr, false);
    $textLines[] = "";
    $textLines[] = "Track your order: " . $trackUrl;
    $textLines[] = "";
    $textLines[] = "Questions? Just reply to this email.";
    $textLines[] = "— The Velorex Music team";
    $text = implode("\n", $textLines);

    // -------- HTML version (inline styles, table layout) --------
    $rowsHtml = '';
    foreach ($items as $item) {
        if (!is_array($item)) continue;
        $name = _vv_esc($item['name'] ?? '');
        $artist = _vv_esc($item['artist'] ?? '');
        $qty = (int)($item['qty'] ?? 0);
        $price = (int)($item['price'] ?? 0);
        $lineTotal = (int)($item['lineTotal'] ?? ($price * $qty));
        $rowsHtml .= '<tr>'
            . '<td style="padding:14px 12px;border-bottom:1px solid #eee;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;">'
            .   '<div style="font-weight:600;">' . $name . '</div>'
            .   ($artist !== '' ? '<div style="color:#666;font-size:12px;margin-top:2px;">' . $artist . '</div>' : '')
            . '</td>'
            . '<td align="center" style="padding:14px 12px;border-bottom:1px solid #eee;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#444;">' . $qty . '</td>'
            . '<td align="right" style="padding:14px 12px;border-bottom:1px solid #eee;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#444;">' . _vv_money($price) . '</td>'
            . '<td align="right" style="padding:14px 12px;border-bottom:1px solid #eee;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;font-weight:600;">' . _vv_money($lineTotal) . '</td>'
            . '</tr>';
    }

    $addrHtml = _vv_format_address($addr, true);

    $html = '<!doctype html>'
        . '<html lang="en">'
        . '<head>'
        .   '<meta charset="UTF-8">'
        .   '<meta name="viewport" content="width=device-width,initial-scale=1">'
        .   '<title>' . _vv_esc($subject) . '</title>'
        . '</head>'
        . '<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">'
        // Pre-header — shown by Gmail/iOS Mail in the inbox preview line.
        . '<span style="display:none !important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">'
        .   'Order #' . _vv_esc($id) . ' confirmed — total ' . _vv_money($total) . '. Tap to track.'
        . '</span>'

        . '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f7;">'
        .   '<tr><td align="center" style="padding:24px 12px;">'

        .     '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.04);">'

        // Header bar with brand
        .       '<tr><td style="background:#0a0a14;padding:24px 28px;">'
        .         '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">'
        .           '<tr>'
        .             '<td style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:800;letter-spacing:0.02em;color:#ffffff;">'
        .               '<a href="' . _vv_esc($storeUrl) . '" style="text-decoration:none;color:#ffffff;">Velorex Music</a>'
        .             '</td>'
        .             '<td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#ff6b35;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;">Order Confirmed</td>'
        .           '</tr>'
        .         '</table>'
        .       '</td></tr>'

        // Body — greeting + order id
        .       '<tr><td style="padding:32px 28px 8px;">'
        .         '<p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#111;">Hi ' . _vv_esc($firstName) . ',</p>'
        .         '<p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#444;">'
        .           'Thanks for shopping with Velorex Music! Your order is confirmed and we\'ll send you another email once it ships. '
        .           'Below is your receipt — save this email or note the order number for tracking.'
        .         '</p>'

        .         '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fafafa;border:1px solid #ececec;border-radius:10px;margin:0 0 20px;">'
        .           '<tr>'
        .             '<td style="padding:14px 18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#666;">Order number</td>'
        .             '<td align="right" style="padding:14px 18px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111;font-weight:700;letter-spacing:0.04em;">'
        .               _vv_esc($id)
        .             '</td>'
        .           '</tr>'
        .           ($date !== '' ? '<tr><td style="padding:0 18px 14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#666;">Placed</td>'
        .             '<td align="right" style="padding:0 18px 14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111;">' . _vv_esc($date) . '</td></tr>' : '')
        .         '</table>'

        // Track button (bullet-proof) — uses a table inside an <a> so Outlook 2007+
        // renders it as a clickable button. The MSO-only fill paints the background
        // colour in Word's HTML renderer.
        .         '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px;"><tr><td>'
        .           '<a href="' . _vv_esc($trackUrl) . '" target="_blank" style="display:inline-block;background:#ff6b35;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;padding:12px 22px;border-radius:8px;">'
        .             'Track your order →'
        .           '</a>'
        .         '</td></tr></table>'

        // Items table
        .         '<h3 style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#666;text-transform:uppercase;letter-spacing:0.08em;">Items</h3>'
        .         '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">'
        .           '<thead>'
        .             '<tr style="background:#fafafa;">'
        .               '<th align="left"   style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #eee;">Product</th>'
        .               '<th align="center" style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #eee;">Qty</th>'
        .               '<th align="right"  style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #eee;">Price</th>'
        .               '<th align="right"  style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #eee;">Total</th>'
        .             '</tr>'
        .           '</thead>'
        .           '<tbody>' . $rowsHtml . '</tbody>'
        .         '</table>'

        // Totals
        .         '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:16px;">'
        .           '<tr>'
        .             '<td></td>'
        .             '<td width="240">'
        .               '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">'
        .                 '<tr>'
        .                   '<td align="right" style="padding:6px 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#666;">Subtotal</td>'
        .                   '<td align="right" style="padding:6px 0 6px 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;">' . _vv_money($subtotal) . '</td>'
        .                 '</tr>'
        .                 '<tr>'
        .                   '<td align="right" style="padding:6px 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#666;">Shipping</td>'
        .                   '<td align="right" style="padding:6px 0 6px 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:' . ($shipping === 0 ? '#16a34a' : '#111') . ';">'
        .                     ($shipping === 0 ? 'FREE' : _vv_money($shipping))
        .                   '</td>'
        .                 '</tr>'
        .                 '<tr>'
        .                   '<td align="right" style="padding:10px 12px;border-top:2px solid #111;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111;font-weight:700;">Total</td>'
        .                   '<td align="right" style="padding:10px 0 10px 12px;border-top:2px solid #111;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#ff6b35;font-weight:800;">' . _vv_money($total) . '</td>'
        .                 '</tr>'
        .               '</table>'
        .             '</td>'
        .           '</tr>'
        .         '</table>'

        // Shipping address card
        .         '<h3 style="margin:28px 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#666;text-transform:uppercase;letter-spacing:0.08em;">Shipping to</h3>'
        .         '<div style="background:#fafafa;border:1px solid #ececec;border-radius:10px;padding:14px 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#111;">'
        .           $addrHtml
        .         '</div>'

        .       '</td></tr>'

        // Footer
        .       '<tr><td style="padding:24px 28px 28px;border-top:1px solid #ececec;">'
        .         '<p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#444;line-height:1.55;">Questions about your order? Just reply to this email — we read every one.</p>'
        .         '<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#999;line-height:1.55;">Velorex Music · <a href="' . _vv_esc($storeUrl) . '" style="color:#999;">velorexmusic.com</a></p>'
        .       '</td></tr>'

        .     '</table>'
        .   '</td></tr>'
        . '</table>'
        . '</body>'
        . '</html>';

    return [
        'subject' => $subject,
        'html'    => $html,
        'text'    => $text,
    ];
}
