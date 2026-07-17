const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 3000;
const host = '0.0.0.0';
const rootDir = __dirname;
const indexFile = path.join(rootDir, 'Conversor_ubicaciones_bins.html');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon'
};

function resolvePath(requestPath) {
  const decodedPath = decodeURIComponent(requestPath);
  const normalizedPath = decodedPath.replace(/^\/+/, '');
  const requestedFile = normalizedPath || 'Conversor_ubicaciones_bins.html';
  const fullPath = path.resolve(rootDir, requestedFile);

  if (!fullPath.startsWith(rootDir)) {
    return null;
  }

  return fullPath;
}

const server = http.createServer((req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const targetPath = resolvePath(requestUrl.pathname);

    if (!targetPath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    fs.readFile(targetPath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Archivo no encontrado');
        return;
      }

      const ext = path.extname(targetPath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Error del servidor');
  }
});

server.listen(port, host, () => {
  console.log(`Servidor listo en http://${host}:${port}`);
});
