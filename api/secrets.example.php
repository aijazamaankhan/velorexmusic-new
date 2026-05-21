<?php
// Template for the secrets file loaded by api/config.php.
//
// NEVER commit a copy of this with real values filled in.
//
// Local development:
//   cp api/secrets.example.php api/secrets.local.php
//   # then edit api/secrets.local.php with your local MySQL credentials
//
// Hostinger production:
//   Copy this file to /home/u286479481/private/velorex_secrets.php
//   (one directory ABOVE public_html so git deploys can never touch it).
//   Fill in the real production values.
//
//   You will need to create the `private/` folder once via File Manager,
//   then upload this file into it.

define('DB_HOST', 'localhost');
define('DB_NAME', 'u286479481_velorex');
define('DB_USER', 'u286479481_velorex_admin');
define('DB_PASS', 'REPLACE_WITH_REAL_PASSWORD');

// Used as the admin API token. Must match the password used in the admin login page (vlx-admin-2026.html).
define('ADMIN_PASS', 'REPLACE_WITH_ADMIN_PASSWORD');

// =============================================
// Razorpay payment gateway
// =============================================
// Two sets of credentials so we can flip between sandbox and production
// without touching code. RAZORPAY_MODE picks which set is active for both
// the order-creation flow and webhook signature verification.
//
// Get the key id + secret from: Razorpay Dashboard → Settings → API Keys
// Get the webhook secret from:  Razorpay Dashboard → Settings → Webhooks
//                               (Create a webhook pointing to
//                                https://velorexmusic.com/api/payments/webhook.php
//                                and copy the "secret" shown when it's created.)
//
// SECURITY: never commit a copy of this file with real values filled in.
// The webhook secret in particular gates whether anyone on the internet can
// post fake payment-success events — if it's blank, the webhook endpoint
// refuses to accept anything.

define('RAZORPAY_MODE', 'test'); // 'test' | 'live' — flip when ready to accept real payments

define('RAZORPAY_TEST_KEY_ID',         'rzp_test_REPLACE_ME');
define('RAZORPAY_TEST_KEY_SECRET',     'REPLACE_ME');
define('RAZORPAY_TEST_WEBHOOK_SECRET', 'REPLACE_ME'); // optional until you wire up the webhook

define('RAZORPAY_LIVE_KEY_ID',         'rzp_live_REPLACE_ME');
define('RAZORPAY_LIVE_KEY_SECRET',     'REPLACE_ME');
define('RAZORPAY_LIVE_WEBHOOK_SECRET', 'REPLACE_ME');

// =============================================
// Transactional email (Brevo SMTP)
// =============================================
// PHPMailer in api/_mailer.php talks to whatever SMTP server you put here.
// Default expectation is Brevo (https://www.brevo.com) — free 300 emails/day
// forever, no card required.
//
// Setup steps on Brevo:
//   1. Sign up, verify your account email.
//   2. Senders, Domains & IPs → Domains → add velorexmusic.com → copy the
//      SPF/DKIM/DMARC DNS records into Hostinger's DNS Zone Editor.
//   3. Senders, Domains & IPs → Senders → add orders@velorexmusic.com (or
//      whatever SMTP_FROM you set below).
//   4. SMTP & API → SMTP → "Generate a new SMTP key" → paste into SMTP_PASS.
//      Your Brevo account email goes into SMTP_USER.
//
// If SMTP_HOST / SMTP_USER / SMTP_PASS are blank, send_mail() returns false
// silently and the order still completes — so this file is safe to deploy
// before you've finished the Brevo wizard.

define('SMTP_HOST', '');                 // e.g. 'smtp-relay.brevo.com'
define('SMTP_PORT', 587);                // 587 (STARTTLS) for Brevo; 465 for SMTPS elsewhere
define('SMTP_USER', '');                 // your Brevo account email
define('SMTP_PASS', '');                 // SMTP key from Brevo (NOT your dashboard password)

// Default From header for transactional emails. Must be a sender Brevo has
// verified — otherwise Brevo rejects with "550 Sender not allowed".
define('SMTP_FROM',      'orders@velorexmusic.com');
define('SMTP_FROM_NAME', 'Velorex Music');
define('SMTP_REPLY_TO',  'orders@velorexmusic.com'); // shown when the customer hits "Reply"

// Encryption + auth toggles — defaults are right for Brevo. Override only
// when pointing at a local Mailpit/MailHog catcher for development:
//   define('SMTP_SECURE', '');     // no TLS
//   define('SMTP_AUTH',   false);  // no credentials
// Acceptable values for SMTP_SECURE: 'tls' (Brevo default), 'ssl' (SMTPS on
// 465), '' (no encryption — local dev only).
// define('SMTP_SECURE', 'tls');
// define('SMTP_AUTH',   true);

// Optional: bump to 2 only when debugging SMTP delivery; routes wire-level
// SMTP chatter to error_log. Leave at 0 in production.
define('SMTP_DEBUG', 0);

// Optional: overrides the base URL used in transactional emails (track links
// etc.). Leave undefined in production — _vv_base_url() defaults to
// https://velorexmusic.com. Set this in api/secrets.local.php to point at
// http://localhost:5500 during development so test emails link locally.
// define('SITE_BASE_URL', 'http://localhost:5500');

// Store-owner / store-manager order alerts.
// When set, finalize_payment() sends a "🔔 New order #VD-… · ₹… · N items"
// email to this address on every successful payment, alongside the
// customer's receipt. Use a comma- or semicolon-separated list to notify
// multiple people. Leave undefined or empty to disable admin alerts (the
// customer receipt still fires either way).
//   define('ADMIN_NOTIFY_EMAIL', 'orders@velorexmusic.com');
//   define('ADMIN_NOTIFY_EMAIL', 'owner@example.com, manager@example.com');
