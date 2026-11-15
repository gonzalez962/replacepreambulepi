'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const { createServer } = require('./server.cjs');

async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-capture-'));
  const server = createServer({ captureDir: dir, maxBytes: 1024 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(dir, { recursive: true, force: true }); });
  const port = server.address().port;
  async function request(route, body, headers = {}, method = 'POST') {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: route, method, headers: { 'content-length': Buffer.byteLength(body), ...headers } }, res => {
        let data = ''; res.setEncoding('utf8'); res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) }));
      });
      req.on('error', reject); req.end(body);
    });
  }
  return { dir, port, request };
}

test('captures only ordered instruction text for each protocol including streams and empty instructions', async t => {
  const { dir, request } = await setup(t);
  const cases = [
    ['/v1/chat/completions', { stream: true, messages: [{ role: 'system', content: 'one' }, { role: 'user', content: 'SECRET' }, { role: 'developer', content: [{ type: 'text', text: 'two' }, { type: 'image_url', image_url: 'SECRET' }] }] }, ['one', 'two'], 'openai'],
    ['/v1/responses', { instructions: 'first', input: [{ role: 'developer', content: [{ type: 'input_text', text: 'second' }] }, { role: 'assistant', content: 'SECRET' }] }, ['first', 'second'], 'openai'],
    ['/v1/messages', { system: [{ type: 'text', text: 'claude' }, { type: 'image', source: 'SECRET' }], messages: [{ role: 'user', content: 'SECRET' }] }, ['claude'], 'claude'],
    ['/v1/messages', { messages: [] }, [], 'claude'],
  ];
  for (const [route, payload, expected, protocol] of cases) {
    const before = await fs.readdir(dir);
    const res = await request(route, JSON.stringify(payload));
    assert.equal(res.status, 403); assert.equal(res.headers['access-control-allow-origin'], undefined);
    assert.match(res.headers['content-type'], /application\/json/);
    assert.equal(res.body.error.type, protocol === 'claude' ? 'permission_error' : 'permission_denied');
    if (protocol === 'claude') assert.equal(res.body.type, 'error');
    const added = (await fs.readdir(dir)).filter(x => !before.includes(x)); assert.equal(added.length, 1);
    const raw = await fs.readFile(path.join(dir, added[0]), 'utf8'); assert(!raw.includes('SECRET'));
    const capture = JSON.parse(raw); assert.deepEqual(Object.keys(capture).sort(), ['instructions', 'protocol', 'route', 'time']);
    assert.deepEqual(capture.instructions, expected); assert.equal(capture.protocol, protocol); assert.equal(capture.route, route); assert(!Number.isNaN(Date.parse(capture.time)));
  }
});

test('rejects invalid requests without changing captures', async t => {
  const { dir, port, request } = await setup(t);
  await request('/v1/messages', '{}');
  const before = await Promise.all((await fs.readdir(dir)).map(async f => [f, await fs.readFile(path.join(dir, f), 'utf8')]));
  for (const [route, body, headers, method, status] of [
    ['/v1/messages', '{', {}, 'POST', 400], ['/v1/messages', '[]', {}, 'POST', 400],
    ['/v1/messages', 'x'.repeat(1025), {}, 'POST', 413], ['/bad', '{}', {}, 'POST', 404],
    ['/v1/messages', '{}', {}, 'GET', 405], ['/v1/messages', '{}', { origin: 'http://evil.example' }, 'POST', 403],
    ['/v1/messages', '{}', { origin: 'null' }, 'POST', 403],
    ['/v1/messages', '{}', { host: 'attacker.example' }, 'POST', 403],
    ['/v1/messages', '{}', { host: `127.0.0.1:${port === 1 ? 2 : port - 1}` }, 'POST', 403],
  ]) { const res = await request(route, body, headers, method); assert.equal(res.status, status); assert(res.body.error); }
  assert.deepEqual(await Promise.all((await fs.readdir(dir)).map(async f => [f, await fs.readFile(path.join(dir, f), 'utf8')])), before);
  assert.equal((await request('/v1/messages', '{}', { origin: `http://127.0.0.1:${port}` })).status, 403);
  assert.equal((await fs.readdir(dir)).length, before.length + 1);
});

test('partial write failure leaves no artifact', async t => {
  const { dir, request } = await setup(t);
  const original = fs.writeFile;
  fs.writeFile = async (file, data, options) => {
    await original(file, data.slice(0, 20), options);
    const err = new Error('simulated'); err.code = 'ENOSPC'; throw err;
  };
  try {
    const res = await request('/v1/messages', JSON.stringify({ system: 'synthetic instruction' }));
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { type: 'error', error: { type: 'invalid_request_error', message: 'Failed to persist capture' } });
    assert.deepEqual(await fs.readdir(dir), []);
  } finally { fs.writeFile = original; }
});

test('CLI help and invalid port have exact output and exit status', () => {
  const script = path.join(__dirname, 'server.cjs');
  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0); assert.equal(help.stdout, 'Usage: node server.cjs [--port N]\nCapture local instructions on 127.0.0.1 (default port 8787).\n'); assert.equal(help.stderr, '');
  const invalid = spawnSync(process.execPath, [script, '--port', 'invalid'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1); assert.equal(invalid.stdout, ''); assert.equal(invalid.stderr, 'Invalid arguments or port; use --help.\n');
});

test('persistence failure returns 500', async t => {
  const { dir, request } = await setup(t);
  const bad = path.join(dir, 'file'); await fs.writeFile(bad, 'x');
  const server = createServer({ captureDir: bad }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const res = await fetch(`http://127.0.0.1:${server.address().port}/v1/messages`, { method: 'POST', body: '{}' });
  assert.equal(res.status, 500); assert((await res.json()).error); assert.deepEqual(await fs.readdir(dir), ['file']);
});
