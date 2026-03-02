#!/usr/bin/env node
// Simple static file server for changup-site
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8888;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// API 핸들러: /api/* → api/*.js 서버리스 함수 로컬 실행
function handleApi(req, res) {
  const urlPath = req.url.split('?')[0];
  const fnName = urlPath.replace(/^\/api\//, '');
  const fnPath = path.join(ROOT, 'api', fnName + '.js');

  if (!fs.existsSync(fnPath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `API not found: ${fnName}` }));
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      if (body) req.body = JSON.parse(body);
    } catch { req.body = {}; }

    // mock res object
    const mockRes = {
      _status: 200,
      _headers: {},
      status(code) { this._status = code; return this; },
      setHeader(k, v) { this._headers[k] = v; return this; },
      json(data) {
        res.writeHead(this._status, { 'Content-Type': 'application/json', ...this._headers });
        res.end(JSON.stringify(data));
      },
      end() { res.writeHead(this._status, this._headers); res.end(); }
    };

    // Clear require cache so edits are reflected
    delete require.cache[require.resolve(fnPath)];
    const fn = require(fnPath);
    Promise.resolve(fn(req, mockRes)).catch(e => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    });
  });
}

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // API 라우팅
  if (req.url.startsWith('/api/')) {
    handleApi(req, res);
    return;
  }

  let filePath = path.join(ROOT, req.url === '/' ? 'index.html' : req.url);
  // Strip query strings
  filePath = filePath.split('?')[0];
  const ext = path.extname(filePath);
  if (!ext) filePath += '.html';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found: ' + req.url);
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('\n✅ 창업지도 개발 서버 시작!');
  console.log('   Local: http://localhost:' + PORT);
  console.log('   API:   /api/* → api/*.js (로컬 서버리스 함수 실행)\n');
});
