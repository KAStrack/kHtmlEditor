<?php
/**
 * Minimal upload handler implementing TinyMCE's (and kHtmlEditor's) upload contract:
 *   POST multipart/form-data with a "file" field  ->  200 {"location": "/uploads/name.ext"}
 * Works for images_upload_url and media_upload_url. Adjust $uploadDir/$publicPath, the allowed
 * types and the size limit for your site, and add your own authentication check.
 *
 * Run locally:  php -S localhost:8080 -t docs/examples/server
 * Then set images_upload_url: 'http://localhost:8080/upload.php' (and allow CORS below).
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *'); // tighten to your origin in production
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

$uploadDir  = __DIR__ . '/uploads';
$publicPath = '/uploads';
$maxBytes   = 20 * 1024 * 1024;
$allowed = [
  'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp', 'image/avif' => 'avif',
  'video/mp4' => 'mp4', 'video/webm' => 'webm', 'video/ogg' => 'ogv', 'audio/mpeg' => 'mp3', 'audio/ogg' => 'ogg', 'audio/wav' => 'wav',
];

$fail = function (int $status, string $message): void {
  http_response_code($status);
  echo json_encode(['error' => $message]);
  exit;
};

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $fail(405, 'Method not allowed'); }
if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) { $fail(400, 'No file uploaded'); }
$file = $_FILES['file'];
if ($file['size'] > $maxBytes) { $fail(413, 'File too large'); }

// Never trust the client's MIME type: sniff the content.
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($file['tmp_name']) ?: '';
if (!isset($allowed[$mime])) { $fail(415, 'Unsupported file type: ' . $mime); }
// Images: make sure they really decode.
if (strpos($mime, 'image/') === 0 && @getimagesize($file['tmp_name']) === false) { $fail(415, 'Invalid image'); }

if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true)) { $fail(500, 'Cannot create upload directory'); }
$name = bin2hex(random_bytes(8)) . '.' . $allowed[$mime];
if (!move_uploaded_file($file['tmp_name'], $uploadDir . '/' . $name)) { $fail(500, 'Cannot save file'); }

echo json_encode(['location' => $publicPath . '/' . $name]);
