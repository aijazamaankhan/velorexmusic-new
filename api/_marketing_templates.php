<?php
// =============================================================================
// Marketing email templates — newsletter welcome + abandoned-cart recovery.
//
// Kept separate from _email_templates.php, which holds TRANSACTIONAL mail
// (order receipt, admin alert). The split is not filing tidiness: transactional
// mail goes to anyone who buys, always, and must never carry an unsubscribe
// affordance that implies receipts can be switched off. Marketing mail here
// must ALWAYS carry one. Two files makes it hard to reach for the wrong helper.
//
// Reuses _vv_money / _vv_esc / _vv_base_url from _email_templates.php so both
// families render money and links identically.
// =============================================================================

require_once __DIR__ . '/_email_templates.php';

// =============================================================================
// newsletter_welcome_email — sent once, on a genuinely new signup
// =============================================================================
// Short by design. The job of a welcome email is to confirm the address works
// and put a route back to the shop in the inbox; it is not the place for a
// catalogue. Carries the unsubscribe link in the body as well as in the
// List-Unsubscribe header, because the header is invisible in some clients.
function newsletter_welcome_email(string $email, string $unsubToken): array {
    $base    = _vv_base_url();
    $unsub   = $base . '/api/unsubscribe.php?token=' . urlencode($unsubToken);
    $subject = 'Welcome to the Velorex Record Club';

    $text = implode("\n", [
        'Welcome to the Velorex Record Club.',
        '',
        'You are on the list. We will email you when new vinyl, CDs and cassettes',
        'land, and when something rare comes back into stock. A couple of emails',
        'a month, no more.',
        '',
        'Browse the shop: ' . $base . '/products',
        '',
        '---',
        'You received this because ' . $email . ' was entered on velorexmusic.com.',
        'Unsubscribe: ' . $unsub,
    ]);

    $html = '<!doctype html><html lang="en"><head>'
        . '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<title>' . _vv_esc($subject) . '</title></head>'
        . '<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">'
        . '<span style="display:none !important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">'
        .   'New arrivals, restocks and the occasional rare find, straight to your inbox.'
        . '</span>'
        . '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f7;">'
        .   '<tr><td align="center" style="padding:24px 12px;">'
        .     '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.04);">'
        .       '<tr><td style="background:#0a0a14;padding:28px;text-align:center;">'
        .         '<a href="' . _vv_esc($base) . '/" style="text-decoration:none;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:0.02em;">'
        .           '<img src="' . _vv_esc($base) . '/src/img/logo-lockup-dark.png" alt="Velorex Music" width="190" height="44" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:190px;margin:0 auto;">'
        .         '</a>'
        .         '<div style="margin-top:8px;font-size:11px;color:#ff6b35;letter-spacing:0.14em;text-transform:uppercase;font-weight:700;">Record Club</div>'
        .       '</td></tr>'
        .       '<tr><td style="padding:34px 28px 8px;">'
        .         '<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#111;">You are on the list</h1>'
        .         '<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#444;">'
        .           'We will email you when new vinyl, CDs and cassettes land, and when something rare '
        .           'comes back into stock. A couple of emails a month, no more.'
        .         '</p>'
        .         '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 28px;"><tr><td>'
        .           '<a href="' . _vv_esc($base) . '/products" target="_blank" style="display:inline-block;background:#ff6b35;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:12px 22px;border-radius:8px;">Browse the shop &rarr;</a>'
        .         '</td></tr></table>'
        .       '</td></tr>'
        .       '<tr><td style="padding:20px 28px 26px;border-top:1px solid #ececec;">'
        .         '<p style="margin:0;font-size:12px;color:#999;line-height:1.6;">'
        .           'You received this because <strong style="color:#666;">' . _vv_esc($email) . '</strong> was entered on velorexmusic.com.<br>'
        .           '<a href="' . _vv_esc($unsub) . '" style="color:#999;text-decoration:underline;">Unsubscribe</a> at any time &middot; '
        .           '<a href="' . _vv_esc($base) . '/" style="color:#999;">velorexmusic.com</a>'
        .         '</p>'
        .       '</td></tr>'
        .     '</table>'
        .   '</td></tr>'
        . '</table></body></html>';

    return ['subject' => $subject, 'html' => $html, 'text' => $text];
}

