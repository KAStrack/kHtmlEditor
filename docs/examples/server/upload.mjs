// Minimal Node (>= 18) upload server implementing TinyMCE's / kHtmlEditor's upload contract:
//   POST multipart/form-data with a "file" field -> 200 {"location": "/uploads/name.ext"}
// Usage: node docs/examples/server/upload.mjs 8080
// Then: images_upload_url: 'http://localhost:8080/upload', media_upload_url: 'http://localhost:8080/upload'
import { createServer } from 'node:http';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join, extname } from 'node:path';

const port = Number(process.argv[2] || 8080);
const uploadDir = join(process.cwd(), 'uploads');
const publicPath = '/uploads';
const maxBytes = 20 * 1024 * 1024;
const signatures = [
  { ext: 'png', mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'gif', mime: 'image/gif', test: (b) => b.subarray(0, 3).toString() === 'GIF' },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  { ext: 'mp4', mime: 'video/mp4', test: (b) => b.subarray(4, 8).toString() === 'ftyp' },
  { ext: 'webm', mime: 'video/webm', test: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
  { ext: 'mp3', mime: 'audio/mpeg', test: (b) => b.subarray(0, 3).toString() === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  { ext: 'ogg', mime: 'audio/ogg', test: (b) => b.subarray(0, 4).toString() === 'OggS' },
  { ext: 'wav', mime: 'audio/wav', test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WAVE' },
];

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
};

/** Extracts the "file" part from a multipart body without any dependency. */
const parseMultipart = (buffer, contentType) => {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!m) return null;
  const boundary = Buffer.from('--' + (m[1] || m[2]));
  let pos = buffer.indexOf(boundary);
  while (pos !== -1) {
    const start = pos + boundary.length + 2; // CRLF
    const headerEnd = buffer.indexOf('\r\n\r\n', start);
    if (headerEnd === -1) break;
    const headers = buffer.subarray(start, headerEnd).toString();
    const next = buffer.indexOf(boundary, headerEnd);
    if (next === -1) break;
    const data = buffer.subarray(headerEnd + 4, next - 2);
    if (/name="file"/.test(headers)) {
      const fn = /filename="([^"]*)"/.exec(headers);
      return { data, filename: fn ? fn[1] : '' };
    }
    pos = next;
  }
  return null;
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }
  if (req.method === 'GET' && url.pathname.startsWith(publicPath + '/')) {
    try {
      const name = url.pathname.slice(publicPath.length + 1).replace(/[^a-z0-9.]/gi, '');
      const data = await readFile(join(uploadDir, name));
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
      return res.end(data);
    } catch {
      return json(res, 404, { error: 'Not found' });
    }
  }
  if (req.method !== 'POST' || url.pathname !== '/upload') {
    return json(res, 404, { error: 'Not found' });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes + 4096) return json(res, 413, { error: 'File too large' });
    chunks.push(chunk);
  }
  const part = parseMultipart(Buffer.concat(chunks), req.headers['content-type'] || '');
  if (!part) return json(res, 400, { error: 'No file uploaded' });
  if (part.data.length > maxBytes) return json(res, 413, { error: 'File too large' });
  const sig = signatures.find((s) => s.test(part.data));
  if (!sig) return json(res, 415, { error: 'Unsupported file type' });
  await mkdir(uploadDir, { recursive: true });
  const name = randomBytes(8).toString('hex') + '.' + (sig.ext || extname(part.filename).slice(1));
  await writeFile(join(uploadDir, name), part.data);
  json(res, 200, { location: publicPath + '/' + name });
}).listen(port, () => console.log(`upload server on http://localhost:${port}/upload`));
