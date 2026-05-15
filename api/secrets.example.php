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
