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

// Used as the admin API token. Must match the password used in admin.html login.
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