// =============================================================================
// abandoned_cart_email — the 2-hour and 24-hour recovery nudges
// =============================================================================
// $data: firstName, items[], total, stage (1|2), kind ('cart'|'checkout'),
//        recoveryUrl, unsubscribeUrl.
//
// Two stages with different copy on purpose. Stage 1 goes out while the intent
// is still warm and reads as helpful ("we saved it"); stage 2 is the next-day
// nudge and leans on scarcity, which is the honest reason to hurry in a shop
// that mostly sells single copies of second-hand records.
//
// NO DISCOUNT CODE. Shoppers learn to abandon carts on stores that reward it,
// and more concretely: the checkout total is recomputed server-side from DB
// prices (CLAUDE.md §17), so a code promised here could not be honoured at the
// till without a change to create-order.php. An email must not promise a price
// the payment path will refuse to charge.
function abandoned_cart_email(array $data): array {
    $firstName = trim((string)($data['firstName'] ?? ''));
    $greeting  = $firstName !== '' ? $firstName : 'there';
    $items     = is_array($data['items'] ?? null) ? $data['items'] : [];
    $total     = (int)($data['total'] ?? 0);
    $stage     = ((int)($data['stage'] ?? 1)) === 2 ? 2 : 1;
    $kind      = (string)($data['kind'] ?? 'cart');
    $base      = _vv_base_url();
    $url       = (string)($data['recoveryUrl'] ?? ($base . '/cart'));
    $unsub     = (string)($data['unsubscribeUrl'] ?? '');

    $count = 0;
    foreach ($items as $i) { if (is_array($i)) $count += (int)($i['qty'] ?? 0); }
    $firstTitle = '';
    foreach ($items as $i) {
        if (is_array($i) && !empty($i['name'])) { $firstTitle = (string)$i['name']; break; }
    }

    // The subject names the record when there is one to name. "You left Sholay
    // in your cart" is a specific memory; "You left items in your cart" is
    // inbox wallpaper.
    if ($stage === 1) {
        $subject  = $firstTitle !== ''
            ? 'You left ' . $firstTitle . ' in your cart'
            : 'You left something in your cart';
        $heading  = 'Your cart is waiting';
        $intro    = $kind === 'checkout'
            ? 'You were one step from checking out and something interrupted it. Nothing is lost, your basket is exactly as you left it.'
            : 'We saved your basket. Pick up where you left off whenever you are ready.';
        $ctaLabel = 'Return to my cart';
        $urgency  = '';
    } else {
        $subject  = $firstTitle !== ''
            ? 'Still thinking about ' . $firstTitle . '?'
            : 'Still thinking it over?';
        $heading  = 'Still want these?';
        $intro    = 'Your basket is still here. One heads-up though: much of what we stock is a single copy, so we cannot hold anything back.';
        $ctaLabel = 'Complete my order';
        $urgency  = 'Most of our records are one-of-a-kind. When a copy goes, it is gone.';
    }

    // -------- Plain text --------
    $t   = [];
    $t[] = 'Hi ' . $greeting . ',';
    $t[] = '';
    $t[] = $intro;
    $t[] = '';
    $t[] = 'YOUR BASKET (' . $count . ' item' . ($count === 1 ? '' : 's') . ')';
    foreach ($items as $i) {
        if (!is_array($i)) continue;
        $t[] = '  ' . (int)($i['qty'] ?? 1) . ' x ' . (string)($i['name'] ?? '-')
             . '   ' . _vv_money((int)($i['lineTotal'] ?? 0));
    }
    $t[] = '';
    $t[] = 'Total: ' . _vv_money($total);
    $t[] = '';
    $t[] = $ctaLabel . ': ' . $url;
    if ($urgency !== '') { $t[] = ''; $t[] = $urgency; }
    $t[] = '';
    $t[] = 'Questions? Just reply to this email.';
    $t[] = '- The Velorex Music team';
    if ($unsub !== '') {
        $t[] = '';
        $t[] = '---';
        $t[] = 'Do not want cart reminders? Unsubscribe: ' . $unsub;
        $t[] = 'Order receipts and delivery updates are unaffected.';
    }
    $text = implode("\n", $t);

    // -------- HTML --------
    $rows = '';
    foreach ($items as $i) {
        if (!is_array($i)) continue;
        $name   = _vv_esc($i['name'] ?? '');
        $artist = _vv_esc($i['artist'] ?? '');
        $qty    = (int)($i['qty'] ?? 0);
        $line   = (int)($i['lineTotal'] ?? 0);
        $img    = (string)($i['image'] ?? '');
        // Product covers are root-relative (/uploads/products/<hash>.jpg). An
        // email client has no page origin to resolve those against, so they
        // must be absolutised here or every thumbnail renders broken.
        if ($img !== '' && strpos($img, 'http') !== 0) {
            $img = $base . '/' . ltrim($img, '/');
        }
        $thumb = $img !== ''
            ? '<img src="' . _vv_esc($img) . '" width="56" height="56" alt="" style="display:block;width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid #eee;">'
            : '<div style="width:56px;height:56px;border-radius:6px;background:#f0f0f3;"></div>';
        $rows .= '<tr>'
            . '<td width="72" style="padding:12px 0 12px 12px;border-bottom:1px solid #eee;">' . $thumb . '</td>'
            . '<td style="padding:12px;border-bottom:1px solid #eee;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;">'
            .   '<div style="font-weight:600;">' . $name . '</div>'
            .   ($artist !== '' ? '<div style="color:#666;font-size:12px;margin-top:2px;">' . $artist . '</div>' : '')
            .   '<div style="color:#888;font-size:12px;margin-top:4px;">Qty ' . $qty . '</div>'
            . '</td>'
            . '<td align="right" style="padding:12px 12px 12px 0;border-bottom:1px solid #eee;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;font-weight:600;white-space:nowrap;">'
            .   _vv_money($line)
            . '</td>'
            . '</tr>';
    }

    $urgencyBlock = $urgency !== ''
        ? '<tr><td style="padding:20px 28px 0;"><p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#8a6d3b;background:#fdf6e6;border:1px solid #f5e3bd;border-radius:8px;padding:12px 14px;">' . _vv_esc($urgency) . '</p></td></tr>'
        : '';

    $unsubBlock = $unsub !== ''
        ? '<br>Do not want cart reminders? <a href="' . _vv_esc($unsub) . '" style="color:#999;text-decoration:underline;">Unsubscribe</a>. Order receipts are unaffected.'
        : '';

    $html = '<!doctype html><html lang="en"><head>'
        . '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<title>' . _vv_esc($subject) . '</title></head>'
        . '<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">'
        . '<span style="display:none !important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">'
        .   $count . ' item' . ($count === 1 ? '' : 's') . ' still in your basket, ' . _vv_money($total) . '.'
        . '</span>'
        . '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f7;">'
        .   '<tr><td align="center" style="padding:24px 12px;">'
        .     '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.04);">'

        .       '<tr><td style="background:#0a0a14;padding:24px 28px;">'
        .         '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>'
        .           '<td style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:800;letter-spacing:0.02em;color:#ffffff;">'
        // Brand lockup — same treatment as the receipt in _email_templates.php.
        // Absolute https URL, explicit dimensions, display:block; the alt text
        // is the fallback for clients that block images.
        .             '<a href="' . _vv_esc($base) . '/" style="text-decoration:none;color:#ffffff;">'
        .               '<img src="' . _vv_esc($base) . '/src/img/logo-lockup-dark.png" alt="Velorex Music" width="170" height="39" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:170px;">'
        .             '</a>'
        .           '</td>'
        .           '<td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#ff6b35;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;">Cart saved</td>'
        .         '</tr></table>'
        .       '</td></tr>'

        .       '<tr><td style="padding:32px 28px 4px;">'
        .         '<h1 style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:#111;">' . _vv_esc($heading) . '</h1>'
        .         '<p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#444;">Hi ' . _vv_esc($greeting) . ',</p>'
        .         '<p style="margin:0 0 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#444;">' . _vv_esc($intro) . '</p>'
        .         '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;"><tr><td>'
        .           '<a href="' . _vv_esc($url) . '" target="_blank" style="display:inline-block;background:#ff6b35;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;padding:13px 26px;border-radius:8px;">'
        .             _vv_esc($ctaLabel) . ' &rarr;'
        .           '</a>'
        .         '</td></tr></table>'
        .       '</td></tr>'

        .       '<tr><td style="padding:0 16px;">'
        .         '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid #eee;border-radius:10px;">'
        .           $rows
        .           '<tr>'
        .             '<td colspan="2" style="padding:14px 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#666;">Total</td>'
        .             '<td align="right" style="padding:14px 12px;font-family:Arial,Helvetica,sans-serif;font-size:17px;color:#ff6b35;font-weight:800;white-space:nowrap;">' . _vv_money($total) . '</td>'
        .           '</tr>'
        .         '</table>'
        .       '</td></tr>'

        .       $urgencyBlock

        .       '<tr><td style="padding:26px 28px 8px;">'
        .         '<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#444;line-height:1.6;">Shipping is calculated at checkout. Questions? Just reply to this email &mdash; we read every one.</p>'
        .       '</td></tr>'

        .       '<tr><td style="padding:18px 28px 26px;border-top:1px solid #ececec;">'
        .         '<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#999;line-height:1.6;">'
        .           'Velorex Music &middot; <a href="' . _vv_esc($base) . '/" style="color:#999;">velorexmusic.com</a>'
        .           $unsubBlock
        .         '</p>'
        .       '</td></tr>'

        .     '</table>'
        .   '</td></tr>'
        . '</table></body></html>';

    return ['subject' => $subject, 'html' => $html, 'text' => $text];
}
