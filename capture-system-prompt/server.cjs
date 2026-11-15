'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const routes = new Map([['/v1/chat/completions', 'openai'], ['/v1/responses', 'openai'], ['/v1/messages', 'claude']]);

function error(res, status, message, protocol = 'openai') {
  if (res.destroyed || res.writableEnded) return;
  const type = status === 403 ? 'permission_denied' : 'invalid_request_error';
  const body = protocol === 'claude'
    ? { type: 'error', error: { type: status === 403 ? 'permission_error' : 'invalid_request_error', message } }
    : { error: { message, type, code: status === 403 ? 'permission_denied' : null } };
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function extract(route, body) {
  const segments = [];
  function content(value) {
    if (typeof value === 'string') segments.push(value);
    else if (Array.isArray(value)) for (const block of value) {
      if (block && (block.type === 'text' || block.type === 'input_text') && typeof block.text === 'string') segments.push(block.text);
    }
  }
  function messages(value) {
    if (Array.isArray(value)) for (const item of value) {
      if (item && (item.role === 'system' || item.role === 'developer')) content(item.content);
    }
  }
  if (route === '/v1/messages') content(body.system);
  else if (route === '/v1/responses') { content(body.instructions); messages(body.input); }
  else messages(body.messages);
  return segments;
}

function createServer({ captureDir = path.join(__dirname, 'captures'), maxBytes = 8 * 1024 * 1024 } = {}) {
  return http.createServer((req, res) => {
    const route = req.url;
    const protocol = routes.get(route);
    if (!protocol) { req.resume(); error(res, 404, 'Endpoint not found'); return; }
    if (req.method !== 'POST') { req.resume(); error(res, 405, 'Method not allowed', protocol); return; }
    const origin = req.headers.origin;
    const address = req.socket.localAddress;
    const allowedOrigin = `http://127.0.0.1:${req.socket.localPort}`;
    if (address !== '127.0.0.1' || req.headers.host !== `127.0.0.1:${req.socket.localPort}` || (origin !== undefined && origin !== allowedOrigin)) {
      req.resume(); error(res, 403, 'Origin not allowed', protocol); return;
    }
    let size = 0, tooLarge = false;
    const chunks = [];
    req.on('error', () => {});
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        if (!tooLarge) { tooLarge = true; chunks.length = 0; error(res, 413, 'Request body too large', protocol); }
      } else if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', async () => {
      if (tooLarge || res.destroyed) return;
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { error(res, 400, 'Invalid JSON', protocol); return; }
      if (!body || typeof body !== 'object' || Array.isArray(body)) { error(res, 400, 'Expected a JSON object', protocol); return; }
      const capture = { protocol, route, time: new Date().toISOString(), instructions: extract(route, body) };
      const filename = `${randomUUID()}.json`;
      const temporary = path.join(captureDir, `.${randomUUID()}.tmp`);
      let handle, owned = false;
      try {
        await fs.mkdir(captureDir, { recursive: true, mode: 0o700 });
        handle = await fs.open(temporary, 'wx', 0o600);
        owned = true;
        await fs.writeFile(handle, JSON.stringify(capture, null, 2) + '\n');
        await handle.close(); handle = undefined;
        await fs.rename(temporary, path.join(captureDir, filename));
        owned = false;
        console.log(filename);
        error(res, 403, 'Request captured; inference is disabled', protocol);
      } catch {
        if (handle) await handle.close().catch(() => {});
        if (owned) await fs.unlink(temporary).catch(() => {});
        error(res, 500, 'Failed to persist capture', protocol);
      }
    });
  });
}

function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: node server.cjs [--port N]\nCapture local instructions on 127.0.0.1 (default port 8787).'); return;
  }
  let port = 8787;
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--port' || !/^\d+$/.test(args[1]) || Number(args[1]) < 1 || Number(args[1]) > 65535) {
      console.error('Invalid arguments or port; use --help.'); process.exitCode = 1; return;
    }
    port = Number(args[1]);
  }
  const server = createServer();
  server.on('error', err => { console.error(`Server error: ${err.code || 'unknown'}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1');
}
if (require.main === module) main(process.argv.slice(2));
module.exports = { createServer };
