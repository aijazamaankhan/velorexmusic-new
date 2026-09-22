<?php
// =============================================================================
// OPTIONAL command-line version of Admin → Blog → "Import prepared drafts".
// The admin button is the normal way; this exists for SSH use and testing.
//
//   php scripts/import-journal-drafts.php --dry-run   # report only
//   php scripts/import-journal-drafts.php             # create the drafts
//
// Same code as the button (api/_journal_import.php): drafts only, existing
// slugs skipped, product links rewritten to canonical URLs.
// =============================================================================

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$dry = in_array('--dry-run', $argv, true);
require_once dirname(__DIR__) . '/api/config.php';
require_once dirname(__DIR__) . '/api/_journal_import.php';

$r = journal_import_drafts(db(), $dry);
foreach ($r['articles'] as $a) {
    echo "\n== {$a['slug']}\n   {$a['status']}" . ($a['words'] ? " · {$a['words']} words" : '') . "\n";
    foreach ($a['notes'] as $n) echo "   ! {$n}\n";
}
echo "\nDone: {$r['created']} created, {$r['skipped']} already existed, {$r['problems']} problem(s)."
   . ($dry ? " Dry run — nothing written.\n" : " Review and publish in Admin -> Blog.\n");
exit($r['problems'] ? 2 : 0);
