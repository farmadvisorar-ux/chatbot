/**
 * A static file server for dist/, for looking at the site locally.
 *
 * Not part of the deploy — Vercel serves dist/ directly. This exists so that
 * `npm run dev` shows you the real built output rather than an approximation
 * of it through a dev server with different behaviour.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.env.PORT ?? 4321);

const TYPES = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.xml': 'application/xml',
    '.txt': 'text/plain; charset=utf-8', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
};

createServer(async (req, res) => {
    // decodeURIComponent throws on a malformed escape such as "/%". Inside an
    // async handler that rejection is unhandled and takes the server down, so
    // a stray link in a page under test would end the dev session.
    let path;
    try {
        // normalize() collapses "..", so a request for /../../etc/passwd
        // cannot escape dist/ — the one thing a file server must not get wrong.
        path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    } catch {
        res.writeHead(400).end('bad request');
        return;
    }
    let file = join(dist, path);
    if (!file.startsWith(dist)) { res.writeHead(403).end('forbidden'); return; }

    try {
        if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    } catch {
        if (!extname(file)) file += '.html';
    }

    try {
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
        res.end(body);
    } catch {
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<h1>404</h1>');
    }
}).listen(port, () => process.stdout.write(`http://localhost:${port}\n`));
