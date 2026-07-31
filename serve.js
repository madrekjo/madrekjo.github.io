const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;
const ROOT = path.resolve(__dirname);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  try {
    let url = req.url.split('?')[0].split('#')[0];
    if (url === '/') url = '/index.html';

    let filePath = path.resolve(path.join(ROOT, '.' + url));

    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<h1>404</h1>');
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<h1>404</h1>');
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const data = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.end(data);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>500</h1>' + e.message);
  }
}).listen(PORT, () => {
  console.log('\n  Server running: http://localhost:' + PORT);
  console.log('  Folder: ' + ROOT + '\n');
});
