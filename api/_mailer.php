<?php
// Thin wrapper around PHPMailer for transactional email.
//
// Usage:
//   require_once __DIR__ . '/_mailer.php';
//   $ok = send_mail('customer@example.com', 'Jane Doe',
//                   'Subject', '<html>...</html>', 'Plain text version');
//
// Design rules:
//   1. NEVER throws. Email failure must not roll back the order/payment that
//      triggered it. Callers (finalize_payment, signup, etc.) treat email
//      as a best-effort side-effect — if SMTP is down the order still stands
//      and we just write to error_log.
//   2. NEVER blocks for more than 30s. Brevo's SMTP server normally responds
//      in well under 2s; the timeout exists to protect the user from a
//      hanging payment finalization if Brevo is having a bad day.
//   3. If SMTP credentials aren't configured (e.g. before the user has set
//      up Brevo on a fresh deploy), returns false silently. The code is safe
//      to deploy ahead of the secrets being set.
//   4. The library lives at api/lib/PHPMailer/ — three files, no Composer.
//
// Required secrets (define in the active secrets file — see secrets.example.php):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
//
// Optional secrets:
//   SMTP_FROM        — defaults to SMTP_USER if unset
//   SMTP_FROM_NAME   — defaults to 'Velorex Music'
//   SMTP_REPLY_TO    — adds a Reply-To header (handy when SMTP_FROM is a no-reply alias)
//   SMTP_SECURE      — 'tls' (STARTTLS — Brevo default), 'ssl' (SMTPS on 465), or '' (plain).
//                      Default 'tls'. Set to '' for local Mailpit/MailHog catchers.
//   SMTP_AUTH        — true | false. Default true. Set to false for local catchers
//                      that don't require credentials.
//   SMTP_DEBUG       — 0..4; passed to PHPMailer's SMTPDebug. Default 0 (silent).
//                      Set to 2 temporarily on the server when chasing a delivery bug.

require_once __DIR__ . '/lib/PHPMailer/Exception.php';
require_once __DIR__ . '/lib/PHPMailer/PHPMailer.php';
require_once __DIR__ . '/lib/PHPMailer/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as PHPMailerException;

function mailer_is_configured(): bool {
    // SMTP_HOST is the only hard requirement — local catchers (Mailpit,
    // MailHog) don't need creds, so we let SMTP_USER/SMTP_PASS be blank
    // when SMTP_AUTH is explicitly false.
    if (!defined('SMTP_HOST') || SMTP_HOST === '') return false;
    $authRequired = !defined('SMTP_AUTH') || (bool)SMTP_AUTH;
    if ($authRequired) {
        if (!defined('SMTP_USER') || !defined('SMTP_PASS')) return false;
        if (SMTP_USER === '' || SMTP_PASS === '') return false;
    }
    return true;
}

function send_mail(string $to, string $toName, string $subject, string $htmlBody, string $textBody = ''): bool {
    if (!mailer_is_configured()) {
        error_log('[mailer] SMTP not configured — skipping send to ' . $to . ' subject="' . $subject . '"');
        return false;
    }

    $mail = new PHPMailer(true); // true = throw exceptions on internal errors; we catch them all here
    try {
        $mail->isSMTP();
        $mail->Host        = SMTP_HOST;
        $mail->Port        = defined('SMTP_PORT') && SMTP_PORT ? (int)SMTP_PORT : 587;
        $mail->Timeout     = 30;
        $mail->CharSet     = PHPMailer::CHARSET_UTF8;
        $mail->Encoding    = PHPMailer::ENCODING_QUOTED_PRINTABLE;
        $mail->SMTPDebug   = defined('SMTP_DEBUG') ? (int)SMTP_DEBUG : 0;

        // Auth: on by default. Toggle off only for local catchers that don't
        // require credentials (Mailpit/MailHog).
        $authRequired = !defined('SMTP_AUTH') || (bool)SMTP_AUTH;
        $mail->SMTPAuth = $authRequired;
        if ($authRequired) {
            $mail->Username = SMTP_USER;
            $mail->Password = SMTP_PASS;
        }

        // Encryption: 'tls' (STARTTLS — Brevo default), 'ssl' (SMTPS on 465),
        // or '' (plain — local Mailpit). PHPMailer accepts the empty string
        // for "no encryption".
        $secure = defined('SMTP_SECURE') ? strtolower((string)SMTP_SECURE) : 'tls';
        if ($secure === 'tls') {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        } elseif ($secure === 'ssl' || $secure === 'smtps') {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        } else {
            // Disable encryption entirely. Without this PHPMailer still tries
            // STARTTLS opportunistically and trips on servers that don't
            // advertise it.
            $mail->SMTPSecure = '';
            $mail->SMTPAutoTLS = false;
        }
        if ($mail->SMTPDebug > 0) {
            // Route debug output to error_log instead of stdout so it doesn't
            // leak into the JSON response body.
            $mail->Debugoutput = function ($str, $level) {
                error_log('[mailer:smtp] ' . trim($str));
            };
        }

        $fromAddr = defined('SMTP_FROM')      && SMTP_FROM      !== '' ? SMTP_FROM      : SMTP_USER;
        $fromName = defined('SMTP_FROM_NAME') && SMTP_FROM_NAME !== '' ? SMTP_FROM_NAME : 'Velorex Music';
        $mail->setFrom($fromAddr, $fromName);

        $mail->addAddress($to, $toName !== '' ? $toName : $to);

        if (defined('SMTP_REPLY_TO') && SMTP_REPLY_TO !== '') {
            $mail->addReplyTo(SMTP_REPLY_TO, $fromName);
        }

        // X-Mailer + a custom header so future ops can grep server logs and
        // Brevo's "Transactional → Email logs" by source.
        $mail->XMailer = 'velorex-music';
        $mail->addCustomHeader('X-Velorex-App', 'velorex-music');

        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body    = $htmlBody;
        if ($textBody !== '') {
            $mail->AltBody = $textBody;
        } else {
            // Naive fallback so the email always has a text/plain part for
            // clients that refuse HTML.
            $mail->AltBody = trim(html_entity_decode(strip_tags($htmlBody), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        }

        $mail->send();
        return true;
    } catch (PHPMailerException $e) {
        // PHPMailer's ErrorInfo is more useful than the exception message —
        // it includes the SMTP server's reply text on auth/delivery failures.
        error_log('[mailer] PHPMailer error sending to ' . $to . ': ' . $mail->ErrorInfo);
        return false;
    } catch (Throwable $t) {
        error_log('[mailer] unexpected error sending to ' . $to . ': ' . $t->getMessage());
        return false;
    }
}
