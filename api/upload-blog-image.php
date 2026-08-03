<?php
// =============================================================================
// /api/upload-blog-image.php — admin-only image upload for blog posts
//
// POST multipart, field "image" → { ok, url, bytes, mime }
//
// Deliberately a separate endpoint from upload-product-image.php rather than a
// `folder` parameter on it: a caller-controlled destination directory on an
// upload endpoint is a path-traversal invitation, and product uploads are on
// the critical path for the storefront. The two write to sibling directories
// and are otherwise identical in behaviour.
//
// Files land in public_html/uploads/blog/<hash>.<ext>, which resolves through
// the same symlink as product images — so they live OUTSIDE public_html on
// Hostinger and survive a git deploy. See CLAUDE.md §10.
//
// Content-addressed: identical bytes → same hash → same URL → one file on disk,
// and re-uploading the same image is idempotent.
// =============================================================================

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

require_admin();

$MAX_BYTES = 5 * 1024 * 1024; // 5 MB
$ALLOWED = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp',
    'image/gif'  => 'gif',
];

try {
    if (!isset($_FILES['image'])) {
        http_response_code(400);
        echo json_encode(['error' => 'No file uploaded (expected multipart field "image")']);
        exit;
    }

    $f = $_FILES['image'];
    if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $map = [
            UPLOAD_ERR_INI_SIZE   => 'File exceeds the server upload limit',
            UPLOAD_ERR_FORM_SIZE  => 'File exceeds the form upload limit',
            UPLOAD_ERR_PARTIAL    => 'File was only partially uploaded',
            UPLOAD_ERR_NO_FILE    => 'No file uploaded',
            UPLOAD_ERR_NO_TMP_DIR => 'Server has no temp directory configured',
            UPLOAD_ERR_CANT_WRITE => 'Server could not write the file',
        ];
        http_response_code(400);
        echo json_encode(['error' => $map[$f['error']] ?? 'Upload failed']);
        exit;
    }

    if ((int)$f['size'] <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Uploaded file is empty']);
        exit;
    }
    if ((int)$f['size'] > $MAX_BYTES) {
        http_response_code(400);
        echo json_encode(['error' => 'File too large (max 5 MB)']);
        exit;
    }

    // Trust the sniffed MIME type, never the client-supplied one or the
    // filename extension — both are attacker-controlled.
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = $finfo ? finfo_file($finfo, $f['tmp_name']) : null;
    if ($finfo) finfo_close($finfo);
    if (!$mime || !isset($ALLOWED[$mime])) {
        http_response_code(400);
        echo json_encode(['error' => 'Unsupported image type. Allowed: JPG, PNG, WebP, GIF.']);
        exit;
    }
    $ext = $ALLOWED[$mime];

    $bytes = file_get_contents($f['tmp_name']);
    if ($bytes === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Could not read uploaded file']);
        exit;
    }

    // The filename is derived entirely from a hash of the CONTENT, so nothing
    // the uploader controls reaches the filesystem path.
    $hash = substr(sha1($bytes), 0, 16);
    $publicPath = "/uploads/blog/{$hash}.{$ext}";
    $diskDir    = realpath(__DIR__ . '/..') . '/uploads/blog';
    $diskPath   = $diskDir . "/{$hash}.{$ext}";

    if (!is_dir($diskDir)) {
        if (!@mkdir($diskDir, 0755, true) && !is_dir($diskDir)) {
            http_response_code(500);
            echo json_encode(['error' => 'Could not create upload directory: ' . $diskDir]);
            exit;
        }
    }

    if (!file_exists($diskPath)) {
        if (file_put_contents($diskPath, $bytes) === false) {
            http_response_code(500);
            echo json_encode(['error' => 'Could not write uploaded file to disk']);
            exit;
        }
        @chmod($diskPath, 0644);
    }

    echo json_encode([
        'ok'    => true,
        'url'   => $publicPath,
        'bytes' => strlen($bytes),
        'mime'  => $mime,
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
